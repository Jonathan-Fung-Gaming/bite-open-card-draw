-- Private Pumbility persistence and analysis model. The consuming application remains flags-off
-- until its independently reviewed backfill, shadow, canary, and cutover gates pass.

create schema pumbility;

revoke all on schema pumbility from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'pumbility_reader') then
    create role pumbility_reader
      nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'pumbility_worker') then
    create role pumbility_worker
      nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end;
$$;

grant usage on schema pumbility to pumbility_reader, pumbility_worker, service_role;

create table pumbility.schema_metadata (
  key text primary key check (btrim(key) <> ''),
  value text not null check (btrim(value) <> ''),
  updated_at timestamptz not null default statement_timestamp()
);

insert into pumbility.schema_metadata (key, value)
values ('migration_version', '20260813010000');

create table pumbility.data_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (btrim(source_key) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  is_frozen boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table pumbility.mixes (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references pumbility.data_sources(id) on delete restrict,
  mix_key text not null unique check (btrim(mix_key) <> ''),
  upstream_value text not null check (btrim(upstream_value) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  archived boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (data_source_id, upstream_value)
);

insert into pumbility.data_sources (
  id, source_key, display_name, is_frozen, metadata
) values (
  '50000000-0000-4000-8000-000000000001',
  'piu-scores',
  'PIU Scores',
  false,
  '{}'::jsonb
);

insert into pumbility.mixes (
  id, data_source_id, mix_key, upstream_value, display_name, archived, metadata
) values
  (
    '50000000-0000-4000-8000-000000000101',
    '50000000-0000-4000-8000-000000000001',
    'phoenix1',
    'Phoenix',
    'Phoenix 1',
    true,
    '{}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000102',
    '50000000-0000-4000-8000-000000000001',
    'phoenix2',
    'Phoenix2',
    'Phoenix 2',
    false,
    '{}'::jsonb
  );

create table pumbility.players (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references pumbility.data_sources(id) on delete restrict,
  upstream_player_id text not null check (btrim(upstream_player_id) <> ''),
  public_key text not null unique check (btrim(public_key) <> ''),
  username text not null check (btrim(username) <> ''),
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_score_recorded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (data_source_id, upstream_player_id)
);

create table pumbility.consent_scopes (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null unique check (btrim(scope_key) <> ''),
  description text not null check (btrim(description) <> ''),
  created_at timestamptz not null default statement_timestamp()
);

create table pumbility.jobs (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique check (btrim(external_key) <> ''),
  kind text not null check (btrim(kind) <> ''),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  stage text not null default 'queued' check (btrim(stage) <> ''),
  mix_key text references pumbility.mixes(mix_key) on update cascade on delete restrict,
  attempt integer not null default 0 check (attempt >= 0),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  cancellation_requested_at timestamptz,
  retry_at timestamptz,
  safe_error jsonb check (safe_error is null or jsonb_typeof(safe_error) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  check ((lease_owner is null) = (lease_expires_at is null)),
  check (status <> 'running' or (lease_owner is not null and started_at is not null)),
  check (status not in ('completed', 'cancelled') or completed_at is not null)
);

create table pumbility.job_heads (
  name text primary key check (btrim(name) <> ''),
  job_id uuid not null references pumbility.jobs(id) on delete restrict,
  updated_at timestamptz not null default statement_timestamp()
);

create table pumbility.job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references pumbility.jobs(id) on delete cascade,
  event_type text not null check (btrim(event_type) <> ''),
  stage text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default statement_timestamp()
);

create table pumbility.sync_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references pumbility.jobs(id) on delete set null,
  mix_id uuid not null references pumbility.mixes(id) on delete restrict,
  run_key text not null unique check (btrim(run_key) <> ''),
  kind text not null check (kind in ('full', 'incremental', 'player', 'import')),
  status text not null check (status in ('building', 'ready', 'failed', 'cancelled')),
  source_schema_version text,
  source_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(source_manifest) = 'object'),
  capture_started_at timestamptz not null,
  capture_completed_at timestamptz,
  player_count bigint check (player_count is null or player_count >= 0),
  chart_count bigint check (chart_count is null or chart_count >= 0),
  score_count bigint check (score_count is null or score_count >= 0),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (capture_completed_at is null or capture_completed_at >= capture_started_at),
  check (status <> 'ready' or (capture_completed_at is not null and content_hash is not null))
);

