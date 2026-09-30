-- Only the new clock capability is tested; fixture transaction leaves no records behind.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %',message; end if;
end $$;
create function pg_temp.clock(command text,payload jsonb,actor jsonb default '{"userId":"10000000-0000-4000-8000-000000000001"}',ver bigint default null) returns jsonb language sql as $$
 select crossplay.clock_execute(actor,command,payload,gen_random_uuid(),ver)
$$;
create function pg_temp.reject(command text,payload jsonb,expected text,actor jsonb default '{"userId":"10000000-0000-4000-8000-000000000001"}',ver bigint default null) returns void language plpgsql as $$
declare rejected boolean:=false; begin
  begin perform pg_temp.clock(command,payload,actor,ver); exception when others then
    if sqlerrm=expected then rejected:=true; else raise exception 'Expected %, got % for %',expected,sqlerrm,command; end if;
  end;
  perform pg_temp.assert(rejected,'Must reject '||command||' with '||expected);
end $$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001');
insert into crossplay.organizers(user_id) values('10000000-0000-4000-8000-000000000001');
create function pg_temp.fixture(round_count integer default 6) returns uuid language plpgsql as $$
declare tid uuid; begin
  insert into crossplay.tournaments(slug,name,status,config,frozen_config,seed,started_at) values('clock-'||gen_random_uuid()::text,'Clock fixture','active',
    jsonb_build_object('roundCount',round_count,'timeLimitSeconds',1200,'penaltyIntervalSeconds',10,'penaltyPoints',2),
    jsonb_build_object('roundCount',round_count,'timeLimitSeconds',1200,'penaltyIntervalSeconds',10,'penaltyPoints',2),'fixture',now()) returning id into tid;
  insert into crossplay.tournament_staff values(tid,'10000000-0000-4000-8000-000000000001','owner');
  insert into crossplay.entrants(tournament_id,id,name,normalized_name,seed) values
    (tid,'20000000-0000-4000-8000-000000000001','Alex Chen','alex chen',1),
    (tid,'20000000-0000-4000-8000-000000000002','Robin Patel','robin patel',2),
    (tid,'20000000-0000-4000-8000-000000000003','Priya Marsh','priya marsh',3),
    (tid,'20000000-0000-4000-8000-000000000004','Samira Holt','samira holt',4);
  return tid;
end $$;
create function pg_temp.match(tid uuid,round_number integer,a integer default 1,b integer default 2) returns uuid language plpgsql as $$
declare rid uuid; mid uuid; begin
  insert into crossplay.rounds(tournament_id,number,status,engine_version,input_hash,input_version,input_snapshot)
    values(tid,round_number,'published','fixture','fixture',0,'{}') returning id into rid;
  insert into crossplay.matches(tournament_id,round_id,table_number,kind) values(tid,rid,1,case when b is null then 'bye' else 'played' end) returning id into mid;
  insert into crossplay.match_sides values(tid,rid,mid,1,('20000000-0000-4000-8000-'||lpad(a::text,12,'0'))::uuid);
  if b is not null then insert into crossplay.match_sides values(tid,rid,mid,2,('20000000-0000-4000-8000-'||lpad(b::text,12,'0'))::uuid); end if;
  return mid;
end $$;

