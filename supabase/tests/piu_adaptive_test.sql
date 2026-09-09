\set ON_ERROR_STOP on
begin;
do $$
declare actor uuid:='10000000-0000-4000-8000-000000000001'; other uuid:='10000000-0000-4000-8000-000000000002';
 state jsonb; run_record jsonb; slots jsonb:='[]'; steps jsonb:='[]'; assignments jsonb:='[]';
 run_id uuid:=gen_random_uuid(); assignment_id uuid; event_id uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); saved jsonb; item jsonb;
 index integer; slot text; phase text; mode text; rev bigint;
begin
 if public."PIU_TRAINER_READ"(actor)->'capabilities'<>'{"workouts":1,"personalSync":1}' then raise exception 'Capabilities missing'; end if;
 if public."PIU_TRAINER_READ"(actor)->>'planReady'<>'true' or public."PIU_TRAINER_STATE"(actor)->'trainingPlan'<>'null' then raise exception 'Fresh daily account requires enrollment'; end if;
 state:=public."PIU_TRAINER_STATE"(actor);
 state:=jsonb_set(state,'{runs}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'planSessionId','legacy-W1','status','skipped')));
 perform public."PIU_TRAINER_COMMIT"(actor,req,'legacy',0,state,'null',false,'fixture');
 saved:=public."PIU_TRAINER_RECEIPT"(actor,req,'legacy');
 for index in 0..15 loop
  phase:=case when index<8 then 'warmup' else 'push' end;
  mode:=case when index%8<4 then 'Single' else 'Double' end;
  slot:='slot-'||index;
  slots:=slots||jsonb_build_array(jsonb_build_object('id',slot,'phase',phase,'mode',mode));
  steps:=steps||jsonb_build_array(jsonb_build_object('id',slot||'-1','slotId',slot,'phase',phase,'repetition',1,'included',true));
  if phase='push' then steps:=steps||jsonb_build_array(jsonb_build_object('id',slot||'-2','slotId',slot,'phase',phase,'repetition',2,'included',true)); end if;
  assignment_id:=gen_random_uuid();
  assignments:=assignments||jsonb_build_array(jsonb_build_object('id',assignment_id,'sessionRunId',run_id,'planSlotId',slot,'isCurrent',true));
 end loop;
 run_record:=jsonb_build_object('id',run_id,'kind','daily','status','generated','workout',jsonb_build_object('version',1,'profileId','hds','localDate','2026-09-09','slots',slots,'steps',steps),'plays','[]'::jsonb,'stepStates','[]'::jsonb);
 if not public."PIU_TRAINER_DAILY_VALID"(run_record) then raise exception 'Valid daily run rejected'; end if;
 if public."PIU_TRAINER_DAILY_VALID"(jsonb_build_object('id',run_id,'kind','daily')) then raise exception 'Missing daily payload accepted'; end if;
 state:=jsonb_set(state,'{runs}',state->'runs'||jsonb_build_array(run_record));
 state:=jsonb_set(state,'{assignments}',assignments);
 state:=jsonb_set(state,'{settings,workout}','{"warmupStart":20,"pushSingle":26,"pushDouble":28,"pushPlays":2,"allowedSongTypes":["Arcade","ShortCut","Remix","FullSong"]}');
 perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'daily',1,state,'null',false,'fixture');
 if public."PIU_TRAINER_STATE"(actor)->'settings'->'workout' is distinct from state->'settings'->'workout' then raise exception 'Preferences lost'; end if;
 item:=jsonb_build_object('id',event_id,'assignmentId',assignments->0->>'id','stepId','slot-0-1','completed',true,'sequence',1,'createdAtUtc','2026-09-09T00:00:00Z');
 run_record:=jsonb_set(run_record,'{plays}',jsonb_build_array(item));
 state:=jsonb_set(state,'{runs,1}',run_record);
 perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'play',2,state,'{"saved":true}',false,'fixture');
 if public."PIU_TRAINER_STATE"(other)->'runs'<>'[]' then raise exception 'Daily profile leak'; end if;
 if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run_record,'{plays}',jsonb_build_array(item,item))) then raise exception 'Duplicate play accepted'; end if;
 if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run_record,'{plays,0,sequence}','2')) then raise exception 'Skipped event sequence accepted'; end if;
 begin
  perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'wrong-owner',3,jsonb_set(state,'{runs,1,workout,profileId}','"jonathan"'),'null',false,'fixture');
  raise exception 'Expected wrong profile rejection';
 exception when raise_exception then if sqlerrm<>'INVALID_PROFILE' then raise; end if; end;
 begin
  perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'wrong-play',3,jsonb_set(state,'{runs,1,plays,0,assignmentId}',to_jsonb(gen_random_uuid()::text)),'null',false,'fixture');
  raise exception 'Expected foreign assignment rejection';
 exception when raise_exception then if sqlerrm<>'INVALID_PLAY' then raise; end if; end;
 begin
  perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'short',3,jsonb_set(state,'{assignments}',assignments-0),'null',false,'fixture');
  raise exception 'Expected short daily rejection';
 exception when raise_exception then if sqlerrm<>'INVALID_ASSIGNMENTS' then raise; end if; end;
 -- Finish/archive does not lose play records, preferences, receipts or the legacy run.
 perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'archive',3,state,'null',true,'fixture');
 if not exists(select 1 from public."PIU_TRAINER_ARCHIVES" a cross join lateral jsonb_array_elements(a.payload->'runs') r where a.user_id=actor and r->'plays'->0->>'id'=event_id::text) then raise exception 'Daily safety archive lost'; end if;
 if public."PIU_TRAINER_RECEIPT"(actor,req,'legacy')<>saved then raise exception 'Legacy receipt lost'; end if;
 if public."PIU_TRAINER_COMMIT"(actor,req,'legacy',0,state,'null',false,'fixture')<>saved then raise exception 'Old receipt replay failed'; end if;
 -- Daily dates are not unique; an additional workout uses another UUID.
 run_id:=gen_random_uuid();
 run_record:=jsonb_set(jsonb_set(run_record,'{id}',to_jsonb(run_id::text)),'{plays}','[]');
 assignments:='[]';
 for index in 0..15 loop assignments:=assignments||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'sessionRunId',run_id,'planSlotId','slot-'||index,'isCurrent',true)); end loop;
 state:=jsonb_set(state,'{runs}',state->'runs'||jsonb_build_array(run_record));
 state:=jsonb_set(state,'{assignments}',state->'assignments'||assignments);
 perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'second-same-day',4,state,'null',false,'fixture');
 if jsonb_array_length(public."PIU_TRAINER_STATE"(actor)->'runs')<>3 then raise exception 'Same-day workout rejected'; end if;
 rev:=(public."PIU_TRAINER_READ"(actor)->>'revision')::bigint;
 if rev<>5 then raise exception 'Revision fence drifted'; end if;
