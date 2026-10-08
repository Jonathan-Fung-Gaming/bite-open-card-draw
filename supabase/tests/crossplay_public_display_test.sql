-- Only this additive projection's acceptance. Fixture writes roll back.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %',message; end if;
end $$;
create function pg_temp.unavailable(key text) returns void language plpgsql as $$
declare rejected boolean:=false; begin
  begin perform crossplay.display_read(key); exception when others then
    if sqlerrm='NOT_FOUND' then rejected:=true; else raise; end if;
  end;
  perform pg_temp.assert(rejected,'private or missing display must return NOT_FOUND');
end $$;

do $$ declare f record; begin
  perform pg_temp.assert(crossplay.display_version()='20261008040000','display capability');
  for f in select p.oid,p.proname,p.proconfig,p.prosecdef,p.provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='crossplay' and p.proname in ('display_version','display_read') loop
    perform pg_temp.assert(f.prosecdef and f.provolatile='s' and f.proconfig @> array['search_path=""'],'stable security-definer and empty search path');
    perform pg_temp.assert(has_function_privilege('crossplay_runtime',f.oid,'EXECUTE'),'runtime projection access');
    perform pg_temp.assert(not has_function_privilege('anon',f.oid,'EXECUTE') and not has_function_privilege('authenticated',f.oid,'EXECUTE') and not has_function_privilege('service_role',f.oid,'EXECUTE'),'browser and service roles remain excluded');
  end loop;
  perform pg_temp.assert(not has_table_privilege('crossplay_runtime','crossplay.match_clock_sessions','SELECT'),'clock base table remains private');
  perform pg_temp.assert(not has_table_privilege('crossplay_runtime','crossplay.match_reports','SELECT'),'report base table remains private');
  perform pg_temp.unavailable('does-not-exist');
end $$;

create temporary table display_fixture(tid uuid,rid uuid,owner_id uuid);
do $$ declare tid uuid; rid uuid; owner_id uuid:=gen_random_uuid(); mid uuid; a uuid; b uuid; i integer; draft uuid; report_id uuid;
 cfg jsonb:='{"roundCount":3,"timeLimitSeconds":1200,"penaltyIntervalSeconds":10,"penaltyPoints":2}';
