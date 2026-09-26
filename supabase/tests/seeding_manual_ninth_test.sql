begin;

create function pg_temp.proposed(slug text, source_fields jsonb) returns jsonb language plpgsql as $$
declare initial jsonb; draft jsonb; entry jsonb; source jsonb;
begin
  draft := '{"id":"00000000-0000-4000-8000-000000000001","inputRevision":0,"run":{"inputRevision":0,"status":"ready","passes":[{},{}]},"entrants":[]}'::jsonb;
  initial := jsonb_build_object('slug',slug,'revision',0,'inputRevision',0,'nextSequence','1','entrants','[]'::jsonb,'submissions','[]'::jsonb,'draft',draft,'published',null);
  perform public.tournament_seeding_read_event(slug,initial,'20260926020000');
  entry := '{"id":"00000000-0000-4000-8000-000000000002","canonicalKey":"player","displayName":"Player","mergedInto":null,"acceptedSubmissionId":"00000000-0000-4000-8000-000000000003"}'::jsonb;
  source := '{"id":"00000000-0000-4000-8000-000000000003","entrantId":"00000000-0000-4000-8000-000000000002","sequence":"1","actualRating":"12000.12","ninthContribution":"250","predictedRating":"12077.779121","contributions":[],"scoreInputMode":"ninth_only","verifiedShortfall":false,"shortfallNote":"","source":"admin_manual","status":"approved","identityConfirmed":true}'::jsonb || source_fields;
  draft := draft || '{"id":"00000000-0000-4000-8000-000000000004","inputRevision":1,"run":{"inputRevision":1,"status":"ready","passes":[{},{}]}}'::jsonb;
  return initial || jsonb_build_object('revision',1,'inputRevision',1,'nextSequence','2','entrants',jsonb_build_array(entry),'submissions',jsonb_build_array(source),'draft',draft);
end $$;

do $$ declare state jsonb; result jsonb; c jsonb; i integer:=0; failed boolean; oid regprocedure;
begin
  oid := 'public.tournament_seeding_commit(text,bigint,jsonb,text,text,jsonb)'::regprocedure;
  if has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute') or not has_function_privilege('service_role',oid,'execute') then raise exception 'RPC privilege regression'; end if;
  if not exists(select 1 from tournament_seeding.schema_metadata where version='20260926010000') then raise exception 'Old readiness marker lost'; end if;
  state := pg_temp.proposed('manual-ninth','{}');
  result := public.tournament_seeding_commit('manual-ninth',0,state,'first','fingerprint','{}');
  if result->>'replayed'!='false' or (select count(*) from tournament_seeding.submission_scores where event_slug='manual-ninth')!=1 then raise exception 'Manual source fabricated extra scores'; end if;
  if not exists(select 1 from tournament_seeding.submission_scores where event_slug='manual-ninth' and position=9 and contribution=250) then raise exception 'Known ninth score missing'; end if;
  if not exists(select 1 from tournament_seeding.submissions where event_slug='manual-ninth' and actual_rating=12000.12 and predicted_rating=12077.779121 and source_data->'contributions'='[]'::jsonb) then raise exception 'Exact manual source missing'; end if;
  result := public.tournament_seeding_commit('manual-ninth',0,state,'first','fingerprint','{}');
  if result->>'replayed'!='true' then raise exception 'Replay failed'; end if;
  failed:=false; begin perform public.tournament_seeding_commit('manual-ninth',0,state,'stale','stale','{}'); exception when others then if sqlerrm='STALE_REVISION' then failed:=true; else raise; end if; end;
  if not failed then raise exception 'Stale commit accepted'; end if;
  state := jsonb_set(state,'{revision}','2'); state := jsonb_set(state,'{submissions,0,actualRating}','"1"');
  failed:=false; begin perform public.tournament_seeding_commit('manual-ninth',1,state,'changed','changed','{}'); exception when others then if sqlerrm='IMMUTABLE_SOURCE' then failed:=true; else raise; end if; end;
  if not failed then raise exception 'Manual source mutation accepted'; end if;

  for c in select value from jsonb_array_elements('[
    {"verifiedShortfall":true,"shortfallNote":"Fewer than nine verified","ninthContribution":null,"predictedRating":null},
    {"ninthContribution":"0","predictedRating":"-966.384379"},
    {"scoreInputMode":null,"source":"piugame","contributions":["300","295","290","285","280","275","270","260","250"]},
    {"scoreInputMode":null,"source":"admin_manual","contributions":["300","295","290","285","280","275","270","260","250"]},
    {"scoreInputMode":null,"source":"piugame","verifiedShortfall":true,"shortfallNote":"Two imported scores","contributions":["300","250"],"ninthContribution":null,"predictedRating":null}
  ]'::jsonb) loop
    i:=i+1; state:=pg_temp.proposed('valid-'||i,c);
    perform public.tournament_seeding_commit('valid-'||i,0,state,'save','save','{}');
  end loop;
  if exists(select 1 from tournament_seeding.submission_scores where event_slug='valid-1') then raise exception 'Shortfall fabricated scores'; end if;
  if (select count(*) from tournament_seeding.submission_scores where event_slug='valid-3')!=9 then raise exception 'Legacy imported scores lost'; end if;
  for c in select value from jsonb_array_elements('[
    {"source":"piugame"}, {"source":null}, {"contributions":["250"]}, {"contributions":null},
    {"ninthContribution":null}, {"predictedRating":null}, {"predictedRating":"999"},
    {"ninthContribution":"-1"}, {"ninthContribution":"NaN"}, {"ninthContribution":"Infinity"},
    {"ninthContribution":""}, {"verifiedShortfall":true},
    {"verifiedShortfall":true,"shortfallNote":"","ninthContribution":null,"predictedRating":null},
    {"scoreInputMode":null,"source":"piugame","contributions":["250"]}
  ]'::jsonb) loop
    i:=i+1; state:=pg_temp.proposed('invalid-'||i,c); failed:=false;
    begin perform public.tournament_seeding_commit('invalid-'||i,0,state,'save','save','{}'); exception when others then failed:=true; end;
    if not failed then raise exception 'Invalid case accepted: %',c; end if;
    if (select revision from tournament_seeding.events where slug='invalid-'||i)!=0 or exists(select 1 from tournament_seeding.submissions where event_slug='invalid-'||i) or exists(select 1 from tournament_seeding.entrants where event_slug='invalid-'||i) then raise exception 'Failed case changed state'; end if;
  end loop;
end $$;
set local role anon;
do $$ declare denied boolean:=false; begin
  begin perform public.tournament_seeding_commit('manual-ninth',0,'{}','x','x','{}'); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Anonymous commit allowed'; end if;
end $$;
reset role;
set local role service_role;
do $$ begin
  if public.tournament_seeding_commit('manual-ninth',0,'{}','first','fingerprint','{}')->>'replayed'!='true' then raise exception 'Service commit denied'; end if;
end $$;
reset role;
rollback;