end $$;

do $$
declare token uuid:=gen_random_uuid(); mapping text:=repeat('a',64); payload jsonb; revision_before bigint; result jsonb;
begin
 revision_before:=(public."PIU_TRAINER_READ"('10000000-0000-4000-8000-000000000001')->>'revision')::bigint;
 perform public."PIU_TRAINER_PERSONAL"('hds','link',null,jsonb_build_object('externalUserId','20000000-0000-4000-8000-000000000001','mappingVersion',mapping));
 if public."PIU_TRAINER_PERSONAL"('hds','lease',token)<>'true' then raise exception 'Sync lease failed'; end if;
 if public."PIU_TRAINER_PERSONAL"('hds','lease',gen_random_uuid())<>'false' then raise exception 'Parallel sync lease granted'; end if;
 payload:=jsonb_build_object('version',1,'mappingVersion',mapping,'catalogRevision','fixture','scoresComplete',true,'journalComplete',false,'scoreChartIds','[]'::jsonb,'journalChartIds','[]'::jsonb,'fetchedAtUtc',now(),'checkpointUtc',now(),'fullSyncedAtUtc',now());
 begin perform public."PIU_TRAINER_PERSONAL"('hds','publish',token,payload); raise exception 'Expected incomplete sync rejection'; exception when raise_exception then if sqlerrm<>'INCOMPLETE_PERSONAL' then raise; end if; end;
 if public."PIU_TRAINER_PERSONAL"('hds','publish',gen_random_uuid(),payload)<>'false' then raise exception 'Wrong lease accepted'; end if;
 payload:=jsonb_set(payload,'{journalComplete}','true');
 perform public."PIU_TRAINER_PERSONAL"('hds','publish',token,payload);
 result:=public."PIU_TRAINER_PERSONAL"('hds','get');
 if result->'snapshot'<>payload or result->>'revision'<>'1' or result->'staging'<>'null' then raise exception 'Atomic publication failed'; end if;
 if public."PIU_TRAINER_PERSONAL"('jonathan','get') is not null then raise exception 'Personal profile leak'; end if;
 if (public."PIU_TRAINER_READ"('10000000-0000-4000-8000-000000000001')->>'revision')::bigint<>revision_before then raise exception 'Sync changed journal revision'; end if;
 if public."PIU_TRAINER_STATE"('10000000-0000-4000-8000-000000000001') ? 'personal' then raise exception 'Account data in journal'; end if;
 update public."PIU_TRAINER_PERSONAL_ACCOUNTS" set attempted_at=now()-interval '3 minutes' where profile_id='hds';
 token:=gen_random_uuid(); perform public."PIU_TRAINER_PERSONAL"('hds','lease',token,null,true);
 perform public."PIU_TRAINER_PERSONAL"('hds','save',token,jsonb_build_object('version',1,'mappingVersion',mapping,'catalogRevision','fixture','next','cursor'));
 if public."PIU_TRAINER_PERSONAL"('hds','get')->'snapshot'<>payload then raise exception 'Partial pages replaced published coverage'; end if;
 update public."PIU_TRAINER_PERSONAL_ACCOUNTS" set attempted_at=now()-interval '3 minutes' where profile_id='hds';
 token:=gen_random_uuid(); perform public."PIU_TRAINER_PERSONAL"('hds','lease',token);
 perform public."PIU_TRAINER_PERSONAL"('hds','fail',token,'{"denied":true,"retrySeconds":300}');
 if public."PIU_TRAINER_PERSONAL"('hds','get')->>'available'<>'false' then raise exception 'Revoked account remains available'; end if;
 if public."PIU_TRAINER_PERSONAL"('hds','lease',gen_random_uuid(),null,true)<>'false' then raise exception 'Retry-After bypassed'; end if;
 perform public."PIU_TRAINER_PERSONAL"('hds','link',null,jsonb_build_object('externalUserId','20000000-0000-4000-8000-000000000003','mappingVersion',repeat('b',64)));
 if public."PIU_TRAINER_PERSONAL"('hds','get')->'snapshot'<>'null' then raise exception 'New mapping reused prior account'; end if;
