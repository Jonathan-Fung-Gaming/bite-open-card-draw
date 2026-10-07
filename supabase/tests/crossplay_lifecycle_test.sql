-- Focused acceptance for 20261008010000; all synthetic rows roll back.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %',message; end if;
end $$;
create temporary table lifecycle_owner(id uuid default gen_random_uuid());
insert into lifecycle_owner default values;
insert into auth.users(id) select id from lifecycle_owner;
insert into crossplay.organizers(user_id) select id from lifecycle_owner;
create function pg_temp.actor() returns jsonb language sql as $$ select jsonb_build_object('userId',id) from lifecycle_owner $$;
create function pg_temp.fixture(state text default 'draft') returns uuid language plpgsql as $$
declare tid uuid; rid uuid; mid uuid; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); cfg jsonb:='{"roundCount":2,"timeLimitSeconds":564,"penaltyIntervalSeconds":10,"penaltyPoints":2}';
begin
  insert into crossplay.tournaments(slug,name,status,config,frozen_config,seed,started_at,finished_at)
    values('lifecycle-'||gen_random_uuid(),'Lifecycle fixture',state,cfg,case when state<>'draft' then cfg end,'stable seed',
      case when state<>'draft' then now() end,case when state='finished' then now() end) returning id into tid;
  insert into crossplay.tournament_staff select tid,id,'owner' from lifecycle_owner;
  insert into crossplay.entrants(tournament_id,id,name,normalized_name,seed,active) values(tid,a,'Alex Chen','alex chen',1,true),(tid,b,'Robin Patel','robin patel',2,false);
  insert into crossplay.rounds(tournament_id,number,status,engine_version,input_hash,input_version,input_snapshot)
    values(tid,1,case when state='draft' then 'draft' else 'published' end,'fixture','fixture',0,'{}') returning id into rid;
  insert into crossplay.matches(tournament_id,round_id,table_number,kind) values(tid,rid,1,'played') returning id into mid;
  insert into crossplay.match_sides values(tid,rid,mid,1,a),(tid,rid,mid,2,b);
  return tid;
end $$;
create function pg_temp.action(cmd text,tid uuid,request uuid default gen_random_uuid(),ver bigint default null,extra jsonb default '{}') returns jsonb language sql as $$
  select crossplay.execute(pg_temp.actor(),cmd,jsonb_build_object('tournamentId',tid,'confirmationName','Lifecycle fixture')||extra,request,
    coalesce(ver,(select version from crossplay.tournaments where id=tid)))
$$;
create function pg_temp.reject(stmt text,wanted text) returns void language plpgsql as $$
declare rejected boolean:=false; begin
  begin execute stmt; exception when others then
    if sqlerrm=wanted then rejected:=true; else raise exception 'Expected %, got %',wanted,sqlerrm; end if;
  end;
  perform pg_temp.assert(rejected,'Expected rejection '||wanted);
end $$;

do $$ declare obj record; begin
  perform pg_temp.assert(crossplay.lifecycle_version()='20261008010000','lifecycle capability');
  perform pg_temp.assert(crossplay.schema_version()='20260928010000' and crossplay.clock_version()='20260930020000','legacy capabilities unchanged');
  for obj in select p.oid,p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crossplay' and p.proname in
    ('lifecycle_version','read_model','read_model_before_lifecycle','clock_read','clock_read_before_lifecycle','execute','execute_before_lifecycle','clock_execute','clock_execute_before_lifecycle','clear_tournament_play') loop
    perform pg_temp.assert(not has_function_privilege('anon',obj.oid,'EXECUTE') and not has_function_privilege('authenticated',obj.oid,'EXECUTE') and not has_function_privilege('service_role',obj.oid,'EXECUTE'),'private function '||obj.proname);
    perform pg_temp.assert(has_function_privilege('crossplay_runtime',obj.oid,'EXECUTE')=(obj.proname in ('lifecycle_version','read_model','clock_read','execute','clock_execute')),'runtime boundary '||obj.proname);
    perform pg_temp.assert(obj.proconfig @> array['search_path=""'],'empty search path');
  end loop;
  perform pg_temp.assert(not has_table_privilege('crossplay_runtime','crossplay.tournaments','SELECT,INSERT,UPDATE,DELETE'),'no new table access');