create table pumbility.player_consents (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references pumbility.players(id) on delete cascade,
  mix_id uuid not null references pumbility.mixes(id) on delete restrict,
  consent_scope_id uuid not null references pumbility.consent_scopes(id) on delete restrict,
  status text not null check (status in ('granted', 'revoked')),
  valid_from timestamptz not null,
  valid_to timestamptz,
  source_sync_run_id uuid references pumbility.sync_runs(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  check (valid_to is null or valid_to > valid_from),
  check (status <> 'revoked' or valid_to is not null)
);

create table pumbility.player_mix_state (
  player_id uuid not null references pumbility.players(id) on delete cascade,
  mix_id uuid not null references pumbility.mixes(id) on delete restrict,
  last_synced_at timestamptz,
  last_score_recorded_at timestamptz,
  empty_since timestamptz,
  recheck_after timestamptz,
  last_full_reconciled_at timestamptz,
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (player_id, mix_id),
  check (recheck_after is null or empty_since is null or recheck_after > empty_since)
);

create table pumbility.sync_run_players (
  sync_run_id uuid not null references pumbility.sync_runs(id) on delete cascade,
  player_id uuid not null references pumbility.players(id) on delete cascade,
  status text not null check (status in ('discovered', 'skipped', 'processing', 'completed', 'failed')),
  previous_watermark timestamptz,
  new_watermark timestamptz,
  accepted_score_count integer not null default 0 check (accepted_score_count >= 0),
  safe_error jsonb check (safe_error is null or jsonb_typeof(safe_error) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (sync_run_id, player_id),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create table pumbility.songs (
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null references pumbility.mixes(id) on delete restrict,
  source_song_key text not null check (btrim(source_song_key) <> ''),
  title text not null check (btrim(title) <> ''),
  normalized_title text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (mix_id, source_song_key),
  unique (id, mix_id)
);

create table pumbility.charts (
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null references pumbility.mixes(id) on delete restrict,
  upstream_chart_id text not null check (btrim(upstream_chart_id) <> ''),
  song_id uuid not null,
  chart_type text not null check (btrim(chart_type) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (mix_id, upstream_chart_id),
  unique (id, mix_id),
  foreign key (song_id, mix_id) references pumbility.songs(id, mix_id) on delete restrict
);

create table pumbility.chart_revisions (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references pumbility.charts(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  level integer check (level is null or level > 0),
  difficulty text,
  step_artist text,
  image_url text,
  note_count integer check (note_count is null or note_count >= 0),
  bpm_min double precision check (bpm_min is null or bpm_min >= 0),
  bpm_max double precision check (bpm_max is null or bpm_max >= 0),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  valid_from timestamptz not null,
  valid_to timestamptz,
  source_sync_run_id uuid references pumbility.sync_runs(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  unique (chart_id, revision_number),
  check (valid_to is null or valid_to > valid_from),
  check (bpm_max is null or bpm_min is null or bpm_max >= bpm_min)
);

create table pumbility.score_revisions (
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null references pumbility.mixes(id) on delete restrict,
  player_id uuid not null references pumbility.players(id) on delete cascade,
  chart_id uuid not null,
  pumbility double precision not null,
  score double precision,
  letter_grade text,
  plate text,
  recorded_at_raw text,
  recorded_at timestamptz,
  is_broken boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  row_hash text not null check (row_hash ~ '^[0-9a-f]{64}$'),
  valid_from timestamptz not null,
  valid_to timestamptz,
  source_sync_run_id uuid references pumbility.sync_runs(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  foreign key (chart_id, mix_id) references pumbility.charts(id, mix_id) on delete cascade,
  check (valid_to is null or valid_to > valid_from)
);

create table pumbility.methodologies (
  id uuid primary key default gen_random_uuid(),
  methodology_key text not null check (btrim(methodology_key) <> ''),
  script_version text not null check (btrim(script_version) <> ''),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  dependency_hash text check (dependency_hash is null or dependency_hash ~ '^[0-9a-f]{64}$'),
  random_seed bigint,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  unique (methodology_key, script_version, code_hash)
);

create table pumbility.score_overrides (
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null references pumbility.mixes(id) on delete restrict,
  override_key text not null check (btrim(override_key) <> ''),
  methodology_id uuid not null references pumbility.methodologies(id) on delete restrict,
  parameters jsonb not null check (jsonb_typeof(parameters) = 'object'),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  valid_from timestamptz not null,
  valid_to timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  unique (mix_id, override_key, methodology_id),
  check (valid_to is null or valid_to > valid_from)
);

create table pumbility.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique check (btrim(run_key) <> ''),
  job_id uuid references pumbility.jobs(id) on delete set null,
  mix_id uuid not null references pumbility.mixes(id) on delete restrict,
  methodology_id uuid not null references pumbility.methodologies(id) on delete restrict,
  kind text not null default 'chart_analysis' check (btrim(kind) <> ''),
  status text not null check (status in ('building', 'ready', 'shadow', 'published', 'failed', 'cancelled', 'rolled_back')),
  generated_at timestamptz not null default statement_timestamp(),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  input_hash text check (input_hash is null or input_hash ~ '^[0-9a-f]{64}$'),
  output_hash text check (output_hash is null or output_hash ~ '^[0-9a-f]{64}$'),
  coverage jsonb not null default '{}'::jsonb check (jsonb_typeof(coverage) = 'object'),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  validated_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (completed_at is null or completed_at >= started_at),
  check (validated_at is null or (completed_at is not null and validated_at >= completed_at)),
  check (status not in ('ready', 'shadow', 'published') or
    (completed_at is not null and validated_at is not null))
);

create table pumbility.analysis_run_inputs (
  analysis_run_id uuid not null references pumbility.analysis_runs(id) on delete cascade,
  sync_run_id uuid references pumbility.sync_runs(id) on delete restrict,
  imported_analysis_run_id uuid references pumbility.analysis_runs(id) on delete restrict,
  input_role text not null check (btrim(input_role) <> ''),
  precedence integer not null default 0,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  primary key (analysis_run_id, input_role, precedence),
  check (num_nonnulls(sync_run_id, imported_analysis_run_id) = 1),
  check (analysis_run_id is distinct from imported_analysis_run_id)
);

create table pumbility.analysis_mode_results (
  analysis_run_id uuid not null references pumbility.analysis_runs(id) on delete cascade,
  mode text not null check (btrim(mode) <> ''),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  eligible_player_count integer not null default 0 check (eligible_player_count >= 0),
  chart_count integer not null default 0 check (chart_count >= 0),
  calibration jsonb not null default '{}'::jsonb check (jsonb_typeof(calibration) = 'object'),
  shrinkage jsonb not null default '{}'::jsonb check (jsonb_typeof(shrinkage) = 'object'),
  coverage jsonb not null default '{}'::jsonb check (jsonb_typeof(coverage) = 'object'),
  primary key (analysis_run_id, mode)
);

create table pumbility.player_mode_features (
  analysis_run_id uuid not null references pumbility.analysis_runs(id) on delete cascade,
  player_id uuid not null references pumbility.players(id) on delete cascade,
  player_hash text not null check (player_hash ~ '^[0-9a-f]{64}$'),
  mode text not null check (btrim(mode) <> ''),
  eligible boolean not null default true,
  valid_score_count integer not null check (valid_score_count >= 0),
  baseline_pumbility double precision,
  baseline_std double precision check (baseline_std is null or baseline_std >= 0),
  baseline_min double precision,
  baseline_max double precision,
  baseline_count integer not null default 0 check (baseline_count >= 0),
  top_twenty_rating double precision,
  projection_rating double precision,
  top_fifty_total double precision,
  top_fifty_cutoff double precision,
  selection_hash text check (selection_hash is null or selection_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  primary key (analysis_run_id, player_id, mode),
  check (baseline_max is null or baseline_min is null or baseline_max >= baseline_min)
);

create table pumbility.chart_contributions (
  analysis_run_id uuid not null references pumbility.analysis_runs(id) on delete cascade,
  chart_id uuid not null references pumbility.charts(id) on delete cascade,
  player_id uuid not null references pumbility.players(id) on delete cascade,
  player_hash text not null check (player_hash ~ '^[0-9a-f]{64}$'),
  mode text not null check (btrim(mode) <> ''),
  pumbility double precision not null,
  baseline_pumbility double precision not null,
  residual_pb double precision not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  rank_index integer check (rank_index is null or rank_index > 0),
  selected_top boolean not null default false,
  selected_recent boolean not null default false,
  selected_fallback boolean not null default false,
  recorded_at timestamptz,
  primary key (analysis_run_id, chart_id, player_id, mode)
);

create table pumbility.chart_results (
  analysis_run_id uuid not null references pumbility.analysis_runs(id) on delete cascade,
  chart_id uuid not null references pumbility.charts(id) on delete cascade,
  mode text not null check (btrim(mode) <> ''),
  estimated_difficulty double precision,
  average_difficulty double precision,
  difficulty_delta double precision,
  difficulty_delta_ci95_low double precision,
  difficulty_delta_ci95_high double precision,
  difficulty_ci95_low double precision,
  difficulty_ci95_high double precision,
  confidence_low double precision,
  confidence_high double precision,
  residual double precision,
  n_contributors integer not null default 0 check (n_contributors >= 0),
  n_players_scored integer not null default 0 check (n_players_scored >= 0),
  source_contributor_count integer not null default 0 check (source_contributor_count >= 0),
  shrinkage double precision,
  calibration double precision,
  effect_band text,
  relative_group text,
  evidence_status text,
  mode_rank integer check (mode_rank is null or mode_rank > 0),
  level_rank integer check (level_rank is null or level_rank > 0),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  primary key (analysis_run_id, chart_id, mode),
  check (confidence_high is null or confidence_low is null or confidence_high >= confidence_low),
  check (difficulty_delta_ci95_high is null or difficulty_delta_ci95_low is null or
    difficulty_delta_ci95_high >= difficulty_delta_ci95_low),
  check (difficulty_ci95_high is null or difficulty_ci95_low is null or
    difficulty_ci95_high >= difficulty_ci95_low)
);

create table pumbility.analysis_folder_results (
  analysis_run_id uuid not null references pumbility.analysis_runs(id) on delete cascade,
  mix_id uuid not null references pumbility.mixes(id) on delete restrict,
  mode text not null check (btrim(mode) <> ''),
  folder_key text not null check (btrim(folder_key) <> ''),
  median_value double precision,
  compressed_min double precision,
  compressed_max double precision,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  primary key (analysis_run_id, mix_id, mode, folder_key),
  check (compressed_max is null or compressed_min is null or compressed_max >= compressed_min)
);

create table pumbility.artifacts (
  id uuid primary key default gen_random_uuid(),
  object_key text not null unique check (btrim(object_key) <> ''),
  media_type text not null check (btrim(media_type) <> ''),
  payload_json jsonb,
  storage_bucket text,
  storage_object_path text,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size >= 0),
  schema_version text not null default '1' check (btrim(schema_version) <> ''),
  analysis_run_id uuid references pumbility.analysis_runs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  validated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (num_nonnulls(payload_json, storage_object_path) >= 1),
  check ((storage_object_path is null and storage_bucket is null) or
         (storage_object_path is not null and storage_bucket = 'pumbility-artifacts')),
  check (payload_json is null or jsonb_typeof(payload_json) in ('object', 'array')),
  check (expires_at is null or expires_at > created_at)
);

create table pumbility.model_generations (
  id uuid primary key default gen_random_uuid(),
  generation_key text not null unique check (btrim(generation_key) <> ''),
  job_id uuid references pumbility.jobs(id) on delete set null,
  analysis_run_id uuid not null references pumbility.analysis_runs(id) on delete restrict,
  artifact_id uuid not null references pumbility.artifacts(id) on delete restrict,
  status text not null check (status in ('building', 'ready', 'shadow', 'published', 'failed', 'cancelled', 'rolled_back', 'expired')),
  model_schema_version text not null check (btrim(model_schema_version) <> ''),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  output_hash text check (output_hash is null or output_hash ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  published_at timestamptz,
  check (status not in ('ready', 'shadow', 'published') or (completed_at is not null and output_hash is not null))
);

create table pumbility.model_player_features (
  model_generation_id uuid not null references pumbility.model_generations(id) on delete cascade,
  player_id uuid not null references pumbility.players(id) on delete cascade,
  mode text not null check (btrim(mode) <> ''),
  eligible boolean not null,
  rating_source text,
  top_twenty_rating double precision,
  projection_rating double precision,
  valid_score_count integer not null default 0 check (valid_score_count >= 0),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  primary key (model_generation_id, player_id, mode)
);

create table pumbility.recommendation_refreshes (
  id uuid primary key default gen_random_uuid(),
  refresh_key text not null unique check (btrim(refresh_key) <> ''),
  player_id uuid not null references pumbility.players(id) on delete cascade,
  model_generation_id uuid not null references pumbility.model_generations(id) on delete restrict,
  job_id uuid references pumbility.jobs(id) on delete set null,
  status text not null check (status in ('building', 'completed', 'failed', 'cancelled', 'stale')),
  input_hash text check (input_hash is null or input_hash ~ '^[0-9a-f]{64}$'),
  output_hash text check (output_hash is null or output_hash ~ '^[0-9a-f]{64}$'),
  safe_error jsonb check (safe_error is null or jsonb_typeof(safe_error) = 'object'),
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  check (completed_at is null or completed_at >= started_at),
  check (status <> 'completed' or (completed_at is not null and output_hash is not null))
);

create table pumbility.recommendation_mode_results (
  recommendation_refresh_id uuid not null references pumbility.recommendation_refreshes(id) on delete cascade,
  mode text not null check (btrim(mode) <> ''),
  eligible boolean not null,
  rating_source text,
  current_top_fifty_total double precision,
  current_top_fifty_cutoff double precision,
  projection_available boolean not null default false,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  primary key (recommendation_refresh_id, mode)
);

create table pumbility.recommendation_candidates (
  recommendation_refresh_id uuid not null references pumbility.recommendation_refreshes(id) on delete cascade,
  chart_id uuid not null references pumbility.charts(id) on delete cascade,
  mode text not null check (btrim(mode) <> ''),
  candidate_rank integer not null check (candidate_rank > 0),
  farm_edge double precision,
  played boolean not null,
  existing_pumbility double precision,
  expected_pumbility double precision,
  projected_score double precision,
  projected_grade text,
  projected_plate text,
  projected_gain double precision,
  support integer not null default 0 check (support >= 0),
  source text not null check (btrim(source) <> ''),
  confidence double precision check (confidence is null or (confidence >= 0 and confidence <= 1)),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  primary key (recommendation_refresh_id, chart_id, mode),
  unique (recommendation_refresh_id, mode, candidate_rank)
);

create table pumbility.player_recommendation_heads (
  player_id uuid primary key references pumbility.players(id) on delete cascade,
  model_generation_id uuid not null references pumbility.model_generations(id) on delete restrict,
  recommendation_refresh_id uuid not null unique references pumbility.recommendation_refreshes(id) on delete restrict,
  job_id uuid not null references pumbility.jobs(id) on delete restrict,
  updated_at timestamptz not null default statement_timestamp()
);

create table pumbility.publications (
  publication_key text primary key check (btrim(publication_key) <> ''),
  analysis_run_id uuid references pumbility.analysis_runs(id) on delete restrict,
  model_generation_id uuid references pumbility.model_generations(id) on delete restrict,
  artifact_id uuid references pumbility.artifacts(id) on delete restrict,
  published_by_job_id uuid not null references pumbility.jobs(id) on delete restrict,
  published_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (num_nonnulls(analysis_run_id, model_generation_id, artifact_id) >= 1)
);

create table pumbility.outbox_events (
  id bigint generated always as identity primary key,
  event_key text not null unique check (btrim(event_key) <> ''),
  aggregate_type text not null check (btrim(aggregate_type) <> ''),
  aggregate_key text not null check (btrim(aggregate_key) <> ''),
  event_type text not null check (btrim(event_type) <> ''),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  available_at timestamptz not null default statement_timestamp(),
  claimed_at timestamptz,
  completed_at timestamptz,
  attempt integer not null default 0 check (attempt >= 0),
  safe_error jsonb check (safe_error is null or jsonb_typeof(safe_error) = 'object')
);

create table pumbility.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  reconciliation_key text not null unique check (btrim(reconciliation_key) <> ''),
  source_boundary text not null check (btrim(source_boundary) <> ''),
  target_boundary text not null check (btrim(target_boundary) <> ''),
  status text not null check (status in ('building', 'matched', 'mismatched', 'failed')),
  source_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(source_counts) = 'object'),
  target_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(target_counts) = 'object'),
  source_hash text check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
  target_hash text check (target_hash is null or target_hash ~ '^[0-9a-f]{64}$'),
  safe_mismatches jsonb not null default '[]'::jsonb check (jsonb_typeof(safe_mismatches) = 'array'),
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  check (completed_at is null or completed_at >= started_at)
);

create table pumbility.chart_rerates (
  id uuid primary key default gen_random_uuid(),
  source_chart_id uuid not null references pumbility.charts(id) on delete cascade,
  target_chart_id uuid not null references pumbility.charts(id) on delete cascade,
  source_level integer,
  target_level integer,
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  unique (source_chart_id, target_chart_id),
  check (source_chart_id <> target_chart_id)
);

create table pumbility.chart_videos (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references pumbility.charts(id) on delete cascade,
  video_id text not null check (btrim(video_id) <> ''),
  video_url text not null check (btrim(video_url) <> ''),
  is_override boolean not null default false,
  matching_method text not null check (btrim(matching_method) <> ''),
  notes text,
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  unique (chart_id, video_id)
);

create table pumbility.song_aliases (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references pumbility.songs(id) on delete cascade,
  alias text not null check (btrim(alias) <> ''),
  normalized_alias text not null check (btrim(normalized_alias) <> ''),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  unique (song_id, normalized_alias)
);

create unique index player_consents_one_open_idx
  on pumbility.player_consents (player_id, mix_id, consent_scope_id)
  where valid_to is null;
create unique index chart_revisions_one_open_idx
  on pumbility.chart_revisions (chart_id)
  where valid_to is null;
create index chart_revisions_content_hash_idx
  on pumbility.chart_revisions (chart_id, content_hash);
create unique index score_revisions_one_open_idx
  on pumbility.score_revisions (mix_id, player_id, chart_id)
  where valid_to is null;
create index score_revisions_row_hash_idx
  on pumbility.score_revisions (mix_id, player_id, chart_id, row_hash);
create index score_revisions_player_rank_idx
  on pumbility.score_revisions
  (mix_id, player_id, pumbility desc, score desc, recorded_at_raw desc, chart_id)
  where valid_to is null;
create index score_revisions_chart_analysis_idx
  on pumbility.score_revisions (mix_id, chart_id, player_id)
  where valid_to is null;
create index jobs_claim_idx
  on pumbility.jobs (status, retry_at, lease_expires_at, created_at);
create unique index jobs_one_running_analysis_idx
  on pumbility.jobs ((kind))
  where kind = 'analysis' and status = 'running';
create unique index jobs_one_running_player_recommendation_idx
  on pumbility.jobs ((payload->>'playerKey'))
  where kind = 'player_recommendation'
    and status = 'running'
    and payload ? 'playerKey';
create index job_events_job_time_idx
  on pumbility.job_events (job_id, created_at);
create index sync_run_players_status_idx
  on pumbility.sync_run_players (sync_run_id, status, updated_at);
create index chart_contributions_chart_idx
  on pumbility.chart_contributions (analysis_run_id, mode, chart_id);
create index chart_results_rank_idx
  on pumbility.chart_results (analysis_run_id, mode, mode_rank, level_rank);
create index recommendation_candidates_filter_idx
  on pumbility.recommendation_candidates
  (recommendation_refresh_id, mode, played, projected_gain desc, candidate_rank);
create index outbox_events_delivery_idx
  on pumbility.outbox_events (available_at, created_at)
  where completed_at is null;

create view pumbility.current_catalog
with (security_barrier = true) as
select
  c.id as chart_id,
  c.mix_id,
  c.upstream_chart_id,
  c.song_id,
  s.title,
  c.chart_type,
  r.level,
  r.difficulty,
  r.step_artist,
  r.image_url,
  r.note_count,
  r.bpm_min,
  r.bpm_max,
  r.content_hash
from pumbility.charts as c
join pumbility.songs as s on s.id = c.song_id
join pumbility.chart_revisions as r on r.chart_id = c.id and r.valid_to is null
where c.is_active;

create view pumbility.current_best_scores
with (security_barrier = true) as
select * from pumbility.score_revisions where valid_to is null;

create view pumbility.public_players
with (security_barrier = true) as
select public_key, username, last_synced_at
from pumbility.players
where is_active;

create view pumbility.current_analysis
with (security_barrier = true) as
select p.publication_key, p.analysis_run_id, r.kind, r.output_hash, p.published_at
from pumbility.publications as p
join pumbility.analysis_runs as r on r.id = p.analysis_run_id;

create view pumbility.public_tier_list
with (security_barrier = true) as
select p.publication_key, cr.chart_id, cr.mode, cr.estimated_difficulty, cr.confidence_low,
  cr.confidence_high, cr.effect_band, cr.relative_group, cr.mode_rank, cr.level_rank, cr.evidence
from pumbility.publications as p
join pumbility.chart_results as cr on cr.analysis_run_id = p.analysis_run_id;

create view pumbility.current_player_recommendations
with (security_barrier = true) as
select h.player_id, pl.public_key, h.model_generation_id, h.recommendation_refresh_id,
  h.updated_at
from pumbility.player_recommendation_heads as h
join pumbility.players as pl on pl.id = h.player_id and pl.is_active;

create or replace function pumbility.claim_job(
  p_external_key text,
  p_kind text,
  p_stage text,
  p_mix_key text,
  p_payload jsonb,
  p_lease_owner text,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job pumbility.jobs%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if pg_catalog.btrim(p_external_key) = '' or pg_catalog.btrim(p_kind) = ''
     or pg_catalog.btrim(p_stage) = '' or pg_catalog.btrim(p_lease_owner) = '' then
    raise exception 'invalid_job_claim' using errcode = '22023';
  end if;
  if p_lease_seconds < 1 or p_lease_seconds > 3600 then
    raise exception 'invalid_lease_seconds' using errcode = '22023';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_job_payload' using errcode = '22023';
  end if;
  if p_kind = 'player_recommendation'
     and pg_catalog.btrim(coalesce(p_payload->>'playerKey', '')) = '' then
    raise exception 'player_key_required' using errcode = '22023';
  end if;

  if p_kind = 'analysis' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('pumbility:global-analysis', 0)
    );
    if exists (
      select 1 from pumbility.jobs
      where kind = 'analysis'
        and status = 'running'
        and lease_expires_at >= v_now
        and external_key <> p_external_key
    ) then
      select * into v_job from pumbility.jobs
      where kind = 'analysis'
        and status = 'running'
        and lease_expires_at >= v_now
      order by created_at
      limit 1;
      return pg_catalog.jsonb_build_object('claimed', false, 'job', pg_catalog.to_jsonb(v_job));
    end if;
    update pumbility.jobs
    set status = 'failed',
        stage = 'lease_expired',
        completed_at = v_now,
        lease_owner = null,
        lease_expires_at = null,
        safe_error = '{"code":"lease_expired"}'::jsonb,
        updated_at = v_now
    where kind = 'analysis'
      and status = 'running'
      and lease_expires_at < v_now
      and external_key <> p_external_key;
  end if;

  if p_kind = 'player_recommendation' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'pumbility:player-recommendation:' || (p_payload->>'playerKey'), 0
      )
    );
    if exists (
      select 1 from pumbility.jobs
      where kind = 'player_recommendation'
        and status = 'running'
        and payload->>'playerKey' = p_payload->>'playerKey'
        and lease_expires_at >= v_now
        and external_key <> p_external_key
    ) then
      select * into v_job from pumbility.jobs
      where kind = 'player_recommendation'
        and status = 'running'
        and payload->>'playerKey' = p_payload->>'playerKey'
        and lease_expires_at >= v_now
      order by created_at
      limit 1;
      return pg_catalog.jsonb_build_object('claimed', false, 'job', pg_catalog.to_jsonb(v_job));
    end if;
    update pumbility.jobs
    set status = 'failed',
        stage = 'lease_expired',
        completed_at = v_now,
        lease_owner = null,
        lease_expires_at = null,
        safe_error = '{"code":"lease_expired"}'::jsonb,
        updated_at = v_now
    where kind = 'player_recommendation'
      and status = 'running'
      and payload->>'playerKey' = p_payload->>'playerKey'
      and lease_expires_at < v_now
      and external_key <> p_external_key;
  end if;

  insert into pumbility.jobs (external_key, kind, stage, mix_key, payload)
  values (p_external_key, p_kind, p_stage, p_mix_key, p_payload)
  on conflict (external_key) do nothing;

  update pumbility.jobs
  set status = 'running',
      stage = p_stage,
      attempt = attempt + 1,
      payload = p_payload,
      lease_owner = p_lease_owner,
      lease_expires_at = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
      heartbeat_at = v_now,
      started_at = coalesce(started_at, v_now),
      completed_at = null,
      safe_error = null,
      updated_at = v_now
  where external_key = p_external_key
    and cancellation_requested_at is null
    and (
      status = 'queued'
      or (status = 'failed' and (retry_at is null or retry_at <= v_now))
      or (status = 'running' and lease_expires_at < v_now)
    )
  returning * into v_job;

  if found then
    insert into pumbility.job_events (job_id, event_type, stage, details)
    values (v_job.id, 'claimed', v_job.stage,
      pg_catalog.jsonb_build_object('attempt', v_job.attempt));
    return pg_catalog.jsonb_build_object('claimed', true, 'job', pg_catalog.to_jsonb(v_job));
  end if;

  select * into v_job from pumbility.jobs where external_key = p_external_key;
  return pg_catalog.jsonb_build_object('claimed', false, 'job', pg_catalog.to_jsonb(v_job));
end;
$$;

create or replace function pumbility.heartbeat_job(
  p_job_id uuid,
  p_lease_owner text,
  p_stage text,
  p_progress jsonb,
  p_lease_seconds integer default 300
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  if pg_catalog.btrim(p_lease_owner) = '' or pg_catalog.btrim(p_stage) = ''
     or p_lease_seconds < 1 or p_lease_seconds > 3600
     or p_progress is null or pg_catalog.jsonb_typeof(p_progress) <> 'object' then
    raise exception 'invalid_job_heartbeat' using errcode = '22023';
  end if;
  update pumbility.jobs
  set stage = p_stage,
      progress = p_progress,
      heartbeat_at = v_now,
      lease_expires_at = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
      updated_at = v_now
  where id = p_job_id
    and status = 'running'
    and lease_owner = p_lease_owner
    and lease_expires_at >= v_now
    and cancellation_requested_at is null;
  return found;
end;
$$;

create or replace function pumbility.complete_job(
  p_job_id uuid,
  p_lease_owner text,
  p_succeeded boolean,
  p_stage text,
  p_safe_error jsonb default null,
  p_retry_at timestamptz default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_status text;
begin
  if pg_catalog.btrim(p_lease_owner) = '' or pg_catalog.btrim(p_stage) = ''
     or (p_safe_error is not null and pg_catalog.jsonb_typeof(p_safe_error) <> 'object') then
    raise exception 'invalid_job_completion' using errcode = '22023';
  end if;
  if p_succeeded then
    v_status := 'completed';
  else
    select case when cancellation_requested_at is null then 'failed' else 'cancelled' end
      into v_status
    from pumbility.jobs
    where id = p_job_id for update;
  end if;

  update pumbility.jobs
  set status = v_status,
      stage = p_stage,
      completed_at = v_now,
      lease_owner = null,
      lease_expires_at = null,
      heartbeat_at = v_now,
      retry_at = case when v_status = 'failed' then p_retry_at else null end,
      safe_error = case when v_status = 'failed' then p_safe_error else null end,
      updated_at = v_now
  where id = p_job_id
    and status = 'running'
    and lease_owner = p_lease_owner
    and lease_expires_at >= v_now
    and (not p_succeeded or cancellation_requested_at is null);
  if found then
    insert into pumbility.job_events (job_id, event_type, stage, details)
    values (p_job_id, v_status, p_stage, '{}'::jsonb);
  end if;
  return found;
end;
$$;

create or replace function pumbility.cancel_job(
  p_job_id uuid,
  p_lease_owner text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job pumbility.jobs%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  update pumbility.jobs
  set cancellation_requested_at = coalesce(cancellation_requested_at, v_now),
      status = case when status in ('queued', 'failed') then 'cancelled' else status end,
      completed_at = case when status in ('queued', 'failed') then v_now else completed_at end,
      lease_owner = case when status in ('queued', 'failed') then null else lease_owner end,
      lease_expires_at = case when status in ('queued', 'failed') then null else lease_expires_at end,
      updated_at = v_now
  where id = p_job_id
    and status in ('queued', 'running', 'failed')
    and (status <> 'running' or p_lease_owner is null or lease_owner = p_lease_owner)
  returning * into v_job;
  if not found then
    select * into v_job from pumbility.jobs where id = p_job_id;
    return pg_catalog.jsonb_build_object('requested', false, 'job', pg_catalog.to_jsonb(v_job));
  end if;
  insert into pumbility.job_events (job_id, event_type, stage, details)
  values (p_job_id, 'cancellation_requested', v_job.stage, '{}'::jsonb);
  return pg_catalog.jsonb_build_object('requested', true, 'job', pg_catalog.to_jsonb(v_job));
end;
$$;

create or replace function pumbility.publish_generation(
  p_publication_key text,
  p_job_id uuid,
  p_lease_owner text,
  p_analysis_run_id uuid default null,
  p_model_generation_id uuid default null,
  p_artifact_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job pumbility.jobs%rowtype;
  v_publication pumbility.publications%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if pg_catalog.btrim(p_publication_key) = '' or pg_catalog.btrim(p_lease_owner) = ''
     or pg_catalog.num_nonnulls(p_analysis_run_id, p_model_generation_id, p_artifact_id) < 1 then
    raise exception 'invalid_publication' using errcode = '22023';
  end if;
  select * into v_job from pumbility.jobs where id = p_job_id for update;
  if v_job.id is null or v_job.status <> 'running' or v_job.lease_owner <> p_lease_owner
     or v_job.lease_expires_at < v_now or v_job.cancellation_requested_at is not null then
    raise exception 'job_not_publishable' using errcode = '55000';
  end if;
  if p_analysis_run_id is not null and not exists (
    select 1 from pumbility.analysis_runs
    where id = p_analysis_run_id and status in ('ready', 'shadow', 'published')
  ) then
    raise exception 'analysis_not_ready' using errcode = '55000';
  end if;
  if p_model_generation_id is not null and not exists (
    select 1
    from pumbility.model_generations as g
    join pumbility.artifacts as a on a.id = g.artifact_id and a.validated_at is not null
    where g.id = p_model_generation_id
      and g.status in ('ready', 'shadow', 'published')
      and (p_analysis_run_id is null or g.analysis_run_id = p_analysis_run_id)
      and (p_artifact_id is null or g.artifact_id = p_artifact_id)
  ) then
    raise exception 'model_not_ready' using errcode = '55000';
  end if;
  if p_artifact_id is not null and not exists (
    select 1 from pumbility.artifacts
    where id = p_artifact_id
      and validated_at is not null
      and (p_analysis_run_id is null or analysis_run_id = p_analysis_run_id)
  ) then
    raise exception 'artifact_not_validated' using errcode = '55000';
  end if;

  insert into pumbility.publications (
    publication_key, analysis_run_id, model_generation_id, artifact_id, published_by_job_id,
    published_at, updated_at
  ) values (
    p_publication_key, p_analysis_run_id, p_model_generation_id, p_artifact_id, p_job_id,
    v_now, v_now
  )
  on conflict (publication_key) do update
  set analysis_run_id = excluded.analysis_run_id,
      model_generation_id = excluded.model_generation_id,
      artifact_id = excluded.artifact_id,
      published_by_job_id = excluded.published_by_job_id,
      published_at = excluded.published_at,
      updated_at = excluded.updated_at
  returning * into v_publication;

  update pumbility.analysis_runs set status = 'published', updated_at = v_now
    where id = p_analysis_run_id and status in ('ready', 'shadow');
  update pumbility.model_generations set status = 'published', published_at = v_now
    where id = p_model_generation_id and status in ('ready', 'shadow');
  insert into pumbility.job_events (job_id, event_type, stage, details)
  values (p_job_id, 'published', v_job.stage,
    pg_catalog.jsonb_build_object('publicationKey', p_publication_key));
  return pg_catalog.to_jsonb(v_publication);
end;
$$;

create or replace function pumbility.publish_player_recommendation(
  p_player_id uuid,
  p_model_generation_id uuid,
  p_recommendation_refresh_id uuid,
  p_job_id uuid,
  p_lease_owner text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job pumbility.jobs%rowtype;
  v_head pumbility.player_recommendation_heads%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if pg_catalog.btrim(p_lease_owner) = '' then
    raise exception 'invalid_player_publication' using errcode = '22023';
  end if;
  select * into v_job from pumbility.jobs where id = p_job_id for update;
  if v_job.id is null or v_job.status <> 'running' or v_job.lease_owner <> p_lease_owner
     or v_job.lease_expires_at < v_now or v_job.cancellation_requested_at is not null then
    raise exception 'job_not_publishable' using errcode = '55000';
  end if;
  if not exists (
    select 1
    from pumbility.model_generations as g
    join pumbility.artifacts as a on a.id = g.artifact_id and a.validated_at is not null
    where g.id = p_model_generation_id and g.status in ('ready', 'shadow', 'published')
  ) then
    raise exception 'model_not_ready' using errcode = '55000';
  end if;
  if not exists (
    select 1 from pumbility.recommendation_refreshes
    where id = p_recommendation_refresh_id
      and player_id = p_player_id
      and model_generation_id = p_model_generation_id
      and job_id = p_job_id
      and status = 'completed'
  ) then
    raise exception 'recommendation_not_complete' using errcode = '55000';
  end if;

  insert into pumbility.player_recommendation_heads (
    player_id, model_generation_id, recommendation_refresh_id, job_id, updated_at
  ) values (
    p_player_id, p_model_generation_id, p_recommendation_refresh_id, p_job_id, v_now
  )
  on conflict (player_id) do update
  set model_generation_id = excluded.model_generation_id,
      recommendation_refresh_id = excluded.recommendation_refresh_id,
      job_id = excluded.job_id,
      updated_at = excluded.updated_at
  returning * into v_head;
  return pg_catalog.to_jsonb(v_head);
end;
$$;

do $$
declare
  v_table text;
begin
  for v_table in
    select c.relname
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'pumbility' and c.relkind in ('r', 'p')
  loop
    execute pg_catalog.format('alter table pumbility.%I enable row level security', v_table);
    execute pg_catalog.format('alter table pumbility.%I force row level security', v_table);
    execute pg_catalog.format(
      'create policy pumbility_worker_access on pumbility.%I to pumbility_worker using (true) with check (true)',
      v_table
    );
  end loop;
end;
$$;

revoke all on all tables in schema pumbility from public, anon, authenticated, service_role;
revoke all on all sequences in schema pumbility from public, anon, authenticated, service_role;
revoke all on all functions in schema pumbility
  from public, anon, authenticated, service_role, pumbility_reader, pumbility_worker;

grant select, insert, update, delete on all tables in schema pumbility to pumbility_worker;
grant usage, select on all sequences in schema pumbility to pumbility_worker;
grant select on pumbility.current_catalog,
  pumbility.public_players,
  pumbility.current_analysis,
  pumbility.public_tier_list,
  pumbility.current_player_recommendations
to pumbility_reader, service_role;

grant execute on function pumbility.claim_job(text, text, text, text, jsonb, text, integer)
  to pumbility_worker, service_role;
grant execute on function pumbility.heartbeat_job(uuid, text, text, jsonb, integer)
  to pumbility_worker, service_role;
grant execute on function pumbility.complete_job(uuid, text, boolean, text, jsonb, timestamptz)
  to pumbility_worker, service_role;
grant execute on function pumbility.cancel_job(uuid, text)
  to pumbility_worker, service_role;
grant execute on function pumbility.publish_generation(text, uuid, text, uuid, uuid, uuid)
  to pumbility_worker, service_role;
grant execute on function pumbility.publish_player_recommendation(uuid, uuid, uuid, uuid, text)
  to pumbility_worker, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pumbility-artifacts',
  'pumbility-artifacts',
  false,
  52428800,
  array[
    'application/octet-stream',
    'application/x-npz',
    'application/zip',
    'application/json'
  ]::text[]
);

create policy "Pumbility service can read artifacts"
on storage.objects for select to service_role
using (bucket_id = 'pumbility-artifacts');

create policy "Pumbility service can insert artifacts"
on storage.objects for insert to service_role
with check (bucket_id = 'pumbility-artifacts');

create policy "Pumbility service can update artifacts"
on storage.objects for update to service_role
using (bucket_id = 'pumbility-artifacts')
with check (bucket_id = 'pumbility-artifacts');

create policy "Pumbility service can delete artifacts"
on storage.objects for delete to service_role
using (bucket_id = 'pumbility-artifacts');

comment on schema pumbility is
  'Private Pumbility persistence; not exposed through the Supabase Data API.';
comment on table pumbility.artifacts is
  'Metadata for immutable analysis/model artifacts. Large binaries live in private Storage.';
comment on table pumbility.publications is
  'Atomic pointers to complete, validated immutable analysis/model generations.';
