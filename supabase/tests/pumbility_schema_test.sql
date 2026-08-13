\set ON_ERROR_STOP on

begin;

do $$
declare
  v_tables text[];
  v_required text[] := array[
    'analysis_folder_results', 'analysis_mode_results', 'analysis_run_inputs', 'analysis_runs',
    'artifacts', 'chart_contributions', 'chart_rerates', 'chart_results', 'chart_revisions',
    'chart_videos', 'charts', 'consent_scopes', 'data_sources', 'job_events', 'job_heads', 'jobs',
    'methodologies', 'mixes', 'model_generations', 'model_player_features', 'outbox_events',
    'player_consents', 'player_mix_state', 'player_mode_features', 'player_recommendation_heads', 'players',
    'publications', 'recommendation_candidates', 'recommendation_mode_results',
    'recommendation_refreshes', 'reconciliation_runs', 'schema_metadata', 'score_overrides',
    'score_revisions', 'song_aliases', 'songs', 'sync_run_players', 'sync_runs'
  ];
begin
  select pg_catalog.array_agg(c.relname order by c.relname)
  into v_tables
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'pumbility' and c.relkind in ('r', 'p');
  if v_tables is distinct from v_required then
    raise exception 'Pumbility table inventory mismatch: %', v_tables;
  end if;
  if (select value from pumbility.schema_metadata where key = 'migration_version')
     <> '20260813010000' then
    raise exception 'Pumbility migration version metadata mismatch';
  end if;
  if (select count(*) from pumbility.data_sources where source_key = 'piu-scores') <> 1
     or (select count(*) from pumbility.mixes where mix_key in ('phoenix1', 'phoenix2')) <> 2 then
    raise exception 'Required PIU Scores source/mix seed rows are missing';
  end if;
  if not exists (select 1 from pg_catalog.pg_class where oid = 'public.rounds'::regclass)
     or not exists (select 1 from pg_catalog.pg_class where oid = 'public.protein_profiles'::regclass)
     or not exists (select 1 from pg_catalog.pg_class where oid = 'public.karaoke_rooms'::regclass) then
    raise exception 'A representative sibling relation is missing';
  end if;
end;
$$;

do $$
declare
  v_missing text;
