\set ON_ERROR_STOP on
begin;
do $$
declare actor uuid; rid uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); settings jsonb; result jsonb;
 slots jsonb:='[]'; steps jsonb:='[]'; assignments jsonb:='[]'; state jsonb; run jsonb; slot text; phase text; mode text; idx integer; n integer; pos integer:=0; rep integer;
begin
 select account_id into actor from public."PIU_TRAINER_PROFILES" where id='waffle';
 if actor is null or (select count(distinct account_id) from public."PIU_TRAINER_PROFILES")<>3 then raise exception 'profile isolation failed'; end if;
 select a.settings into settings from public."PIU_TRAINER_ACCOUNTS" a where user_id=actor;
 if settings->'workout' is distinct from '{"warmupStart":17,"pushSingle":22,"pushDouble":24,"pushPlays":2,"allowedSongTypes":["Arcade","ShortCut","Remix","FullSong"]}'::jsonb then raise exception 'defaults incorrect'; end if;
 if (public."PIU_TRAINER_PROFILE"('waffle','2026-09-11')->>'accountId')::uuid<>actor then raise exception 'resolver mismatch'; end if;
 begin perform public."PIU_TRAINER_PROFILE"(actor::text,'2026-09-11'); raise exception 'arbitrary identity accepted'; exception when others then if sqlerrm<>'INVALID_PROFILE' then raise; end if; end;
 begin insert into public."PIU_TRAINER_ACCOUNTS"(user_id,profile_id) values(gen_random_uuid(),'unknown'); raise exception 'unknown account accepted'; exception when check_violation then null; end;
 begin insert into public."PIU_TRAINER_LEADERBOARD_CACHE"(cache_key) values('player:unknown'); raise exception 'unknown player cache accepted'; exception when check_violation then null; end;
 insert into public."PIU_TRAINER_LEADERBOARD_CACHE"(cache_key) values('player:waffle');
 if public."PIU_TRAINER_PERSONAL"('waffle','get') is not null then raise exception 'new profile inherited personal data'; end if;
 perform public."PIU_TRAINER_PERSONAL"('waffle','link',null,'{"externalUserId":"22222222-2222-4222-8222-222222222222","mappingVersion":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}');
 if public."PIU_TRAINER_PERSONAL"('waffle','get')->>'mappingVersion'<>'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' then raise exception 'personal scope failed'; end if;
 begin perform public."PIU_TRAINER_PERSONAL"('unknown','get'); raise exception 'unknown personal accepted'; exception when others then if sqlerrm<>'INVALID_PROFILE' then raise; end if; end;

 for idx in 0..1 loop
  insert into public."PIU_TRAINER_LEADERBOARD_CACHE"(cache_key,fetched_at,payload)
  values('board:30000000-0000-4000-8000-'||lpad(idx::text,12,'0'),now(),jsonb_build_object('board',jsonb_build_object(
   'mix','Phoenix2','asOf','2026-09-11T12:00:00Z','data',jsonb_build_array(
    jsonb_build_object('place',200+idx,'score',980000,'player',jsonb_build_object('playerId',7548,'gameTag','WAFFLE#1473','isSupplemented',false)),
    jsonb_build_object('place',20,'score',990000,'player',jsonb_build_object('playerId',4626,'gameTag','HDS#9184','isSupplemented',false)),
    jsonb_build_object('place',300,'score',970000,'player',jsonb_build_object('playerId',5756,'gameTag','JONATHAN#5143','isSupplemented',false))))));
 end loop;
 result:=public."PIU_TRAINER_BOARD_MEMBERSHIP"('waffle','2026-09-10');
 if jsonb_array_length(result)<>2 or result->0->'goal'<>'true' or result->1->'goal'<>'false'
  or result->0->'top300'<>'true' or result->1->'top300'<>'true' then raise exception 'rank 200/201 boundary failed'; end if;
 if public."PIU_TRAINER_BOARD_MEMBERSHIP"('hds','2026-09-10')->0->'goal'<>'true'
  or public."PIU_TRAINER_BOARD_MEMBERSHIP"('jonathan','2026-09-10')->0->'goal'<>'true' then raise exception 'existing threshold changed'; end if;

 foreach phase in array array['warmup','push'] loop
  foreach mode in array array['Single','Double'] loop
   n:=case when phase='push' then 6 else 4 end;
   for idx in 1..n loop
    slot:=rid::text||':'||phase||':'||lower(mode)||':'||idx;
    slots:=slots||jsonb_build_array(jsonb_build_object('id',slot,'phase',phase,'mode',mode,'minLevel',20,'maxLevel',24,'level',20,'targetLevel',20)
     ||case when phase='push' then jsonb_build_object('lane',case when idx<=3 then 'random' else 'improvement' end) else '{}'::jsonb end);
    assignments:=assignments||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'sessionRunId',rid,'planSlotId',slot,'isCurrent',true));
    for rep in 1..case when phase='push' then 2 else 1 end loop
     pos:=pos+1;
     steps:=steps||jsonb_build_array(jsonb_build_object('id',slot||':play:'||rep,'slotId',slot,'phase',phase,'repetition',rep,'included',true,'position',pos));
    end loop;
   end loop;
  end loop;
 end loop;
 run:=jsonb_build_object('id',rid,'kind','daily','status','generated','plays','[]'::jsonb,'stepStates','[]'::jsonb,'workout',jsonb_build_object(
  'version',1,'profileId','waffle','selectionVersion','2.0.0','orderVersion','2.0.0','slots',slots,'steps',steps));
 if not public."PIU_TRAINER_DAILY_VALID"(run) then raise exception 'WAFFLE daily session rejected'; end if;
 if public."PIU_TRAINER_DAILY_VALID"(jsonb_set(run,'{workout,profileId}','"unknown"')) then raise exception 'unknown session accepted'; end if;
 insert into public."PIU_TRAINER_CATALOGS"(revision,payload) values('waffle-fixture','{}');
 insert into public."PIU_TRAINER_CATALOG_HEAD"(id,revision) values(true,'waffle-fixture');
 state:=jsonb_build_object('settings',settings,'runs',jsonb_build_array(run),'assignments',assignments,'attempts','[]'::jsonb,'checkins','[]'::jsonb,'rerolls','[]'::jsonb,'corrections','[]'::jsonb,'preferences','[]'::jsonb,'archivedCharts','[]'::jsonb);
 result:=public."PIU_TRAINER_COMMIT"(actor,req,'waffle-create',0,state,'null',false,'waffle-fixture');
 if result->>'revision'<>'1' or public."PIU_TRAINER_COMMIT"(actor,req,'waffle-create',0,state,'null',false,'waffle-fixture')<>result then raise exception 'commit/replay failed'; end if;
 begin perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'foreign-profile',1,jsonb_set(state,'{runs,0,workout,profileId}','"hds"'),'null',false,'waffle-fixture'); raise exception 'foreign journal accepted'; exception when others then if sqlerrm<>'INVALID_PROFILE' then raise; end if; end;
 if (select revision from public."PIU_TRAINER_ACCOUNTS" where profile_id='hds')<>7
  or (select revision from public."PIU_TRAINER_ACCOUNTS" where profile_id='jonathan')<>9
  or (select count(*) from public."PIU_TRAINER_ACCOUNTS" a where profile_id in ('hds','jonathan') and a.settings=jsonb_build_object('fixture',profile_id))<>2
  or (select count(*) from public."PIU_TRAINER_RECEIPTS" where fingerprint='preserve-fixture')<>1 then raise exception 'predecessor journals changed'; end if;
 if has_function_privilege('anon','public."PIU_TRAINER_PROFILE"(text,date)','EXECUTE')
  or has_function_privilege('authenticated','public."PIU_TRAINER_BOARD_MEMBERSHIP"(text,timestamptz)','EXECUTE')
  or not has_function_privilege('service_role','public."PIU_TRAINER_PROFILE"(text,date)','EXECUTE') then raise exception 'grants changed'; end if;
 raise notice 'WAFFLE migration checks passed: defaults, isolation, allowlists, top-200 boundary, daily commit/replay and predecessor preservation.';
end $$;
rollback;
