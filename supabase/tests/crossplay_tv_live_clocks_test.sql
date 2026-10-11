-- Focused acceptance for 20261011010000; all fixture writes roll back.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %',message; end if;
end $$;
create temporary table tv_fixture(tid uuid,mid uuid,owner_id uuid,controller uuid);
do $$ declare tid uuid; rid uuid; mid uuid; uid uuid:=gen_random_uuid(); controller uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
  cfg jsonb:='{"roundCount":3,"timeLimitSeconds":1200,"penaltyIntervalSeconds":10,"penaltyPoints":2}';
begin
  insert into auth.users(id) values(uid); insert into crossplay.organizers(user_id) values(uid);
  insert into crossplay.tournaments(slug,name,status,config,frozen_config,seed,started_at)
    values('tv-live-acceptance','TV live fixture','active',cfg,cfg,'PRIVATE_SEED',now()) returning id into tid;
  insert into crossplay.tournament_staff values(tid,uid,'owner');
  insert into crossplay.entrants(tournament_id,id,name,normalized_name,seed) values(tid,a,'Alice','alice',1),(tid,b,'Bob','bob',2);
  insert into crossplay.rounds(tournament_id,number,status,engine_version,input_hash,input_version,input_snapshot)
    values(tid,1,'published','test','test',0,'{}') returning id into rid;
  insert into crossplay.matches(tournament_id,round_id,table_number,kind,status) values(tid,rid,1,'played','unreported') returning id into mid;
  insert into crossplay.match_sides values(tid,rid,mid,1,a),(tid,rid,mid,2,b);
  insert into crossplay.match_clock_sessions(tournament_id,match_id,rules,status,active_side,used_ms1,used_ms2,epoch,version,sequence,controller_id,controller_actor)
    values(tid,mid,cfg,'running',1,10000,20000,1,1,1,controller,uid::text);
  insert into tv_fixture values(tid,mid,uid,controller);
