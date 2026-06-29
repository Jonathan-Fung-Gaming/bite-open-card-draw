create extension if not exists pgcrypto;

create table if not exists public.rounds (
  round_number smallint primary key check (round_number between 1 and 4),
  display_name text not null,
  status text not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  startgg_username text not null,
  startgg_username_normalized text not null,
  active boolean not null default true,
  has_tournament_history boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_username_not_blank check (length(trim(startgg_username)) > 0),
  constraint players_username_normalized_not_blank check (
    length(trim(startgg_username_normalized)) > 0
  )
);

create unique index if not exists players_active_username_unique
  on public.players (startgg_username_normalized)
  where active = true;

create table if not exists public.charts (
  id uuid primary key default gen_random_uuid(),
  source_row_hash text,
  name text not null,
  name_kr text,
  artist text not null,
  label text,
  chart_type text not null check (chart_type in ('s', 'd')),
  chart_level smallint not null check (chart_level > 0),
  display_difficulty text not null,
  song_key text not null,
  chart_key text not null,
  source_bg_img text,
  local_image_path text,
  tournament_scope boolean not null default false,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint charts_name_not_blank check (length(trim(name)) > 0),
  constraint charts_artist_not_blank check (length(trim(artist)) > 0)
);

create unique index if not exists charts_chart_key_unique
  on public.charts (chart_key);

create index if not exists charts_pool_idx
  on public.charts (chart_type, chart_level)
  where tournament_scope = true;

create table if not exists public.chart_exclusions (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references public.charts(id) on delete cascade,
  excluded boolean not null default true,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chart_exclusions_reason_not_blank check (length(trim(reason)) > 0)
);

create index if not exists chart_exclusions_chart_idx
  on public.chart_exclusions (chart_id, excluded);

create table if not exists public.round_sets (
  id uuid primary key default gen_random_uuid(),
  round_number smallint not null references public.rounds(round_number) on delete cascade,
  set_order smallint not null check (set_order in (1, 2)),
  chart_type text not null check (chart_type in ('s', 'd')),
  chart_level smallint not null,
  display_label text not null,
  draw_count smallint not null default 7 check (draw_count = 7),
  max_bans smallint not null default 2 check (max_bans = 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_number, set_order),
  unique (round_number, display_label)
);

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint admin_sessions_token_hash_not_blank check (length(trim(session_token_hash)) > 0)
);

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_session_id uuid references public.admin_sessions(id) on delete set null,
  action_type text not null,
  action_summary text not null,
  reason text,
  requires_password_reentry boolean not null default false,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint admin_actions_type_not_blank check (length(trim(action_type)) > 0),
  constraint admin_actions_summary_not_blank check (length(trim(action_summary)) > 0)
);

create table if not exists public.draws (
  id uuid primary key default gen_random_uuid(),
  round_set_id uuid not null references public.round_sets(id) on delete cascade,
  draw_version integer not null default 1 check (draw_version > 0),
  status text not null default 'active',
  eligible_pool_count integer not null default 0 check (eligible_pool_count >= 0),
  admin_action_id uuid references public.admin_actions(id) on delete set null,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (round_set_id, draw_version)
);

create table if not exists public.drawn_charts (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete cascade,
  chart_id uuid not null references public.charts(id) on delete restrict,
  draw_order smallint not null check (draw_order between 1 and 7),
  created_at timestamptz not null default now(),
  unique (draw_id, chart_id),
  unique (draw_id, draw_order)
);

create table if not exists public.voting_windows (
  id uuid primary key default gen_random_uuid(),
  round_number smallint not null references public.rounds(round_number) on delete cascade,
  status text not null default 'not_started',
  opened_at timestamptz,
  closes_at timestamptz,
  paused_at timestamptz,
  remaining_seconds_at_pause integer,
  extension_used boolean not null default false,
  final_warning_started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_number)
);

create table if not exists public.round_player_eligibility (
  id uuid primary key default gen_random_uuid(),
  round_number smallint not null references public.rounds(round_number) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  active_at_round_start boolean not null default true,
  added_by_admin_action_id uuid references public.admin_actions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (round_number, player_id)
);

create table if not exists public.ballots (
  id uuid primary key default gen_random_uuid(),
  round_number smallint not null references public.rounds(round_number) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  submitted boolean not null default false,
  submitted_at timestamptz,
  last_revision_at timestamptz,
  latest_revision_number integer not null default 0,
  manual_override boolean not null default false,
  override_admin_action_id uuid references public.admin_actions(id) on delete set null,
  override_reason text,
  replaced_existing_ballot boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_number, player_id)
);

create table if not exists public.ballot_choices (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots(id) on delete cascade,
  round_set_id uuid not null references public.round_sets(id) on delete cascade,
  no_bans boolean not null default false,
  banned_chart_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ballot_id, round_set_id),
  constraint ballot_choices_completion_check check (
    (no_bans = true and cardinality(banned_chart_ids) = 0)
    or (no_bans = false and cardinality(banned_chart_ids) between 1 and 2)
  )
);