begin
  insert into auth.users(id) values(owner_id);
  insert into crossplay.organizers(user_id) values(owner_id);
  insert into crossplay.tournaments(slug,name,status,config,frozen_config,seed,started_at)
    values('crossplay-public-display-acceptance','Public display fixture','active',cfg,cfg,'PRIVATE_SEED',now()) returning id into tid;
  insert into crossplay.tournament_staff values(tid,owner_id,'owner');
  insert into crossplay.table_settings(tournament_id) values(tid);
  insert into crossplay.physical_tables select tid,n,true from generate_series(1,6) n;
  insert into crossplay.table_devices values(tid,gen_random_uuid(),'PRIVATE_DEVICE_LABEL',1,0);
  insert into crossplay.rounds(tournament_id,number,status,engine_version,input_hash,input_version,input_snapshot)
    values(tid,1,'published','PRIVATE_ENGINE','PRIVATE_INPUT_HASH',0,'{"private":"PRIVATE_SNAPSHOT"}') returning id into rid;
  insert into display_fixture values(tid,rid,owner_id);
  for i in 1..8 loop
    a:=gen_random_uuid(); b:=case when i=8 then null else gen_random_uuid() end;
    insert into crossplay.entrants(tournament_id,id,name,normalized_name,seed,active) values(tid,a,'Player '||i||'A','player '||i||'a',i*2-1,i<>8);
    if b is not null then insert into crossplay.entrants(tournament_id,id,name,normalized_name,seed) values(tid,b,'Player '||i||'B','player '||i||'b',i*2); end if;
    insert into crossplay.matches(tournament_id,round_id,table_number,kind,status) values(tid,rid,i,case when b is null then 'bye' else 'played' end,
      case when i=5 then 'awaiting_confirmation' when i=6 then 'disputed' else 'unreported' end) returning id into mid;
    insert into crossplay.match_sides values(tid,rid,mid,1,a);
    if b is not null then insert into crossplay.match_sides values(tid,rid,mid,2,b); end if;
    if i<=6 then
      insert into crossplay.match_clock_sessions(tournament_id,match_id,rules,status,active_side,controller_id,controller_actor)
        values(tid,mid,cfg,case when i=1 then 'ready' when i=2 then 'running' when i=3 then 'paused' else 'ended' end,1,gen_random_uuid(),'PRIVATE_CONTROLLER');
    end if;
    if i in (5,6) then
      insert into crossplay.match_reports(tournament_id,match_id,revision,submitted_by,raw1,raw2,overtime1,overtime2,dispute_reason)
        values(tid,mid,1,a,98765,87654,0,0,'PRIVATE_REASON') returning id into report_id;
      update crossplay.matches set current_report_id=report_id where tournament_id=tid and id=mid;
    end if;
    if i=8 then perform crossplay.finalize_match(tid,mid,'bye','{}',jsonb_build_object('userId',owner_id),null); end if;
  end loop;
  perform crossplay.allocate_tables(tid,rid);
  insert into crossplay.rounds(tournament_id,number,status,engine_version,input_hash,input_version,input_snapshot)
    values(tid,2,'draft','PRIVATE_DRAFT_ENGINE','PRIVATE_DRAFT_HASH',0,'{}') returning id into draft;
  insert into crossplay.matches(tournament_id,round_id,table_number,kind) values(tid,draft,1,'bye') returning id into mid;
  insert into crossplay.match_sides values(tid,draft,mid,1,a);
end $$;

