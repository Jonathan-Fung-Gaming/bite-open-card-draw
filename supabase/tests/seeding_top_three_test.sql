begin;

create function pg_temp.proposed(slug text, source_fields jsonb) returns jsonb language plpgsql as $$
declare initial jsonb; draft jsonb; entry jsonb; source jsonb;
begin
  draft := '{"id":"00000000-0000-4000-8000-000000000001","inputRevision":0,"run":{"inputRevision":0,"status":"ready","passes":[{},{}]},"entrants":[]}'::jsonb;
  initial := jsonb_build_object('slug',slug,'revision',0,'inputRevision',0,'nextSequence','1','entrants','[]'::jsonb,'submissions','[]'::jsonb,'draft',draft,'published',null);
  perform public.tournament_seeding_read_event(slug,initial,'20260927010000');
  entry := '{"id":"00000000-0000-4000-8000-000000000002","canonicalKey":"player","displayName":"Player","mergedInto":null,"acceptedSubmissionId":"00000000-0000-4000-8000-000000000003"}'::jsonb;
  source := '{"id":"00000000-0000-4000-8000-000000000003","entrantId":"00000000-0000-4000-8000-000000000002","sequence":"1","actualRating":"12000.12","ninthContribution":"250","predictedRating":"12077.779121","contributions":[],"scoreInputMode":"ninth_only","verifiedShortfall":false,"shortfallNote":"","source":"admin_manual","status":"approved","identityConfirmed":true}'::jsonb || source_fields;
  draft := draft || '{"id":"00000000-0000-4000-8000-000000000004","inputRevision":1,"run":{"inputRevision":1,"status":"ready","passes":[{},{}]}}'::jsonb;
  return initial || jsonb_build_object('revision',1,'inputRevision',1,'nextSequence','2','entrants',jsonb_build_array(entry),'submissions',jsonb_build_array(source),'draft',draft);
end $$;

do $$ declare state jsonb; result jsonb; item jsonb; failed boolean; i integer:=0; function_oid regprocedure;
begin
  function_oid := 'public.tournament_seeding_commit(text,bigint,jsonb,text,text,jsonb)'::regprocedure;
  if has_function_privilege('anon',function_oid,'execute') or has_function_privilege('authenticated',function_oid,'execute') or not has_function_privilege('service_role',function_oid,'execute') then raise exception 'RPC ACL regression'; end if;
  if exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=function_oid and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'PUBLIC execute allowed'; end if;
  if not exists(select 1 from tournament_seeding.schema_metadata where version='20260926020000') then raise exception 'Legacy readiness lost'; end if;
  state:=pg_temp.proposed('legacy','{}');
  perform public.tournament_seeding_commit('legacy',0,state,'save','save','{}');
  if (select predicted_rating from tournament_seeding.submissions where event_slug='legacy')<>12077.779121 then raise exception 'Legacy source changed'; end if;
  for item in select value from jsonb_array_elements('[
    {"contributions":["300","295","290"],"predictedRating":"14217.32743896"},
    {"contributions":["300","295","290","285","280","275","270","260","250"],"ninthContribution":"250","predictedRating":"14217.32743896"},
    {"contributions":["1","0","0"],"predictedRating":"-977.74344268"},
    {"source":"piugame","scoreInputMode":null,"contributions":["250","250","250","249"],"predictedRating":"11896.81322061"},
    {"contributions":["300","290"],"verifiedShortfall":true,"shortfallNote":"Two scores verified","predictedRating":null},
    {"contributions":[],"verifiedShortfall":true,"shortfallNote":"No scores verified","predictedRating":null}
  ]'::jsonb) loop
    i:=i+1;
    state:=pg_temp.proposed('top-'||i,'{"formulaVersion":"phoenix2-top3-51.56698263x-994.93243689-v2","scoreInputMode":"top_three","ninthContribution":null}'::jsonb || item);
    result:=public.tournament_seeding_commit('top-'||i,0,state,'save','save','{}');
    if (select count(*) from tournament_seeding.submission_scores where event_slug='top-'||i)<>jsonb_array_length(item->'contributions') then raise exception 'Scores lost or fabricated'; end if;
    if public.tournament_seeding_commit('top-'||i,0,state,'save','save','{}')->>'replayed'<>'true' then raise exception 'Replay failed'; end if;
  end loop;
  if (select top_three_sum from tournament_seeding.submissions where event_slug='top-1')<>885 then raise exception 'Sum mismatch'; end if;
  state:=jsonb_set(state,'{revision}','2'); state:=jsonb_set(state,'{submissions,0,actualRating}','"1"');
  failed:=false;begin perform public.tournament_seeding_commit('top-6',1,state,'tamper','tamper','{}');exception when others then if sqlerrm='IMMUTABLE_SOURCE' then failed:=true;else raise;end if;end;
  if not failed then raise exception 'Immutable source changed';end if;
  for item in select value from jsonb_array_elements('[
    {"contributions":["300","295"]},
    {"contributions":["300","295","290"],"predictedRating":"999999"},
    {"contributions":["300","295","290"],"predictedRating":null},
    {"contributions":["300","295","290"],"verifiedShortfall":true,"shortfallNote":"Wrong"},
    {"contributions":["300","295","290","","1"]},
    {"contributions":["290","300","295"]},
    {"contributions":["300","295","-1"]},
    {"contributions":["Infinity","295","290"]},
    {"contributions":["300","295","290"],"ninthContribution":"250"},
    {"contributions":["300","295","290"],"scoreInputMode":"ninth_only"},
    {"contributions":["300","295","290"],"formulaVersion":"unknown"},
    {"contributions":[],"verifiedShortfall":true,"shortfallNote":"","predictedRating":null},
    {"contributions":null}
  ]'::jsonb) loop
    i:=i+1;state:=pg_temp.proposed('bad-'||i,'{"formulaVersion":"phoenix2-top3-51.56698263x-994.93243689-v2","scoreInputMode":"top_three","ninthContribution":null,"predictedRating":"14217.32743896"}'::jsonb || item);
    failed:=false;begin perform public.tournament_seeding_commit('bad-'||i,0,state,'save','save','{}');exception when others then failed:=true;end;
    if not failed then raise exception 'Invalid source accepted: %',item;end if;
    if exists(select 1 from tournament_seeding.submissions where event_slug='bad-'||i) then raise exception 'Failed commit wrote source';end if;
  end loop;
end $$;
set local role anon;
do $$ declare denied boolean:=false;begin
  begin perform public.tournament_seeding_commit('legacy',0,'{}','x','x','{}');exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Anonymous write allowed';end if;
end $$;
reset role;
set local role service_role;
do $$ begin
  if public.tournament_seeding_commit('top-1',0,'{}','save','save','{}')->>'replayed'<>'true' then raise exception 'Service access denied';end if;
end $$;
reset role;
rollback;