begin
  with required(table_name, column_name, data_type) as (
    values
      ('artifacts', 'object_key', 'text'),
      ('artifacts', 'media_type', 'text'),
      ('artifacts', 'payload_json', 'jsonb'),
      ('artifacts', 'storage_bucket', 'text'),
      ('artifacts', 'storage_object_path', 'text'),
      ('artifacts', 'sha256', 'text'),
      ('artifacts', 'byte_size', 'bigint'),
      ('artifacts', 'updated_at', 'timestamp with time zone'),
      ('jobs', 'external_key', 'text'),
      ('jobs', 'kind', 'text'),
      ('jobs', 'status', 'text'),
      ('jobs', 'stage', 'text'),
      ('jobs', 'mix_key', 'text'),
      ('jobs', 'attempt', 'integer'),
      ('jobs', 'payload', 'jsonb'),
      ('jobs', 'completed_at', 'timestamp with time zone'),
      ('job_heads', 'name', 'text'),
      ('job_heads', 'job_id', 'uuid'),
      ('data_sources', 'source_key', 'text'),
      ('mixes', 'mix_key', 'text'),
      ('players', 'upstream_player_id', 'text'),
      ('player_consents', 'source_sync_run_id', 'uuid'),
      ('songs', 'source_song_key', 'text'),
      ('charts', 'upstream_chart_id', 'text'),
      ('chart_revisions', 'content_hash', 'text'),
      ('sync_runs', 'source_manifest', 'jsonb'),
      ('score_revisions', 'recorded_at_raw', 'text'),
      ('score_revisions', 'score', 'double precision'),
      ('player_mix_state', 'last_synced_at', 'timestamp with time zone'),
      ('player_mix_state', 'last_score_recorded_at', 'timestamp with time zone'),
      ('player_mix_state', 'empty_since', 'timestamp with time zone'),
      ('player_mix_state', 'recheck_after', 'timestamp with time zone'),
      ('methodologies', 'script_version', 'text'),
      ('methodologies', 'code_hash', 'text'),
      ('analysis_runs', 'mix_id', 'uuid'),
      ('analysis_runs', 'generated_at', 'timestamp with time zone'),
      ('analysis_runs', 'source_hash', 'text'),
      ('analysis_runs', 'summary', 'jsonb'),
      ('analysis_runs', 'validated_at', 'timestamp with time zone'),
      ('analysis_mode_results', 'metrics', 'jsonb'),
      ('player_mode_features', 'player_hash', 'text'),
      ('player_mode_features', 'baseline_pumbility', 'double precision'),
      ('player_mode_features', 'baseline_std', 'double precision'),
      ('player_mode_features', 'baseline_count', 'integer'),
      ('chart_contributions', 'player_hash', 'text'),
      ('chart_contributions', 'pumbility', 'double precision'),
      ('chart_contributions', 'residual_pb', 'double precision'),
      ('chart_results', 'difficulty_delta_ci95_low', 'double precision'),
      ('chart_results', 'difficulty_delta_ci95_high', 'double precision'),
      ('chart_results', 'difficulty_ci95_low', 'double precision'),
      ('chart_results', 'difficulty_ci95_high', 'double precision'),
      ('chart_results', 'n_contributors', 'integer'),
      ('chart_results', 'n_players_scored', 'integer')
  )
  select pg_catalog.string_agg(
    pg_catalog.format('%I.%I expected %s', r.table_name, r.column_name, r.data_type), ', '
  ) into v_missing
  from required as r
  left join information_schema.columns as c
    on c.table_schema = 'pumbility'
   and c.table_name = r.table_name
   and c.column_name = r.column_name
   and c.data_type = r.data_type
  where c.column_name is null;
  if v_missing is not null then
    raise exception 'Required consumer columns missing or mistyped: %', v_missing;
  end if;
  if (select is_nullable from information_schema.columns
      where table_schema = 'pumbility' and table_name = 'score_revisions'
        and column_name = 'score') <> 'YES' then
    raise exception 'score_revisions.score must remain nullable';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_index as i
    join pg_catalog.pg_class as c on c.oid = i.indexrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'pumbility'
      and c.relname in ('chart_revisions_content_hash_idx', 'score_revisions_row_hash_idx')
      and i.indisunique
  ) then
    raise exception 'Temporal hash lookup indexes must be nonunique';
  end if;
end;
$$;

do $$
declare
  v_bad text;
begin
  select pg_catalog.string_agg(c.relname, ', ' order by c.relname)
  into v_bad
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'pumbility'
    and c.relkind in ('r', 'p')
    and (not c.relrowsecurity or not c.relforcerowsecurity);
  if v_bad is not null then
    raise exception 'Pumbility tables without enabled+forced RLS: %', v_bad;
  end if;
  if has_schema_privilege('anon', 'pumbility', 'USAGE')
     or has_schema_privilege('authenticated', 'pumbility', 'USAGE') then
    raise exception 'A browser/public role has Pumbility schema access';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_namespace as n
    cross join lateral pg_catalog.aclexplode(
      coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
    ) as acl
    where n.nspname = 'pumbility' and acl.grantee = 0
  ) then
    raise exception 'PUBLIC has Pumbility schema privileges';
  end if;
  select pg_catalog.string_agg(c.relname, ', ' order by c.relname)
  into v_bad
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'pumbility'
    and c.relkind in ('r', 'p', 'v', 'm', 'S')
    and (
      has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
      or has_table_privilege('anon', c.oid, 'DELETE,TRUNCATE,TRIGGER')
      or has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
      or has_table_privilege('authenticated', c.oid, 'DELETE,TRUNCATE,TRIGGER')
    );
  if v_bad is not null then
    raise exception 'A browser/public role has Pumbility relation privileges: %', v_bad;
  end if;
  if exists (
    select 1
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault(
        case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end,
        c.relowner
      ))
    ) as acl
    where n.nspname = 'pumbility'
      and c.relkind in ('r', 'p', 'v', 'm', 'S')
      and acl.grantee = 0
  ) then
    raise exception 'PUBLIC has Pumbility relation privileges';
  end if;
  if has_table_privilege('service_role', 'pumbility.players', 'SELECT')
     or has_table_privilege('service_role', 'pumbility.score_revisions', 'SELECT')
     or has_table_privilege('service_role', 'pumbility.chart_contributions', 'SELECT')
     or has_table_privilege('service_role', 'pumbility.players', 'INSERT,UPDATE,DELETE') then
    raise exception 'service_role has direct private Pumbility base-table privileges';
  end if;
  if not has_table_privilege('service_role', 'pumbility.public_players', 'SELECT')
     or not has_table_privilege('service_role', 'pumbility.public_tier_list', 'SELECT') then
    raise exception 'service_role is missing reviewed public-safe Pumbility view grants';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_policy as p
    join pg_catalog.pg_class as c on c.oid = p.polrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    cross join lateral unnest(p.polroles) as role_oid
    where n.nspname = 'pumbility'
      and role_oid in ('anon'::regrole::oid, 'authenticated'::regrole::oid, 0)
  ) then
    raise exception 'A Pumbility table policy includes a browser/public role';
  end if;
  if (select count(*) from pg_catalog.pg_roles
      where rolname in ('pumbility_reader', 'pumbility_worker')
        and not rolcanlogin and not rolsuper and not rolcreaterole and not rolcreatedb
        and not rolreplication and not rolbypassrls) <> 2 then
    raise exception 'Pumbility group roles are missing or overprivileged';
  end if;
