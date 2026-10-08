-- Actor-free, published-only TV source. No new table or mutation authority.
create function crossplay.display_version() returns text
language sql stable security definer set search_path='' as $$ select '20261008040000'::text $$;

create function crossplay.display_read(p_tournament text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare source jsonb; tid uuid; projected jsonb; statuses jsonb;
begin
  -- Never accept an actor: an organizer's browser receives the same projection.
  source:=crossplay.read_model('{}'::jsonb,p_tournament,'public');
  tid:=(source#>>'{tournament,id}')::uuid;
  if tid is null or not exists(select 1 from crossplay.rounds where tournament_id=tid and status<>'draft') then
    raise exception 'NOT_FOUND';
  end if;
  projected:=jsonb_build_object(
    'tournament',jsonb_build_object('id',tid,'slug',source#>'{tournament,slug}','name',source#>'{tournament,name}',
      'status',source#>'{tournament,status}','config',jsonb_build_object('roundCount',source#>'{tournament,config,roundCount}'),
      'currentRound',source#>'{tournament,currentRound}','runGeneration',source#>'{tournament,runGeneration}'),
    -- The existing public seed order is needed for identical shared-rank ordering.
    'entrants',source->'entrants',
    'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',r->'id','number',r->'number','status',r->'status',
      'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m->'id','roundNumber',m->'roundNumber',
        'tableNumber',m->'tableNumber','player1Id',m->'player1Id','player2Id',m->'player2Id','kind',m->'kind','status',m->'status',
        'result',case when m->>'status'='final' and m->'result'<>'null'::jsonb then jsonb_build_object(
          'adjusted1',m#>'{result,adjusted1}','adjusted2',m#>'{result,adjusted2}','points1',m#>'{result,points1}',
          'points2',m#>'{result,points2}','difference1',m#>'{result,difference1}') else null end) order by (m->>'tableNumber')::integer)
        from jsonb_array_elements(r->'matches') m),'[]'::jsonb)) order by (r->>'number')::integer)
      from jsonb_array_elements(source->'rounds') r where r->>'status'<>'draft'),'[]'::jsonb),
    'tables',jsonb_build_object('enabled',coalesce(source#>'{tables,enabled}','false'::jsonb),
      'locations',coalesce(source#>'{tables,locations}','[]'::jsonb)));
  select coalesce(jsonb_object_agg(m.id::text,jsonb_build_object(
    'status',case
      when m.status='final' then 'final'
      when m.status='disputed' or c.review_required then 'organizer_review'
      when m.status='awaiting_confirmation' then 'awaiting_confirmation'
      when source#>>'{tournament,status}'<>'active' then 'outstanding'
      when l.match_id is not null and not crossplay.table_match_ready(tid,m.id) then 'queued'
      when c.status='running' then 'playing'
      when c.status='paused' then 'paused'
      when c.status='ended' then 'reporting'
      when c.status='ready' then 'ready'
      else 'outstanding' end,
    'completedAt',case when m.status='final' then v.created_at else null end)), '{}'::jsonb) into statuses
  from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
  left join crossplay.match_clock_sessions c on c.tournament_id=m.tournament_id and c.match_id=m.id
  left join crossplay.match_locations l on l.tournament_id=m.tournament_id and l.match_id=m.id
  left join crossplay.result_revisions v on v.tournament_id=m.tournament_id and v.match_id=m.id and v.id=m.official_revision_id
  where m.tournament_id=tid and r.status<>'draft';
  return jsonb_build_object('snapshot',projected,'matches',statuses,
    'serverNowMs',floor(extract(epoch from statement_timestamp())*1000)::bigint);
end $$;

revoke all on function crossplay.display_version(),crossplay.display_read(text) from public,anon,authenticated,service_role,crossplay_runtime;
grant execute on function crossplay.display_version(),crossplay.display_read(text) to crossplay_runtime;