end $$;

do $$ declare state text; tid uuid; before_row crossplay.tournaments%rowtype; request uuid; response jsonb; reset_request uuid; reset_response jsonb; n bigint;
begin
  foreach state in array array['draft','active','finished'] loop
    tid:=pg_temp.fixture(state); select * into before_row from crossplay.tournaments where id=tid;
    request:=gen_random_uuid(); response:=pg_temp.action('archive_tournament',tid,request,0);
    perform pg_temp.assert(pg_temp.action('archive_tournament',tid,request,0)=response,'archive replay');
    perform pg_temp.assert((select status='archived' and archived_from_status=state and version=1 from crossplay.tournaments where id=tid),'archive remembers state');
    perform pg_temp.assert(not exists(select 1 from jsonb_array_elements(crossplay.read_model('{}')->'tournaments') e where e->>'id'=tid::text),'public list excludes archive');
    if state='draft' then perform pg_temp.reject(format('select crossplay.read_model(''{}'',%L)',tid::text),'NOT_FOUND');
    else perform pg_temp.assert(crossplay.read_model('{}',tid::text)#>>'{tournament,archivedFromStatus}'=state,'published archive public history'); end if;
    perform pg_temp.reject(format('select pg_temp.action(''update_settings'',%L)',tid),'TOURNAMENT_ARCHIVED');
    perform pg_temp.reject(format('select crossplay.execute(''{}'',''update_settings'',%L,%L,1)',jsonb_build_object('tournamentId',tid),gen_random_uuid()),'FORBIDDEN');
    perform pg_temp.action('restore_tournament',tid);
    perform pg_temp.assert((select status=state and archived_at is null and archived_from_status is null and config=before_row.config and seed=before_row.seed from crossplay.tournaments where id=tid),'restore preserves original state/config');
    if state='draft' then perform pg_temp.assert(not exists(select 1 from crossplay.rounds where tournament_id=tid),'draft preview regenerated after archive'); end if;
    reset_request:=gen_random_uuid(); select version into n from crossplay.tournaments where id=tid;
    reset_response:=pg_temp.action('reset_tournament',tid,reset_request,n);
    perform pg_temp.assert((select status='draft' and started_at is null and frozen_config is null and finished_at is null and not corrections_only and run_generation=1 and version=n+1 and config=before_row.config from crossplay.tournaments where id=tid),'reset unlocks exact current config');
    perform pg_temp.assert((select count(*)=2 and bool_and(active) from crossplay.entrants where tournament_id=tid),'roster retained/reactivated');
    perform pg_temp.assert(not exists(select 1 from crossplay.rounds where tournament_id=tid),'play removed');
    perform pg_temp.action('add_entrants',tid,gen_random_uuid(),null,jsonb_build_object('entrants',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Maya Chen','seed',3))));
    perform pg_temp.assert(pg_temp.action('reset_tournament',tid,reset_request,n)=reset_response,'late reset replay does not reset again');
    perform pg_temp.assert((select count(*)=3 from crossplay.entrants where tournament_id=tid),'replay retains new roster edit');
    perform pg_temp.reject(format('select pg_temp.action(''reset_tournament'',%L,%L,%s,''{"confirmationName":"wrong"}'')',tid,reset_request,n),'IDEMPOTENCY_MISMATCH');
    perform pg_temp.reject(format('select pg_temp.action(''delete_tournament'',%L,%L,0)',tid,gen_random_uuid()),'STALE_VERSION');
    perform pg_temp.reject(format('select pg_temp.action(''delete_tournament'',%L,%L,null,''{"confirmationName":"wrong"}'')',tid,gen_random_uuid()),'CONFIRMATION_REQUIRED');
    request:=gen_random_uuid(); select version into n from crossplay.tournaments where id=tid;
    response:=pg_temp.action('delete_tournament',tid,request,n);
    perform pg_temp.assert(pg_temp.action('delete_tournament',tid,request,n)=response,'delete replay after row gone');
    perform pg_temp.assert(not exists(select 1 from crossplay.tournaments where id=tid),'tournament row deleted');
    perform pg_temp.reject(format('select crossplay.read_model(%L,%L)',pg_temp.actor(),tid::text),'NOT_FOUND');
  end loop;
  tid:=pg_temp.fixture(); perform pg_temp.action('archive_tournament',tid); perform pg_temp.action('reset_tournament',tid);
  perform pg_temp.assert((select status='draft' and archived_from_status is null from crossplay.tournaments where id=tid),'archived reset');
end $$;

-- Populate every dependent gameplay/access table, including the non-cascading children.
do $$ declare tid uuid:=pg_temp.fixture('active'); other_tid uuid:=pg_temp.fixture(); mid uuid; eid uuid; cred uuid; report uuid; result_id uuid;
  controller uuid:=gen_random_uuid(); token text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text); request uuid:=gen_random_uuid(); obj record; remaining bigint;
begin
  select id into mid from crossplay.matches where tournament_id=tid;
  select id into eid from crossplay.entrants where tournament_id=tid and active;
  insert into crossplay.entrant_credentials(tournament_id,entrant_id,invite_hash,expires_at) values(tid,eid,token,now()+interval '1 day') returning id into cred;
  insert into crossplay.entrant_sessions(token_hash,tournament_id,entrant_id,credential_id,expires_at) values(token,tid,eid,cred,now()+interval '1 day');
  insert into crossplay.match_credentials(tournament_id,match_id,invite_hash,expires_at) values(tid,mid,token,now()+interval '1 day') returning id into cred;
  insert into crossplay.match_sessions(token_hash,tournament_id,match_id,credential_id,expires_at) values(token,tid,mid,cred,now()+interval '1 day');
  insert into crossplay.match_clock_sessions(tournament_id,match_id,rules,status,active_side,used_ms1,used_ms2,controller_id,controller_actor,anchor_at_ms)
    select tid,mid,config,'running',1,1209999,864123,controller,token,1000000 from crossplay.tournaments where id=tid;
  insert into crossplay.match_clock_events values(tid,mid,1,1,'{"kind":"start"}',now());
  insert into crossplay.match_starts(tournament_id,match_id,entrant_id,method,counts,played) values(tid,mid,eid,'random','{}',true);
  insert into crossplay.match_start_accounting values(tid,mid,eid,'first','played');
  insert into crossplay.match_reports(tournament_id,match_id,revision,submitted_by,raw1,raw2,overtime1,overtime2) values(tid,mid,1,eid,401,399,20,0) returning id into report;
  insert into crossplay.match_report_clocks(tournament_id,match_id,report_id,clock_version,acknowledged1) values(tid,mid,report,0,true);
  insert into crossplay.result_revisions(tournament_id,match_id,revision,kind,result,rules,actor) values(tid,mid,0,'played','{}','{}',pg_temp.actor()) returning id into result_id;
  update crossplay.matches set current_report_id=report,official_revision_id=result_id,status='awaiting_confirmation',revision=1 where tournament_id=tid;
  insert into crossplay.mutation_requests(actor_key,request_id,fingerprint,response,tournament_id,generation,command)
    values('clock:test',request,'test',crossplay.clock_read(pg_temp.actor(),mid),tid,0,'clock:claim_clock');
  perform pg_temp.action('archive_tournament',tid);
  perform pg_temp.assert((select used_ms1=1209999 and used_ms2=864123 and status='paused' and review_required and controller_id is null and anchor_at_ms is null and epoch=2 from crossplay.match_clock_sessions where match_id=mid),'archive retains exact saved milliseconds and invalidates control');
  perform pg_temp.assert(not (crossplay.clock_read(pg_temp.actor(),mid)->>'canControl')::boolean,'archive has no live control');
  perform pg_temp.assert((select revoked_at is not null from crossplay.match_sessions where token_hash=token),'old table session revoked');
  perform pg_temp.action('restore_tournament',tid);
  perform pg_temp.assert((select status='paused' from crossplay.match_clock_sessions where match_id=mid),'restore never resumes clock');
  perform pg_temp.reject(format('select crossplay.clock_execute(%L,''claim_clock'',%L,%L)',jsonb_build_object('matchSessionHash',token),jsonb_build_object('matchId',mid,'controllerId',controller),gen_random_uuid()),'FORBIDDEN');
  -- Verify full deletion, then abort the subtransaction to exercise rollback preservation.
  begin
    perform pg_temp.action('delete_tournament',tid);
    for obj in select table_name from information_schema.columns where table_schema='crossplay' and column_name='tournament_id' and table_name<>'mutation_requests' loop
      execute format('select count(*) from crossplay.%I where tournament_id=$1',obj.table_name) into remaining using tid;
      perform pg_temp.assert(remaining=0,'delete clears '||obj.table_name);
    end loop;
    raise exception 'ROLLBACK_DELETE_PROBE';
  exception when others then if sqlerrm<>'ROLLBACK_DELETE_PROBE' then raise; end if; end;
  perform pg_temp.assert(exists(select 1 from crossplay.match_clock_events where tournament_id=tid) and exists(select 1 from crossplay.match_reports where tournament_id=tid),'aborted transaction retains complete play');
  perform pg_temp.action('reset_tournament',tid);
  for obj in select table_name from information_schema.columns where table_schema='crossplay' and column_name='tournament_id'
    and table_name not in ('entrants','tournament_staff','audit_events','mutation_requests') loop
    execute format('select count(*) from crossplay.%I where tournament_id=$1',obj.table_name) into remaining using tid;
    perform pg_temp.assert(remaining=0,'reset clears '||obj.table_name);
  end loop;
  perform pg_temp.assert((select retired and response='{"error":"STALE_ACTION"}'::jsonb from crossplay.mutation_requests where request_id=request),'sensitive clock receipt retired');
  perform pg_temp.assert(exists(select 1 from crossplay.audit_events where tournament_id=tid and action='reset_tournament'),'reset audit retained');
  perform pg_temp.action('delete_tournament',tid);
  perform pg_temp.assert(exists(select 1 from crossplay.tournaments where id=other_tid),'other tournament remains');
  perform pg_temp.assert(exists(select 1 from auth.users where id=(pg_temp.actor()->>'userId')::uuid),'shared Auth remains');
end $$;

-- Ended reports retain their acknowledgement binding when archival advances the clock.
do $$ declare tid uuid:=pg_temp.fixture('active'); mid uuid; eid uuid; rid uuid; out jsonb;
begin
  select id into mid from crossplay.matches where tournament_id=tid;
  select id into eid from crossplay.entrants where tournament_id=tid and active;
  insert into crossplay.match_clock_sessions(tournament_id,match_id,rules,status,active_side,report_submitted) select tid,mid,config,'ended',1,true from crossplay.tournaments where id=tid;
  insert into crossplay.match_reports(tournament_id,match_id,revision,submitted_by,raw1,raw2,overtime1,overtime2) values(tid,mid,1,eid,401,399,0,0) returning id into rid;
  insert into crossplay.match_report_clocks(tournament_id,match_id,report_id,clock_version,acknowledged1) values(tid,mid,rid,0,true);
  update crossplay.matches set current_report_id=rid,status='awaiting_confirmation',revision=1 where id=mid;
  perform pg_temp.action('archive_tournament',tid); perform pg_temp.action('restore_tournament',tid);
  out:=crossplay.clock_read(pg_temp.actor(),mid);
  perform pg_temp.assert(out#>'{report,acknowledgedSides}'='[1]' and out#>'{report,clockVersion}'=out#>'{state,version}' and out#>>'{state,reviewRequired}'='false','ended report preserved across controller change');
  perform pg_temp.action('delete_tournament',tid);
end $$;

do $$ declare tid uuid:=pg_temp.fixture(); outsider uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); response jsonb; cfg jsonb:='{"roundCount":1,"penaltyIntervalSeconds":10,"penaltyPoints":2,"timeLimitSeconds":1200}';
begin
  insert into auth.users(id) values(outsider); insert into crossplay.organizers(user_id) values(outsider);
  perform pg_temp.reject(format('select crossplay.execute(%L,''reset_tournament'',%L,%L,0)',jsonb_build_object('userId',outsider),jsonb_build_object('tournamentId',tid,'confirmationName','Lifecycle fixture'),gen_random_uuid()),'FORBIDDEN');
  perform pg_temp.reject(format('select crossplay.execute(''{}'',''delete_tournament'',%L,%L,0)',jsonb_build_object('tournamentId',tid,'confirmationName','Lifecycle fixture'),gen_random_uuid()),'FORBIDDEN');
  response:=crossplay.execute(pg_temp.actor(),'create_tournament',jsonb_build_object('name','Lifecycle fixture','slug','created-'||request,'config',cfg,'seed','fixture'),request);
  tid:=(response->>'id')::uuid; perform pg_temp.action('delete_tournament',tid);
  perform pg_temp.reject(format('select crossplay.execute(%L,''create_tournament'',%L,%L)',pg_temp.actor(),jsonb_build_object('name','Lifecycle fixture','slug','created-'||request,'config',cfg,'seed','fixture'),request),'STALE_ACTION');
  perform pg_temp.assert(not exists(select 1 from crossplay.tournaments where id=tid),'create retry cannot resurrect');
end $$;

do $$ declare tid uuid:=pg_temp.fixture('active'); a uuid; b uuid; out jsonb; reset_request uuid:=gen_random_uuid(); reset_out jsonb; mid uuid;
begin
  reset_out:=pg_temp.action('reset_tournament',tid,reset_request,0);
  perform pg_temp.action('update_settings',tid,gen_random_uuid(),null,'{"name":"Lifecycle fixture","date":null,"config":{"roundCount":1,"timeLimitSeconds":564,"penaltyIntervalSeconds":10,"penaltyPoints":2}}');
  select id into a from crossplay.entrants where tournament_id=tid and seed=1;
  select id into b from crossplay.entrants where tournament_id=tid and seed=2;
  out:=pg_temp.action('generate_round',tid,gen_random_uuid(),null,jsonb_build_object('roundNumber',1,'engineVersion','test','inputHash','test','pairs',jsonb_build_array(jsonb_build_object('player1Id',a,'player2Id',b))));
  perform pg_temp.action('publish_round',tid,gen_random_uuid(),null,jsonb_build_object('roundId',out->>'roundId'));
  select id into mid from crossplay.matches where tournament_id=tid;
  perform crossplay.execute(pg_temp.actor(),'finalize_result',jsonb_build_object('tournamentId',tid,'matchId',mid,'expectedRevision',0,'kind','played','raw1',401,'raw2',399,'overtime1',20,'overtime2',0),gen_random_uuid());
  perform pg_temp.assert(pg_temp.action('reset_tournament',tid,reset_request,0)=reset_out,'reset replay after a new match');
  perform pg_temp.assert((select result->>'difference1'='-2' from crossplay.result_revisions where tournament_id=tid),'fresh result remains with correct arithmetic');
end $$;
rollback;
