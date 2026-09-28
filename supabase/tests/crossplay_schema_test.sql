-- Focused new-schema tests. This transaction rolls back fixture data.
begin;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into crossplay.organizers(user_id) values('10000000-0000-4000-8000-000000000001');
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.run(command text,payload jsonb,actor jsonb default '{"userId":"10000000-0000-4000-8000-000000000001"}') returns jsonb language plpgsql as $$
declare ver bigint; begin
  select version into ver from crossplay.tournaments where id=(payload->>'tournamentId')::uuid;
  return crossplay.execute(actor,command,payload,gen_random_uuid(),ver);
end $$;
create function pg_temp.reject(command text,payload jsonb,expected text,actor jsonb default '{"userId":"10000000-0000-4000-8000-000000000001"}') returns void language plpgsql as $$
declare rejected boolean:=false; begin
  begin perform pg_temp.run(command,payload,actor); exception when others then
    if expected is null or sqlerrm=expected then rejected:=true; else raise exception 'Expected %, got % for %',expected,sqlerrm,command; end if;
  end;
  perform pg_temp.assert(rejected,'Must reject '||command||' with '||coalesce(expected,'constraint error'));
end $$;

do $$ declare obj record; computed jsonb; cfg jsonb:='{"roundCount":2,"penaltyIntervalSeconds":10,"penaltyPoints":2,"timeLimitSeconds":null}'; seconds integer;
begin
  perform pg_temp.assert(crossplay.schema_version()='20260928010000','contract version');
  for obj in select tablename from pg_tables where schemaname='crossplay' loop
    perform pg_temp.assert(not has_table_privilege('crossplay_runtime','crossplay.'||obj.tablename,'SELECT,INSERT,UPDATE,DELETE'),'runtime base table denied '||obj.tablename);
    perform pg_temp.assert((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='crossplay' and c.relname=obj.tablename),'RLS enabled '||obj.tablename);
  end loop;
  for obj in select p.oid,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crossplay' loop
    perform pg_temp.assert(not has_function_privilege('anon',obj.oid,'EXECUTE') and not has_function_privilege('authenticated',obj.oid,'EXECUTE') and not has_function_privilege('service_role',obj.oid,'EXECUTE'),'browser roles denied '||obj.proname);
    perform pg_temp.assert(has_function_privilege('crossplay_runtime',obj.oid,'EXECUTE')=(obj.proname in ('execute','read_model','schema_version','consume_rate_limit')),'runtime interface '||obj.proname);
    perform pg_temp.assert(obj.proconfig @> array['search_path=""'],'empty search path '||obj.proname);
  end loop;
  perform pg_temp.assert(not pg_has_role('crossplay_runtime','postgres','MEMBER'),'no administrator membership');
  foreach seconds in array array[0,9,10,11,19,20] loop
    computed:=crossplay.calculate_result('played',jsonb_build_object('raw1',401,'raw2',399,'overtime1',seconds,'overtime2',0),cfg);
    perform pg_temp.assert((computed->>'adjusted1')::integer=401-(seconds/10)*2,'completed interval '||seconds);
  end loop;
  computed:=crossplay.calculate_result('played','{"raw1":401,"raw2":399,"overtime1":20,"overtime2":0}',cfg);
  perform pg_temp.assert(computed->>'difference1'='-2' and computed->>'points2'='2','overtime changes winner');
  computed:=crossplay.calculate_result('played','{"raw1":0,"raw2":-3,"overtime1":19,"overtime2":11}',cfg);
  perform pg_temp.assert(computed->>'adjusted1'='-2' and computed->>'adjusted2'='-5','negative score and both overtime');
  computed:=crossplay.calculate_result('played','{"raw1":401,"raw2":399,"overtime1":10,"overtime2":0}',cfg);
  perform pg_temp.assert(computed->>'points1'='1' and computed->>'points2'='1','adjusted draw');
  computed:=crossplay.calculate_result('played','{"raw1":20,"raw2":10,"overtime1":11,"overtime2":0}',cfg||'{"penaltyIntervalSeconds":3,"penaltyPoints":4}');
  perform pg_temp.assert(computed->>'adjusted1'='8','custom interval/rate');
  computed:=crossplay.calculate_result('played','{"raw1":-100000,"raw2":100000,"overtime1":86400,"overtime2":86400}',cfg||'{"penaltyPoints":0}');
  perform pg_temp.assert(computed->>'adjusted1'='-100000','zero penalty');
  perform pg_temp.assert(crossplay.consume_rate_limit('fixture',2,60),'rate hit 1');
  perform pg_temp.assert(crossplay.consume_rate_limit('fixture',2,60),'rate hit 2');
  perform pg_temp.assert(not crossplay.consume_rate_limit('fixture',2,60),'rate exceeded');
