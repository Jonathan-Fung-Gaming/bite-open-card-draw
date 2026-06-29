create table if not exists public.event_runtime_state (
  event_id text not null primary key,
  current_round smallint not null default 1 check (current_round between 1 and 4),
  rehearsal_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint event_runtime_state_event_id_not_blank check (length(trim(event_id)) > 0)
);

alter table public.event_runtime_state enable row level security;

alter table public.draws
  add column if not exists reason text;

alter table public.round_player_eligibility
  add column if not exists reason text;
alter table public.round_player_eligibility
  add column if not exists added_at timestamptz;

alter table public.active_voter_presence
  add column if not exists round_number smallint not null default 1 references public.rounds(round_number) on delete cascade;
alter table public.active_voter_presence
  drop constraint if exists active_voter_presence_event_id_player_id_device_id_key;
alter table public.active_voter_presence
  add constraint active_voter_presence_event_round_player_device_key
  unique (event_id, round_number, player_id, device_id);
drop index if exists public.active_voter_presence_event_player_idx;
create index if not exists active_voter_presence_event_round_player_idx
  on public.active_voter_presence (event_id, round_number, player_id, expires_at);

alter table public.voting_windows
  add column if not exists paused_from_status text;
alter table public.voting_windows
  add column if not exists remaining_ms_when_paused integer;
alter table public.voting_windows
  add column if not exists eligible_players jsonb not null default '[]'::jsonb;

alter table public.result_snapshots
  add column if not exists reveal_phase text not null default 'computed';
alter table public.result_snapshots
  add column if not exists reveal_phase_started_at timestamptz;
alter table public.result_snapshots
  add column if not exists final_revealed_at timestamptz;
alter table public.result_snapshots
  add column if not exists eligible_players jsonb not null default '[]'::jsonb;

alter table public.tiebreaks
  add column if not exists winner_reveal_started_at timestamptz;

alter table public.host_locks
  add column if not exists owner_session_id text;

create table if not exists public.ballot_invalidations (
  id uuid primary key default gen_random_uuid(),
  event_id text not null default 'local-dev',
  round_number smallint not null references public.rounds(round_number) on delete cascade,
  invalidated_at timestamptz not null,
  reason text not null,
  admin_session_id text not null,
  ballot_ids uuid[] not null default '{}'::uuid[],
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ballot_invalidations_event_id_not_blank check (length(trim(event_id)) > 0),
  constraint ballot_invalidations_reason_not_blank check (length(trim(reason)) > 0),
  constraint ballot_invalidations_admin_session_id_not_blank check (length(trim(admin_session_id)) > 0)
);

alter table public.ballot_invalidations enable row level security;

create index if not exists ballot_invalidations_event_round_idx
  on public.ballot_invalidations (event_id, round_number, invalidated_at);
