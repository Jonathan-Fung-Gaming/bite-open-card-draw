\set ON_ERROR_STOP on
begin;
\ir piu_standard_pushes_contract.sql
do $$
declare run jsonb; changed jsonb; old_run jsonb; slots jsonb; steps jsonb;
 modes text; algorithm text; lane text; actor uuid; req uuid:=gen_random_uuid();
 state jsonb; assignments jsonb; saved jsonb; settings jsonb; signature text;
begin
 foreach modes in array array['both','singles','doubles'] loop
  run:=pg_temp.standard_pushes_run(modes);
  if not public."PIU_TRAINER_DAILY_VALID"(run)
   or (select count(*) from jsonb_array_elements(run->'workout'->'slots') s where s->>'phase'='push' and s->>'lane'='standard')<>12 then
   raise exception 'new all-twelve Standard % rejected',modes; end if;
  foreach algorithm in array array['professional','standard'] loop
   old_run:=pg_temp.standard_pushes_run(modes,algorithm,'hds','3.0.0');
   if not public."PIU_TRAINER_DAILY_VALID"(old_run) then raise exception 'predecessor % % rejected',modes,algorithm; end if;
   if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(old_run,'{workout,slots,8,lane}','"standard"')) then raise exception 'historical mixed lane accepted'; end if;
  end loop;
 end loop;
 run:=pg_temp.standard_pushes_run('singles');
 foreach lane in array array['random','improvement','unknown'] loop
  if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,8,lane}',to_jsonb(lane))) then raise exception 'mixed % lane accepted',lane; end if;
  select jsonb_agg(case when s->>'phase'='push' then s||jsonb_build_object('lane',lane) else s end) into slots from jsonb_array_elements(run->'workout'->'slots') s;
  if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots}',slots)) then raise exception 'all % lanes accepted',lane; end if;
 end loop;
 if public."PIU_TRAINER_DAILY_VALID"(run#-'{workout,slots,8,lane}')
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,8,lane}','null'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,0,lane}','"standard"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,settings,algorithm}','"professional"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,settings,algorithm}','"unknown"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,selectionVersion}','"3.0.0"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,selectionVersion}','"3.2.0"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,orderVersion}','"3.1.0"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,settings,modes}','"both"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,settings,modes}','"unknown"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,8,mode}','"Double"'))
  or public."PIU_TRAINER_DAILY_VALID"(run#-'{workout,slots,19}')
  or public."PIU_TRAINER_DAILY_VALID"(run#-'{workout,steps,31}') then raise exception 'invalid new lane, policy, mode or counts accepted'; end if;
 if public."PIU_TRAINER_DAILY_VALID"(run#-'{workout,standardGeneration}')
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,standardGeneration,version}','2'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,8,targetLevel}','23'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,8,level}','19'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,8,bpmBucket}','"unknown"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,standardGeneration,groups,0,mode}','"Double"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,standardGeneration,groups,0,weakness}','1.1'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,settings,ranges,warmupSingle,min}','9'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,settings,ranges,pushSingle,min}','19')) then raise exception 'invalid frozen Standard inputs, target or floor accepted'; end if;
 changed:=jsonb_set(run,'{workout,standardGeneration,progressionRevision}','null');
 select jsonb_agg(g||jsonb_build_object('normalizedSkill',null,'scoreCount',0,'confidence',0,'weakness',0.5)) into slots
  from jsonb_array_elements(changed->'workout'->'standardGeneration'->'groups') g;
 changed:=jsonb_set(changed,'{workout,standardGeneration,groups}',slots);
 select jsonb_agg(case when s->>'phase'='push' then s||jsonb_build_object('targetLevel',22) else s end) into slots from jsonb_array_elements(changed->'workout'->'slots') s;
 changed:=jsonb_set(changed,'{workout,slots}',slots);
 if not public."PIU_TRAINER_DAILY_VALID"(changed) then raise exception 'all-twelve neutral Standard rejected'; end if;

 -- Compatibility checks for this migration only; no predecessor migration/test replay.
 old_run:=pg_temp.standard_pushes_run('both','professional','hds','3.0.0');
 old_run:=jsonb_set(jsonb_set(old_run,'{workout,selectionVersion}','"2.0.0"'),'{workout,orderVersion}','"2.0.0"')#-'{workout,settings}';
 if not public."PIU_TRAINER_DAILY_VALID"(old_run) then raise exception 'historical twenty-chart rejected'; end if;
 select jsonb_agg(s) into slots from jsonb_array_elements(old_run->'workout'->'slots') s where s->>'phase'='warmup' or (regexp_match(s->>'id',':([0-9]+)$'))[1]::integer<=4;
 select jsonb_agg(s) into steps from jsonb_array_elements(old_run->'workout'->'steps') s where exists(select 1 from jsonb_array_elements(slots) t where t->>'id'=s->>'slotId');
 old_run:=jsonb_set(jsonb_set(jsonb_set(old_run,'{workout,slots}',slots),'{workout,steps}',steps),'{workout,selectionVersion}','"1.0.0"');
 if not public."PIU_TRAINER_DAILY_VALID"(old_run) or not public."PIU_TRAINER_DAILY_VALID"('{"planSessionId":"legacy-fixture"}') then raise exception 'historical sixteen-chart or legacy rejected'; end if;

 foreach signature in array array['public."PIU_TRAINER_DAILY_VALID"(jsonb)','public."PIU_TRAINER_READ"(uuid,bigint,integer)'] loop
  if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE')
   or not has_function_privilege('service_role',signature,'EXECUTE') then raise exception 'function grant changed for %',signature; end if;
 end loop;
 select account_id into actor from public."PIU_TRAINER_PROFILES" where id='hds';
 saved:=public."PIU_TRAINER_READ"(actor);
 if saved->'capabilities' is distinct from '{"workouts":1,"personalSync":1,"sessionOptions":1,"standardPushes":1}'::jsonb then raise exception 'additive capability missing'; end if;
 if (select count(*) from public."PIU_TRAINER_RECEIPTS" where fingerprint='preserve-session-options-fixture')<>1
  or (select count(*) from public."PIU_TRAINER_ACCOUNTS" where revision=0)<>3
  or (select count(distinct account_id) from public."PIU_TRAINER_PROFILES")<>3 then raise exception 'predecessor profiles, receipts or fences changed'; end if;
 select a.settings into settings from public."PIU_TRAINER_ACCOUNTS" a where user_id=actor;
 run:=pg_temp.standard_pushes_run('doubles');
 select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'sessionRunId',run->>'id','planSlotId',s->>'id','isCurrent',true)) into assignments from jsonb_array_elements(run->'workout'->'slots') s;
 state:=jsonb_build_object('settings',settings,'runs',jsonb_build_array(run),'assignments',assignments,'attempts','[]'::jsonb,'checkins','[]'::jsonb,'rerolls','[]'::jsonb,'corrections','[]'::jsonb,'preferences','[]'::jsonb,'archivedCharts','[]'::jsonb);
 saved:=public."PIU_TRAINER_COMMIT"(actor,req,'standard-pushes-create',0,state,'null',false,'synthetic-fixture');
 if saved->>'revision'<>'1' or public."PIU_TRAINER_COMMIT"(actor,req,'standard-pushes-create',0,state,'null',false,'synthetic-fixture')<>saved then raise exception 'all-twelve commit/replay failed'; end if;
 begin perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'stale',0,state,'null',false,'synthetic-fixture'); raise exception 'stale revision accepted'; exception when others then if sqlerrm<>'CONFLICT' then raise; end if; end;
 begin perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'foreign-profile',1,jsonb_set(state,'{runs,0,workout,profileId}','"jonathan"'),'null',false,'synthetic-fixture'); raise exception 'foreign profile accepted'; exception when others then if sqlerrm<>'INVALID_PROFILE' then raise; end if; end;
 if (select count(*) from public."PIU_TRAINER_ACCOUNTS" where profile_id in ('jonathan','waffle') and revision=0)<>2 then raise exception 'foreign journal changed'; end if;
 raise notice 'All twelve Standard push checks passed: modes, new/old lane policies, frozen targets, capability, ACL, commit/replay and profile/revision fences.';
end $$;
rollback;