end $$;

do $$ declare cfg jsonb:='{"roundCount":2,"penaltyIntervalSeconds":10,"penaltyPoints":2,"timeLimitSeconds":null}'; tid uuid; second_tid uuid; copy_tid uuid; rid uuid; mid uuid; report_id uuid; request uuid; snapshot jsonb; outcome jsonb; version_before bigint; r_before integer; p jsonb; other jsonb; failed boolean;
  owner_actor jsonb:='{"userId":"10000000-0000-4000-8000-000000000001"}';
  session_a jsonb:=jsonb_build_object('sessionHash',repeat('a',64)); session_b jsonb:=jsonb_build_object('sessionHash',repeat('b',64));
  a uuid:='20000000-0000-4000-8000-000000000001'; b uuid:='20000000-0000-4000-8000-000000000002'; c uuid:='20000000-0000-4000-8000-000000000003';
begin
  perform pg_temp.reject('create_tournament',jsonb_build_object('slug','forbidden','name','Forbidden','config',cfg,'seed','test'),'FORBIDDEN','{"userId":"10000000-0000-4000-8000-000000000002"}');
  failed:=false; begin perform crossplay.read_model('{"userId":"10000000-0000-4000-8000-000000000002"}',null,'admin'); exception when others then failed:=sqlerrm='FORBIDDEN'; end; perform pg_temp.assert(failed,'admin list blocks unrelated auth user');
  request:=gen_random_uuid(); p:=jsonb_build_object('slug','test-swiss','name','Test Swiss','config',cfg,'seed','test');
  outcome:=crossplay.execute(owner_actor,'create_tournament',p,request,null); tid:=(outcome->>'id')::uuid;
  perform pg_temp.assert(crossplay.execute(owner_actor,'create_tournament',p,request,null)=outcome,'create replay');
  failed:=false; begin perform crossplay.execute(owner_actor,'create_tournament',p||'{"name":"Other"}',request,null); exception when others then failed:=sqlerrm='IDEMPOTENCY_MISMATCH'; end; perform pg_temp.assert(failed,'idempotency mismatch');
  perform pg_temp.assert(jsonb_array_length(crossplay.read_model('{}')->'tournaments')=0,'draft excluded from public list');
  failed:=false; begin perform crossplay.read_model('{}',tid::text); exception when others then failed:=sqlerrm='NOT_FOUND'; end; perform pg_temp.assert(failed,'draft inaccessible');
  perform pg_temp.run('add_entrants',jsonb_build_object('tournamentId',tid,'entrants',jsonb_build_array(jsonb_build_object('id',a,'name','Alice','seed',1),jsonb_build_object('id',b,'name','Bob','seed',2),jsonb_build_object('id',c,'name','Cara','seed',3))));
  perform pg_temp.reject('add_entrants',jsonb_build_object('tournamentId',tid,'entrants',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Unique','seed',4),jsonb_build_object('id',gen_random_uuid(),'name','alice','seed',5))),null);
  perform pg_temp.assert((select count(*) from crossplay.entrants where tournament_id=tid)=3,'duplicate batch atomic');
  perform pg_temp.reject('add_entrants',jsonb_build_object('tournamentId',tid,'entrants',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Ａlice','seed',4))),null);
  perform pg_temp.run('issue_invite',jsonb_build_object('tournamentId',tid,'entrantId',a,'inviteHash',repeat('1',64)));
  perform pg_temp.run('issue_invite',jsonb_build_object('tournamentId',tid,'entrantId',b,'inviteHash',repeat('2',64)));
  perform pg_temp.run('claim_invite',jsonb_build_object('inviteHash',repeat('1',64),'sessionHash',repeat('a',64)),'{}');
  perform pg_temp.run('claim_invite',jsonb_build_object('inviteHash',repeat('2',64),'sessionHash',repeat('b',64)),'{}');
  perform pg_temp.reject('claim_invite',jsonb_build_object('inviteHash',repeat('1',64),'sessionHash',repeat('c',64)),'INVALID_INVITE','{}');
  perform pg_temp.reject('generate_round',jsonb_build_object('tournamentId',tid,'roundNumber',1,'pairs',jsonb_build_array(jsonb_build_object('player1Id',a,'player2Id',b)),'engineVersion','test','inputHash','fixture'),'INCOMPLETE_PAIRINGS');
  p:=jsonb_build_object('tournamentId',tid,'roundNumber',1,'pairs',jsonb_build_array(jsonb_build_object('player1Id',a,'player2Id',b),jsonb_build_object('player1Id',c,'player2Id',null)),'engineVersion','test','inputHash','fixture');
  outcome:=pg_temp.run('generate_round',p); rid:=(outcome->>'roundId')::uuid;
  perform pg_temp.run('update_entrant',jsonb_build_object('tournamentId',tid,'entrantId',a,'name','Alice A'));
  perform pg_temp.reject('publish_round',jsonb_build_object('tournamentId',tid,'roundId',rid),'STALE_PAIRINGS');
  rid:=(pg_temp.run('generate_round',p)->>'roundId')::uuid;
  request:=gen_random_uuid(); select version into version_before from crossplay.tournaments where id=tid;
  outcome:=crossplay.execute(owner_actor,'publish_round',jsonb_build_object('tournamentId',tid,'roundId',rid),request,version_before);
  perform pg_temp.assert(crossplay.execute(owner_actor,'publish_round',jsonb_build_object('tournamentId',tid,'roundId',rid),request,version_before)=outcome,'publish replay before version check');
  perform pg_temp.assert((select count(*) from crossplay.rounds where tournament_id=tid)=1,'one round on replay');
  snapshot:=crossplay.read_model('{}',tid::text); mid:=(snapshot#>>'{rounds,0,matches,0,id}')::uuid;
  perform pg_temp.assert(snapshot#>>'{rounds,0,matches,1,result,points1}'='2' and snapshot#>>'{rounds,0,matches,1,result,difference1}'='0','bye finalized zero differential');
  perform pg_temp.assert(not (snapshot ? 'audit') and snapshot#>>'{viewer,isOrganizer}'='false','public projection');
  perform pg_temp.reject('add_entrants',jsonb_build_object('tournamentId',tid,'entrants','[]'::jsonb),'ROSTER_LOCKED');
  perform pg_temp.reject('update_settings',jsonb_build_object('tournamentId',tid,'name','Test','config',cfg||'{"penaltyPoints":3}'),'RULES_LOCKED');
  perform pg_temp.reject('generate_round',p||'{"roundNumber":2}','UNRESOLVED_MATCHES');
  perform pg_temp.reject('submit_report',jsonb_build_object('tournamentId',tid,'matchId',mid,'expectedRevision',0,'raw1',401,'raw2',399,'overtime1',20,'overtime2',0),'FORBIDDEN','{}');
  p:=jsonb_build_object('tournamentId',tid,'matchId',mid,'expectedRevision',0,'raw1',401,'raw2',399,'overtime1',20,'overtime2',0);
  perform pg_temp.run('submit_report',p,session_a);
  snapshot:=crossplay.read_model('{}',tid::text);
  perform pg_temp.assert(snapshot#>'{rounds,0,matches,0,result}'='null'::jsonb and snapshot#>'{rounds,0,matches,0,report}'='null'::jsonb,'pending hidden and unofficial');
  snapshot:=crossplay.read_model(session_b,tid::text); report_id:=(snapshot#>>'{rounds,0,matches,0,report,id}')::uuid;
  perform pg_temp.assert(snapshot#>>'{rounds,0,matches,0,report,raw1}'='401','opponent sees proposal');
  perform pg_temp.reject('confirm_report',jsonb_build_object('tournamentId',tid,'matchId',mid,'expectedRevision',1,'reportId',report_id),'OPPONENT_REQUIRED',session_a);
  perform pg_temp.run('submit_report',p||'{"expectedRevision":1,"raw1":402}',session_a);
  perform pg_temp.reject('confirm_report',jsonb_build_object('tournamentId',tid,'matchId',mid,'expectedRevision',1,'reportId',report_id),'STALE_REVISION',session_b);
  report_id:=(crossplay.read_model(session_b,tid::text)#>>'{rounds,0,matches,0,report,id}')::uuid;
  perform pg_temp.run('dispute_report',jsonb_build_object('tournamentId',tid,'matchId',mid,'expectedRevision',2,'reportId',report_id,'reason','Wrong score'),session_b);
  perform pg_temp.reject('finalize_result',p||'{"expectedRevision":3,"kind":"played"}','REASON_REQUIRED');
  perform pg_temp.run('finalize_result',p||'{"expectedRevision":3,"kind":"played","reason":"Score verified"}');
  perform pg_temp.assert(crossplay.read_model('{}',tid::text)#>>'{rounds,0,matches,0,result,adjusted1}'='397','authoritative final score');
  perform pg_temp.reject('submit_report',p||'{"expectedRevision":4}','RESULT_LOCKED',session_a);
  perform pg_temp.reject('finish_tournament',jsonb_build_object('tournamentId',tid),'EARLY_FINISH_REASON_REQUIRED');
  -- Correction is append-only, audited, and preserves the original published opponent.
  perform pg_temp.run('finalize_result',p||'{"expectedRevision":4,"kind":"played","raw1":410,"reason":"Corrected transcription"}');
  perform pg_temp.assert((select count(*) from crossplay.result_revisions where tournament_id=tid and match_id=mid)=2,'append-only result history');
  perform pg_temp.assert(not exists(select 1 from crossplay.result_revisions where tournament_id=tid and (rules->>'roundingPolicy' is distinct from 'completed_intervals' or rules->>'rulesVersion' is distinct from 'crossplay-v1')),'explicit frozen scoring policy');
  perform pg_temp.assert((select count(*) from crossplay.match_reports where tournament_id=tid and match_id=mid)=2,'proposal history');
  -- Prior bye cannot repeat; played opponents cannot repeat.
  perform pg_temp.reject('generate_round',jsonb_build_object('tournamentId',tid,'roundNumber',2,'pairs',jsonb_build_array(jsonb_build_object('player1Id',c,'player2Id',null),jsonb_build_object('player1Id',a,'player2Id',b)),'engineVersion','test','inputHash','fixture'),'REPEATED_BYE');
  perform pg_temp.reject('generate_round',jsonb_build_object('tournamentId',tid,'roundNumber',2,'pairs',jsonb_build_array(jsonb_build_object('player1Id',a,'player2Id',b),jsonb_build_object('player1Id',c,'player2Id',null)),'engineVersion','test','inputHash','fixture'),'REPEATED_OPPONENT');
  perform pg_temp.run('withdraw_entrant',jsonb_build_object('tournamentId',tid,'entrantId',b));
  p:=jsonb_build_object('tournamentId',tid,'roundNumber',2,'pairs',jsonb_build_array(jsonb_build_object('player1Id',a,'player2Id',c)),'engineVersion','test','inputHash','fixture2');
  rid:=(pg_temp.run('generate_round',p)->>'roundId')::uuid;
  perform pg_temp.run('publish_round',jsonb_build_object('tournamentId',tid,'roundId',rid));
  snapshot:=crossplay.read_model(session_a,tid::text); mid:=(snapshot#>>'{rounds,1,matches,0,id}')::uuid;
  perform pg_temp.reject('submit_report',jsonb_build_object('tournamentId',tid,'matchId',mid,'expectedRevision',0,'raw1',5,'raw2',3,'overtime1',0,'overtime2',0),'FORBIDDEN',session_b);
  perform pg_temp.run('submit_report',jsonb_build_object('tournamentId',tid,'matchId',mid,'expectedRevision',0,'raw1',5,'raw2',3,'overtime1',0,'overtime2',0),session_a);
  -- Regeneration invalidates existing entrant sessions.
  perform pg_temp.run('issue_invite',jsonb_build_object('tournamentId',tid,'entrantId',a,'inviteHash',repeat('3',64)));
  perform pg_temp.reject('submit_report',jsonb_build_object('tournamentId',tid,'matchId',mid,'expectedRevision',1,'raw1',5,'raw2',3,'overtime1',0,'overtime2',0),'FORBIDDEN',session_a);
  perform pg_temp.run('finalize_result',jsonb_build_object('tournamentId',tid,'matchId',mid,'expectedRevision',1,'kind','forfeit','winnerId',c,'reason','Player left'));
  perform pg_temp.assert(crossplay.read_model('{}',tid::text)#>>'{rounds,1,matches,0,result,difference1}'='0','forfeit zero differential');
  perform pg_temp.run('finish_tournament',jsonb_build_object('tournamentId',tid));
  perform pg_temp.run('reopen_tournament',jsonb_build_object('tournamentId',tid,'reason','Correct result'));
  perform pg_temp.reject('generate_round',jsonb_build_object('tournamentId',tid,'roundNumber',3),'CORRECTIONS_ONLY');
  perform pg_temp.reject('add_entrants',jsonb_build_object('tournamentId',tid,'entrants','[]'::jsonb),'ROSTER_LOCKED');
  perform pg_temp.run('finalize_result',jsonb_build_object('tournamentId',tid,'matchId',mid,'expectedRevision',2,'kind','double_forfeit','reason','Both absent'));
  perform pg_temp.assert(crossplay.read_model('{}',tid::text)#>>'{rounds,1,matches,0,result,points2}'='0','double forfeit zero points');
  perform pg_temp.run('finish_tournament',jsonb_build_object('tournamentId',tid));
  copy_tid:=(pg_temp.run('copy_tournament',jsonb_build_object('tournamentId',tid,'name','Copy','slug','copy-swiss','seed','copy-seed'))->>'id')::uuid;
  snapshot:=crossplay.read_model(owner_actor,copy_tid::text,'admin');
  perform pg_temp.assert(snapshot#>>'{tournament,status}'='draft' and jsonb_array_length(snapshot->'entrants')=0 and jsonb_array_length(snapshot->'rounds')=0,'copy clean draft');
  perform pg_temp.assert(not exists(select 1 from crossplay.entrant_credentials where tournament_id=copy_tid),'copy no credentials');
  perform pg_temp.run('archive_tournament',jsonb_build_object('tournamentId',tid));
  -- Composite FK rejects an official pointer to a revision of a different match.
  failed:=false; begin
    update crossplay.matches set official_revision_id=(select id from crossplay.result_revisions where tournament_id=tid and match_id<>mid limit 1) where tournament_id=tid and id=mid;
    set constraints crossplay.crossplay_official_revision_fk immediate;
  exception when foreign_key_violation then failed:=true; end;
  perform pg_temp.assert(failed,'revision pointer scoped to match');
  failed:=false; begin
    insert into crossplay.match_sides values(copy_tid,rid,mid,2,a);
  exception when foreign_key_violation then failed:=true; end;
  perform pg_temp.assert(failed,'cross tournament assignments denied');
  perform pg_temp.assert(not exists(select 1 from crossplay.rounds where tournament_id=tid and status='draft'),'no obsolete drafts');
end $$;

set local role crossplay_runtime;
do $$ declare denied boolean:=false; begin
  perform crossplay.schema_version();
  perform crossplay.read_model('{}');
  begin perform 1 from crossplay.tournaments; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Runtime table access allowed'; end if;
end $$;
reset role;
set local role anon;
do $$ declare denied boolean:=false; begin
  begin perform crossplay.read_model('{}'); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Anonymous function allowed'; end if;
end $$;
reset role;
rollback;