create table if not exists public.ballot_revisions (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  accepted boolean not null default true,
  submitted_at timestamptz not null default now(),
  payload jsonb not null,
  failure_reason text,
  unique (ballot_id, revision_number)
);

create table if not exists public.result_snapshots (
  id uuid primary key default gen_random_uuid(),
  round_number smallint not null references public.rounds(round_number) on delete cascade,
  computed_at timestamptz not null default now(),
  stage_reveal_started_at timestamptz,
  stage_revealed_at timestamptz,
  admin_action_id uuid references public.admin_actions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  unique (round_number)
);

create table if not exists public.result_rows (
  id uuid primary key default gen_random_uuid(),
  result_snapshot_id uuid not null references public.result_snapshots(id) on delete cascade,
  round_set_id uuid not null references public.round_sets(id) on delete cascade,
  chart_id uuid not null references public.charts(id) on delete restrict,
  ban_count integer not null default 0 check (ban_count >= 0),
  reveal_order integer not null check (reveal_order > 0),
  is_selected boolean not null default false,
  is_tiebreak_candidate boolean not null default false,
  created_at timestamptz not null default now(),
  unique (result_snapshot_id, round_set_id, chart_id),
  unique (result_snapshot_id, round_set_id, reveal_order)
);

create table if not exists public.tiebreaks (
  id uuid primary key default gen_random_uuid(),
  result_snapshot_id uuid not null references public.result_snapshots(id) on delete cascade,
  round_set_id uuid not null references public.round_sets(id) on delete cascade,
  candidate_chart_ids uuid[] not null,
  winner_chart_id uuid not null references public.charts(id) on delete restrict,
  decided_at timestamptz not null default now(),
  decision_source text not null default 'server',
  admin_action_id uuid references public.admin_actions(id) on delete set null,
  unique (result_snapshot_id, round_set_id)
);

create table if not exists public.host_locks (
  id uuid primary key default gen_random_uuid(),
  lock_name text not null default 'tournament-host' unique,
  admin_session_id uuid references public.admin_sessions(id) on delete set null,
  host_token_hash text not null,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  constraint host_locks_token_hash_not_blank check (length(trim(host_token_hash)) > 0)
);

create table if not exists public.image_assets (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid references public.charts(id) on delete cascade,
  remote_url text,
  local_path text,
  status text not null default 'pending',
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_state_snapshots (
  id text primary key default 'primary',
  schema_version integer not null default 1,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  constraint tournament_state_snapshots_singleton check (id = 'primary')
);

insert into public.rounds (round_number, display_name)
values
  (1, 'Round 1'),
  (2, 'Round 2'),
  (3, 'Round 3'),
  (4, 'Round 4')
on conflict (round_number) do update
set display_name = excluded.display_name;

insert into public.round_sets (
  id,
  round_number,
  set_order,
  chart_type,
  chart_level,
  display_label,
  draw_count,
  max_bans
)
values
  ('00000000-0000-4000-8000-000000000101', 1, 1, 's', 16, 'S16', 7, 2),
  ('00000000-0000-4000-8000-000000000102', 1, 2, 's', 17, 'S17', 7, 2),
  ('00000000-0000-4000-8000-000000000201', 2, 1, 's', 18, 'S18', 7, 2),
  ('00000000-0000-4000-8000-000000000202', 2, 2, 's', 19, 'S19', 7, 2),
  ('00000000-0000-4000-8000-000000000301', 3, 1, 's', 20, 'S20', 7, 2),
  ('00000000-0000-4000-8000-000000000302', 3, 2, 's', 21, 'S21', 7, 2),
  ('00000000-0000-4000-8000-000000000401', 4, 1, 's', 22, 'S22', 7, 2),
  ('00000000-0000-4000-8000-000000000402', 4, 2, 'd', 23, 'D23', 7, 2)
on conflict (round_number, set_order) do update
set
  id = excluded.id,
  chart_type = excluded.chart_type,
  chart_level = excluded.chart_level,
  display_label = excluded.display_label,
  draw_count = excluded.draw_count,
  max_bans = excluded.max_bans;

alter table public.rounds enable row level security;
alter table public.players enable row level security;
alter table public.charts enable row level security;
alter table public.chart_exclusions enable row level security;
alter table public.round_sets enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_actions enable row level security;
alter table public.draws enable row level security;
alter table public.drawn_charts enable row level security;
alter table public.voting_windows enable row level security;
alter table public.round_player_eligibility enable row level security;
alter table public.ballots enable row level security;
alter table public.ballot_choices enable row level security;
alter table public.ballot_revisions enable row level security;
alter table public.result_snapshots enable row level security;
alter table public.result_rows enable row level security;
alter table public.tiebreaks enable row level security;
alter table public.host_locks enable row level security;
alter table public.image_assets enable row level security;
alter table public.tournament_state_snapshots enable row level security;
