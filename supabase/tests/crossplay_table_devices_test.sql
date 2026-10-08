-- Focused acceptance for the additive table/device migration. Synthetic data rolls back.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %',message; end if;
end $$;
create function pg_temp.reject(stmt text,wanted text) returns void language plpgsql as $$
declare rejected boolean:=false; begin
  begin execute stmt; exception when others then
    if sqlerrm=wanted then rejected:=true; else raise exception 'Expected %, got %',wanted,sqlerrm; end if;
  end;
  perform pg_temp.assert(rejected,'Expected rejection '||wanted);
end $$;
create temporary table table_owner(id uuid default gen_random_uuid());
insert into table_owner default values;
insert into auth.users(id) select id from table_owner;
insert into crossplay.organizers(user_id) select id from table_owner;
create function pg_temp.actor() returns jsonb language sql as $$ select jsonb_build_object('userId',id) from table_owner $$;
create function pg_temp.fixture(n integer default 9) returns uuid language plpgsql as $$
declare tid uuid; rid uuid; mid uuid; a uuid; b uuid; i integer; cfg jsonb:='{"roundCount":2,"timeLimitSeconds":1200,"penaltyIntervalSeconds":10,"penaltyPoints":2}';
begin
  insert into crossplay.tournaments(slug,name,status,config,frozen_config,seed,started_at)
    values('tables-'||gen_random_uuid(),'Tables fixture','active',cfg,cfg,'stable seed',now()) returning id into tid;
  insert into crossplay.tournament_staff select tid,id,'owner' from table_owner;
  insert into crossplay.table_settings(tournament_id) values(tid);
  insert into crossplay.physical_tables select tid,number,true from generate_series(1,8) number;
  insert into crossplay.rounds(tournament_id,number,status,engine_version,input_hash,input_version,input_snapshot)
    values(tid,1,'published','fixture','fixture',0,'{}') returning id into rid;
  for i in 1..n loop
    a:=gen_random_uuid(); b:=gen_random_uuid();
    insert into crossplay.entrants(tournament_id,id,name,normalized_name,seed) values(tid,a,'Player '||i||'A','player '||i||'a',i*2-1),(tid,b,'Player '||i||'B','player '||i||'b',i*2);
    insert into crossplay.matches(tournament_id,round_id,table_number,kind) values(tid,rid,i,'played') returning id into mid;
    insert into crossplay.match_sides values(tid,rid,mid,1,a),(tid,rid,mid,2,b);
  end loop;
  perform crossplay.allocate_tables(tid,rid);
  return tid;
end $$;
create function pg_temp.action(tid uuid,cmd text,extra jsonb default '{}') returns jsonb language sql as $$
 select crossplay.table_execute(pg_temp.actor(),cmd,jsonb_build_object('tournamentId',tid)||extra,gen_random_uuid(),(select version from crossplay.table_settings where tournament_id=tid))
$$;
create function pg_temp.clock(mid uuid,cmd text,actor jsonb,extra jsonb default '{}') returns jsonb language sql as $$
 select crossplay.clock_execute(actor,cmd,jsonb_build_object('matchId',mid)||extra,gen_random_uuid(),(select version from crossplay.match_clock_sessions where match_id=mid))
$$;
do $$ declare obj record; begin
 perform pg_temp.assert(crossplay.tables_version()='20261008030000','table capability');
 for obj in select p.oid,p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crossplay' and p.proname in
   ('tables_version','table_match_ready','table_device_busy','tables_json','read_model','read_model_before_tables','clock_read','clock_read_before_tables','allocate_tables','execute','execute_before_tables','clock_execute','clock_execute_before_tables','table_execute','table_enter_match') loop
  perform pg_temp.assert(not has_function_privilege('anon',obj.oid,'EXECUTE') and not has_function_privilege('authenticated',obj.oid,'EXECUTE') and not has_function_privilege('service_role',obj.oid,'EXECUTE'),'private boundary '||obj.proname);
  perform pg_temp.assert(has_function_privilege('crossplay_runtime',obj.oid,'EXECUTE')=(obj.proname in ('tables_version','read_model','clock_read','execute','clock_execute','table_execute','table_enter_match')),'runtime boundary '||obj.proname);
  perform pg_temp.assert(obj.proconfig @> array['search_path=""'],'empty search path');
 end loop;
 for obj in select oid,relname,relrowsecurity from pg_class where relnamespace='crossplay'::regnamespace and relname in ('table_settings','physical_tables','table_devices','match_locations') loop
  perform pg_temp.assert(obj.relrowsecurity and not has_table_privilege('crossplay_runtime',obj.oid,'SELECT,INSERT,UPDATE,DELETE'),'private RLS table '||obj.relname);
 end loop;
