\set ON_ERROR_STOP on
begin;
do $$
declare actor uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); run_id uuid; assignment_id uuid;
 state jsonb; run_record jsonb; slots jsonb; steps jsonb; assignments jsonb; slot jsonb; step jsonb;
 chart_count integer; i integer; phase text; mode text; slot_id text; lane text; rev bigint:=0;
 req uuid:=gen_random_uuid(); receipt jsonb; old_run jsonb;
begin
 insert into public."PIU_TRAINER_CATALOGS"(revision,payload) values('twenty-fixture','{}');
 insert into public."PIU_TRAINER_CATALOG_HEAD"(id,revision) values(true,'twenty-fixture');
 insert into public."PIU_TRAINER_ACCOUNTS"(user_id,profile_id) values(actor,'jonathan'),(other,'hds');
 state:=public."PIU_TRAINER_STATE"(actor);
 foreach chart_count in array array[16,20] loop
  run_id:=gen_random_uuid(); slots:='[]'; steps:='[]'; assignments:='[]';
  for i in 0..chart_count-1 loop
   phase:=case when i<8 then 'warmup' else 'push' end;
   mode:=case when (i<8 and i<4) or (i>=8 and i<8+(chart_count-8)/2) then 'Single' else 'Double' end;
   slot_id:=run_id::text||':'||i;
   slot:=jsonb_build_object('id',slot_id,'phase',phase,'mode',mode,'level',20,'targetLevel',20,'minLevel',20,'maxLevel',23);
   if chart_count=20 and phase='push' then
    lane:=case when (i-8)%6<3 then 'random' else 'improvement' end;
    slot:=slot||jsonb_build_object('lane',lane);
   end if;
   slots:=slots||jsonb_build_array(slot);
   step:=jsonb_build_object('id',slot_id||':1','slotId',slot_id,'phase',phase,'repetition',1,'included',true);
   steps:=steps||jsonb_build_array(step);
   if phase='push' then steps:=steps||jsonb_build_array(step||jsonb_build_object('id',slot_id||':2','repetition',2)); end if;
   assignment_id:=gen_random_uuid();
   assignments:=assignments||jsonb_build_array(jsonb_build_object('id',assignment_id,'sessionRunId',run_id,'planSlotId',slot_id,'isCurrent',true));
  end loop;
  run_record:=jsonb_build_object('id',run_id,'kind','daily','status','generated','workout',jsonb_build_object(
   'version',1,'profileId','jonathan','selectionVersion',case when chart_count=20 then '2.0.0' else '1.1.0' end,
   'orderVersion',case when chart_count=20 then '2.0.0' else '1.0.0' end,'slots',slots,'steps',steps), 'plays','[]'::jsonb,'stepStates','[]'::jsonb);
  if not public."PIU_TRAINER_DAILY_VALID"(run_record) then raise exception 'Valid % chart snapshot rejected',chart_count; end if;
  state:=jsonb_set(state,'{runs}',state->'runs'||jsonb_build_array(run_record));
  state:=jsonb_set(state,'{assignments}',state->'assignments'||assignments);
  perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'format-'||chart_count,rev,state,'null',false,'twenty-fixture');
  rev:=rev+1;
  if chart_count=16 then old_run:=run_record; end if;
 end loop;
 if jsonb_array_length(public."PIU_TRAINER_STATE"(actor)->'assignments')<>36 then raise exception 'Mixed old/new chart counts lost'; end if;
 if public."PIU_TRAINER_STATE"(actor)->'runs'->0 is distinct from old_run and public."PIU_TRAINER_STATE"(actor)->'runs'->1 is distinct from old_run then raise exception 'Historical snapshot changed'; end if;
 if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run_record,'{workout,slots}',slots-19)) then raise exception 'Missing slot accepted'; end if;
 if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run_record,'{workout,slots,8,lane}','"improvement"')) then raise exception 'Wrong lane balance accepted'; end if;
 if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run_record,'{workout,slots,8,minLevel}','19')) then raise exception 'Sub-20 floor accepted'; end if;
 if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run_record,'{workout,steps}',steps-31)) then raise exception 'Missing optional retry accepted'; end if;
 if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run_record,'{workout,orderVersion}','"1.0.0"')) then raise exception 'Wrong order version accepted'; end if;
 begin
  perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'missing-chart',rev,jsonb_set(state,'{assignments}',(state->'assignments')-35),'null',false,'twenty-fixture');
  raise exception 'Missing assignment accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_ASSIGNMENTS' then raise; end if; end;
 begin
  perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'foreign',rev,jsonb_set(state,'{runs,1,workout,profileId}','"hds"'),'null',false,'twenty-fixture');
  raise exception 'Foreign profile accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_PROFILE' then raise; end if; end;
 receipt:=public."PIU_TRAINER_COMMIT"(actor,req,'replay',rev,state,'{"ok":true}',true,'twenty-fixture');
 if public."PIU_TRAINER_COMMIT"(actor,req,'replay',rev,state,'null',false,'twenty-fixture')<>receipt then raise exception 'Replay receipt changed'; end if;
 begin
  perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'stale',rev,state,'null',false,'twenty-fixture');
  raise exception 'Stale revision accepted';
 exception when raise_exception then if sqlerrm<>'CONFLICT' then raise; end if; end;
 if public."PIU_TRAINER_STATE"(other)->'runs'<>'[]' then raise exception 'Other profile changed'; end if;
 if has_function_privilege('anon','public."PIU_TRAINER_DAILY_VALID"(jsonb)','EXECUTE') or has_function_privilege('authenticated','public."PIU_TRAINER_COMMIT"(uuid,uuid,text,bigint,jsonb,jsonb,boolean,text)','EXECUTE') then raise exception 'Public execute permission leaked'; end if;
 if not has_function_privilege('service_role','public."PIU_TRAINER_COMMIT"(uuid,uuid,text,bigint,jsonb,jsonb,boolean,text)','EXECUTE') then raise exception 'Server execute permission lost'; end if;
 raise notice 'Twenty-chart migration checks passed: formats, lane quotas, floor, retries, commits, isolation, revision, replay, grants.';
end $$;
rollback;
