-- Focused read-only projection acceptance; synthetic fixtures roll back.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %',message; end if;
end $$;
do $$ declare owner_id uuid:=gen_random_uuid(); tid uuid; rid uuid; mid uuid;
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); actor jsonb; result jsonb; obj record;
  expected bigint[]:=array[0,0,1200,3500,3500,4000,0,4200,4200,4200]; n integer;
  cfg jsonb:='{"roundCount":1,"timeLimitSeconds":1200,"penaltyIntervalSeconds":10,"penaltyPoints":2}';
begin
  insert into auth.users(id) values(owner_id);
  insert into crossplay.organizers(user_id) values(owner_id);
  actor:=jsonb_build_object('userId',owner_id);
  insert into crossplay.tournaments(slug,name,status,config,frozen_config,seed,started_at)
    values('turn-'||gen_random_uuid(),'Turn fixture','active',cfg,cfg,'fixture',now()) returning id into tid;
  insert into crossplay.tournament_staff values(tid,owner_id,'owner');
  insert into crossplay.entrants(tournament_id,id,name,normalized_name,seed) values(tid,a,'Alex','alex',1),(tid,b,'Morgan','morgan',2);
  insert into crossplay.rounds(tournament_id,number,status,engine_version,input_hash,input_version,input_snapshot)
    values(tid,1,'published','fixture','fixture',0,'{}') returning id into rid;
  insert into crossplay.matches(tournament_id,round_id,table_number,kind) values(tid,rid,1,'played') returning id into mid;
  insert into crossplay.match_sides values(tid,rid,mid,1,a),(tid,rid,mid,2,b);
  perform pg_temp.assert(crossplay.clock_read(actor,mid)->'state'='null'::jsonb,'absent clock stays absent');
  insert into crossplay.match_clock_sessions(tournament_id,match_id,rules,status,active_side,used_ms1,used_ms2)
    values(tid,mid,cfg,'ready',1,4800,4200);
  insert into crossplay.match_clock_events(tournament_id,match_id,epoch,sequence,event)
    select tid,mid,1,ordinality,event from jsonb_array_elements('[
      {"kind":"start","elapsedMs":0}, {"kind":"recover","elapsedMs":1200},
      {"kind":"pause","elapsedMs":2300}, {"kind":"resume","elapsedMs":0},
      {"kind":"recover","elapsedMs":500}, {"kind":"switch","elapsedMs":800},
      {"kind":"pause","elapsedMs":4200}, {"kind":"recover","elapsedMs":0,"reviewRequired":true},
      {"kind":"end","elapsedMs":0}
    ]'::jsonb) with ordinality as entries(event,ordinality);
  for n in 0..9 loop
    update crossplay.match_clock_sessions set sequence=n where tournament_id=tid and match_id=mid;
    result:=crossplay.clock_read(actor,mid);
    perform pg_temp.assert((result->'state'->>'currentTurnMs')::bigint=expected[n+1],'turn duration at sequence '||n);
    perform pg_temp.assert(result->'state'->'usedMs'='[4800,4200]'::jsonb,'main totals unchanged');
    perform pg_temp.assert(result->>'tournamentStatus'='active' and result->>'runGeneration'='0','lifecycle metadata retained');
  end loop;
  update crossplay.match_clock_sessions set epoch=2,sequence=0,status='paused' where tournament_id=tid and match_id=mid;
  perform pg_temp.assert(crossplay.clock_read(actor,mid)->'state'->>'currentTurnMs'='0','new epoch does not inherit previous history');
  begin
    perform crossplay.clock_read('{}',mid);
    raise exception 'Anonymous read unexpectedly succeeded';
  exception when others then if sqlerrm<>'FORBIDDEN' then raise; end if; end;
  for obj in select p.oid,p.proname,p.proconfig,p.prosecdef from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='crossplay' and p.proname in ('clock_read','clock_read_before_turn_time') loop
    perform pg_temp.assert(obj.prosecdef and obj.proconfig @> array['search_path=""'],'secure path '||obj.proname);
    perform pg_temp.assert(has_function_privilege('crossplay_runtime',obj.oid,'EXECUTE')=(obj.proname='clock_read'),'runtime boundary '||obj.proname);
    perform pg_temp.assert(not has_function_privilege('anon',obj.oid,'EXECUTE') and not has_function_privilege('authenticated',obj.oid,'EXECUTE')
      and not has_function_privilege('service_role',obj.oid,'EXECUTE'),'private function '||obj.proname);
  end loop;
end $$;
rollback;