do $$ declare obj record; begin
  perform pg_temp.assert(crossplay.schema_version()='20260928010000','old app schema version unchanged');
  perform pg_temp.assert(crossplay.clock_version()='20260930020000','clock capability version');
  for obj in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='crossplay' and c.relname in
    ('match_starts','match_start_accounting','match_credentials','match_sessions','match_clock_sessions','match_clock_events','match_report_clocks') loop
    perform pg_temp.assert(obj.relrowsecurity,'new table RLS '||obj.relname);
    perform pg_temp.assert(not has_table_privilege('crossplay_runtime',obj.oid,'SELECT,INSERT,UPDATE,DELETE'),'runtime no table rights');
    perform pg_temp.assert(not has_table_privilege('anon',obj.oid,'SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('authenticated',obj.oid,'SELECT,INSERT,UPDATE,DELETE'),'browser no table rights');
  end loop;
  for obj in select p.oid,p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crossplay' and p.proname in
    ('clock_version','clock_read','clock_execute','execute','execute_base','finalize_match','finalize_match_base','resolve_match_start','record_played_start','match_session_valid') loop
    perform pg_temp.assert(not has_function_privilege('anon',obj.oid,'EXECUTE') and not has_function_privilege('authenticated',obj.oid,'EXECUTE') and not has_function_privilege('service_role',obj.oid,'EXECUTE'),'function private '||obj.proname);
    perform pg_temp.assert(has_function_privilege('crossplay_runtime',obj.oid,'EXECUTE')=(obj.proname in ('clock_version','clock_read','clock_execute','execute')),'only public boundary granted '||obj.proname);
    perform pg_temp.assert(obj.proconfig @> array['search_path=""'],'empty path '||obj.proname);
  end loop;
end $$;

do $$ declare tid uuid:=pg_temp.fixture(); mid uuid; second_mid uuid; out jsonb; p jsonb; actor jsonb:=jsonb_build_object('matchSessionHash',repeat('a',64));
  owner_actor jsonb:='{"userId":"10000000-0000-4000-8000-000000000001"}'; controller uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); starter integer; other integer;
  clock_version bigint; report_id uuid; revision integer; before_version bigint; rejected boolean;
begin
  mid:=pg_temp.match(tid,1); second_mid:=pg_temp.match(tid,2,3,4);
  perform pg_temp.reject('claim_clock',jsonb_build_object('matchId',mid,'controllerId',controller),'FORBIDDEN','{}');
  perform pg_temp.clock('issue_match_link',jsonb_build_object('matchId',mid,'inviteHash',repeat('1',64)));
  perform pg_temp.reject('claim_match_link',jsonb_build_object('matchId',second_mid,'inviteHash',repeat('1',64),'sessionHash',repeat('a',64)),'FORBIDDEN','{}');
  p:=jsonb_build_object('matchId',mid,'inviteHash',repeat('1',64),'sessionHash',repeat('a',64));
  out:=crossplay.clock_execute('{}','claim_match_link',p,request);
  perform pg_temp.assert(crossplay.clock_execute('{}','claim_match_link',p,request)=out,'same link-claim request replay');
  perform pg_temp.reject('claim_match_link',p,'INVALID_INVITE','{}');
  perform pg_temp.reject('claim_clock',jsonb_build_object('matchId',second_mid,'controllerId',controller),'FORBIDDEN',actor);
  out:=pg_temp.clock('claim_clock',jsonb_build_object('matchId',mid,'controllerId',controller),actor);
  starter:=(out#>>'{state,activeSide}')::integer; other:=3-starter;
  perform pg_temp.assert(out#>>'{state,status}'='ready' and out#>>'{state,usedMs,0}'='0' and out#>>'{state,usedMs,1}'='0','claim does not tick');
  perform pg_temp.assert(out#>>'{start,method}'='random' and out#>>'{start,played}'='false','first draw saved before played');
  perform pg_temp.assert((pg_temp.clock('claim_clock',jsonb_build_object('matchId',mid,'controllerId',controller),actor)#>>'{start,entrantId}')=(out#>>'{start,entrantId}'),'refresh claim stable');
  perform pg_temp.reject('claim_clock',jsonb_build_object('matchId',mid,'controllerId',gen_random_uuid()),'CONTROLLER_CONFLICT',actor);
  perform pg_temp.reject('submit_shared_report',jsonb_build_object('matchId',mid,'raw1',401,'raw2',399,'clockVersion',0,'expectedRevision',0),'CLOCK_NOT_ENDED',actor);
  select version into before_version from crossplay.tournaments where id=tid;
  p:=jsonb_build_object('matchId',mid,'controllerId',controller,'epoch',1,'events',jsonb_build_array(jsonb_build_object('sequence',1,'kind','start','atMs',1000000,'elapsedMs',0,'side',starter)));
  request:=gen_random_uuid(); out:=crossplay.clock_execute(actor,'append_events',p,request,0);
  perform pg_temp.assert(crossplay.clock_execute(actor,'append_events',p,request,0)=out,'start retry idempotent');
  perform pg_temp.assert((select count(*) from crossplay.match_start_accounting where tournament_id=tid and match_id=mid)=2,'played has first and second once');
  perform pg_temp.assert(out#>>'{start,played}'='true','start marks play');
  perform pg_temp.reject('append_events',p,'STALE_CLOCK_VERSION',actor,0);
  perform pg_temp.reject('append_events',p||jsonb_build_object('events',jsonb_build_array(jsonb_build_object('sequence',2,'kind','switch','atMs',1001000,'elapsedMs',1000,'side',other))),'INVALID_TRANSITION',actor,1);
  -- Forty minutes are represented with exact tap deltas, independent of wall execution speed.
  p:=p||jsonb_build_object('events',jsonb_build_array(
    jsonb_build_object('sequence',2,'kind','switch','atMs',2220000,'elapsedMs',case when starter=1 then 1220000 else 1190000 end,'side',starter),
    jsonb_build_object('sequence',3,'kind','pause','atMs',3410000,'elapsedMs',case when other=1 then 1220000 else 1190000 end),
    jsonb_build_object('sequence',4,'kind','resume','atMs',4000000,'elapsedMs',0),
    jsonb_build_object('sequence',5,'kind','end','atMs',4000000,'elapsedMs',0)));
  out:=pg_temp.clock('append_events',p,actor,1);
  perform pg_temp.assert(out#>>'{state,usedMs,0}'='1220000' and out#>>'{state,usedMs,1}'='1190000','correct accumulated timing and excluded pause');
  perform pg_temp.assert((select version from crossplay.tournaments where id=tid)=before_version,'clock does not churn tournament version');
  rejected:=false; begin perform crossplay.execute(owner_actor,'submit_report',jsonb_build_object('tournamentId',tid,'matchId',mid),gen_random_uuid()); exception when others then rejected:=sqlerrm='CLOCK_REPORT_REQUIRED'; end;
  perform pg_temp.assert(rejected,'individual manual overtime path blocked for clock match');
  p:=jsonb_build_object('matchId',mid,'raw1',401,'raw2',399,'clockVersion',5,'expectedRevision',0,'overtime1',0,'overtime2',86400);
  out:=pg_temp.clock('submit_shared_report',p,actor);
  perform pg_temp.assert(out#>>'{report,overtime1}'='20' and out#>>'{report,overtime2}'='0' and out#>>'{report,adjusted1}'='397' and out#>>'{report,adjusted2}'='399','server derives overtime and differential scoring');
  out:=pg_temp.clock('claim_clock',jsonb_build_object('matchId',mid,'controllerId',controller),actor);
  perform pg_temp.assert(out->>'matchStatus'='awaiting_confirmation' and out#>>'{state,reportSubmitted}'='true' and out#>>'{report,raw1}'='401','pending report reload reattaches existing controller without restarting');
  report_id:=(out#>>'{report,id}')::uuid;
  perform pg_temp.reject('append_events',jsonb_build_object('matchId',mid,'controllerId',controller,'epoch',1,'events',jsonb_build_array(jsonb_build_object('sequence',6,'kind','resume','atMs',5000000,'elapsedMs',0))),'RESULT_LOCKED',actor,5);
  out:=pg_temp.clock('acknowledge_shared_report',jsonb_build_object('matchId',mid,'reportId',report_id,'expectedRevision',1,'side',1),actor);
  perform pg_temp.assert(out#>'{report,acknowledgedSides}'='[1]'::jsonb and out->>'matchStatus'='awaiting_confirmation','one acknowledgement not final');
  out:=pg_temp.clock('submit_shared_report',p||'{"expectedRevision":1}',actor);
  perform pg_temp.assert(out#>'{report,acknowledgedSides}'='[]'::jsonb,'editing creates revision and clears both acknowledgements');
  perform pg_temp.reject('acknowledge_shared_report',jsonb_build_object('matchId',mid,'reportId',report_id,'expectedRevision',1,'side',2),'STALE_REVISION',actor);
  report_id:=(out#>>'{report,id}')::uuid;
  perform pg_temp.clock('acknowledge_shared_report',jsonb_build_object('matchId',mid,'reportId',report_id,'expectedRevision',2,'side',2),actor);
  out:=pg_temp.clock('acknowledge_shared_report',jsonb_build_object('matchId',mid,'reportId',report_id,'expectedRevision',2,'side',1),actor);
  perform pg_temp.assert(out->>'matchStatus'='final' and out#>>'{result,difference1}'='-2' and out#>>'{result,points2}'='2','both acknowledgements finalize exact adjusted result');
  perform pg_temp.assert(out->>'officialConfirmationMethod'='shared_device','official shared result confirmation source');
  perform pg_temp.assert((select rr.actor->>'confirmationMethod' from crossplay.result_revisions rr where tournament_id=tid and match_id=mid)='shared_device','explicit shared attestation in history');
  perform pg_temp.assert(not(crossplay.read_model('{}',tid::text)::text like '%matchSessionHash%') and not(crossplay.read_model('{}',tid::text)::text like '%controllerId%'),'public model excludes private clock control');
  perform crossplay.execute(owner_actor,'finalize_result',jsonb_build_object('tournamentId',tid,'matchId',mid,'expectedRevision',(out->>'matchRevision')::integer,
    'kind','played','raw1',397,'raw2',399,'overtime1',0,'overtime2',0,'reason','Verified corrected raw score with same adjusted total'),gen_random_uuid());
  out:=crossplay.clock_read(actor,mid);
  perform pg_temp.assert(out->>'officialConfirmationMethod'='organizer' and out#>>'{result,raw1}'='397' and out#>>'{result,overtime1}'='0' and out#>>'{result,adjusted1}'='397'
    and out#>>'{report,raw1}'='401','official organizer revision raw/time/source distinguish older shared report even when adjusted result unchanged');
end $$;

do $$ declare tid uuid:=pg_temp.fixture(); mid uuid; mid2 uuid; mid3 uuid; mid4 uuid; out jsonb; actor jsonb:=jsonb_build_object('matchSessionHash',repeat('b',64)); controller uuid:=gen_random_uuid();
  a uuid:='20000000-0000-4000-8000-000000000001'; b uuid:='20000000-0000-4000-8000-000000000002'; rejected boolean; expected text;
begin
  mid:=pg_temp.match(tid,1);
  perform pg_temp.clock('record_manual_start',jsonb_build_object('matchId',mid,'entrantId',a,'reason','External clock'));
  mid2:=pg_temp.match(tid,2);
  perform pg_temp.clock('issue_match_link',jsonb_build_object('matchId',mid2,'inviteHash',repeat('2',64)));
  perform pg_temp.clock('claim_match_link',jsonb_build_object('matchId',mid2,'inviteHash',repeat('2',64),'sessionHash',repeat('b',64)),'{}');
  out:=pg_temp.clock('claim_clock',jsonb_build_object('matchId',mid2,'controllerId',controller),actor);
  perform pg_temp.assert(out#>>'{start,entrantId}'=b::text and out#>>'{start,method}'='fewer_firsts','fewer firsts wins after manual game');
  perform pg_temp.clock('correct_starter',jsonb_build_object('matchId',mid2,'entrantId',a,'reason','Actual external starter'));
  out:=crossplay.clock_read(actor,mid2);
  perform pg_temp.assert(out#>>'{state,activeSide}'='1' and out#>>'{start,method}'='organizer','organizer prestart override reflected in clock');
  out:=pg_temp.clock('append_events',jsonb_build_object('matchId',mid2,'controllerId',controller,'epoch',1,'events',jsonb_build_array(
    jsonb_build_object('sequence',1,'kind','start','atMs',1000,'elapsedMs',0),
    jsonb_build_object('sequence',2,'kind','recover','atMs',5000,'elapsedMs',4000,'reviewRequired',true))),actor,1);
  perform pg_temp.assert(out#>>'{state,reviewRequired}'='true','ambiguous recovery marked');
  perform pg_temp.reject('append_events',jsonb_build_object('matchId',mid2,'controllerId',controller,'epoch',1,'events',jsonb_build_array(jsonb_build_object('sequence',3,'kind','end','atMs',6000,'elapsedMs',1000))),'TIMING_REVIEW_REQUIRED',actor,3);
  out:=pg_temp.clock('correct_clock',jsonb_build_object('matchId',mid2,'usedMs','[4500,0]'::jsonb,'activeSide',1,'reason','Reviewed device timing'),'{"userId":"10000000-0000-4000-8000-000000000001"}',3);
  perform pg_temp.assert(out#>>'{state,status}'='paused' and out#>>'{state,reviewRequired}'='false' and out#>>'{state,usedMs,0}'='4500','review correction explicit and paused');
  perform pg_temp.assert(out#>>'{state,epoch}'='2' and out#>>'{state,sequence}'='0','correction invalidates prior controller event journal');
  perform pg_temp.reject('append_events',jsonb_build_object('matchId',mid2,'controllerId',controller,'epoch',1,'events',jsonb_build_array(jsonb_build_object('sequence',3,'kind','end','atMs',6000,'elapsedMs',1000))),'STALE_EPOCH',actor,4);
  perform pg_temp.clock('issue_match_link',jsonb_build_object('matchId',mid2,'inviteHash',repeat('3',64)));
  perform pg_temp.reject('append_events',jsonb_build_object('matchId',mid2,'controllerId',controller,'epoch',1,'events','[]'::jsonb),'FORBIDDEN',actor,4);
  actor:=jsonb_build_object('matchSessionHash',repeat('c',64));
  perform pg_temp.clock('claim_match_link',jsonb_build_object('matchId',mid2,'inviteHash',repeat('3',64),'sessionHash',repeat('c',64)),'{}');
  out:=pg_temp.clock('claim_clock',jsonb_build_object('matchId',mid2,'controllerId',controller),actor);
  perform pg_temp.assert(out#>>'{state,epoch}'='3' and out#>>'{state,status}'='paused' and out#>>'{state,reviewRequired}'='true','replacement of paused checkpoint changes epoch and requires review of possible unsaved events');
  perform pg_temp.reject('append_events',jsonb_build_object('matchId',mid2,'controllerId',controller,'epoch',1,'events','[]'::jsonb),'STALE_EPOCH',actor,5);
  perform pg_temp.clock('revoke_match_link',jsonb_build_object('matchId',mid2,'reason','Device retired'));
  rejected:=false; begin perform crossplay.clock_read(actor,mid2); exception when others then rejected:=sqlerrm='FORBIDDEN'; end; perform pg_temp.assert(rejected,'revoked device cannot read');
  -- Played forfeit keeps the original two start entries.
  perform crossplay.execute('{"userId":"10000000-0000-4000-8000-000000000001"}','finalize_result',jsonb_build_object('tournamentId',tid,'matchId',mid2,'expectedRevision',0,'kind','forfeit','winnerId',b,'reason','Forfeit after play'),gen_random_uuid());
  perform pg_temp.assert((select count(*) from crossplay.match_start_accounting where tournament_id=tid and match_id=mid2 and source='played')=2,'played forfeit retains first and second');
  mid3:=pg_temp.match(tid,3,1,3); mid4:=pg_temp.match(tid,4,1,4);
  perform crossplay.finalize_match(tid,mid3,'forfeit',jsonb_build_object('winnerId','20000000-0000-4000-8000-000000000003'),'{}','Absent');
  perform crossplay.finalize_match(tid,mid4,'forfeit',jsonb_build_object('winnerId','20000000-0000-4000-8000-000000000004'),'{}','Absent');
  perform pg_temp.assert((select position from crossplay.match_start_accounting where tournament_id=tid and match_id=mid3 and entrant_id=a)='first','first unplayed forfeit counts first');
  perform pg_temp.assert((select position from crossplay.match_start_accounting where tournament_id=tid and match_id=mid4 and entrant_id=a)='second','next unplayed forfeit counts second');
  perform crossplay.finalize_match(tid,mid4,'forfeit',jsonb_build_object('winnerId','20000000-0000-4000-8000-000000000004'),'{}','Correction same outcome');
  perform pg_temp.assert((select count(*) from crossplay.match_start_accounting where tournament_id=tid and match_id=mid4)=1,'forfeit correction never double counts or credits opponent');
  mid:=pg_temp.match(tid,5,2,null); perform crossplay.finalize_match(tid,mid,'bye','{}','{}',null);
  perform pg_temp.assert(not exists(select 1 from crossplay.match_start_accounting where tournament_id=tid and match_id=mid),'bye no first second');
end $$;

do $$ declare tid uuid:=pg_temp.fixture(); mid uuid; manual_mid uuid; out jsonb; actor jsonb:=jsonb_build_object('matchSessionHash',repeat('d',64));
  controller uuid:=gen_random_uuid(); report_id uuid; version bigint; revision integer; owner_actor jsonb:='{"userId":"10000000-0000-4000-8000-000000000001"}';
begin
  mid:=pg_temp.match(tid,1);
  perform pg_temp.clock('issue_match_link',jsonb_build_object('matchId',mid,'inviteHash',repeat('4',64)));
  perform pg_temp.clock('claim_match_link',jsonb_build_object('matchId',mid,'inviteHash',repeat('4',64),'sessionHash',repeat('d',64)),'{}');
  perform pg_temp.clock('claim_clock',jsonb_build_object('matchId',mid,'controllerId',controller),actor);
  perform pg_temp.clock('issue_match_link',jsonb_build_object('matchId',mid,'inviteHash',repeat('5',64)));
  actor:=jsonb_build_object('matchSessionHash',repeat('e',64));
  perform pg_temp.clock('claim_match_link',jsonb_build_object('matchId',mid,'inviteHash',repeat('5',64),'sessionHash',repeat('e',64)),'{}');
  out:=pg_temp.clock('claim_clock',jsonb_build_object('matchId',mid,'controllerId',controller),actor);
  perform pg_temp.assert(out#>>'{state,status}'='ready' and out#>>'{state,reviewRequired}'='true','replacement of ready checkpoint requires review of possible offline start');
  perform pg_temp.reject('append_events',jsonb_build_object('matchId',mid,'controllerId',controller,'epoch',2,'events',jsonb_build_array(jsonb_build_object('sequence',1,'kind','start','atMs',1000,'elapsedMs',0))),'TIMING_REVIEW_REQUIRED',actor,1);
  out:=pg_temp.clock('correct_clock',jsonb_build_object('matchId',mid,'usedMs','[0,0]'::jsonb,'activeSide',(out#>>'{state,activeSide}')::integer,'reason','Confirmed play had not begun'),owner_actor,1);
  out:=pg_temp.clock('append_events',jsonb_build_object('matchId',mid,'controllerId',controller,'epoch',3,'events',jsonb_build_array(
    jsonb_build_object('sequence',1,'kind','start','atMs',1000,'elapsedMs',0),jsonb_build_object('sequence',2,'kind','end','atMs',2000,'elapsedMs',1000))),actor,2);
  out:=pg_temp.clock('submit_shared_report',jsonb_build_object('matchId',mid,'raw1',401,'raw2',399,'expectedRevision',0,'clockVersion',4),actor);
  report_id:=(out#>>'{report,id}')::uuid;
  perform pg_temp.clock('acknowledge_shared_report',jsonb_build_object('matchId',mid,'reportId',report_id,'expectedRevision',1,'side',1),actor);
  perform pg_temp.clock('dispute_shared_report',jsonb_build_object('matchId',mid,'reportId',report_id,'expectedRevision',1,'reason','Verify clock'),actor);
  out:=pg_temp.clock('claim_clock',jsonb_build_object('matchId',mid,'controllerId',controller),actor);
  perform pg_temp.assert(out->>'matchStatus'='disputed' and out#>>'{state,status}'='ended','disputed report reload reattaches existing controller');
  perform pg_temp.clock('issue_match_link',jsonb_build_object('matchId',mid,'inviteHash',repeat('6',64)));
  actor:=jsonb_build_object('matchSessionHash',repeat('f',64));
  perform pg_temp.clock('claim_match_link',jsonb_build_object('matchId',mid,'inviteHash',repeat('6',64),'sessionHash',repeat('f',64)),'{}');
  out:=pg_temp.clock('claim_clock',jsonb_build_object('matchId',mid,'controllerId',controller),actor);
  perform pg_temp.assert(out#>>'{state,status}'='ended' and out#>>'{state,reviewRequired}'='true','ended pending/disputed report replacement remains recoverable and requires review');
  out:=pg_temp.clock('correct_clock',jsonb_build_object('matchId',mid,'usedMs',out#>'{state,usedMs}','activeSide',(out#>>'{state,activeSide}')::integer,'reason','Reviewed replacement device'),owner_actor,(out#>>'{state,version}')::bigint);
  perform pg_temp.assert(out->>'matchStatus'='unreported' and out->'report'='null'::jsonb and out#>>'{state,reportSubmitted}'='false' and out#>>'{state,status}'='ended','review clears superseded pending report and retains frozen ended timing');
  perform pg_temp.reject('acknowledge_shared_report',jsonb_build_object('matchId',mid,'reportId',report_id,'expectedRevision',2,'side',2),'STALE_REVISION',actor);
  out:=pg_temp.clock('submit_shared_report',jsonb_build_object('matchId',mid,'raw1',401,'raw2',399,'expectedRevision',(out->>'matchRevision')::integer,'clockVersion',(out#>>'{state,version}')::bigint),actor);
  perform pg_temp.assert(out#>'{report,acknowledgedSides}'='[]'::jsonb,'replacement report requires fresh acknowledgements');
  perform pg_temp.clock('revoke_match_link',jsonb_build_object('matchId',mid,'reason','Controller retired'));
  out:=crossplay.clock_read(owner_actor,mid);
  perform pg_temp.assert(out#>>'{state,reviewRequired}'='true','revocation of ended claimed device also flags possible unsaved events');
  manual_mid:=pg_temp.match(tid,2,3,4);
  insert into crossplay.match_reports(tournament_id,match_id,revision,submitted_by,raw1,raw2,overtime1,overtime2)
    values(tid,manual_mid,1,'20000000-0000-4000-8000-000000000003',410,390,0,0) returning id into report_id;
  update crossplay.matches set current_report_id=report_id,revision=1,status='awaiting_confirmation' where tournament_id=tid and id=manual_mid;
  perform pg_temp.reject('claim_clock',jsonb_build_object('matchId',manual_mid,'controllerId',controller),'CLOCK_UNAVAILABLE');
end $$;

do $$ declare tid uuid:=pg_temp.fixture(); mid uuid; mid2 uuid; out jsonb; a uuid:='20000000-0000-4000-8000-000000000001'; b uuid:='20000000-0000-4000-8000-000000000002'; begin
  mid:=pg_temp.match(tid,1,1,3);
  perform pg_temp.clock('record_manual_start',jsonb_build_object('matchId',mid,'entrantId','20000000-0000-4000-8000-000000000003','reason','Imported starter'));
  mid2:=pg_temp.match(tid,2,1,2); perform crossplay.resolve_match_start(tid,mid2);
  perform pg_temp.assert((select entrant_id=a and method='more_seconds' from crossplay.match_starts where tournament_id=tid and match_id=mid2),'equal firsts more seconds wins');
  -- Explicit fewer-first priority even when the other side has more seconds.
  update crossplay.match_start_accounting set position='first' where tournament_id=tid and entrant_id=a;
  delete from crossplay.match_starts where tournament_id=tid and match_id=mid2;
  perform crossplay.resolve_match_start(tid,mid2);
  perform pg_temp.assert((select entrant_id=b and method='fewer_firsts' from crossplay.match_starts where tournament_id=tid and match_id=mid2),'first count priority over second count');
  tid:=pg_temp.fixture(); mid:=pg_temp.match(tid,1); mid2:=pg_temp.match(tid,2);
  perform crossplay.finalize_match(tid,mid,'played','{"raw1":410,"raw2":380,"overtime1":0,"overtime2":0}','{}',null);
  perform pg_temp.reject('claim_clock',jsonb_build_object('matchId',mid2,'controllerId',gen_random_uuid()),'START_HISTORY_REQUIRED');
  perform pg_temp.clock('record_manual_start',jsonb_build_object('matchId',mid,'entrantId',a,'reason','Organizer imported actual starter'));
  out:=pg_temp.clock('claim_clock',jsonb_build_object('matchId',mid2,'controllerId',gen_random_uuid()));
  perform pg_temp.assert(out#>>'{start,entrantId}'=b::text,'imported history unblocks balanced start');
end $$;
select 'Crossplay clock migration focused checks passed' as evidence;
rollback;
