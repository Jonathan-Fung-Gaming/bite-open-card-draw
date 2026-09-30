begin;

create function pg_temp.proposed(slug text) returns jsonb language plpgsql as $$
declare initial jsonb; draft jsonb; entry jsonb; source jsonb;
begin
  draft := '{"id":"00000000-0000-4000-8000-000000000001","inputRevision":0,"run":{"inputRevision":0,"status":"ready","passes":[{},{}]},"entrants":[]}'::jsonb;
  initial := jsonb_build_object('slug',slug,'revision',0,'inputRevision',0,'nextSequence','1','entrants','[]'::jsonb,'submissions','[]'::jsonb,'draft',draft,'published',null);
  perform public.tournament_seeding_read_event(slug,initial,'20260930010000');
  entry := '{"id":"00000000-0000-4000-8000-000000000002","canonicalKey":"player","mergedInto":null,"acceptedSubmissionId":"00000000-0000-4000-8000-000000000003"}'::jsonb;
  source := '{"id":"00000000-0000-4000-8000-000000000003","entrantId":"00000000-0000-4000-8000-000000000002","sequence":"1","actualRating":"12000.12","ninthContribution":null,"predictedRating":"14217.32743896","contributions":["300","295","290"],"scoreInputMode":"top_three","formulaVersion":"phoenix2-top3-51.56698263x-994.93243689-v2","verifiedShortfall":false,"shortfallNote":"","source":"admin_manual","status":"approved","identityConfirmed":true}'::jsonb;
  draft := draft || '{"id":"00000000-0000-4000-8000-000000000004","inputRevision":1,"run":{"rulesVersion":"phoenix2-predicted-gap150-higher-pool-v1","inputRevision":1,"status":"ready","passes":[],"swaps":[],"acceptedEntrantCount":1,"assignments":[{"entrantId":"00000000-0000-4000-8000-000000000002"}],"reseedingDecisions":[{"entrantId":"00000000-0000-4000-8000-000000000002","outcome":"protected_pro"}]}}'::jsonb;
  return initial || jsonb_build_object('revision',1,'inputRevision',1,'nextSequence','2','entrants',jsonb_build_array(entry),'submissions',jsonb_build_array(source),'draft',draft);
end $$;

create function pg_temp.reject_commit(slug text, rev bigint, state jsonb, expected text) returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin perform public.tournament_seeding_commit(slug,rev,state,'bad','bad','{}');
  exception when others then if sqlerrm=expected then failed:=true; else raise; end if; end;
  if not failed then raise exception 'Expected %',expected; end if;
end $$;

do $$ declare state jsonb; original jsonb; result jsonb; item jsonb; i integer:=0; function_oid regprocedure;
begin
  function_oid := 'public.tournament_seeding_commit(text,bigint,jsonb,text,text,jsonb)'::regprocedure;
  if has_function_privilege('anon',function_oid,'execute') or has_function_privilege('authenticated',function_oid,'execute') or not has_function_privilege('service_role',function_oid,'execute') then raise exception 'RPC ACL regression'; end if;
  if exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=function_oid and (p.prosecdef or (a.grantee=0 and a.privilege_type='EXECUTE'))) then raise exception 'Invoker/PUBLIC regression'; end if;
  state:=pg_temp.proposed('new'); original:=state;
  result:=public.tournament_seeding_commit('new',0,state,'save','save','{}');
  if result->'state' is distinct from state then raise exception 'State changed'; end if;
  if public.tournament_seeding_commit('new',0,state,'save','save','{}')->>'replayed'<>'true' then raise exception 'Replay failed'; end if;
  perform pg_temp.reject_commit('new',0,state,'STALE_REVISION');
  state:=jsonb_set(state,'{revision}','2');
  perform pg_temp.reject_commit('new',1,jsonb_set(state,'{submissions,0,actualRating}','"1"'),'IMMUTABLE_SOURCE');
  state:=state||jsonb_build_object('published',state->'draft');
  perform public.tournament_seeding_commit('new',1,state,'publish','publish','{}');
  if (select snapshot from tournament_seeding.runs where event_slug='new' and id='00000000-0000-4000-8000-000000000004') is distinct from original->'draft' then raise exception 'Snapshot changed'; end if;
  if (select source_data->>'actualRating' from tournament_seeding.submissions where event_slug='new')<>'12000.12' then raise exception 'Source changed'; end if;
  for item in select value from jsonb_array_elements('[
    {"reseedingDecisions":null}, {"reseedingDecisions":[]}, {"acceptedEntrantCount":2}, {"assignments":[]},
    {"assignments":[{"entrantId":"wrong"}]}, {"passes":[{},{}]}, {"swaps":[{}]}, {"status":null}, {"inputRevision":0},
    {"reseedingDecisions":[{"entrantId":"same"},{"entrantId":"same"}],"assignments":[{"entrantId":"same"},{"entrantId":"same"}],"acceptedEntrantCount":2}
  ]'::jsonb) loop
    i:=i+1; state:=pg_temp.proposed('bad-'||i);
    state:=jsonb_set(state,'{draft,run}',state#>'{draft,run}'||item);
    perform pg_temp.reject_commit('bad-'||i,0,state,'INCOMPLETE_RUN');
    if (select revision from tournament_seeding.events where slug='bad-'||i)<>0 then raise exception 'Partial write'; end if;
  end loop;
  state:=pg_temp.proposed('missing'); state:=state#-'{draft,run,reseedingDecisions}';
  perform pg_temp.reject_commit('missing',0,state,'INCOMPLETE_RUN');
  state:=pg_temp.proposed('legacy');
  state:=jsonb_set(state,'{draft,run}','{"rulesVersion":"phoenix2-pro7-pools3-last2to4-two-pass-chain-slot1-promoted-v5","inputRevision":1,"status":"ready","passes":[{},{}]}'::jsonb);
  perform public.tournament_seeding_commit('legacy',0,state,'save','save','{}');
  state:=pg_temp.proposed('legacy-bad');
  state:=jsonb_set(state,'{draft,run}','{"rulesVersion":"old","inputRevision":1,"status":"ready","passes":[{}]}'::jsonb);
  perform pg_temp.reject_commit('legacy-bad',0,state,'INCOMPLETE_RUN');
end $$;
rollback;
