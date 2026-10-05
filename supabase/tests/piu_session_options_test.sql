\set ON_ERROR_STOP on
begin;
\ir piu_session_options_contract.sql
do $$
declare run jsonb; changed jsonb; old_run jsonb; slots jsonb; steps jsonb; item jsonb;
 modes text; algorithm text; range_key text; boundary integer; actor uuid; req uuid:=gen_random_uuid();
 state jsonb; assignments jsonb; saved jsonb; settings jsonb; signature text;
begin
 foreach modes in array array['both','singles','doubles'] loop
  foreach algorithm in array array['professional','standard'] loop
   run:=pg_temp.session_options_run(modes,algorithm);
   if not public."PIU_TRAINER_DAILY_VALID"(run) then raise exception 'valid % % rejected',modes,algorithm; end if;
   changed:=run;
   foreach range_key in array array['warmupSingle','warmupDouble','pushSingle','pushDouble'] loop
    boundary:=case when left(range_key,6)='warmup' then 10 else 20 end;
    changed:=jsonb_set(changed,array['workout','settings','ranges',range_key],jsonb_build_object('min',boundary,'max',boundary));
   end loop;
   select jsonb_agg(s||jsonb_build_object('minLevel',case when s->>'phase'='warmup' then 10 else 20 end,
    'maxLevel',case when s->>'phase'='warmup' then 10 else 20 end,'targetLevel',case when s->>'phase'='warmup' then 10 else 20 end,
    'level',case when s->>'phase'='warmup' then 10 else 20 end)) into slots from jsonb_array_elements(changed->'workout'->'slots') s;
   changed:=jsonb_set(changed,'{workout,slots}',slots);
   if not public."PIU_TRAINER_DAILY_VALID"(changed) then raise exception 'equal range endpoints rejected for % %',modes,algorithm; end if;
  end loop;
 end loop;
 run:=pg_temp.session_options_run('singles','professional');
 foreach range_key in array array['warmupSingle','warmupDouble','pushSingle','pushDouble'] loop
  boundary:=case when left(range_key,6)='warmup' then 10 else 20 end;
  if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,array['workout','settings','ranges',range_key,'min'],to_jsonb(boundary-1)))
   or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,array['workout','settings','ranges',range_key,'max'],'31'))
   or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,array['workout','settings','ranges',range_key,'min'],'30'))
   or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,array['workout','settings','ranges',range_key,'min'],'10.5'))
   or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,array['workout','settings','ranges',range_key,'min'],'"20"'))
   or public."PIU_TRAINER_DAILY_VALID"(run#-array['workout','settings','ranges',range_key]) then raise exception 'invalid or inactive % accepted',range_key; end if;
 end loop;
 if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,settings,modes}','"both"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,settings,modes}','"unknown"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,settings,algorithm}','"unknown"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,profileId}','"unknown"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,orderVersion}','"2.0.0"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,0,level}','9'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,0,targetLevel}','30'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,0,minLevel}','11'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,0,lane}','"random"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,8,lane}','"improvement"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,8,bpmBucket}','"190-199"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,steps,0,repetition}','2'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,standardGeneration}','{}')) then raise exception 'invalid version-3 configuration, slot or step accepted'; end if;
 run:=pg_temp.session_options_run('doubles','standard');
 if public."PIU_TRAINER_DAILY_VALID"(run#-'{workout,standardGeneration}')
  or public."PIU_TRAINER_DAILY_VALID"(run#-'{workout,slots,8,bpmBucket}')
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,8,bpmBucket}','"unknown"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,slots,8,targetLevel}','24'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,standardGeneration,groups,0,mode}','"Single"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,standardGeneration,groups,0,bpmBucket}','"190-199"'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,standardGeneration,groups,0,scoreCount}','6'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,standardGeneration,groups,0,confidence}','0.5'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,standardGeneration,groups,0,weakness}','1.1'))
  or public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,standardGeneration,groups,0,normalizedSkill}','"19"')) then raise exception 'invalid Standard snapshot accepted'; end if;
 changed:=jsonb_set(run,'{workout,standardGeneration,progressionRevision}','null');
 select jsonb_agg(g||jsonb_build_object('normalizedSkill',null,'scoreCount',0,'confidence',0,'weakness',0.5)) into slots
  from jsonb_array_elements(changed->'workout'->'standardGeneration'->'groups') g;
 changed:=jsonb_set(changed,'{workout,standardGeneration,groups}',slots);
 select jsonb_agg(case when s->>'phase'='push' then s||jsonb_build_object('targetLevel',23) else s end) into slots from jsonb_array_elements(changed->'workout'->'slots') s;
 changed:=jsonb_set(changed,'{workout,slots}',slots);
 if not public."PIU_TRAINER_DAILY_VALID"(changed) then raise exception 'no-history neutral Standard session rejected'; end if;

 -- Compatibility assertions belong to the new migration, without older test suites or migration replay.
 old_run:=pg_temp.session_options_run('both','professional');
 old_run:=jsonb_set(jsonb_set(old_run,'{workout,selectionVersion}','"2.0.0"'),'{workout,orderVersion}','"2.0.0"')#-'{workout,settings}';
 if not public."PIU_TRAINER_DAILY_VALID"(old_run) then raise exception 'historical twenty-chart session rejected'; end if;
 select jsonb_agg(s) into slots from jsonb_array_elements(old_run->'workout'->'slots') s where s->>'phase'='warmup' or (regexp_match(s->>'id',':([0-9]+)$'))[1]::integer<=4;
 select jsonb_agg(s) into steps from jsonb_array_elements(old_run->'workout'->'steps') s where exists(select 1 from jsonb_array_elements(slots) t where t->>'id'=s->>'slotId');
 old_run:=jsonb_set(jsonb_set(jsonb_set(old_run,'{workout,slots}',slots),'{workout,steps}',steps),'{workout,selectionVersion}','"1.0.0"');
 if not public."PIU_TRAINER_DAILY_VALID"(old_run) or not public."PIU_TRAINER_DAILY_VALID"('{"planSessionId":"legacy-fixture"}') then raise exception 'historical sixteen-chart or legacy session rejected'; end if;

 foreach signature in array array['public."PIU_TRAINER_DAILY_VALID"(jsonb)','public."PIU_TRAINER_READ"(uuid,bigint,integer)'] loop
  if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE')
   or not has_function_privilege('service_role',signature,'EXECUTE') then raise exception 'function grant changed for %',signature; end if;
 end loop;
 select account_id into actor from public."PIU_TRAINER_PROFILES" where id='hds';
 saved:=public."PIU_TRAINER_READ"(actor);
 if saved->'capabilities' is distinct from '{"workouts":1,"personalSync":1,"sessionOptions":1}'::jsonb then raise exception 'capability contract missing'; end if;
 if (select count(*) from public."PIU_TRAINER_RECEIPTS" where fingerprint='preserve-session-options-fixture')<>1
  or (select count(*) from public."PIU_TRAINER_ACCOUNTS" where revision=0)<>3
  or (select count(distinct account_id) from public."PIU_TRAINER_PROFILES")<>3 then raise exception 'predecessor profiles, receipts or revision fences changed'; end if;
 select a.settings into settings from public."PIU_TRAINER_ACCOUNTS" a where user_id=actor;
 run:=pg_temp.session_options_run('doubles','standard');
 select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'sessionRunId',run->>'id','planSlotId',s->>'id','isCurrent',true)) into assignments from jsonb_array_elements(run->'workout'->'slots') s;
 state:=jsonb_build_object('settings',settings,'runs',jsonb_build_array(run),'assignments',assignments,'attempts','[]'::jsonb,'checkins','[]'::jsonb,'rerolls','[]'::jsonb,'corrections','[]'::jsonb,'preferences','[]'::jsonb,'archivedCharts','[]'::jsonb);
 saved:=public."PIU_TRAINER_COMMIT"(actor,req,'session-options-create',0,state,'null',false,'synthetic-fixture');
 if saved->>'revision'<>'1' or public."PIU_TRAINER_COMMIT"(actor,req,'session-options-create',0,state,'null',false,'synthetic-fixture')<>saved then raise exception 'version-3 commit/replay failed'; end if;
 begin perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'stale',0,state,'null',false,'synthetic-fixture'); raise exception 'stale revision accepted'; exception when others then if sqlerrm<>'CONFLICT' then raise; end if; end;
 begin perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'foreign-profile',1,jsonb_set(state,'{runs,0,workout,profileId}','"jonathan"'),'null',false,'synthetic-fixture'); raise exception 'foreign profile accepted'; exception when others then if sqlerrm<>'INVALID_PROFILE' then raise; end if; end;
 if (select count(*) from public."PIU_TRAINER_ACCOUNTS" where profile_id in ('jonathan','waffle') and revision=0)<>2 then raise exception 'foreign journal changed'; end if;
 raise notice 'Session options checks passed: all modes/algorithms, floors/ranges, Standard snapshot, historical formats, capabilities, ACLs, commit/replay and profile/revision fences.';
end $$;
rollback;