end $$;
do $$
declare board jsonb; projected jsonb; id text; index integer;
begin
 board:='{"mix":"Phoenix2","asOf":"2026-09-07T00:00:00Z","data":[{"place":20,"score":999000,"player":{"playerId":4626,"gameTag":"HDS#9184","isSupplemented":false}}]}';
 for index in 1..8 loop
  id:='30000000-0000-4000-8000-'||lpad(index::text,12,'0');
  insert into public."PIU_TRAINER_LEADERBOARD_CACHE"(cache_key,payload,fetched_at)
   values('board:'||id,jsonb_build_object('board',board),now());
 end loop;
 update public."PIU_TRAINER_LEADERBOARD_CACHE" set payload=jsonb_set(payload,'{board,asOf}','"2026-09-05T00:00:00Z"') where cache_key like '%000000000002';
 update public."PIU_TRAINER_LEADERBOARD_CACHE" set payload=jsonb_set(payload,'{board,mix}','"Phoenix"') where cache_key like '%000000000003';
 update public."PIU_TRAINER_LEADERBOARD_CACHE" set payload=jsonb_set(payload,'{board,data,0,player,isSupplemented}','true') where cache_key like '%000000000004';
 update public."PIU_TRAINER_LEADERBOARD_CACHE" set payload=jsonb_set(payload,'{board,data,0,player,gameTag}','"OTHER#0000"') where cache_key like '%000000000005';
 update public."PIU_TRAINER_LEADERBOARD_CACHE" set payload=jsonb_set(payload,'{board,asOf}','"invalid"') where cache_key like '%000000000006';
 update public."PIU_TRAINER_LEADERBOARD_CACHE" set payload=jsonb_set(payload,'{board,data}','[]') where cache_key like '%000000000007';
 update public."PIU_TRAINER_LEADERBOARD_CACHE" set payload=jsonb_set(payload,'{board,data,0,place}','301') where cache_key like '%000000000008';
 projected:=public."PIU_TRAINER_BOARD_MEMBERSHIP"('hds','2026-09-06T00:00:00Z');
 if jsonb_array_length(projected)<>4 then raise exception 'Invalid boards affected membership'; end if;
 if not exists(select 1 from jsonb_array_elements(projected) r where r->>'chartId' like '%000000000001' and r->>'goal'='true' and r->>'top300'='true' and r->>'played'='true') then raise exception 'Newer board membership missing'; end if;
 if not exists(select 1 from jsonb_array_elements(projected) r where r->>'chartId' like '%000000000007' and r->>'goal'='false' and r->>'played'='false') then raise exception 'Board absence not reflected'; end if;
 if not exists(select 1 from jsonb_array_elements(projected) r where r->>'chartId' like '%000000000008' and r->>'top300'='false' and r->>'played'='true') then raise exception 'Inclusive goal threshold invalid'; end if;
 if projected::text like '%999000%' or projected::text like '%place%' or projected::text like '%playerId%' then raise exception 'Exact ranking escaped membership projection'; end if;
 if public."PIU_TRAINER_BOARD_MEMBERSHIP"('hds',null)<>'[]' then raise exception 'Partial boards established coverage'; end if;
 delete from public."PIU_TRAINER_LEADERBOARD_CACHE" where cache_key like '%000000000001';
 projected:=public."PIU_TRAINER_BOARD_MEMBERSHIP"('hds','2026-09-06T00:00:00Z');
 if not exists(select 1 from jsonb_array_elements(projected) r where r->>'chartId' like '%000000000001' and r->>'goal'='true') then raise exception 'Raw cache eviction erased known goal'; end if;
 board:=jsonb_set(jsonb_set(board,'{asOf}','"2026-09-08T00:00:00Z"'),'{data}','[]');
 insert into public."PIU_TRAINER_LEADERBOARD_CACHE"(cache_key,payload,fetched_at)
  values('board:30000000-0000-4000-8000-000000000001',jsonb_build_object('board',board),now());
 projected:=public."PIU_TRAINER_BOARD_MEMBERSHIP"('hds','2026-09-06T00:00:00Z');
 if not exists(select 1 from jsonb_array_elements(projected) r where r->>'chartId' like '%000000000001' and r->>'goal'='false' and r->>'played'='true') then raise exception 'Newer authority failed to release goal while retaining played'; end if;
 delete from public."PIU_TRAINER_LEADERBOARD_CACHE" where left(cache_key,6)='board:';
 projected:=public."PIU_TRAINER_BOARD_MEMBERSHIP"('hds','2026-09-09T00:00:00Z');
 if not exists(select 1 from jsonb_array_elements(projected) r where r->>'chartId' like '%000000000001' and r->>'played'='true') then raise exception 'Later player snapshot erased positive board history'; end if;
 if public."PIU_TRAINER_BOARD_MEMBERSHIP"('jonathan','2026-09-06T00:00:00Z')<>'[]' then raise exception 'Membership crossed profile'; end if;