do $$ declare p jsonb; previous jsonb; tid uuid; rid uuid; mid uuid; before_version bigint; result_id uuid;
begin
  select f.tid,f.rid into tid,rid from display_fixture f;
  p:=crossplay.display_read('crossplay-public-display-acceptance');
  perform pg_temp.assert(p=crossplay.display_read(tid::text),'slug and id return identical coherent data');
  perform pg_temp.assert(p->>'serverNowMs' is not null,'server time present');
  perform pg_temp.assert(jsonb_array_length(p#>'{snapshot,rounds}')=1,'unpublished pairing not projected');
  perform pg_temp.assert(jsonb_array_length(p#>'{snapshot,entrants}')=15,'withdrawn entrant retained');
  perform pg_temp.assert(p::text !~ 'PRIVATE_|98765|87654|controllerId|controllerActor|deviceId|token_hash|disputeReason|inputHash|engineVersion|current_report_id','private state absent');
  perform pg_temp.assert(not (p->'snapshot')?'viewer' and not (p->'snapshot')?'audit','no viewer or audit');
  perform pg_temp.assert((select count(*)=8 from jsonb_each(p->'matches')),'all and only published statuses');
  perform pg_temp.assert((select array_agg(p#>>array['matches',m.id::text,'status'] order by m.table_number)
    from crossplay.matches m where m.tournament_id=tid and m.round_id=rid)=array['ready','playing','paused','reporting','awaiting_confirmation','organizer_review','queued','final'],'explicit clock/report/queue/final statuses');
  perform pg_temp.assert((select count(*)=7 from jsonb_array_elements(p#>'{snapshot,tables,locations}')),'bye consumes no physical table');
  select m.id into mid from crossplay.matches m where m.tournament_id=tid and m.round_id=rid and m.table_number=2;
  select version into before_version from crossplay.tournaments where id=tid;
  previous:=p-'serverNowMs';
  update crossplay.match_clock_sessions set status='paused' where tournament_id=tid and match_id=mid;
  p:=crossplay.display_read(tid::text);
  perform pg_temp.assert(p#>>array['matches',mid::text,'status']='paused' and p-'serverNowMs'<>previous,'clock change is present without tournament version change');
  perform pg_temp.assert((select version=before_version from crossplay.tournaments where id=tid),'status projection does not rely on tournament version');
  update crossplay.match_clock_sessions set review_required=true where tournament_id=tid and match_id=mid;
  perform pg_temp.assert(crossplay.display_read(tid::text)#>>array['matches',mid::text,'status']='organizer_review','uncertain timing requires organizer review');
  perform crossplay.finalize_match(tid,mid,'played','{"raw1":400,"raw2":390,"overtime1":0,"overtime2":0}',jsonb_build_object('userId',(select owner_id from display_fixture)),'PRIVATE_FINAL_REASON');
  p:=crossplay.display_read(tid::text);
  perform pg_temp.assert(p#>>array['matches',mid::text,'status']='final' and p#>>array['matches',mid::text,'completedAt'] is not null,'official result outranks stale clock and exposes official timestamp');
  perform pg_temp.assert((select count(*)=1 from jsonb_array_elements(p#>'{snapshot,rounds,0,matches}') m where m->>'id'=mid::text and m->>'status'='final' and m#>>'{result,adjusted1}'='400'),'same snapshot includes matching official result');
  perform pg_temp.assert(p::text !~ 'PRIVATE_|98765|87654|raw1|reason|actor','result projection contains only public scores');
  previous:=p-'serverNowMs';
  perform pg_temp.assert(crossplay.display_read(tid::text)-'serverNowMs'=previous,'unchanged visible source stable');
  select m.id into mid from crossplay.matches m where m.tournament_id=tid and m.round_id=rid and m.table_number=7;
  update crossplay.match_locations set table_number=6,queue_order=2 where tournament_id=tid and match_id=mid;
  p:=crossplay.display_read(tid::text);
  perform pg_temp.assert(p-'serverNowMs'<>previous and (select count(*)=1 from jsonb_array_elements(p#>'{snapshot,tables,locations}') l where l->>'matchId'=mid::text and l->>'tableNumber'='6'),'relocated physical table visible');
end $$;

-- Execute under the production runtime role, not just catalog privilege checks.
set local role crossplay_runtime;
select crossplay.display_version();
select crossplay.display_read('crossplay-public-display-acceptance')->'snapshot'->'tournament'->>'name' as runtime_display_name;
reset role;

do $$ declare tid uuid; owner_id uuid; actor jsonb; mid uuid; cfg jsonb;
begin
  select f.tid,f.owner_id into tid,owner_id from display_fixture f;
  actor:=jsonb_build_object('userId',owner_id);
  perform crossplay.execute(actor,'archive_tournament',jsonb_build_object('tournamentId',tid),gen_random_uuid(),(select version from crossplay.tournaments where id=tid));
  perform pg_temp.assert(crossplay.display_read(tid::text)#>>'{snapshot,tournament,status}'='archived','published archives remain public');
  perform pg_temp.assert(not exists(select 1 from jsonb_each(crossplay.display_read(tid::text)->'matches') m where m.value->>'status'='playing'),'archives never claim ongoing play');
  perform crossplay.execute(actor,'reset_tournament',jsonb_build_object('tournamentId',tid,'confirmationName','Public display fixture'),gen_random_uuid(),(select version from crossplay.tournaments where id=tid));
  perform pg_temp.unavailable(tid::text);
  perform crossplay.execute(actor,'archive_tournament',jsonb_build_object('tournamentId',tid),gen_random_uuid(),(select version from crossplay.tournaments where id=tid));
  perform pg_temp.unavailable(tid::text);
  perform crossplay.execute(actor,'delete_tournament',jsonb_build_object('tournamentId',tid,'confirmationName','Public display fixture'),gen_random_uuid(),(select version from crossplay.tournaments where id=tid));
  perform pg_temp.unavailable(tid::text);
end $$;
rollback;
