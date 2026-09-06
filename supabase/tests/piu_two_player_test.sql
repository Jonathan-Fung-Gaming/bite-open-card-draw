\set ON_ERROR_STOP on
begin;
do $$
declare hds uuid; jonathan uuid; result jsonb; state jsonb; rev bigint; lease uuid:=gen_random_uuid();
 run_id uuid:=gen_random_uuid(); assignment_id uuid:=gen_random_uuid(); req uuid:=gen_random_uuid();
begin
 if (select count(*) from public."PIU_TRAINER_PROFILES")<>2 then raise exception 'Expected exactly two profiles'; end if;
 hds := (public."PIU_TRAINER_PROFILE"('hds','2026-09-06')->>'accountId')::uuid;
 jonathan := (public."PIU_TRAINER_PROFILE"('jonathan','2026-09-06')->>'accountId')::uuid;
 if hds=jonathan then raise exception 'Profiles share a journal'; end if;
 if public."PIU_TRAINER_PROFILE"('hds','2026-09-08')->>'enrolledOn'<>'2026-09-06' then raise exception 'Enrollment moved'; end if;
 begin perform public."PIU_TRAINER_PROFILE"('unknown','2026-09-06'); raise exception 'Expected rejection';
 exception when raise_exception then if sqlerrm<>'INVALID_PROFILE' then raise; end if; end;
 if not exists(select 1 from public."PIU_TRAINER_ACCOUNTS" where user_id='10000000-0000-4000-8000-000000000099' and revision=7 and settings='{"legacy":true}') then raise exception 'Legacy journal changed'; end if;
 if public."PIU_TRAINER_RECEIPT"('10000000-0000-4000-8000-000000000099','20000000-0000-4000-8000-000000000099','legacy')<>'{"revision":7}' then raise exception 'Legacy receipt changed'; end if;
 delete from auth.users where id='10000000-0000-4000-8000-000000000099';
 if not exists(select 1 from public."PIU_TRAINER_ACCOUNTS" where user_id='10000000-0000-4000-8000-000000000099') then raise exception 'Still coupled to Auth'; end if;
 perform public."PIU_TRAINER_ENROLL"(hds,'{"profileId":"hds","sessions":[]}');
 perform public."PIU_TRAINER_ENROLL"(hds,'{"profileId":"hds","sessions":[],"changed":true}');
 if public."PIU_TRAINER_STATE"(hds)->'trainingPlan'<>'{"profileId":"hds","sessions":[]}' then raise exception 'Plan enrollment not immutable'; end if;
 if public."PIU_TRAINER_READ"(hds)->>'revision'<>'1' then raise exception 'Enrollment revision wrong'; end if;
 state:=public."PIU_TRAINER_STATE"(hds);
 state:=jsonb_set(state,'{runs}',jsonb_build_array(jsonb_build_object('id',run_id,'planSessionId','HDS-test','status','generated','planSnapshot',jsonb_build_object('sets',jsonb_build_array(jsonb_build_object('slots',jsonb_build_array(jsonb_build_object('id','slot'))))))));
 state:=jsonb_set(state,'{assignments}',jsonb_build_array(jsonb_build_object('id',assignment_id,'sessionRunId',run_id,'planSlotId','slot','isCurrent',true)));
 state:=jsonb_set(state,'{completions}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'assignmentId',assignment_id,'sequence',1,'completed',true,'createdAtUtc','2026-09-06T00:00:00Z')));
 result:=public."PIU_TRAINER_COMMIT"(hds,req,'completion',1,state,'null',false,'fixture');
 if jsonb_array_length(public."PIU_TRAINER_STATE"(hds)->'completions')<>1 or public."PIU_TRAINER_STATE"(hds)->'attempts'<>'[]' then raise exception 'Neutral completion became a legacy attempt'; end if;
 if public."PIU_TRAINER_COMMIT"(hds,req,'completion',1,state,'null',false,'fixture')<>result then raise exception 'Completion replay failed'; end if;
 if public."PIU_TRAINER_STATE"(jonathan)->'completions'<>'[]' then raise exception 'Cross-profile completion leak'; end if;
 state:=jsonb_set(state,'{completions}',(state->'completions')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'assignmentId',assignment_id,'sequence',2,'completed',false,'createdAtUtc','2026-09-06T00:01:00Z')));
 perform public."PIU_TRAINER_COMMIT"(hds,gen_random_uuid(),'undo',2,state,'null',false,'fixture');
 if jsonb_array_length(public."PIU_TRAINER_STATE"(hds)->'completions')<>2 then raise exception 'Undo audit lost'; end if;
 perform public."PIU_TRAINER_COMMIT"(hds,gen_random_uuid(),'archive',3,state,'null',true,'fixture');
 if not exists(select 1 from public."PIU_TRAINER_ARCHIVES" where user_id=hds and jsonb_array_length(payload->'completions')=2) then raise exception 'Completion safety archive lost'; end if;
 if public."PIU_TRAINER_RECEIPT"(hds,req,'completion')<>result then raise exception 'Archive erased receipt'; end if;
 if public."PIU_TRAINER_CACHE"('player:hds','lease',lease)<>'true' then raise exception 'Cache lease failed'; end if;
 if public."PIU_TRAINER_CACHE"('player:hds','lease',gen_random_uuid())<>'false' then raise exception 'Parallel cache lease granted'; end if;
 if public."PIU_TRAINER_CACHE"('player:hds','put',gen_random_uuid(),'{"wrong":true}')<>'false' then raise exception 'Wrong cache lease accepted'; end if;
 if public."PIU_TRAINER_CACHE"('player:hds','put',lease,'{"good":true}')<>'true' then raise exception 'Cache save failed'; end if;
 if public."PIU_TRAINER_CACHE"('player:hds','get')->'payload'<>'{"good":true}' then raise exception 'Cache value lost'; end if;
 if public."PIU_TRAINER_CACHE"('player:hds','lease',gen_random_uuid(),null,true)<>'false' then raise exception 'Manual cooldown bypassed'; end if;
 update public."PIU_TRAINER_LEADERBOARD_CACHE" set fetched_at=now()-interval '2 days',attempted_at=now()-interval '5 minutes' where cache_key='player:hds';
 lease:=gen_random_uuid();
 perform public."PIU_TRAINER_CACHE"('player:hds','lease',lease);
 perform public."PIU_TRAINER_CACHE"('player:hds','fail',lease);
 if public."PIU_TRAINER_CACHE"('player:hds','get')->'payload'<>'{"good":true}' then raise exception 'Failure erased last good cache'; end if;
end $$;
do $$ declare item record; begin
 for item in select c.oid,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('PIU_TRAINER_PROFILES','PIU_TRAINER_COMPLETIONS','PIU_TRAINER_LEADERBOARD_CACHE') loop
  if not item.relrowsecurity or has_table_privilege('anon',item.oid,'SELECT') or has_table_privilege('authenticated',item.oid,'INSERT') then raise exception 'New table exposed'; end if;
 end loop;
 for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('PIU_TRAINER_PROFILE','PIU_TRAINER_ENROLL','PIU_TRAINER_CACHE','PIU_TRAINER_COMMIT','PIU_TRAINER_STATE','PIU_TRAINER_READ') loop
  if has_function_privilege('anon',item.oid,'EXECUTE') or has_function_privilege('authenticated',item.oid,'EXECUTE') or not has_function_privilege('service_role',item.oid,'EXECUTE') then raise exception 'New/changed RPC ACL incorrect'; end if;
 end loop;
end $$;
rollback;
\echo New two-player migration: profiles, legacy preservation, enrollment, completions, replay/archive and cache checks passed.