end $$;
do $$ declare obj record; begin
 if has_table_privilege('anon','public."PIU_TRAINER_PERSONAL_ACCOUNTS"','SELECT') or has_table_privilege('authenticated','public."PIU_TRAINER_PERSONAL_ACCOUNTS"','INSERT') then raise exception 'Private cache exposed'; end if;
 if not(select relrowsecurity from pg_class where oid='public."PIU_TRAINER_PERSONAL_ACCOUNTS"'::regclass) then raise exception 'Missing cache RLS'; end if;
 if has_table_privilege('anon','public."PIU_TRAINER_OFFICIAL_MEMBERSHIP"','SELECT') or has_table_privilege('authenticated','public."PIU_TRAINER_OFFICIAL_MEMBERSHIP"','INSERT')
  or not(select relrowsecurity from pg_class where oid='public."PIU_TRAINER_OFFICIAL_MEMBERSHIP"'::regclass) then raise exception 'Durable membership exposed'; end if;
 for obj in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('PIU_TRAINER_PERSONAL','PIU_TRAINER_BOARD_MEMBERSHIP','PIU_TRAINER_DAILY_VALID','PIU_TRAINER_STATE','PIU_TRAINER_READ','PIU_TRAINER_COMMIT') loop
  if has_function_privilege('anon',obj.oid,'EXECUTE') or has_function_privilege('authenticated',obj.oid,'EXECUTE') or not has_function_privilege('service_role',obj.oid,'EXECUTE') then raise exception 'RPC ACL invalid'; end if;
 end loop;
end $$;
rollback;
\echo New adaptive migration: daily shape, ownership, replay/history, isolated sync publication and ACL checks passed.