end $$;
do $$ declare tid uuid:=pg_temp.fixture(); mid uuid; queued uuid; did uuid:=gen_random_uuid(); replacement uuid:=gen_random_uuid(); cid uuid:=gen_random_uuid(); ncid uuid:=gen_random_uuid();
 p jsonb; out jsonb; request uuid; first jsonb; actor jsonb:=jsonb_build_object('matchSessionHash',repeat('a',64)); newactor jsonb:=jsonb_build_object('matchSessionHash',repeat('b',64)); before_pairs jsonb; used jsonb;
begin
 select id into mid from crossplay.matches where tournament_id=tid and table_number=1;
 select id into queued from crossplay.matches where tournament_id=tid and table_number=9;
 select jsonb_agg(to_jsonb(s) order by s.match_id,s.side) into before_pairs from crossplay.match_sides s where tournament_id=tid;
 perform pg_temp.assert((select count(*)=8 from crossplay.match_locations where tournament_id=tid and crossplay.table_match_ready(tid,match_id)),'nine matches, eight ready');
 perform pg_temp.assert((select table_number=1 and queue_order=2 from crossplay.match_locations where match_id=queued),'ninth match queues deterministically');
 perform pg_temp.assert(not crossplay.tables_json('{}',tid)?'devices','public devices private');
 perform pg_temp.reject(format('select crossplay.table_execute(''{}'',''assign_device'',%L,%L,1)',jsonb_build_object('tournamentId',tid,'deviceId',did,'label','Phone','tableNumber',1),gen_random_uuid()),'FORBIDDEN');
 perform pg_temp.action(tid,'assign_device',jsonb_build_object('deviceId',did,'label','Phone','tableNumber',1));
 p:=jsonb_build_object('matchId',mid,'deviceId',did,'controllerId',cid,'sessionHash',repeat('a',64),'inviteHash',repeat('1',64),'expectedOperationsVersion',2);
 request:=gen_random_uuid(); out:=crossplay.table_enter_match(pg_temp.actor(),p,request); first:=out;
 perform pg_temp.assert(out#>>'{snapshot,state,status}'='ready' and (out#>>'{snapshot,canControl}')::boolean,'open reserves shared controller, no auto start');
 perform pg_temp.assert(crossplay.table_enter_match(pg_temp.actor(),p||jsonb_build_object('existingHash',repeat('a',64)),request)=first,'lost cookie response and retry recover exactly');
 perform pg_temp.reject(format('select crossplay.table_enter_match(pg_temp.actor(),%L,%L)',p||jsonb_build_object('matchId',queued),gen_random_uuid()),'TABLE_NOT_READY');
 perform pg_temp.reject(format('select pg_temp.action(%L,''retire_device'',%L)',tid,jsonb_build_object('deviceId',did)),'DEVICE_BUSY');
 perform pg_temp.reject(format('select pg_temp.action(%L,''close_table'',%L)',tid,jsonb_build_object('tableNumber',1,'targetTable',2,'reason','Retire tablet')),'RELEASE_CLOCK_BEFORE_MOVE');
 out:=pg_temp.clock(mid,'append_events',actor,jsonb_build_object('controllerId',cid,'epoch',1,'events',jsonb_build_array(
   jsonb_build_object('sequence',1,'kind','start','atMs',1000,'elapsedMs',0),jsonb_build_object('sequence',2,'kind','pause','atMs',2234,'elapsedMs',1234))));
 used:=out#>'{state,usedMs}';
 p:=p||jsonb_build_object('mode','replace','deviceId',replacement,'controllerId',ncid,'sessionHash',repeat('b',64),'inviteHash',repeat('2',64),'reason','Old phone unavailable','expectedClockVersion',2,'expectedEpoch',1);
 request:=gen_random_uuid(); out:=crossplay.table_enter_match(pg_temp.actor(),p,request);
 perform pg_temp.assert(out#>'{snapshot,state,usedMs}'=used and out#>>'{snapshot,state,reviewRequired}'='true' and out#>>'{snapshot,state,status}'='paused','replacement preserves exact saved time and requires review');
 perform pg_temp.assert((out->>'sessionCreated')::boolean and (out#>>'{snapshot,canControl}')::boolean,'replacement receives shared session');
 perform pg_temp.assert(crossplay.table_enter_match(pg_temp.actor(),p,request)=out,'replacement receipt replay');
 perform pg_temp.reject(format('select pg_temp.clock(%L,''append_events'',%L,%L)',mid,actor,jsonb_build_object('controllerId',cid,'epoch',1,'events','[]'::jsonb)),'FORBIDDEN');
 perform pg_temp.reject(format('select pg_temp.clock(%L,''append_events'',%L,%L)',mid,newactor,jsonb_build_object('controllerId',ncid,'epoch',(out#>>'{snapshot,state,epoch}')::integer,'events',jsonb_build_array(jsonb_build_object('sequence',1,'kind','resume','atMs',4000,'elapsedMs',0)))),'TIMING_REVIEW_REQUIRED');
 out:=pg_temp.clock(mid,'correct_clock',pg_temp.actor(),jsonb_build_object('usedMs',used,'activeSide',(out#>>'{snapshot,state,activeSide}')::integer,'reason','Reviewed precise saved times'));
 out:=pg_temp.clock(mid,'append_events',newactor,jsonb_build_object('controllerId',ncid,'epoch',(out#>>'{state,epoch}')::integer,'events',jsonb_build_array(jsonb_build_object('sequence',1,'kind','end','atMs',4000,'elapsedMs',0))));
 out:=pg_temp.clock(mid,'submit_shared_report',newactor,jsonb_build_object('raw1',401,'raw2',399,'expectedRevision',0,'clockVersion',(out#>>'{state,version}')::integer));
 perform pg_temp.assert(not crossplay.table_match_ready(tid,queued),'pending report still occupies table');
 p:=jsonb_build_object('reportId',out#>>'{report,id}','expectedRevision',(out->>'matchRevision')::integer);
 perform pg_temp.clock(mid,'acknowledge_shared_report',newactor,p||'{"side":1}');
 perform pg_temp.assert(not crossplay.table_match_ready(tid,queued),'one acknowledgement still occupies table');
 out:=pg_temp.clock(mid,'acknowledge_shared_report',newactor,p||'{"side":2}');
 perform pg_temp.assert(out->>'matchStatus'='final' and crossplay.table_match_ready(tid,queued),'replacement both acknowledgements finalize and release next head');
 perform pg_temp.action(tid,'close_table',jsonb_build_object('tableNumber',1,'targetTable',2,'reason','Fewer devices'));
 perform pg_temp.assert((select table_number=1 from crossplay.match_locations where match_id=mid),'completed historical location retained');
 perform pg_temp.assert((select table_number=2 and original_table_number=1 from crossplay.match_locations where match_id=queued),'unfinished location moves, original retained');
 perform pg_temp.assert((select jsonb_agg(to_jsonb(s) order by s.match_id,s.side)=before_pairs from crossplay.match_sides s where tournament_id=tid),'no pairing changes');
 perform pg_temp.reject(format('select crossplay.table_enter_match(pg_temp.actor(),%L,%L)',jsonb_build_object('matchId',queued,'deviceId',did,'controllerId',cid,'expectedOperationsVersion',4),gen_random_uuid()),'TABLE_NOT_READY');
 perform crossplay.execute(pg_temp.actor(),'reset_tournament',jsonb_build_object('tournamentId',tid,'confirmationName','Tables fixture'),gen_random_uuid(),(select version from crossplay.tournaments where id=tid));
 perform pg_temp.assert(not exists(select 1 from crossplay.match_locations where tournament_id=tid) and not exists(select 1 from crossplay.table_devices where tournament_id=tid and table_number is not null),'reset clears locations and duty');
 perform pg_temp.assert((select count(*)=8 from crossplay.physical_tables where tournament_id=tid),'reset retains physical setup');
end $$;
select 'Crossplay table/device focused checks passed' as evidence;
rollback;