end;
$$;

do $$
declare
  v_bad text;
begin
  select pg_catalog.string_agg(p.proname, ', ' order by p.proname)
  into v_bad
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'pumbility'
    and (
      not p.prosecdef
      or not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']::text[]
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );
  if v_bad is not null then
    raise exception 'Unsafe Pumbility function ACL/config: %', v_bad;
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as acl
    where n.nspname = 'pumbility'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC can execute a Pumbility function';
  end if;
  if (select count(*) from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'pumbility') <> 6 then
    raise exception 'Pumbility function inventory mismatch';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'pumbility'
      and (
        not has_function_privilege('service_role', p.oid, 'EXECUTE')
        or not has_function_privilege('pumbility_worker', p.oid, 'EXECUTE')
        or has_function_privilege('pumbility_reader', p.oid, 'EXECUTE')
      )
  ) then
    raise exception 'Pumbility server function grants do not match the reviewed allowlist';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'pumbility-artifacts' and name = 'pumbility-artifacts' and not public
      and file_size_limit = 52428800
      and 'application/x-npz' = any (allowed_mime_types)
  ) then
    raise exception 'Private Pumbility Storage bucket is missing or misconfigured';
  end if;
  if (select count(*)
      from pg_catalog.pg_policy as p
      where p.polrelid = 'storage.objects'::regclass
        and p.polname like 'Pumbility service can % artifacts') <> 4 then
    raise exception 'Pumbility Storage policy inventory mismatch';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_policy as p
    cross join lateral unnest(p.polroles) as role_oid
    where p.polrelid = 'storage.objects'::regclass
      and p.polname like 'Pumbility service can % artifacts'
      and role_oid in ('anon'::regrole::oid, 'authenticated'::regrole::oid, 0)
  ) then
    raise exception 'Pumbility Storage policy includes a browser/public role';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = 'storage.objects'::regclass
      and p.polname like 'Pumbility service can % artifacts'
      and p.polroles is distinct from array['service_role'::regrole::oid]
  ) then
    raise exception 'Pumbility Storage policy role allowlist is not exactly service_role';
  end if;
end;
$$;

do $$
declare
  v_source uuid;
  v_mix uuid;
  v_player uuid;
  v_song uuid;
  v_chart uuid;
  v_methodology uuid;
  v_job uuid;
  v_analysis uuid;
  v_artifact uuid;
  v_model uuid;
  v_refresh uuid;
  v_result jsonb;
  v_head uuid;