end $$;
do $$ declare f record; p jsonb; body jsonb; stamp bigint; before_version bigint; r uuid; rejected boolean;
begin
  select * into f from tv_fixture;
  perform pg_temp.assert(crossplay.display_version()='20261011010000','new display capability');
  perform pg_temp.assert(not has_table_privilege('crossplay_runtime','crossplay.display_clock_samples','SELECT,INSERT,UPDATE,DELETE'),'runtime has no telemetry table access');
  perform pg_temp.assert(not has_function_privilege('crossplay_runtime','crossplay.display_read_before_live_clocks(text)','EXECUTE'),'base helper private');
  perform pg_temp.assert(has_function_privilege('crossplay_runtime','crossplay.display_clock_checkpoint(jsonb,uuid,jsonb)','EXECUTE'),'function-only writer');
  perform pg_temp.assert(not has_function_privilege('anon','crossplay.display_clock_checkpoint(jsonb,uuid,jsonb)','EXECUTE')
    and not has_function_privilege('authenticated','crossplay.display_clock_checkpoint(jsonb,uuid,jsonb)','EXECUTE')
    and not has_function_privilege('service_role','crossplay.display_clock_checkpoint(jsonb,uuid,jsonb)','EXECUTE'),'browser and service roles denied');
  stamp:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  body:=jsonb_build_object('controllerId',f.controller,'generation',0,'epoch',1,'version',1,'sequence',1,'sampledAtMs',stamp,'uncertaintyMs',50,'elapsedMs',1234);
  select version into before_version from crossplay.tournaments where id=f.tid;
  perform crossplay.display_clock_checkpoint(jsonb_build_object('userId',f.owner_id),f.mid,body);
  perform crossplay.display_clock_checkpoint(jsonb_build_object('userId',f.owner_id),f.mid,body||jsonb_build_object('sampledAtMs',stamp-1,'elapsedMs',9999));
  p:=crossplay.display_read(f.tid::text);
  perform pg_temp.assert(p#>>array['matches',f.mid::text,'clock','sample','usedMs','0']='11234','newest sample retained and elapsed added only to running side');
  perform pg_temp.assert(p#>>array['matches',f.mid::text,'clock','sample','usedMs','1']='20000','other side unchanged');
  perform pg_temp.assert((select version=before_version from crossplay.tournaments where id=f.tid),'tournament version unchanged');
  perform pg_temp.assert((select version=1 and sequence=1 and used_ms1=10000 from crossplay.match_clock_sessions where match_id=f.mid),'official clock untouched');
  perform pg_temp.assert(p::text !~ 'PRIVATE_|controllerId|controller_actor|received_at|raw1|disputeReason','public allowlist');
  rejected:=false; begin perform crossplay.display_clock_checkpoint('{}',f.mid,body); exception when others then rejected:=sqlerrm='FORBIDDEN'; end;
  perform pg_temp.assert(rejected,'anonymous checkpoint rejected');
  rejected:=false; begin perform crossplay.display_clock_checkpoint(jsonb_build_object('userId',f.owner_id),f.mid,body||jsonb_build_object('controllerId',gen_random_uuid())); exception when others then rejected:=sqlerrm='FORBIDDEN'; end;
  perform pg_temp.assert(rejected,'other device rejected even for staff');
  rejected:=false; begin perform crossplay.display_clock_checkpoint(jsonb_build_object('userId',f.owner_id),f.mid,body||'{"version":0}'); exception when others then rejected:=sqlerrm='STALE_CLOCK_VERSION'; end;
  perform pg_temp.assert(rejected,'stale version rejected');
  rejected:=false; begin perform crossplay.display_clock_checkpoint(jsonb_build_object('userId',f.owner_id),f.mid,body||'{"generation":1}'); exception when others then rejected:=sqlerrm='STALE_CLOCK_VERSION'; end;
  perform pg_temp.assert(rejected,'wrong generation rejected');
  rejected:=false; begin perform crossplay.display_clock_checkpoint(jsonb_build_object('userId',f.owner_id),f.mid,body||jsonb_build_object('sampledAtMs',stamp-7000)); exception when others then rejected:=sqlerrm='INVALID_PAYLOAD'; end;
  perform pg_temp.assert(rejected,'late sample cannot renew freshness');
  rejected:=false; begin perform crossplay.display_clock_checkpoint(jsonb_build_object('userId',f.owner_id),f.mid,body||jsonb_build_object('sampledAtMs',stamp+7000)); exception when others then rejected:=sqlerrm='INVALID_PAYLOAD'; end;
  perform pg_temp.assert(rejected,'future sample rejected');
  update crossplay.match_clock_sessions set version=2,epoch=2 where match_id=f.mid;
  p:=crossplay.display_read(f.tid::text);
  perform pg_temp.assert(p#>array['matches',f.mid::text,'clock','sample']='null'::jsonb,'replacement hides prior sample');
  insert into crossplay.match_reports(tournament_id,match_id,revision,submitted_by,raw1,raw2,overtime1,overtime2,dispute_reason)
    values(f.tid,f.mid,1,(select entrant_id from crossplay.match_sides where match_id=f.mid and side=1),400,390,20,0,'PRIVATE_REASON') returning id into r;
  update crossplay.matches set status='awaiting_confirmation',current_report_id=r where id=f.mid;
  p:=crossplay.display_read(f.tid::text);
  perform pg_temp.assert(p#>>array['matches',f.mid::text,'provisional','adjusted1']='396','pending overtime calculated server-side');
  perform pg_temp.assert(p#>>array['matches',f.mid::text,'provisional','adjusted2']='390','pending second score');
  perform pg_temp.assert(not (p#>array['matches',f.mid::text])?'clock','pending result replaces clock');
  perform pg_temp.assert(p::text !~ 'PRIVATE_|raw1|disputeReason|submittedBy','pending projection remains allowlisted');
  update crossplay.matches set status='disputed' where id=f.mid;
  perform pg_temp.assert(not (crossplay.display_read(f.tid::text)#>array['matches',f.mid::text])?'provisional','dispute hides pending scores');
  perform crossplay.finalize_match(f.tid,f.mid,'played','{"raw1":410,"raw2":400,"overtime1":0,"overtime2":0}',jsonb_build_object('userId',f.owner_id),'test');
  p:=crossplay.display_read(f.tid::text);
  perform pg_temp.assert(p#>>array['matches',f.mid::text,'status']='final' and not (p#>array['matches',f.mid::text])?'provisional'
    and not (p#>array['matches',f.mid::text])?'clock','official final outranks telemetry and pending report');
  perform pg_temp.assert(p#>>'{snapshot,rounds,0,matches,0,result,adjusted1}'='410','official corrected score coherent');
end $$;
set local role crossplay_runtime;
select crossplay.display_read('tv-live-acceptance')->>'serverNowMs';
reset role;
rollback;