begin
  insert into pumbility.data_sources (source_key, display_name)
  values ('test-source', 'Test Source') returning id into v_source;
  insert into pumbility.mixes (data_source_id, mix_key, upstream_value, display_name)
  values (v_source, 'test-mix', 'TEST', 'Test Mix') returning id into v_mix;
  insert into pumbility.players (
    data_source_id, upstream_player_id, public_key, username
  ) values (
    v_source, 'private-player', 'public-player', 'Test Player'
  ) returning id into v_player;
  insert into pumbility.songs (mix_id, source_song_key, title)
  values (v_mix, 'song-1', 'Song 1') returning id into v_song;
  insert into pumbility.charts (mix_id, upstream_chart_id, song_id, chart_type)
  values (v_mix, 'chart-1', v_song, 'Single') returning id into v_chart;
  insert into pumbility.chart_revisions (
    chart_id, revision_number, level, content_hash, valid_from
  ) values (
    v_chart, 1, 20, repeat('a', 64), statement_timestamp()
  );
  insert into pumbility.methodologies (
    methodology_key, script_version, code_hash, dependency_hash, configuration, random_seed
  ) values (
    'test-method', '1', repeat('b', 64), repeat('c', 64), '{}'::jsonb, 42
  ) returning id into v_methodology;

  v_result := pumbility.claim_job(
    'test-job', 'analysis', 'prepare', 'test-mix', '{}'::jsonb, 'worker-a', 300
  );
  if (v_result->>'claimed')::boolean is not true then
    raise exception 'Initial job claim failed: %', v_result;
  end if;
  v_job := (v_result #>> '{job,id}')::uuid;
  v_result := pumbility.claim_job(
    'test-job', 'analysis', 'prepare', 'test-mix', '{}'::jsonb, 'worker-b', 300
  );
  if (v_result->>'claimed')::boolean is not false
     or (v_result #>> '{job,id}')::uuid <> v_job then
    raise exception 'Active job claim was not idempotent: %', v_result;
  end if;
  if pumbility.heartbeat_job(v_job, 'wrong-worker', 'analysis', '{}'::jsonb, 300) then
    raise exception 'Non-owner heartbeat unexpectedly succeeded';
  end if;
  if not pumbility.heartbeat_job(
    v_job, 'worker-a', 'analysis', '{"percent":50}'::jsonb, 300
  ) then
    raise exception 'Owner heartbeat failed';
  end if;
  v_result := pumbility.claim_job(
    'other-global-job', 'analysis', 'prepare', 'test-mix', '{}'::jsonb, 'worker-z', 300
  );
  if (v_result->>'claimed')::boolean is not false
     or v_result #>> '{job,id}' <> v_job::text then
    raise exception 'A second running global analysis job was not blocked: %', v_result;
  end if;

  insert into pumbility.analysis_runs (
    run_key, job_id, mix_id, methodology_id, status, source_hash, completed_at, validated_at
  ) values (
    'analysis-1', v_job, v_mix, v_methodology, 'ready', repeat('d', 64),
    statement_timestamp(), statement_timestamp()
  ) returning id into v_analysis;
  insert into pumbility.analysis_mode_results (analysis_run_id, mode, metrics)
  values (v_analysis, 'Singles', '{}'::jsonb);
  insert into pumbility.player_mode_features (
    analysis_run_id, player_id, player_hash, mode, valid_score_count, baseline_count
  ) values (
    v_analysis, v_player, repeat('e', 64), 'Singles', 30, 20
  );
  insert into pumbility.chart_contributions (
    analysis_run_id, chart_id, player_id, player_hash, mode, pumbility,
    baseline_pumbility, residual_pb
  ) values (
    v_analysis, v_chart, v_player, repeat('e', 64), 'Singles', 20, 19, 1
  );
  insert into pumbility.chart_results (
    analysis_run_id, chart_id, mode, estimated_difficulty, n_contributors,
    n_players_scored, evidence_status
  ) values (
    v_analysis, v_chart, 'Singles', 20.1, 1, 1, 'sufficient'
  );
  insert into pumbility.artifacts (
    object_key, media_type, payload_json, sha256, byte_size, analysis_run_id, validated_at
  ) values (
    'artifact-1', 'application/json', '{}'::jsonb, repeat('f', 64), 2, v_analysis,
    statement_timestamp()
  ) returning id into v_artifact;
  insert into pumbility.model_generations (
    generation_key, job_id, analysis_run_id, artifact_id, status, model_schema_version,
    input_hash, output_hash, completed_at
  ) values (
    'model-1', v_job, v_analysis, v_artifact, 'ready', '1', repeat('1', 64),
    repeat('2', 64), statement_timestamp()
  ) returning id into v_model;

  v_result := pumbility.publish_generation(
    'recommendation-model', v_job, 'worker-a', v_analysis, v_model, v_artifact
  );
  if v_result->>'publication_key' <> 'recommendation-model' then
    raise exception 'Atomic publication failed: %', v_result;
  end if;

  insert into pumbility.recommendation_refreshes (
    refresh_key, player_id, model_generation_id, job_id, status, output_hash, completed_at
  ) values (
    'refresh-1', v_player, v_model, v_job, 'completed', repeat('3', 64),
    statement_timestamp()
  ) returning id into v_refresh;
  perform pumbility.publish_player_recommendation(
    v_player, v_model, v_refresh, v_job, 'worker-a'
  );
  select recommendation_refresh_id into v_head
  from pumbility.player_recommendation_heads where player_id = v_player;
  if v_head <> v_refresh then
    raise exception 'Player recommendation head was not published';
  end if;

  begin
    insert into pumbility.recommendation_refreshes (
      refresh_key, player_id, model_generation_id, job_id, status, safe_error
    ) values (
      'refresh-failed', v_player, v_model, v_job, 'failed', '{"code":"test"}'::jsonb
    ) returning id into v_refresh;
    perform pumbility.publish_player_recommendation(
      v_player, v_model, v_refresh, v_job, 'worker-a'
    );
    raise exception 'Failed recommendation refresh unexpectedly published';
  exception when object_not_in_prerequisite_state then
    null;
  end;
  if (select recommendation_refresh_id from pumbility.player_recommendation_heads
      where player_id = v_player) <> v_head then
    raise exception 'Failed refresh replaced the successful player head';
  end if;

  if pumbility.complete_job(v_job, 'wrong-worker', true, 'complete', null, null) then
    raise exception 'Non-owner completion unexpectedly succeeded';
  end if;
  if not pumbility.complete_job(v_job, 'worker-a', true, 'complete', null, null) then
    raise exception 'Owner completion failed';
  end if;
  if (select status from pumbility.jobs where id = v_job) <> 'completed' then
    raise exception 'Completed job state mismatch';
  end if;
end;
$$;

do $$
declare
  v_first jsonb;
  v_result jsonb;
  v_job uuid;
begin
  v_first := pumbility.claim_job(
    'player-job-a', 'player_recommendation', 'fetch', 'phoenix2',
    '{"playerKey":"player-a"}'::jsonb, 'player-worker-a', 300
  );
  v_job := (v_first #>> '{job,id}')::uuid;
  if (v_first->>'claimed')::boolean is not true then
    raise exception 'First player recommendation claim failed';
  end if;
  v_result := pumbility.claim_job(
    'player-job-b', 'player_recommendation', 'fetch', 'phoenix2',
    '{"playerKey":"player-a"}'::jsonb, 'player-worker-b', 300
  );
  if (v_result->>'claimed')::boolean is not false
     or v_result #>> '{job,id}' <> v_job::text then
    raise exception 'Same-player concurrent recommendation was not blocked: %', v_result;
  end if;
  v_result := pumbility.claim_job(
    'player-job-c', 'player_recommendation', 'fetch', 'phoenix2',
    '{"playerKey":"player-b"}'::jsonb, 'player-worker-c', 300
  );
  if (v_result->>'claimed')::boolean is not true then
    raise exception 'Different-player recommendation concurrency was blocked: %', v_result;
  end if;
end;
$$;

do $$
declare
  v_result jsonb;
  v_job uuid;
begin
  v_result := pumbility.claim_job(
    'cancel-test', 'analysis', 'queued', null, '{}'::jsonb, 'worker-c', 300
  );
  v_job := (v_result #>> '{job,id}')::uuid;
  v_result := pumbility.cancel_job(v_job, 'worker-c');
  if (v_result->>'requested')::boolean is not true then
    raise exception 'Cancellation request failed';
  end if;
  if pumbility.heartbeat_job(v_job, 'worker-c', 'analysis', '{}'::jsonb, 300) then
    raise exception 'Cancelled job heartbeat unexpectedly succeeded';
  end if;
  if pumbility.complete_job(v_job, 'worker-c', true, 'complete', null, null) then
    raise exception 'Cancelled job publication completion unexpectedly succeeded';
  end if;
end;
$$;

set constraints all immediate;
set constraints all deferred;

rollback;
