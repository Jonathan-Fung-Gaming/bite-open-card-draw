-- Phase 1 production-readiness remediation: authoritative reroll/reveal transitions
-- and a monotonic, service-role-only public-state generation.

alter table public.admin_actions
  add column if not exists mutation_request_id uuid;

create unique index if not exists admin_actions_event_mutation_request_unique
  on public.admin_actions (event_id, mutation_request_id)
  where mutation_request_id is not null;

create table if not exists public.public_state_generations (
  event_id text not null,
  round_number smallint not null references public.rounds(round_number) on delete cascade,
  generation bigint not null default 0 check (generation >= 0),
  transition_kind text not null default 'baseline',
  result_mode boolean not null default false,
  set_1_draw_id uuid,
  set_1_draw_version integer,
  set_2_draw_id uuid,
  set_2_draw_version integer,
  voting_status text not null default 'not_started',
  voting_closes_at timestamptz,
  result_id uuid,
  result_phase text,
  result_phase_started_at timestamptz,
  set_1_tiebreak_started_at timestamptz,
  set_2_tiebreak_started_at timestamptz,
  phone_release_state text not null default 'voting_open',
  phone_released_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (event_id, round_number),
  constraint public_state_generations_event_id_not_blank check (length(trim(event_id)) > 0),
  constraint public_state_generations_transition_kind_not_blank
    check (length(trim(transition_kind)) > 0),
  constraint public_state_generations_draw_1_pair
    check ((set_1_draw_id is null) = (set_1_draw_version is null)),
  constraint public_state_generations_draw_2_pair
    check ((set_2_draw_id is null) = (set_2_draw_version is null)),
  constraint public_state_generations_draw_1_version
    check (set_1_draw_version is null or set_1_draw_version > 0),
  constraint public_state_generations_draw_2_version
    check (set_2_draw_version is null or set_2_draw_version > 0),
  constraint public_state_generations_result_phase
    check (
      result_phase is null
      or result_phase in (
        'computed',
        'set_1_counts',
        'set_1_resolved',
        'set_2_counts',
        'set_2_resolved',
        'final'
      )
    ),
  constraint public_state_generations_phone_release_state
    check (phone_release_state in ('voting_open', 'closed_revealing', 'revealed')),
  constraint public_state_generations_phone_release_timestamp
    check (
      (phone_release_state = 'revealed' and phone_released_at is not null)
      or (phone_release_state <> 'revealed' and phone_released_at is null)
    )
);

comment on table public.public_state_generations is
  'Service-role-only coherent round projection. generation changes only with authoritative tournament transitions.';
comment on column public.public_state_generations.transition_kind is
  'The committed transition that produced this generation; used to authorize deliberate state-rank regressions.';
comment on column public.public_state_generations.result_mode is
  'Sticky public result-mode signal. Only a newer explicit reset/reroll/round transition may return to draw mode.';

alter table public.public_state_generations enable row level security;

revoke all on table public.public_state_generations from public, anon, authenticated;
grant select, insert, update, delete on table public.public_state_generations to service_role;

create or replace function public.normalized_assert_phase1_host(
  p_event_id text,
  p_admin_session_id uuid,
  p_host_token_hash text,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored_host_token_hash text;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if p_admin_session_id is null then
    raise exception 'adminSessionId is required';
  end if;

  if coalesce(p_host_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'hostTokenHash must be a lowercase SHA-256 hex digest';
  end if;

  if not exists (
    select 1
    from public.admin_sessions as session
    where session.event_id = p_event_id
      and session.id = p_admin_session_id
      and session.revoked_at is null
      and session.expires_at > p_now
  ) then
    raise exception 'Admin session is missing, expired, or revoked.';
  end if;

  select host_lock.host_token_hash
    into v_stored_host_token_hash
  from public.host_locks as host_lock
  where host_lock.event_id = p_event_id
    and host_lock.lock_name = 'tournament-host'
    and host_lock.released_at is null
    and coalesce(host_lock.owner_session_id, host_lock.admin_session_id::text)
      = p_admin_session_id::text
  for share;

  if not found then
    raise exception 'This admin session does not own the active host lock.';
  end if;

  -- Compare fixed-size digests. Host heartbeat_at/expires_at deliberately do not
  -- participate in ownership: ownership ends only through an explicit release/takeover.
  if extensions.digest(v_stored_host_token_hash, 'sha256')
     <> extensions.digest(p_host_token_hash, 'sha256') then
    raise exception 'Host credential does not match the active host lock.';
  end if;
end;
$$;

revoke all on function public.normalized_assert_phase1_host(text, uuid, text, timestamptz)
  from public, anon, authenticated, service_role;

-- The immediately previous application payloads do not include a host-token
-- digest. During an application rollback, still close the check/mutation race
-- by verifying that the supplied active admin session owns the unreleased host
-- lock inside the mutation transaction.
create or replace function public.normalized_assert_phase1_legacy_host_owner(
  p_event_id text,
  p_admin_session_id uuid,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if p_admin_session_id is null then
    raise exception 'adminSessionId is required';
  end if;

  if not exists (
    select 1
    from public.admin_sessions as session
    where session.event_id = p_event_id
      and session.id = p_admin_session_id
      and session.revoked_at is null
      and session.expires_at > p_now
  ) then
    raise exception 'Admin session is missing, expired, or revoked.';
  end if;

  if not exists (
    select 1
    from public.host_locks as host_lock
    where host_lock.event_id = p_event_id
      and host_lock.lock_name = 'tournament-host'
      and host_lock.released_at is null
      and coalesce(host_lock.owner_session_id, host_lock.admin_session_id::text)
        = p_admin_session_id::text
    for share
  ) then
    raise exception 'This admin session does not own the active host lock.';
  end if;
end;
$$;

revoke all on function public.normalized_assert_phase1_legacy_host_owner(text, uuid, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.normalized_ensure_public_state_generation_locked(
  p_event_id text,
  p_round_number smallint,
  p_now timestamptz
)
returns public.public_state_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_projection public.public_state_generations%rowtype;
begin
  if p_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  insert into public.public_state_generations (
    event_id,
    round_number,
    generation,
    transition_kind,
    result_mode,
    set_1_draw_id,
    set_1_draw_version,
    set_2_draw_id,
    set_2_draw_version,
    voting_status,
    voting_closes_at,
    result_id,
    result_phase,
    result_phase_started_at,
    set_1_tiebreak_started_at,
    set_2_tiebreak_started_at,
    phone_release_state,
    phone_released_at,
    updated_at
  )
  select
    p_event_id,
    p_round_number,
    0,
    'baseline',
    result_snapshot.id is not null
      or coalesce(voting_window.status, '') in (
        'voting_closed',
        'results_computed',
        'results_revealing',
        'results_revealed',
        'round_complete'
      ),
    set_1_draw.id,
    set_1_draw.draw_version,
    set_2_draw.id,
    set_2_draw.draw_version,
    coalesce(
      voting_window.status,
      case
        when set_1_draw.id is not null and set_2_draw.id is not null then 'ready_to_vote'
        when set_1_draw.id is not null or set_2_draw.id is not null then 'drawing'
        else 'not_started'
      end
    ),
    voting_window.closes_at,
    result_snapshot.id,
    result_snapshot.reveal_phase,
    result_snapshot.reveal_phase_started_at,
    set_1_tiebreak.winner_reveal_started_at,
    set_2_tiebreak.winner_reveal_started_at,
    case
      when voting_window.status = 'results_revealed' then 'revealed'
      when result_snapshot.id is not null
        or coalesce(voting_window.status, '') in (
          'voting_closed',
          'results_computed',
          'results_revealing',
          'round_complete'
        ) then 'closed_revealing'
      else 'voting_open'
    end,
    case
      when voting_window.status = 'results_revealed'
        then coalesce(voting_window.updated_at, result_snapshot.final_revealed_at, p_now)
      else null
    end,
    p_now
  from (select 1) as seed
  left join lateral (
    select draw.id, draw.draw_version
    from public.draws as draw
    join public.round_sets as round_set on round_set.id = draw.round_set_id
    where draw.event_id = p_event_id
      and round_set.round_number = p_round_number
      and round_set.set_order = 1
      and draw.status = 'active'
      and draw.superseded_at is null
    limit 1
  ) as set_1_draw on true
  left join lateral (
    select draw.id, draw.draw_version
    from public.draws as draw
    join public.round_sets as round_set on round_set.id = draw.round_set_id
    where draw.event_id = p_event_id
      and round_set.round_number = p_round_number
      and round_set.set_order = 2
      and draw.status = 'active'
      and draw.superseded_at is null
    limit 1
  ) as set_2_draw on true
  left join lateral (
    select voting_window.*
    from public.voting_windows as voting_window
    where voting_window.event_id = p_event_id
      and voting_window.round_number = p_round_number
    limit 1
  ) as voting_window on true
  left join lateral (
    select result_snapshot.*
    from public.result_snapshots as result_snapshot
    where result_snapshot.event_id = p_event_id
      and result_snapshot.round_number = p_round_number
    limit 1
  ) as result_snapshot on true
  left join lateral (
    select tiebreak.winner_reveal_started_at
    from public.tiebreaks as tiebreak
    join public.round_sets as round_set on round_set.id = tiebreak.round_set_id
    where tiebreak.event_id = p_event_id
      and tiebreak.result_snapshot_id = result_snapshot.id
      and round_set.set_order = 1
    limit 1
  ) as set_1_tiebreak on true
  left join lateral (
    select tiebreak.winner_reveal_started_at
    from public.tiebreaks as tiebreak
    join public.round_sets as round_set on round_set.id = tiebreak.round_set_id
    where tiebreak.event_id = p_event_id
      and tiebreak.result_snapshot_id = result_snapshot.id
      and round_set.set_order = 2
    limit 1
  ) as set_2_tiebreak on true
  on conflict (event_id, round_number) do nothing;

  select *
    into v_projection
  from public.public_state_generations
  where event_id = p_event_id
    and round_number = p_round_number
  for update;

  return v_projection;
end;
$$;

revoke all on function public.normalized_ensure_public_state_generation_locked(text, smallint, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.normalized_refresh_public_state_generation(
  p_event_id text,
  p_round_number smallint,
  p_transition_kind text,
  p_phone_release_state text,
  p_phone_released_at timestamptz,
  p_now timestamptz
)
returns public.public_state_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_projection public.public_state_generations%rowtype;
begin
  if length(trim(coalesce(p_transition_kind, ''))) = 0 then
    raise exception 'transition kind is required';
  end if;

  if p_phone_release_state not in ('voting_open', 'closed_revealing', 'revealed') then
    raise exception 'invalid phone release state';
  end if;

  if (p_phone_release_state = 'revealed') <> (p_phone_released_at is not null) then
    raise exception 'phone release timestamp does not match release state';
  end if;

  update public.public_state_generations as projection
  set generation = projection.generation + 1,
      transition_kind = p_transition_kind,
      result_mode = result_snapshot.id is not null
        or coalesce(voting_window.status, '') in (
          'voting_closed',
          'results_computed',
          'results_revealing',
          'results_revealed',
          'round_complete'
        ),
      set_1_draw_id = set_1_draw.id,
      set_1_draw_version = set_1_draw.draw_version,
      set_2_draw_id = set_2_draw.id,
      set_2_draw_version = set_2_draw.draw_version,
      voting_status = coalesce(
        voting_window.status,
        case
          when set_1_draw.id is not null and set_2_draw.id is not null then 'ready_to_vote'
          when set_1_draw.id is not null or set_2_draw.id is not null then 'drawing'
          else 'not_started'
        end
      ),
      voting_closes_at = voting_window.closes_at,
      result_id = result_snapshot.id,
      result_phase = result_snapshot.reveal_phase,
      result_phase_started_at = result_snapshot.reveal_phase_started_at,
      set_1_tiebreak_started_at = set_1_tiebreak.winner_reveal_started_at,
      set_2_tiebreak_started_at = set_2_tiebreak.winner_reveal_started_at,
      phone_release_state = p_phone_release_state,
      phone_released_at = p_phone_released_at,
      updated_at = p_now
  from (select 1) as seed
  left join lateral (
    select draw.id, draw.draw_version
    from public.draws as draw
    join public.round_sets as round_set on round_set.id = draw.round_set_id
    where draw.event_id = p_event_id
      and round_set.round_number = p_round_number
      and round_set.set_order = 1
      and draw.status = 'active'
      and draw.superseded_at is null
    limit 1
  ) as set_1_draw on true
  left join lateral (
    select draw.id, draw.draw_version
    from public.draws as draw
    join public.round_sets as round_set on round_set.id = draw.round_set_id
    where draw.event_id = p_event_id
      and round_set.round_number = p_round_number
      and round_set.set_order = 2
      and draw.status = 'active'
      and draw.superseded_at is null
    limit 1
  ) as set_2_draw on true
  left join lateral (
    select voting_window.*
    from public.voting_windows as voting_window
    where voting_window.event_id = p_event_id
      and voting_window.round_number = p_round_number
    limit 1
  ) as voting_window on true
  left join lateral (
    select result_snapshot.*
    from public.result_snapshots as result_snapshot
    where result_snapshot.event_id = p_event_id
      and result_snapshot.round_number = p_round_number
    limit 1
  ) as result_snapshot on true
  left join lateral (
    select tiebreak.winner_reveal_started_at
    from public.tiebreaks as tiebreak
    join public.round_sets as round_set on round_set.id = tiebreak.round_set_id
    where tiebreak.event_id = p_event_id
      and tiebreak.result_snapshot_id = result_snapshot.id
      and round_set.set_order = 1
    limit 1
  ) as set_1_tiebreak on true
  left join lateral (
    select tiebreak.winner_reveal_started_at
    from public.tiebreaks as tiebreak
    join public.round_sets as round_set on round_set.id = tiebreak.round_set_id
    where tiebreak.event_id = p_event_id
      and tiebreak.result_snapshot_id = result_snapshot.id
      and round_set.set_order = 2
    limit 1
  ) as set_2_tiebreak on true
  where projection.event_id = p_event_id
    and projection.round_number = p_round_number
  returning projection.* into v_projection;

  if not found then
    raise exception 'Public state generation row is missing.';
  end if;

  return v_projection;
end;
$$;

revoke all on function public.normalized_refresh_public_state_generation(
  text,
  smallint,
  text,
  text,
  timestamptz,
  timestamptz
) from public, anon, authenticated, service_role;

-- Backfill every known event/round at generation zero without rewriting any
-- tournament row. New events are lazily initialized by the locked helper.
do $$
declare
  v_event record;
  v_round_number smallint;
  v_projection public.public_state_generations%rowtype;
begin
  for v_event in
    select distinct event_id
    from (
      select event_id from public.event_runtime_state
      union all select event_id from public.players
      union all select event_id from public.draws
      union all select event_id from public.voting_windows
      union all select event_id from public.result_snapshots
      union all select event_id from public.admin_sessions
      union all select event_id from public.host_locks
    ) as known_events
    where length(trim(event_id)) > 0
  loop
    for v_round_number in 1..4
    loop
      v_projection := public.normalized_ensure_public_state_generation_locked(
        v_event.event_id,
        v_round_number::smallint,
        statement_timestamp()
      );
    end loop;
  end loop;
end;
$$;

-- Older normalized events stored the round-start eligibility snapshot only on
-- the voting window. Materialize it before any Phase 1 reroll can replace that
-- window, while preserving separately audited emergency additions.
insert into public.round_player_eligibility (
  id,
  event_id,
  round_number,
  player_id,
  active_at_round_start,
  added_by_admin_action_id,
  reason,
  added_at,
  created_at
)
select
  gen_random_uuid(),
  voting_window.event_id,
  voting_window.round_number,
  player.id,
  true,
  null,
  'Backfilled from the durable voting-window eligibility snapshot.',
  coalesce(voting_window.opened_at, voting_window.created_at),
  coalesce(voting_window.opened_at, voting_window.created_at)
from public.voting_windows as voting_window
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(voting_window.eligible_players) = 'array'
      then voting_window.eligible_players
    else '[]'::jsonb
  end
) as eligible(value)
join public.players as player
  on player.event_id = voting_window.event_id
 and player.id::text = eligible.value->>'id'
on conflict (event_id, round_number, player_id) do nothing;

create or replace function public.normalized_read_coherent_state(
  p_event_id text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'eventId', p_event_id,
    'databaseTime', statement_timestamp(),
    'eventRuntimeState', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.event_id), '[]'::jsonb)
      from (
        select * from public.event_runtime_state
        where event_id = p_event_id
      ) as row_data
    ),
    'players', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.startgg_username_normalized, row_data.id), '[]'::jsonb)
      from (
        select * from public.players
        where event_id = p_event_id
      ) as row_data
    ),
    'chartExclusions', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.chart_id), '[]'::jsonb)
      from (
        select * from public.chart_exclusions
        where event_id = p_event_id
      ) as row_data
    ),
    'adminActions', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at, row_data.id), '[]'::jsonb)
      from (
        select * from public.admin_actions
        where event_id = p_event_id
      ) as row_data
    ),
    'draws', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.round_set_id, row_data.draw_version), '[]'::jsonb)
      from (
        select * from public.draws
        where event_id = p_event_id
      ) as row_data
    ),
    'drawnCharts', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.draw_id, row_data.draw_order), '[]'::jsonb)
      from (
        select * from public.drawn_charts
        where event_id = p_event_id
      ) as row_data
    ),
    'votingWindows', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.round_number), '[]'::jsonb)
      from (
        select * from public.voting_windows
        where event_id = p_event_id
      ) as row_data
    ),
    'roundPlayerEligibility', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.round_number, row_data.player_id), '[]'::jsonb)
      from (
        select * from public.round_player_eligibility
        where event_id = p_event_id
      ) as row_data
    ),
    'activeVoterPresence', (
      select case
        when coalesce((p_payload->>'includeBallotTables')::boolean, true) then
          coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.round_number, row_data.player_id, row_data.device_id), '[]'::jsonb)
        else '[]'::jsonb
      end
      from (
        select * from public.active_voter_presence
        where event_id = p_event_id
      ) as row_data
    ),
    'voterDeviceBindings', (
      select case
        when coalesce((p_payload->>'includeBallotTables')::boolean, true) then
          coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.device_id), '[]'::jsonb)
        else '[]'::jsonb
      end
      from (
        select * from public.voter_device_bindings
        where event_id = p_event_id
      ) as row_data
    ),
    'ballots', (
      select case
        when coalesce((p_payload->>'includeBallotTables')::boolean, true) then
          coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.round_number, row_data.player_id), '[]'::jsonb)
        else '[]'::jsonb
      end
      from (
        select * from public.ballots
        where event_id = p_event_id
      ) as row_data
    ),
    'ballotChoices', (
      select case
        when coalesce((p_payload->>'includeBallotTables')::boolean, true) then
          coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.ballot_id, row_data.round_set_id), '[]'::jsonb)
        else '[]'::jsonb
      end
      from (
        select * from public.ballot_choices
        where event_id = p_event_id
      ) as row_data
    ),
    'ballotRevisions', (
      select case
        when coalesce((p_payload->>'includeBallotTables')::boolean, true) then
          coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.ballot_id, row_data.revision_number), '[]'::jsonb)
        else '[]'::jsonb
      end
      from (
        select * from public.ballot_revisions
        where event_id = p_event_id
      ) as row_data
    ),
    'ballotInvalidations', (
      select case
        when coalesce((p_payload->>'includeBallotTables')::boolean, true) then
          coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.invalidated_at, row_data.id), '[]'::jsonb)
        else '[]'::jsonb
      end
      from (
        select * from public.ballot_invalidations
        where event_id = p_event_id
      ) as row_data
    ),
    'resultSnapshots', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.round_number), '[]'::jsonb)
      from (
        select * from public.result_snapshots
        where event_id = p_event_id
      ) as row_data
    ),
    'resultRows', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.result_snapshot_id, row_data.round_set_id, row_data.reveal_order), '[]'::jsonb)
      from (
        select * from public.result_rows
        where event_id = p_event_id
      ) as row_data
    ),
    'tiebreaks', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.result_snapshot_id, row_data.round_set_id), '[]'::jsonb)
      from (
        select * from public.tiebreaks
        where event_id = p_event_id
      ) as row_data
    ),
    'hostLocks', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.lock_name), '[]'::jsonb)
      from (
        select * from public.host_locks
        where event_id = p_event_id
      ) as row_data
    ),
    'publicStateGenerations', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.round_number), '[]'::jsonb)
      from (
        select * from public.public_state_generations
        where event_id = p_event_id
      ) as row_data
    )
  );
$$;

revoke all on function public.normalized_read_coherent_state(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_read_coherent_state(text, jsonb) to service_role;

create or replace function public.normalized_read_public_generation_key(p_event_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with current_event as (
    select coalesce(
      (
        select runtime.current_round
        from public.event_runtime_state as runtime
        where runtime.event_id = p_event_id
      ),
      1
    )::smallint as current_round
  ),
  round_generations as (
    select
      round_row.round_number,
      coalesce(projection.generation, 0)::bigint as generation,
      coalesce(projection.transition_kind, 'baseline') as transition_kind,
      coalesce(projection.result_mode, false) as result_mode,
      projection.updated_at
    from public.rounds as round_row
    left join public.public_state_generations as projection
      on projection.event_id = p_event_id
     and projection.round_number = round_row.round_number
    where round_row.round_number between 1 and 4
  ),
  public_state_fingerprint as (
    select md5(
      jsonb_build_object(
        'runtime', (
          select max(runtime.updated_at)::text
          from public.event_runtime_state as runtime
          where runtime.event_id = p_event_id
        ),
        'players', (
          select count(*)::text || ':' || coalesce(max(player.updated_at)::text, '')
          from public.players as player
          where player.event_id = p_event_id
        ),
        'draws', (
          select count(*)::text || ':' || coalesce(
            max(greatest(draw.created_at, coalesce(draw.superseded_at, draw.created_at)))::text,
            ''
          )
          from public.draws as draw
          where draw.event_id = p_event_id
        ),
        'voting', (
          select count(*)::text || ':' || coalesce(max(voting_window.updated_at)::text, '')
          from public.voting_windows as voting_window
          where voting_window.event_id = p_event_id
        ),
        'eligibility', (
          select count(*)::text || ':' || coalesce(max(eligibility.created_at)::text, '')
          from public.round_player_eligibility as eligibility
          where eligibility.event_id = p_event_id
        ),
        'ballots', (
          select count(*)::text || ':' || coalesce(max(ballot.updated_at)::text, '')
          from public.ballots as ballot
          where ballot.event_id = p_event_id
        ),
        'revisions', (
          select count(*)::text || ':' || coalesce(max(revision.submitted_at)::text, '')
          from public.ballot_revisions as revision
          where revision.event_id = p_event_id
        ),
        'results', (
          select count(*)::text || ':' || coalesce(
            max(greatest(
              result.computed_at,
              coalesce(result.reveal_phase_started_at, result.computed_at),
              coalesce(result.final_revealed_at, result.computed_at)
            ))::text,
            ''
          )
          from public.result_snapshots as result
          where result.event_id = p_event_id
        ),
        'actions', (
          select count(*)::text || ':' || coalesce(max(action.created_at)::text, '')
          from public.admin_actions as action
          where action.event_id = p_event_id
        )
      )::text
    ) as value
  )
  select jsonb_build_object(
    'eventId', p_event_id,
    'currentRound', current_event.current_round,
    'generationKey', current_event.current_round::text || '|' || public_state_fingerprint.value || '|' || (
      select string_agg(
        round_generations.round_number::text || ':' || round_generations.generation::text,
        ','
        order by round_generations.round_number
      )
      from round_generations
    ),
    'generations', (
      select jsonb_agg(
        jsonb_build_object(
          'roundNumber', round_generations.round_number,
          'generation', round_generations.generation,
          'transitionKind', round_generations.transition_kind,
          'resultMode', round_generations.result_mode,
          'updatedAt', round_generations.updated_at
        )
        order by round_generations.round_number
      )
      from round_generations
    )
  )
  from current_event
  cross join public_state_fingerprint;
$$;

revoke all on function public.normalized_read_public_generation_key(text)
  from public, anon, authenticated;
grant execute on function public.normalized_read_public_generation_key(text) to service_role;

create or replace function public.normalized_apply_phase1_reroll(
  p_event_id text,
  p_payload jsonb,
  p_transition_kind text,
  p_expected_draw_count integer,
  p_one_chart_only boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_round_number smallint;
  v_admin_session_id uuid;
  v_host_token_hash text;
  v_expected_generation bigint;
  v_reason text;
  v_target_chart_id uuid;
  v_now timestamptz;
  v_projection public.public_state_generations%rowtype;
  v_draw_entry jsonb;
  v_next_draw jsonb;
  v_existing_draw record;
  v_expected_draw_id uuid;
  v_expected_draw_version integer;
  v_next_draw_id uuid;
  v_next_round_set_id uuid;
  v_next_draw_version integer;
  v_eligible_pool_count integer;
  v_chart_ids uuid[];
  v_eligible_chart_ids uuid[];
  v_expected_draw_ids uuid[] := array[]::uuid[];
  v_new_draw_ids uuid[] := array[]::uuid[];
  v_round_set_ids uuid[] := array[]::uuid[];
  v_set_orders smallint[] := array[]::smallint[];
  v_sorted_set_orders smallint[];
  v_one_chart_next_draw jsonb;
  v_one_chart_old_draw_id uuid;
  v_target_draw_order smallint;
  v_new_target_chart_id uuid;
  v_non_target_mismatch_count integer;
  v_admin_action_id uuid := gen_random_uuid();
  v_invalidation_id uuid;
  v_invalidated_ballot_ids uuid[] := array[]::uuid[];
  v_had_voting_window boolean := false;
  v_had_result boolean := false;
  v_had_ballots boolean := false;
  v_result_id uuid;
  v_result_phase text;
  v_action_summary text;
  v_active_draws jsonb;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if coalesce(jsonb_typeof(p_payload), '') <> 'object' then
    raise exception 'p_payload must be an object';
  end if;

  v_request_id := (p_payload->>'requestId')::uuid;
  v_round_number := (p_payload->>'roundNumber')::smallint;
  v_admin_session_id := (p_payload->>'adminSessionId')::uuid;
  v_host_token_hash := nullif(p_payload->>'hostTokenHash', '');
  v_expected_generation := (p_payload->>'expectedGeneration')::bigint;
  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');

  if v_request_id is null then
    raise exception 'requestId is required';
  end if;

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_expected_generation is null or v_expected_generation < 0 then
    raise exception 'expectedGeneration must be a nonnegative integer';
  end if;

  if v_reason is null then
    raise exception 'reason is required';
  end if;

  if coalesce(jsonb_typeof(p_payload->'draws'), '') <> 'array'
     or jsonb_array_length(p_payload->'draws') <> p_expected_draw_count then
    raise exception '% requires exactly % replacement draw payload(s)',
      p_transition_kind,
      p_expected_draw_count;
  end if;

  if p_one_chart_only then
    v_target_chart_id := (p_payload->>'targetChartId')::uuid;

    if v_target_chart_id is null then
      raise exception 'targetChartId is required for a one-chart reroll';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );

  v_now := public.normalized_database_time();

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  if v_projection.generation <> v_expected_generation then
    raise exception 'Public state changed before this action could run. Expected generation %, found %.',
      v_expected_generation,
      v_projection.generation;
  end if;

  if exists (
    select 1
    from public.admin_actions as action
    where action.event_id = p_event_id
      and action.mutation_request_id = v_request_id
  ) then
    raise exception 'requestId has already been committed for this event';
  end if;

  -- All active round draws are locked in deterministic set order before any
  -- expected-state comparison. This shares the event/round advisory lock with
  -- ballot submission and prevents a late old-generation ballot from committing.
  perform draw.id
  from public.draws as draw
  join public.round_sets as round_set on round_set.id = draw.round_set_id
  where draw.event_id = p_event_id
    and round_set.round_number = v_round_number
    and draw.status = 'active'
    and draw.superseded_at is null
  order by round_set.set_order
  for update of draw;

  perform voting_window.id
  from public.voting_windows as voting_window
  where voting_window.event_id = p_event_id
    and voting_window.round_number = v_round_number
  for update;
  v_had_voting_window := found;

  select result.id, result.reveal_phase
    into v_result_id, v_result_phase
  from public.result_snapshots as result
  where result.event_id = p_event_id
    and result.round_number = v_round_number
  for update;
  v_had_result := found;

  if v_had_result and v_result_phase <> 'computed' then
    raise exception 'Rerolls after reveal starts require result correction or a full round reset.';
  end if;

  perform ballot.id
  from public.ballots as ballot
  where ballot.event_id = p_event_id
    and ballot.round_number = v_round_number
  order by ballot.id
  for update;
  v_had_ballots := found;

  select coalesce(array_agg(ballot.id order by ballot.id), array[]::uuid[])
    into v_invalidated_ballot_ids
  from public.ballots as ballot
  where ballot.event_id = p_event_id
    and ballot.round_number = v_round_number
    and ballot.invalidated_at is null;

  for v_draw_entry in
    select value from jsonb_array_elements(p_payload->'draws') as entry(value)
  loop
    if coalesce(jsonb_typeof(v_draw_entry), '') <> 'object'
       or coalesce(jsonb_typeof(v_draw_entry->'nextDraw'), '') <> 'object' then
      raise exception 'Each replacement entry must contain a complete nextDraw object';
    end if;

    v_expected_draw_id := (v_draw_entry->>'expectedDrawId')::uuid;
    v_expected_draw_version := (v_draw_entry->>'expectedDrawVersion')::integer;
    v_next_draw := v_draw_entry->'nextDraw';
    v_next_draw_id := (v_next_draw->>'id')::uuid;
    v_next_round_set_id := (v_next_draw->>'roundSetId')::uuid;
    v_next_draw_version := (v_next_draw->>'version')::integer;
    v_eligible_pool_count := (v_next_draw->>'eligiblePoolCount')::integer;

    if v_expected_draw_id is null or v_expected_draw_version is null
       or v_expected_draw_version <= 0 then
      raise exception 'Each replacement requires an expected draw id and positive version';
    end if;

    if v_expected_draw_id = any(v_expected_draw_ids) then
      raise exception 'Replacement draw payload contains a duplicate expectedDrawId';
    end if;

    if v_next_draw_id is null or v_next_round_set_id is null or v_next_draw_version is null then
      raise exception 'Each nextDraw requires id, roundSetId, and version';
    end if;

    if v_next_draw_id = any(v_new_draw_ids) or exists (
      select 1 from public.draws as existing where existing.id = v_next_draw_id
    ) then
      raise exception 'Each replacement draw id must be new and unique';
    end if;

    select
      draw.id,
      draw.round_set_id,
      draw.draw_version,
      round_set.set_order,
      round_set.chart_type,
      round_set.chart_level
      into v_existing_draw
    from public.draws as draw
    join public.round_sets as round_set on round_set.id = draw.round_set_id
    where draw.event_id = p_event_id
      and draw.id = v_expected_draw_id
      and round_set.round_number = v_round_number
      and draw.status = 'active'
      and draw.superseded_at is null
    for update of draw;

    if not found then
      raise exception 'Expected active draw % no longer exists for Round %.',
        v_expected_draw_id,
        v_round_number;
    end if;

    if v_existing_draw.draw_version <> v_expected_draw_version then
      raise exception 'Draw version changed before this action could run. Expected %, found %.',
        v_expected_draw_version,
        v_existing_draw.draw_version;
    end if;

    if v_next_round_set_id <> v_existing_draw.round_set_id then
      raise exception 'nextDraw.roundSetId must match the expected active draw';
    end if;

    if v_next_draw_version <> v_expected_draw_version + 1 then
      raise exception 'nextDraw.version must be exactly expectedDrawVersion + 1';
    end if;

    if coalesce(jsonb_typeof(v_next_draw->'charts'), '') <> 'array'
       or jsonb_array_length(v_next_draw->'charts') <> 7 then
      raise exception 'Each complete replacement draw must contain exactly 7 charts';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_next_draw->'charts') as chart_item(value)
      where nullif(trim(chart_item.value->>'name'), '') is null
        or nullif(trim(chart_item.value->>'artist'), '') is null
        or nullif(trim(chart_item.value->>'songKey'), '') is null
        or nullif(trim(chart_item.value->>'chartKey'), '') is null
        or coalesce(chart_item.value->>'displayDifficulty', '') !~ '^[SD][0-9]{1,2}$'
        or not (chart_item.value ? 'sourceBgImg')
        or not (chart_item.value ? 'localImagePath')
    ) then
      raise exception 'Each replacement chart requires complete canonical chart metadata';
    end if;

    select coalesce(
      array_agg((chart_item.value->>'id')::uuid order by chart_item.ordinal),
      array[]::uuid[]
    )
      into v_chart_ids
    from jsonb_array_elements(v_next_draw->'charts')
      with ordinality as chart_item(value, ordinal);

    if cardinality(v_chart_ids) <> 7
       or array_position(v_chart_ids, null) is not null
       or (select count(distinct chart_id) from unnest(v_chart_ids) as chart_id) <> 7 then
      raise exception 'Replacement draw chart ids must be 7 distinct UUIDs';
    end if;

    -- Rehearsal/disposable databases may contain only charts drawn so far. Keep
    -- the catalog insert inside this transaction so a new replacement chart and
    -- its draw can never commit separately. Existing ids remain authoritative.
    insert into public.charts (
      id,
      name,
      name_kr,
      artist,
      label,
      chart_type,
      chart_level,
      display_difficulty,
      song_key,
      chart_key,
      source_bg_img,
      local_image_path,
      tournament_scope
    )
    select
      (chart_item.value->>'id')::uuid,
      chart_item.value->>'name',
      null,
      chart_item.value->>'artist',
      null,
      lower(left(chart_item.value->>'displayDifficulty', 1)),
      substring(chart_item.value->>'displayDifficulty' from 2)::smallint,
      chart_item.value->>'displayDifficulty',
      chart_item.value->>'songKey',
      chart_item.value->>'chartKey',
      chart_item.value->>'sourceBgImg',
      chart_item.value->>'localImagePath',
      true
    from jsonb_array_elements(v_next_draw->'charts') as chart_item(value)
    on conflict (id) do nothing;

    if exists (
      select 1
      from jsonb_array_elements(v_next_draw->'charts') as chart_item(value)
      join public.charts as chart on chart.id = (chart_item.value->>'id')::uuid
      where chart.song_key <> chart_item.value->>'songKey'
        or chart.chart_key <> chart_item.value->>'chartKey'
        or chart.display_difficulty <> chart_item.value->>'displayDifficulty'
    ) then
      raise exception 'Replacement chart metadata conflicts with the canonical chart catalog';
    end if;

    if (
      select count(distinct chart.song_key)::integer
      from public.charts as chart
      where chart.id = any(v_chart_ids)
    ) <> 7 then
      raise exception 'A replacement draw must contain 7 known charts with distinct songs';
    end if;

    if coalesce(jsonb_typeof(v_next_draw->'eligibleChartIds'), '') <> 'array' then
      raise exception 'nextDraw.eligibleChartIds must be an array';
    end if;

    select coalesce(
      array_agg(value::uuid order by ordinal),
      array[]::uuid[]
    )
      into v_eligible_chart_ids
    from jsonb_array_elements_text(v_next_draw->'eligibleChartIds')
      with ordinality as eligible(value, ordinal);

    if v_eligible_pool_count is null
       or v_eligible_pool_count < (case when p_one_chart_only then 1 else 7 end)
       or v_eligible_pool_count <> cardinality(v_eligible_chart_ids)
       or array_position(v_eligible_chart_ids, null) is not null
       or (
         select count(distinct chart_id)
         from unnest(v_eligible_chart_ids) as chart_id
       ) <> cardinality(v_eligible_chart_ids) then
      raise exception 'eligiblePoolCount must match a distinct eligibleChartIds replacement pool';
    end if;

    if not p_one_chart_only and exists (
      select 1
      from unnest(v_chart_ids) as drawn(chart_id)
      where not (drawn.chart_id = any(v_eligible_chart_ids))
    ) then
      raise exception 'Every replacement chart must belong to eligibleChartIds';
    end if;

    if (
      select count(*)::integer
      from public.charts as chart
      where chart.id = any(v_chart_ids)
        and chart.chart_type = v_existing_draw.chart_type
        and chart.chart_level = v_existing_draw.chart_level
        and chart.tournament_scope = true
    ) <> 7 then
      raise exception 'Replacement draw contains an unknown chart or a chart outside the round-set pool';
    end if;

    if exists (
      select 1
      from public.chart_exclusions as exclusion
      where exclusion.event_id = p_event_id
        and exclusion.chart_id = any(v_eligible_chart_ids)
        and exclusion.excluded = true
    ) then
      raise exception 'eligibleChartIds contains a chart excluded for this event';
    end if;

    if exists (
      select 1
      from public.charts as eligible_chart
      join public.result_rows as selected_row
        on selected_row.event_id = p_event_id
       and selected_row.is_selected = true
      join public.result_snapshots as selected_result
        on selected_result.event_id = selected_row.event_id
       and selected_result.id = selected_row.result_snapshot_id
      join public.charts as selected_chart on selected_chart.id = selected_row.chart_id
      where eligible_chart.id = any(v_eligible_chart_ids)
        and selected_result.round_number < v_round_number
        and public.normalized_result_phase_has_selected_songs(selected_result.reveal_phase)
        and selected_chart.song_key = eligible_chart.song_key
    ) then
      raise exception 'eligibleChartIds contains a song selected in an earlier round';
    end if;

    if coalesce(jsonb_typeof(v_next_draw->'excludedChartKeysSnapshot'), '') <> 'array'
       or coalesce(jsonb_typeof(v_next_draw->'selectedSongKeysSnapshot'), '') <> 'array'
       or coalesce(jsonb_typeof(v_next_draw->'sameRoundBlockedSongKeysSnapshot'), '') <> 'array' then
      raise exception 'Replacement draw eligibility snapshots must be arrays';
    end if;

    if p_one_chart_only then
      v_one_chart_next_draw := v_next_draw;
      v_one_chart_old_draw_id := v_expected_draw_id;
    end if;

    v_expected_draw_ids := array_append(v_expected_draw_ids, v_expected_draw_id);
    v_new_draw_ids := array_append(v_new_draw_ids, v_next_draw_id);
    v_round_set_ids := array_append(v_round_set_ids, v_existing_draw.round_set_id);
    v_set_orders := array_append(v_set_orders, v_existing_draw.set_order);
  end loop;

  select array_agg(distinct set_order order by set_order)
    into v_sorted_set_orders
  from unnest(v_set_orders) as set_order;

  if p_expected_draw_count = 2
     and v_sorted_set_orders <> array[1, 2]::smallint[] then
    raise exception 'A full-round reroll must replace both set orders exactly once';
  end if;

  if p_expected_draw_count = 1 and cardinality(v_sorted_set_orders) <> 1 then
    raise exception 'A set reroll must replace exactly one active set';
  end if;

  if p_one_chart_only then
    select drawn.draw_order
      into v_target_draw_order
    from public.drawn_charts as drawn
    where drawn.event_id = p_event_id
      and drawn.draw_id = v_one_chart_old_draw_id
      and drawn.chart_id = v_target_chart_id;

    if not found then
      raise exception 'targetChartId does not belong to the expected active draw';
    end if;

    select (chart_item.value->>'id')::uuid
      into v_new_target_chart_id
    from jsonb_array_elements(v_one_chart_next_draw->'charts')
      with ordinality as chart_item(value, ordinal)
    where chart_item.ordinal = v_target_draw_order;

    if v_new_target_chart_id is null or v_new_target_chart_id = v_target_chart_id then
      raise exception 'A one-chart reroll must replace the targeted chart at the same draw order';
    end if;

    if not (v_new_target_chart_id = any(v_eligible_chart_ids)) then
      raise exception 'The one-chart replacement must belong to eligibleChartIds';
    end if;

    select count(*)::integer
      into v_non_target_mismatch_count
    from public.drawn_charts as old_chart
    join jsonb_array_elements(v_one_chart_next_draw->'charts')
      with ordinality as new_chart(value, ordinal)
      on new_chart.ordinal = old_chart.draw_order
    where old_chart.event_id = p_event_id
      and old_chart.draw_id = v_one_chart_old_draw_id
      and old_chart.draw_order <> v_target_draw_order
      and old_chart.chart_id <> (new_chart.value->>'id')::uuid;

    if v_non_target_mismatch_count <> 0 then
      raise exception 'A one-chart reroll must preserve the other six chart ids and draw orders';
    end if;
  end if;

  v_action_summary := case p_transition_kind
    when 'reroll_one_chart' then format('Rerolled one chart in Round %s.', v_round_number)
    when 'reroll_round_set' then format('Rerolled Round %s Set %s.', v_round_number, v_set_orders[1])
    when 'reroll_full_round' then format('Rerolled both chart sets for Round %s.', v_round_number)
    else format('Rerolled Round %s.', v_round_number)
  end;

  insert into public.admin_actions (
    id,
    event_id,
    admin_session_id,
    mutation_request_id,
    action_type,
    action_summary,
    reason,
    requires_password_reentry,
    created_at,
    metadata
  )
  values (
    v_admin_action_id,
    p_event_id,
    v_admin_session_id,
    v_request_id,
    p_transition_kind,
    v_action_summary,
    v_reason,
    true,
    v_now,
    jsonb_build_object(
      'requestId', v_request_id,
      'roundNumber', v_round_number,
      'transitionKind', p_transition_kind,
      'targetChartId', v_target_chart_id,
      'replacedDrawIds', to_jsonb(v_expected_draw_ids),
      'newDrawIds', to_jsonb(v_new_draw_ids),
      'dangerous', true,
      'tournamentChanging', true,
      'source', 'normalized_apply_phase1_reroll'
    )
  );

  update public.draws
  set status = 'superseded',
      superseded_at = v_now
  where event_id = p_event_id
    and id = any(v_expected_draw_ids)
    and status = 'active'
    and superseded_at is null;

  if not found then
    raise exception 'Expected active draws could not be superseded';
  end if;

  for v_draw_entry in
    select value from jsonb_array_elements(p_payload->'draws') as entry(value)
  loop
    v_next_draw := v_draw_entry->'nextDraw';
    v_next_draw_id := (v_next_draw->>'id')::uuid;

    insert into public.draws (
      id,
      event_id,
      round_set_id,
      draw_version,
      status,
      eligible_pool_count,
      admin_action_id,
      created_at,
      superseded_at,
      reason,
      eligible_chart_ids,
      excluded_chart_keys_snapshot,
      selected_song_keys_snapshot,
      same_round_blocked_song_keys_snapshot
    )
    values (
      v_next_draw_id,
      p_event_id,
      (v_next_draw->>'roundSetId')::uuid,
      (v_next_draw->>'version')::integer,
      'active',
      (v_next_draw->>'eligiblePoolCount')::integer,
      v_admin_action_id,
      v_now,
      null,
      v_reason,
      coalesce(
        (
          select array_agg(value::uuid order by ordinal)
          from jsonb_array_elements_text(v_next_draw->'eligibleChartIds')
            with ordinality as eligible(value, ordinal)
        ),
        array[]::uuid[]
      ),
      coalesce(
        (
          select array_agg(value order by ordinal)
          from jsonb_array_elements_text(v_next_draw->'excludedChartKeysSnapshot')
            with ordinality as excluded(value, ordinal)
        ),
        array[]::text[]
      ),
      coalesce(
        (
          select array_agg(value order by ordinal)
          from jsonb_array_elements_text(v_next_draw->'selectedSongKeysSnapshot')
            with ordinality as selected_song(value, ordinal)
        ),
        array[]::text[]
      ),
      coalesce(
        (
          select array_agg(value order by ordinal)
          from jsonb_array_elements_text(v_next_draw->'sameRoundBlockedSongKeysSnapshot')
            with ordinality as blocked_song(value, ordinal)
        ),
        array[]::text[]
      )
    );

    insert into public.drawn_charts (
      event_id,
      draw_id,
      chart_id,
      draw_order,
      created_at
    )
    select
      p_event_id,
      v_next_draw_id,
      (chart_item.value->>'id')::uuid,
      chart_item.ordinal::smallint,
      v_now
    from jsonb_array_elements(v_next_draw->'charts')
      with ordinality as chart_item(value, ordinal);
  end loop;

  perform public.validate_round_draws_against_prior_selected_songs(
    p_event_id,
    v_round_number
  );

  update public.ballots
  set invalidated_at = v_now,
      invalidated_by_admin_action_id = v_admin_action_id,
      invalidation_reason = v_reason,
      updated_at = v_now
  where event_id = p_event_id
    and round_number = v_round_number
    and invalidated_at is null;

  if v_had_voting_window or v_had_result or v_had_ballots then
    v_invalidation_id := gen_random_uuid();

    insert into public.ballot_invalidations (
      id,
      event_id,
      round_number,
      invalidated_at,
      reason,
      admin_session_id,
      ballot_ids,
      payload,
      created_at
    )
    values (
      v_invalidation_id,
      p_event_id,
      v_round_number,
      v_now,
      v_reason,
      v_admin_session_id::text,
      v_invalidated_ballot_ids,
      jsonb_build_object(
        'requestId', v_request_id,
        'transitionKind', p_transition_kind,
        'replacedDrawIds', to_jsonb(v_expected_draw_ids),
        'newDrawIds', to_jsonb(v_new_draw_ids)
      ),
      v_now
    );
  end if;

  if v_had_result then
    delete from public.result_snapshots
    where event_id = p_event_id
      and id = v_result_id
      and reveal_phase = 'computed';
  end if;

  delete from public.active_voter_presence
  where event_id = p_event_id
    and round_number = v_round_number;

  insert into public.round_player_eligibility (
    id,
    event_id,
    round_number,
    player_id,
    active_at_round_start,
    added_by_admin_action_id,
    reason,
    added_at,
    created_at
  )
  select
    gen_random_uuid(),
    voting_window.event_id,
    voting_window.round_number,
    player.id,
    true,
    null,
    'Preserved from the pre-reroll voting-window eligibility snapshot.',
    coalesce(voting_window.opened_at, voting_window.created_at),
    coalesce(voting_window.opened_at, voting_window.created_at)
  from public.voting_windows as voting_window
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(voting_window.eligible_players) = 'array'
        then voting_window.eligible_players
      else '[]'::jsonb
    end
  ) as eligible(value)
  join public.players as player
    on player.event_id = voting_window.event_id
   and player.id::text = eligible.value->>'id'
  where voting_window.event_id = p_event_id
    and voting_window.round_number = v_round_number
  on conflict (event_id, round_number, player_id) do nothing;

  delete from public.voting_windows
  where event_id = p_event_id
    and round_number = v_round_number;

  v_projection := public.normalized_refresh_public_state_generation(
    p_event_id,
    v_round_number,
    p_transition_kind,
    'voting_open',
    null,
    v_now
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'roundSetId', draw.round_set_id,
        'setOrder', round_set.set_order,
        'drawId', draw.id,
        'drawVersion', draw.draw_version
      )
      order by round_set.set_order
    ),
    '[]'::jsonb
  )
    into v_active_draws
  from public.draws as draw
  join public.round_sets as round_set on round_set.id = draw.round_set_id
  where draw.event_id = p_event_id
    and round_set.round_number = v_round_number
    and draw.status = 'active'
    and draw.superseded_at is null;

  return jsonb_build_object(
    'committed', true,
    'requestId', v_request_id,
    'roundNumber', v_round_number,
    'generation', v_projection.generation,
    'transitionKind', p_transition_kind,
    'adminActionId', v_admin_action_id,
    'invalidationId', v_invalidation_id,
    'invalidatedBallotIds', to_jsonb(v_invalidated_ballot_ids),
    'replacedDrawIds', to_jsonb(v_expected_draw_ids),
    'activeDraws', v_active_draws
  );
end;
$$;

revoke all on function public.normalized_apply_phase1_reroll(text, jsonb, text, integer, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.normalized_reroll_one_chart(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_apply_phase1_reroll(
    p_event_id,
    p_payload,
    'reroll_one_chart',
    1,
    true
  );
end;
$$;

create or replace function public.normalized_reroll_round_set(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_apply_phase1_reroll(
    p_event_id,
    p_payload,
    'reroll_round_set',
    1,
    false
  );
end;
$$;

create or replace function public.normalized_reroll_full_round(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_apply_phase1_reroll(
    p_event_id,
    p_payload,
    'reroll_full_round',
    2,
    false
  );
end;
$$;

revoke all on function public.normalized_reroll_one_chart(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.normalized_reroll_round_set(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.normalized_reroll_full_round(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.normalized_reroll_one_chart(text, jsonb) to service_role;
grant execute on function public.normalized_reroll_round_set(text, jsonb) to service_role;
grant execute on function public.normalized_reroll_full_round(text, jsonb) to service_role;

create or replace function public.normalized_advance_result_reveal(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_round_number smallint;
  v_admin_session_id uuid;
  v_host_token_hash text;
  v_expected_generation bigint;
  v_expected_result_id uuid;
  v_expected_reveal_phase text;
  v_now timestamptz;
  v_projection public.public_state_generations%rowtype;
  v_result public.result_snapshots%rowtype;
  v_next_phase text;
  v_resolved_set_order smallint;
  v_entering_resolved_set_order smallint;
  v_current_has_tiebreak boolean;
  v_current_tiebreak_started_at timestamptz;
  v_entering_tiebreak_started_at timestamptz;
  v_admin_action_id uuid := gen_random_uuid();
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if coalesce(jsonb_typeof(p_payload), '') <> 'object' then
    raise exception 'p_payload must be an object';
  end if;

  v_request_id := (p_payload->>'requestId')::uuid;
  v_round_number := (p_payload->>'roundNumber')::smallint;
  v_admin_session_id := (p_payload->>'adminSessionId')::uuid;
  v_host_token_hash := nullif(p_payload->>'hostTokenHash', '');
  v_expected_generation := (p_payload->>'expectedGeneration')::bigint;
  v_expected_result_id := (p_payload->>'expectedResultId')::uuid;
  v_expected_reveal_phase := nullif(p_payload->>'expectedRevealPhase', '');

  if v_request_id is null then
    raise exception 'requestId is required';
  end if;

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_expected_generation is null or v_expected_generation < 0 then
    raise exception 'expectedGeneration must be a nonnegative integer';
  end if;

  if v_expected_result_id is null then
    raise exception 'expectedResultId is required';
  end if;

  if v_expected_reveal_phase not in (
    'computed',
    'set_1_counts',
    'set_1_resolved',
    'set_2_counts',
    'set_2_resolved'
  ) then
    raise exception 'expectedRevealPhase is not an advanceable result phase';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );

  v_now := public.normalized_database_time();

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  if v_projection.generation <> v_expected_generation then
    raise exception 'Public state changed before this action could run. Expected generation %, found %.',
      v_expected_generation,
      v_projection.generation;
  end if;

  if exists (
    select 1
    from public.admin_actions as action
    where action.event_id = p_event_id
      and action.mutation_request_id = v_request_id
  ) then
    raise exception 'requestId has already been committed for this event';
  end if;

  select *
    into v_result
  from public.result_snapshots as result
  where result.event_id = p_event_id
    and result.round_number = v_round_number
  for update;

  if not found then
    raise exception 'No computed result exists for this round.';
  end if;

  if v_result.id <> v_expected_result_id then
    raise exception 'Result changed before this action could run. Expected %, found %.',
      v_expected_result_id,
      v_result.id;
  end if;

  if v_result.reveal_phase <> v_expected_reveal_phase then
    raise exception 'Reveal phase changed before this action could run. Expected %, found %.',
      v_expected_reveal_phase,
      v_result.reveal_phase;
  end if;

  perform voting_window.id
  from public.voting_windows as voting_window
  where voting_window.event_id = p_event_id
    and voting_window.round_number = v_round_number
  for update;

  if not found then
    raise exception 'Voting window state is missing for the computed result.';
  end if;

  perform tiebreak.id
  from public.tiebreaks as tiebreak
  join public.round_sets as round_set on round_set.id = tiebreak.round_set_id
  where tiebreak.event_id = p_event_id
    and tiebreak.result_snapshot_id = v_result.id
  order by round_set.set_order
  for update of tiebreak;

  v_next_phase := case v_result.reveal_phase
    when 'computed' then 'set_1_counts'
    when 'set_1_counts' then 'set_1_resolved'
    when 'set_1_resolved' then 'set_2_counts'
    when 'set_2_counts' then 'set_2_resolved'
    when 'set_2_resolved' then 'final'
    else null
  end;

  if v_next_phase is null then
    raise exception 'The result reveal is already complete.';
  end if;

  v_resolved_set_order := case v_result.reveal_phase
    when 'set_1_resolved' then 1
    when 'set_2_resolved' then 2
    else null
  end;

  if v_resolved_set_order is not null then
    select
      count(*) > 0,
      max(tiebreak.winner_reveal_started_at)
      into v_current_has_tiebreak, v_current_tiebreak_started_at
    from public.tiebreaks as tiebreak
    join public.round_sets as round_set on round_set.id = tiebreak.round_set_id
    where tiebreak.event_id = p_event_id
      and tiebreak.result_snapshot_id = v_result.id
      and round_set.set_order = v_resolved_set_order;

    if v_current_has_tiebreak and v_current_tiebreak_started_at is null then
      raise exception 'Tiebreak reveal timing is missing for the resolved phase.';
    end if;

    if v_current_has_tiebreak
       and v_now < v_current_tiebreak_started_at + interval '10 seconds' then
      raise exception 'The 10-second tiebreak reveal must finish before advancing.';
    end if;
  end if;

  v_entering_resolved_set_order := case v_next_phase
    when 'set_1_resolved' then 1
    when 'set_2_resolved' then 2
    else null
  end;

  if v_entering_resolved_set_order is not null then
    select max(tiebreak.winner_reveal_started_at)
      into v_entering_tiebreak_started_at
    from public.tiebreaks as tiebreak
    join public.round_sets as round_set on round_set.id = tiebreak.round_set_id
    where tiebreak.event_id = p_event_id
      and tiebreak.result_snapshot_id = v_result.id
      and round_set.set_order = v_entering_resolved_set_order;

    if v_entering_tiebreak_started_at is not null then
      raise exception 'Tiebreak reveal timing was already started before entering the resolved phase.';
    end if;
  end if;

  insert into public.admin_actions (
    id,
    event_id,
    admin_session_id,
    mutation_request_id,
    action_type,
    action_summary,
    requires_password_reentry,
    created_at,
    metadata
  )
  values (
    v_admin_action_id,
    p_event_id,
    v_admin_session_id,
    v_request_id,
    'advance_result_reveal',
    format('Advanced Round %s reveal from %s to %s.', v_round_number, v_result.reveal_phase, v_next_phase),
    false,
    v_now,
    jsonb_build_object(
      'requestId', v_request_id,
      'roundNumber', v_round_number,
      'resultId', v_result.id,
      'previousRevealPhase', v_result.reveal_phase,
      'revealPhase', v_next_phase,
      'tournamentChanging', true,
      'source', 'normalized_advance_result_reveal'
    )
  );

  if v_entering_resolved_set_order is not null then
    update public.tiebreaks as tiebreak
    set winner_reveal_started_at = v_now
    from public.round_sets as round_set
    where tiebreak.event_id = p_event_id
      and tiebreak.result_snapshot_id = v_result.id
      and tiebreak.round_set_id = round_set.id
      and round_set.set_order = v_entering_resolved_set_order
      and tiebreak.winner_reveal_started_at is null;
  end if;

  update public.result_snapshots
  set reveal_phase = v_next_phase,
      reveal_phase_started_at = v_now,
      final_revealed_at = case
        when v_next_phase = 'final' then v_now
        else final_revealed_at
      end
  where event_id = p_event_id
    and id = v_result.id
    and reveal_phase = v_result.reveal_phase;

  if not found then
    raise exception 'Result reveal state changed before it could be advanced.';
  end if;

  update public.voting_windows
  set status = 'results_revealing',
      updated_at = v_now
  where event_id = p_event_id
    and round_number = v_round_number;

  v_projection := public.normalized_refresh_public_state_generation(
    p_event_id,
    v_round_number,
    'result_reveal_advanced',
    'closed_revealing',
    null,
    v_now
  );

  return jsonb_build_object(
    'committed', true,
    'requestId', v_request_id,
    'roundNumber', v_round_number,
    'generation', v_projection.generation,
    'transitionKind', 'result_reveal_advanced',
    'adminActionId', v_admin_action_id,
    'resultId', v_result.id,
    'previousRevealPhase', v_result.reveal_phase,
    'revealPhase', v_next_phase,
    'revealPhaseStartedAt', v_now
  );
end;
$$;

revoke all on function public.normalized_advance_result_reveal(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_advance_result_reveal(text, jsonb) to service_role;

create or replace function public.normalized_mark_results_revealed(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_round_number smallint;
  v_admin_session_id uuid;
  v_host_token_hash text;
  v_expected_generation bigint;
  v_expected_result_id uuid;
  v_expected_reveal_phase text;
  v_now timestamptz;
  v_projection public.public_state_generations%rowtype;
  v_result public.result_snapshots%rowtype;
  v_admin_action_id uuid := gen_random_uuid();
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if coalesce(jsonb_typeof(p_payload), '') <> 'object' then
    raise exception 'p_payload must be an object';
  end if;

  v_request_id := (p_payload->>'requestId')::uuid;
  v_round_number := (p_payload->>'roundNumber')::smallint;
  v_admin_session_id := (p_payload->>'adminSessionId')::uuid;
  v_host_token_hash := nullif(p_payload->>'hostTokenHash', '');
  v_expected_generation := (p_payload->>'expectedGeneration')::bigint;
  v_expected_result_id := (p_payload->>'expectedResultId')::uuid;
  v_expected_reveal_phase := nullif(p_payload->>'expectedRevealPhase', '');

  if v_request_id is null then
    raise exception 'requestId is required';
  end if;

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_expected_generation is null or v_expected_generation < 0 then
    raise exception 'expectedGeneration must be a nonnegative integer';
  end if;

  if v_expected_result_id is null then
    raise exception 'expectedResultId is required';
  end if;

  if v_expected_reveal_phase <> 'final' then
    raise exception 'expectedRevealPhase must be final for public release';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );

  v_now := public.normalized_database_time();

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  if v_projection.generation <> v_expected_generation then
    raise exception 'Public state changed before this action could run. Expected generation %, found %.',
      v_expected_generation,
      v_projection.generation;
  end if;

  if exists (
    select 1
    from public.admin_actions as action
    where action.event_id = p_event_id
      and action.mutation_request_id = v_request_id
  ) then
    raise exception 'requestId has already been committed for this event';
  end if;

  select *
    into v_result
  from public.result_snapshots as result
  where result.event_id = p_event_id
    and result.round_number = v_round_number
  for update;

  if not found then
    raise exception 'No computed result exists for this round.';
  end if;

  if v_result.id <> v_expected_result_id then
    raise exception 'Result changed before this action could run. Expected %, found %.',
      v_expected_result_id,
      v_result.id;
  end if;

  if v_result.reveal_phase <> 'final' then
    raise exception 'Final results must be visible on stage before public release.';
  end if;

  perform voting_window.id
  from public.voting_windows as voting_window
  where voting_window.event_id = p_event_id
    and voting_window.round_number = v_round_number
  for update;

  if not found then
    raise exception 'Voting window state is missing for the final result.';
  end if;

  insert into public.admin_actions (
    id,
    event_id,
    admin_session_id,
    mutation_request_id,
    action_type,
    action_summary,
    requires_password_reentry,
    created_at,
    metadata
  )
  values (
    v_admin_action_id,
    p_event_id,
    v_admin_session_id,
    v_request_id,
    'release_final_results',
    format('Released Round %s final results to phones.', v_round_number),
    false,
    v_now,
    jsonb_build_object(
      'requestId', v_request_id,
      'roundNumber', v_round_number,
      'resultId', v_result.id,
      'revealPhase', 'final',
      'tournamentChanging', true,
      'source', 'normalized_mark_results_revealed'
    )
  );

  update public.voting_windows
  set status = 'results_revealed',
      updated_at = v_now
  where event_id = p_event_id
    and round_number = v_round_number;

  v_projection := public.normalized_refresh_public_state_generation(
    p_event_id,
    v_round_number,
    'results_released',
    'revealed',
    v_now,
    v_now
  );

  return jsonb_build_object(
    'committed', true,
    'requestId', v_request_id,
    'roundNumber', v_round_number,
    'generation', v_projection.generation,
    'transitionKind', 'results_released',
    'adminActionId', v_admin_action_id,
    'resultId', v_result.id,
    'revealPhase', 'final',
    'phoneReleasedAt', v_now
  );
end;
$$;

revoke all on function public.normalized_mark_results_revealed(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_mark_results_revealed(text, jsonb) to service_role;

-- Result computation predates the Phase 1 contract. Keep its payload/result
-- backward compatible while serializing it with rerolls and publishing the
-- result-mode generation in the same database transaction.
alter function public.normalized_compute_results(text, jsonb)
  rename to normalized_compute_results_without_phase1_projection_20260713;

revoke all on function
  public.normalized_compute_results_without_phase1_projection_20260713(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.normalized_compute_results(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid := (p_payload->>'requestId')::uuid;
  v_round_number smallint := (p_payload->>'roundNumber')::smallint;
  v_admin_session_id uuid := (p_payload->>'adminSessionId')::uuid;
  v_host_token_hash text := nullif(p_payload->>'hostTokenHash', '');
  v_expected_generation bigint := (p_payload->>'expectedGeneration')::bigint;
  v_now timestamptz;
  v_projection public.public_state_generations%rowtype;
  v_result jsonb;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  -- Preserve the immediately previous application contract during a code
  -- rollback. New code always supplies requestId/host/generation and uses the
  -- guarded branch below.
  if v_request_id is null then
    perform pg_advisory_xact_lock(
      hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
    );
    v_now := public.normalized_database_time();
    perform public.normalized_assert_phase1_legacy_host_owner(
      p_event_id,
      v_admin_session_id,
      v_now
    );
    v_projection := public.normalized_ensure_public_state_generation_locked(
      p_event_id,
      v_round_number,
      v_now
    );
    v_result := public.normalized_compute_results_without_phase1_projection_20260713(
      p_event_id,
      p_payload
    );
    v_now := public.normalized_database_time();
    perform public.normalized_refresh_public_state_generation(
      p_event_id,
      v_round_number,
      'results_computed_legacy_compat',
      'closed_revealing',
      null,
      v_now
    );
    return v_result;
  end if;

  if v_request_id is null then
    raise exception 'requestId is required';
  end if;

  if v_expected_generation is null or v_expected_generation < 0 then
    raise exception 'expectedGeneration must be a nonnegative integer';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );
  v_now := public.normalized_database_time();

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  if v_projection.generation <> v_expected_generation then
    raise exception 'Public state changed before results could compute. Expected generation %, found %.',
      v_expected_generation,
      v_projection.generation;
  end if;

  if exists (
    select 1
    from public.admin_actions as action
    where action.event_id = p_event_id
      and action.mutation_request_id = v_request_id
  ) then
    raise exception 'requestId has already been committed for this event';
  end if;

  v_result := public.normalized_compute_results_without_phase1_projection_20260713(
    p_event_id,
    p_payload
  );

  update public.admin_actions
  set mutation_request_id = v_request_id
  where event_id = p_event_id
    and id = (v_result->>'adminActionId')::uuid;

  if not found then
    raise exception 'Result computation audit row was not committed';
  end if;

  v_now := public.normalized_database_time();
  v_projection := public.normalized_refresh_public_state_generation(
    p_event_id,
    v_round_number,
    'results_computed',
    'closed_revealing',
    null,
    v_now
  );

  return v_result || jsonb_build_object(
    'requestId', v_request_id,
    'generation', v_projection.generation,
    'transitionKind', 'results_computed'
  );
end;
$$;

revoke all on function public.normalized_compute_results(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_compute_results(text, jsonb) to service_role;

-- Emergency reopen is an explicit, audited authorization to regress from
-- result mode to voting. Publish that regression as a newer generation.
alter function public.normalized_reopen_voting_window(text, jsonb)
  rename to normalized_reopen_voting_window_pre_phase1_20260713;

revoke all on function
  public.normalized_reopen_voting_window_pre_phase1_20260713(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.normalized_reopen_voting_window(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid := (p_payload->>'requestId')::uuid;
  v_round_number smallint := (p_payload->>'roundNumber')::smallint;
  v_admin_session_id uuid := (p_payload->>'adminSessionId')::uuid;
  v_host_token_hash text := nullif(p_payload->>'hostTokenHash', '');
  v_expected_generation bigint := (p_payload->>'expectedGeneration')::bigint;
  v_now timestamptz;
  v_projection public.public_state_generations%rowtype;
  v_result jsonb;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_request_id is null then
    perform pg_advisory_xact_lock(
      hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
    );
    v_now := public.normalized_database_time();
    perform public.normalized_assert_phase1_legacy_host_owner(
      p_event_id,
      v_admin_session_id,
      v_now
    );
    v_projection := public.normalized_ensure_public_state_generation_locked(
      p_event_id,
      v_round_number,
      v_now
    );
    v_result := public.normalized_reopen_voting_window_pre_phase1_20260713(
      p_event_id,
      p_payload
    );
    v_now := public.normalized_database_time();
    perform public.normalized_refresh_public_state_generation(
      p_event_id,
      v_round_number,
      'voting_restarted_legacy_compat',
      'voting_open',
      null,
      v_now
    );
    return v_result;
  end if;

  if v_request_id is null then
    raise exception 'requestId is required';
  end if;

  if v_expected_generation is null or v_expected_generation < 0 then
    raise exception 'expectedGeneration must be a nonnegative integer';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );
  v_now := public.normalized_database_time();

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  if v_projection.generation <> v_expected_generation then
    raise exception 'Public state changed before voting could reopen. Expected generation %, found %.',
      v_expected_generation,
      v_projection.generation;
  end if;

  if exists (
    select 1
    from public.admin_actions as action
    where action.event_id = p_event_id
      and action.mutation_request_id = v_request_id
  ) then
    raise exception 'requestId has already been committed for this event';
  end if;

  v_result := public.normalized_reopen_voting_window_pre_phase1_20260713(
    p_event_id,
    p_payload
  );

  update public.admin_actions
  set mutation_request_id = v_request_id
  where event_id = p_event_id
    and id = (v_result->>'adminActionId')::uuid;

  if not found then
    raise exception 'Voting reopen audit row was not committed';
  end if;

  v_now := public.normalized_database_time();
  v_projection := public.normalized_refresh_public_state_generation(
    p_event_id,
    v_round_number,
    'voting_restarted',
    'voting_open',
    null,
    v_now
  );

  return v_result || jsonb_build_object(
    'requestId', v_request_id,
    'generation', v_projection.generation,
    'transitionKind', 'voting_restarted'
  );
end;
$$;

revoke all on function public.normalized_reopen_voting_window(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_reopen_voting_window(text, jsonb) to service_role;

-- A password-confirmed full round reset is the other explicit result-mode exit.
alter function public.normalized_reset_round(text, jsonb)
  rename to normalized_reset_round_without_phase1_projection_20260713;

revoke all on function
  public.normalized_reset_round_without_phase1_projection_20260713(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.normalized_reset_round(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid := (p_payload->>'requestId')::uuid;
  v_round_number smallint := (p_payload->>'roundNumber')::smallint;
  v_admin_session_id uuid := (p_payload->>'adminSessionId')::uuid;
  v_host_token_hash text := nullif(p_payload->>'hostTokenHash', '');
  v_expected_generation bigint := (p_payload->>'expectedGeneration')::bigint;
  v_now timestamptz;
  v_projection public.public_state_generations%rowtype;
  v_result jsonb;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_request_id is null then
    perform pg_advisory_xact_lock(
      hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
    );
    v_now := public.normalized_database_time();
    perform public.normalized_assert_phase1_legacy_host_owner(
      p_event_id,
      v_admin_session_id,
      v_now
    );
    v_projection := public.normalized_ensure_public_state_generation_locked(
      p_event_id,
      v_round_number,
      v_now
    );
    v_result := public.normalized_reset_round_without_phase1_projection_20260713(
      p_event_id,
      p_payload
    );
    v_now := public.normalized_database_time();
    perform public.normalized_refresh_public_state_generation(
      p_event_id,
      v_round_number,
      'round_reset_legacy_compat',
      'voting_open',
      null,
      v_now
    );
    return v_result;
  end if;

  if v_request_id is null then
    raise exception 'requestId is required';
  end if;

  if v_expected_generation is null or v_expected_generation < 0 then
    raise exception 'expectedGeneration must be a nonnegative integer';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );
  v_now := public.normalized_database_time();

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  if v_projection.generation <> v_expected_generation then
    raise exception 'Public state changed before the round could reset. Expected generation %, found %.',
      v_expected_generation,
      v_projection.generation;
  end if;

  if exists (
    select 1
    from public.admin_actions as action
    where action.event_id = p_event_id
      and action.mutation_request_id = v_request_id
  ) then
    raise exception 'requestId has already been committed for this event';
  end if;

  v_result := public.normalized_reset_round_without_phase1_projection_20260713(
    p_event_id,
    p_payload
  );

  update public.admin_actions
  set mutation_request_id = v_request_id
  where event_id = p_event_id
    and id = (v_result->>'adminActionId')::uuid;

  if not found then
    raise exception 'Round reset audit row was not committed';
  end if;

  v_now := public.normalized_database_time();
  v_projection := public.normalized_refresh_public_state_generation(
    p_event_id,
    v_round_number,
    'round_reset',
    'voting_open',
    null,
    v_now
  );

  return v_result || jsonb_build_object(
    'requestId', v_request_id,
    'generation', v_projection.generation,
    'transitionKind', 'round_reset'
  );
end;
$$;

revoke all on function public.normalized_reset_round(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_reset_round(text, jsonb) to service_role;

-- Opening voting after a reroll is the authoritative restart generation. This
-- also replaces the disabled initial-open placeholder so both initial open and
-- reroll restart share one database transaction and host check.
create or replace function public.normalized_open_voting_window(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid := (p_payload->>'requestId')::uuid;
  v_round_number smallint := (p_payload->>'roundNumber')::smallint;
  v_admin_session_id uuid := (p_payload->>'adminSessionId')::uuid;
  v_host_token_hash text := nullif(p_payload->>'hostTokenHash', '');
  v_expected_generation bigint := (p_payload->>'expectedGeneration')::bigint;
  v_now timestamptz;
  v_closes_at timestamptz;
  v_projection public.public_state_generations%rowtype;
  v_active_draw_count integer;
  v_incomplete_draw_count integer;
  v_eligible_players jsonb;
  v_eligible_count integer;
  v_has_eligibility_snapshot boolean;
  v_admin_action_id uuid := gen_random_uuid();
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_request_id is null then
    raise exception 'requestId is required';
  end if;

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_expected_generation is null or v_expected_generation < 0 then
    raise exception 'expectedGeneration must be a nonnegative integer';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );
  v_now := public.normalized_database_time();

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  if v_projection.generation <> v_expected_generation then
    raise exception 'Public state changed before voting could open. Expected generation %, found %.',
      v_expected_generation,
      v_projection.generation;
  end if;

  if exists (
    select 1
    from public.admin_actions as action
    where action.event_id = p_event_id
      and action.mutation_request_id = v_request_id
  ) then
    raise exception 'requestId has already been committed for this event';
  end if;

  if exists (
    select 1
    from public.voting_windows as voting_window
    where voting_window.event_id = p_event_id
      and voting_window.round_number = v_round_number
  ) then
    raise exception 'Voting has already opened for this round.';
  end if;

  if exists (
    select 1
    from public.result_snapshots as result_snapshot
    where result_snapshot.event_id = p_event_id
      and result_snapshot.round_number = v_round_number
  ) then
    raise exception 'Round results must be reset before voting can open again.';
  end if;

  select count(*)::integer,
         (count(*) filter (where drawn_count <> 7))::integer
    into v_active_draw_count, v_incomplete_draw_count
  from (
    select draw.id, count(drawn.id)::integer as drawn_count
    from public.draws as draw
    join public.round_sets as round_set on round_set.id = draw.round_set_id
    left join public.drawn_charts as drawn
      on drawn.event_id = draw.event_id
     and drawn.draw_id = draw.id
    where draw.event_id = p_event_id
      and round_set.round_number = v_round_number
      and draw.status = 'active'
      and draw.superseded_at is null
    group by draw.id
  ) as active_draws;

  if v_active_draw_count <> 2 or v_incomplete_draw_count <> 0 then
    raise exception 'Both chart sets must be drawn before voting opens.';
  end if;

  perform public.validate_round_draws_against_prior_selected_songs(
    p_event_id,
    v_round_number
  );

  select exists (
    select 1
    from public.round_player_eligibility as eligibility
    where eligibility.event_id = p_event_id
      and eligibility.round_number = v_round_number
  )
    into v_has_eligibility_snapshot;

  with eligible as (
    select player.id, player.startgg_username
    from public.players as player
    where player.event_id = p_event_id
      and player.active = true
      and not v_has_eligibility_snapshot
    union
    select player.id, player.startgg_username
    from public.players as player
    join public.round_player_eligibility as eligibility
      on eligibility.event_id = player.event_id
     and eligibility.player_id = player.id
    where player.event_id = p_event_id
      and eligibility.round_number = v_round_number
      and v_has_eligibility_snapshot
  )
  select count(*)::integer,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', eligible.id,
               'startggUsername', eligible.startgg_username
             )
             order by lower(eligible.startgg_username), eligible.id
           ),
           '[]'::jsonb
         )
    into v_eligible_count, v_eligible_players
  from eligible;

  if v_eligible_count < 1 then
    raise exception 'At least one eligible active player is required before voting opens.';
  end if;

  insert into public.round_player_eligibility (
    id,
    event_id,
    round_number,
    player_id,
    active_at_round_start,
    added_by_admin_action_id,
    reason,
    added_at,
    created_at
  )
  select
    gen_random_uuid(),
    p_event_id,
    v_round_number,
    player.id,
    true,
    null,
    'Captured when voting opened.',
    v_now,
    v_now
  from jsonb_array_elements(v_eligible_players) as eligible(value)
  join public.players as player
    on player.event_id = p_event_id
   and player.id::text = eligible.value->>'id'
  on conflict (event_id, round_number, player_id) do nothing;

  v_closes_at := v_now + interval '10 minutes';

  insert into public.voting_windows (
    event_id,
    round_number,
    status,
    eligible_players,
    opened_at,
    closes_at,
    closed_at,
    extension_used,
    final_warning_started_at,
    paused_at,
    paused_from_status,
    remaining_seconds_at_pause,
    remaining_ms_when_paused,
    created_at,
    updated_at
  )
  values (
    p_event_id,
    v_round_number,
    'voting_open',
    v_eligible_players,
    v_now,
    v_closes_at,
    null,
    false,
    null,
    null,
    null,
    null,
    null,
    v_now,
    v_now
  );

  if not v_has_eligibility_snapshot then
    insert into public.round_player_eligibility (
      event_id,
      round_number,
      player_id,
      active_at_round_start,
      created_at
    )
    select
      p_event_id,
      v_round_number,
      player.id,
      true,
      v_now
    from public.players as player
    where player.event_id = p_event_id
      and player.active = true
    on conflict (event_id, round_number, player_id) do nothing;
  end if;

  insert into public.admin_actions (
    id,
    event_id,
    admin_session_id,
    mutation_request_id,
    action_type,
    action_summary,
    requires_password_reentry,
    created_at,
    metadata
  )
  values (
    v_admin_action_id,
    p_event_id,
    v_admin_session_id,
    v_request_id,
    'open_voting',
    format('Opened voting for Round %s.', v_round_number),
    false,
    v_now,
    jsonb_build_object(
      'requestId', v_request_id,
      'roundNumber', v_round_number,
      'eligibleCount', v_eligible_count,
      'tournamentChanging', true,
      'source', 'normalized_open_voting_window'
    )
  );

  v_projection := public.normalized_refresh_public_state_generation(
    p_event_id,
    v_round_number,
    'voting_opened',
    'voting_open',
    null,
    v_now
  );

  return jsonb_build_object(
    'committed', true,
    'requestId', v_request_id,
    'roundNumber', v_round_number,
    'generation', v_projection.generation,
    'transitionKind', 'voting_opened',
    'status', 'voting_open',
    'openedAt', v_now,
    'closesAt', v_closes_at,
    'eligibleCount', v_eligible_count,
    'adminActionId', v_admin_action_id
  );
end;
$$;

revoke all on function public.normalized_open_voting_window(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_open_voting_window(text, jsonb) to service_role;

alter function public.normalized_submit_ballot(text, jsonb)
  rename to normalized_submit_ballot_without_phase1_generation_20260713;

revoke all on function
  public.normalized_submit_ballot_without_phase1_generation_20260713(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.normalized_submit_ballot(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_number smallint;
  v_expected_generation bigint;
  v_now timestamptz;
  v_projection public.public_state_generations%rowtype;
  v_result jsonb;
  v_ballot_id uuid;
  v_eligible_count integer;
  v_submitted_count integer;
  v_window public.voting_windows%rowtype;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if coalesce(jsonb_typeof(p_payload), '') <> 'object' then
    raise exception 'p_payload must be an object';
  end if;

  v_round_number := (p_payload->>'roundNumber')::smallint;
  v_expected_generation := (p_payload->>'expectedGeneration')::bigint;

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_expected_generation is not null and v_expected_generation < 0 then
    raise exception 'expectedGeneration must be a nonnegative integer when provided';
  end if;

  -- The same transaction lock is used by rerolls. A ballot either commits
  -- entirely before a reroll (and is invalidated by it) or validates the newer
  -- generation/draws after the reroll; it cannot commit late against old draws.
  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );

  v_now := public.normalized_database_time();

  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  -- The immediately previous application build did not send a generation.
  -- Service-role-only legacy calls use the generation locked in this same
  -- transaction; current code always supplies and compares an explicit value.
  v_expected_generation := coalesce(v_expected_generation, v_projection.generation);

  if v_projection.generation <> v_expected_generation then
    raise exception 'The ballot draw changed before submission. Expected generation %, found %.',
      v_expected_generation,
      v_projection.generation;
  end if;

  v_result := public.normalized_submit_ballot_without_phase1_generation_20260713(
    p_event_id,
    p_payload - 'expectedGeneration'
  );

  v_ballot_id := (v_result->>'ballotId')::uuid;

  if v_ballot_id is null then
    raise exception 'Ballot submission did not return a committed ballot id.';
  end if;

  -- A valid post-reroll resubmission becomes active again. The previous RPC
  -- updated the ballot but left these fields populated, silently excluding the
  -- new revision from result counts.
  update public.ballots
  set invalidated_at = null,
      invalidated_by_admin_action_id = null,
      invalidation_reason = null,
      updated_at = v_now
  where event_id = p_event_id
    and id = v_ballot_id
    and round_number = v_round_number;

  if not found then
    raise exception 'Committed ballot could not be activated for this round.';
  end if;

  select count(*)::integer
    into v_eligible_count
  from public.round_player_eligibility as eligibility
  where eligibility.event_id = p_event_id
    and eligibility.round_number = v_round_number;

  select count(distinct ballot.player_id)::integer
    into v_submitted_count
  from public.ballots as ballot
  join public.round_player_eligibility as eligibility
    on eligibility.event_id = ballot.event_id
   and eligibility.round_number = ballot.round_number
   and eligibility.player_id = ballot.player_id
  where ballot.event_id = p_event_id
    and ballot.round_number = v_round_number
    and ballot.submitted = true
    and ballot.invalidated_at is null;

  select *
    into v_window
  from public.voting_windows as voting_window
  where voting_window.event_id = p_event_id
    and voting_window.round_number = v_round_number
  for update;

  if not found then
    raise exception 'Voting window state disappeared during ballot submission.';
  end if;

  if v_eligible_count > 0
     and v_submitted_count >= v_eligible_count
     and v_window.status in ('voting_open', 'extension_1_minute')
     and (v_window.closes_at is null or v_now < v_window.closes_at) then
    update public.voting_windows
    set status = 'final_30_seconds',
        final_warning_started_at = coalesce(final_warning_started_at, v_now),
        closes_at = v_now + interval '30 seconds',
        updated_at = v_now
    where event_id = p_event_id
      and round_number = v_round_number
    returning * into v_window;
  end if;

  if v_projection.voting_status is distinct from v_window.status
     or v_projection.voting_closes_at is distinct from v_window.closes_at then
    v_projection := public.normalized_refresh_public_state_generation(
      p_event_id,
      v_round_number,
      case
        when v_window.status = 'final_30_seconds' then 'voting_final_warning'
        else 'ballot_window_updated'
      end,
      'voting_open',
      null,
      v_now
    );
  end if;

  return v_result || jsonb_build_object(
    'submittedCount', v_submitted_count,
    'eligibleCount', v_eligible_count,
    'status', v_window.status,
    'generation', v_projection.generation
  );
end;
$$;

revoke all on function public.normalized_submit_ballot(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_submit_ballot(text, jsonb) to service_role;

-- Keep deadline-driven status changes and explicit close in the same public
-- generation as their authoritative voting-window rows.
alter function public.normalized_manual_ballot_override(text, jsonb)
  rename to normalized_manual_ballot_pre_phase1_20260713;

revoke all on function public.normalized_manual_ballot_pre_phase1_20260713(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.normalized_manual_ballot_override(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_number smallint := (coalesce(p_payload, '{}'::jsonb)->>'roundNumber')::smallint;
  v_now timestamptz;
  v_result jsonb;
  v_projection public.public_state_generations%rowtype;
  v_window_status text;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_round_number is null or v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );
  v_now := public.normalized_database_time();
  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );
  v_result := public.normalized_manual_ballot_pre_phase1_20260713(p_event_id, p_payload);

  select voting_window.status
    into v_window_status
  from public.voting_windows as voting_window
  where voting_window.event_id = p_event_id
    and voting_window.round_number = v_round_number;

  v_now := public.normalized_database_time();
  v_projection := public.normalized_refresh_public_state_generation(
    p_event_id,
    v_round_number,
    'manual_ballot_override',
    case
      when v_window_status in ('voting_closed', 'results_computed', 'results_revealing')
        then 'closed_revealing'
      else 'voting_open'
    end,
    null,
    v_now
  );

  return v_result || jsonb_build_object(
    'generation', v_projection.generation,
    'transitionKind', 'manual_ballot_override'
  );
end;
$$;

revoke all on function public.normalized_manual_ballot_override(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_manual_ballot_override(text, jsonb) to service_role;

alter function public.normalized_advance_voting_timer(text, jsonb)
  rename to normalized_advance_timer_pre_phase1_20260713;

revoke all on function
  public.normalized_advance_timer_pre_phase1_20260713(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.normalized_advance_voting_timer(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_number smallint := (coalesce(p_payload, '{}'::jsonb)->>'roundNumber')::smallint;
  v_now timestamptz;
  v_result jsonb;
  v_projection public.public_state_generations%rowtype;
  v_window public.voting_windows%rowtype;
  v_transition_kind text;
  v_phone_release_state text;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_round_number is null or v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );
  v_now := public.normalized_database_time();
  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  v_result := public.normalized_advance_timer_pre_phase1_20260713(
    p_event_id,
    p_payload
  );

  if coalesce((v_result->>'changed')::boolean, false) then
    select *
      into strict v_window
    from public.voting_windows as voting_window
    where voting_window.event_id = p_event_id
      and voting_window.round_number = v_round_number;

    v_transition_kind := case v_window.status
      when 'extension_1_minute' then 'voting_extended'
      when 'final_30_seconds' then 'voting_final_warning'
      when 'voting_closed' then 'voting_closed'
      else 'voting_timer_updated'
    end;
    v_phone_release_state := case
      when v_window.status = 'voting_closed' then 'closed_revealing'
      else 'voting_open'
    end;
    v_now := public.normalized_database_time();
    v_projection := public.normalized_refresh_public_state_generation(
      p_event_id,
      v_round_number,
      v_transition_kind,
      v_phone_release_state,
      null,
      v_now
    );
  end if;

  return v_result || jsonb_build_object(
    'generation', v_projection.generation,
    'transitionKind', v_projection.transition_kind
  );
end;
$$;

revoke all on function public.normalized_advance_voting_timer(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_advance_voting_timer(text, jsonb) to service_role;

alter function public.normalized_close_voting_window(text, jsonb)
  rename to normalized_close_window_pre_phase1_20260713;

revoke all on function
  public.normalized_close_window_pre_phase1_20260713(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.normalized_close_voting_window(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_number smallint := (coalesce(p_payload, '{}'::jsonb)->>'roundNumber')::smallint;
  v_now timestamptz;
  v_result jsonb;
  v_projection public.public_state_generations%rowtype;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_round_number is null or v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );
  v_now := public.normalized_database_time();
  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );
  v_result := public.normalized_close_window_pre_phase1_20260713(
    p_event_id,
    p_payload
  );
  v_now := public.normalized_database_time();
  v_projection := public.normalized_refresh_public_state_generation(
    p_event_id,
    v_round_number,
    'voting_closed',
    'closed_revealing',
    null,
    v_now
  );

  return v_result || jsonb_build_object(
    'generation', v_projection.generation,
    'transitionKind', 'voting_closed'
  );
end;
$$;

revoke all on function public.normalized_close_voting_window(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_close_voting_window(text, jsonb) to service_role;

-- Pause and resume must publish the exact voting-window state in the same
-- transaction. The previous application persisted these through independent
-- REST writes, which could leave public_state_generations behind the window.
create or replace function public.normalized_pause_voting_window(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid := (p_payload->>'requestId')::uuid;
  v_round_number smallint := (p_payload->>'roundNumber')::smallint;
  v_admin_session_id uuid := (p_payload->>'adminSessionId')::uuid;
  v_host_token_hash text := nullif(p_payload->>'hostTokenHash', '');
  v_expected_generation bigint := (p_payload->>'expectedGeneration')::bigint;
  v_now timestamptz;
  v_projection public.public_state_generations%rowtype;
  v_window public.voting_windows%rowtype;
  v_remaining_ms integer;
  v_admin_action_id uuid := gen_random_uuid();
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_request_id is null then
    raise exception 'requestId is required';
  end if;

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_expected_generation is null or v_expected_generation < 0 then
    raise exception 'expectedGeneration must be a nonnegative integer';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );
  v_now := public.normalized_database_time();

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  if v_projection.generation <> v_expected_generation then
    raise exception 'Public state changed before voting could pause. Expected generation %, found %.',
      v_expected_generation,
      v_projection.generation;
  end if;

  if exists (
    select 1
    from public.admin_actions as action
    where action.event_id = p_event_id
      and action.mutation_request_id = v_request_id
  ) then
    raise exception 'requestId has already been committed for this event';
  end if;

  v_window := public.normalized_apply_voting_deadline_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  if v_window.status not in ('voting_open', 'final_30_seconds', 'extension_1_minute') then
    raise exception 'Voting can only be paused while submissions are open.';
  end if;

  if v_window.closes_at is null then
    raise exception 'Open voting must have a deadline before it can be paused.';
  end if;

  v_remaining_ms := greatest(
    0,
    floor(extract(epoch from (v_window.closes_at - v_now)) * 1000)::integer
  );

  update public.voting_windows
  set status = 'voting_paused',
      paused_at = v_now,
      paused_from_status = v_window.status,
      remaining_seconds_at_pause = ceil(v_remaining_ms::numeric / 1000)::integer,
      remaining_ms_when_paused = v_remaining_ms,
      closes_at = null,
      updated_at = v_now
  where event_id = p_event_id
    and round_number = v_round_number
  returning * into strict v_window;

  insert into public.admin_actions (
    id,
    event_id,
    admin_session_id,
    mutation_request_id,
    action_type,
    action_summary,
    requires_password_reentry,
    created_at,
    metadata
  )
  values (
    v_admin_action_id,
    p_event_id,
    v_admin_session_id,
    v_request_id,
    'pause_voting',
    format('Paused voting for Round %s.', v_round_number),
    false,
    v_now,
    jsonb_build_object(
      'requestId', v_request_id,
      'roundNumber', v_round_number,
      'pausedFromStatus', v_window.paused_from_status,
      'remainingMsWhenPaused', v_remaining_ms,
      'tournamentChanging', true,
      'source', 'normalized_pause_voting_window'
    )
  );

  v_projection := public.normalized_refresh_public_state_generation(
    p_event_id,
    v_round_number,
    'voting_paused',
    'voting_open',
    null,
    v_now
  );

  return jsonb_build_object(
    'committed', true,
    'requestId', v_request_id,
    'roundNumber', v_round_number,
    'generation', v_projection.generation,
    'transitionKind', 'voting_paused',
    'status', v_window.status,
    'pausedAt', v_window.paused_at,
    'pausedFromStatus', v_window.paused_from_status,
    'remainingMsWhenPaused', v_window.remaining_ms_when_paused,
    'adminActionId', v_admin_action_id
  );
end;
$$;

revoke all on function public.normalized_pause_voting_window(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_pause_voting_window(text, jsonb) to service_role;

create or replace function public.normalized_resume_voting_window(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid := (p_payload->>'requestId')::uuid;
  v_round_number smallint := (p_payload->>'roundNumber')::smallint;
  v_admin_session_id uuid := (p_payload->>'adminSessionId')::uuid;
  v_host_token_hash text := nullif(p_payload->>'hostTokenHash', '');
  v_expected_generation bigint := (p_payload->>'expectedGeneration')::bigint;
  v_now timestamptz;
  v_projection public.public_state_generations%rowtype;
  v_window public.voting_windows%rowtype;
  v_resume_status text;
  v_remaining_ms integer;
  v_closes_at timestamptz;
  v_admin_action_id uuid := gen_random_uuid();
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_request_id is null then
    raise exception 'requestId is required';
  end if;

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_expected_generation is null or v_expected_generation < 0 then
    raise exception 'expectedGeneration must be a nonnegative integer';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase1:' || p_event_id || ':' || v_round_number::text, 0)
  );
  v_now := public.normalized_database_time();

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  if v_projection.generation <> v_expected_generation then
    raise exception 'Public state changed before voting could resume. Expected generation %, found %.',
      v_expected_generation,
      v_projection.generation;
  end if;

  if exists (
    select 1
    from public.admin_actions as action
    where action.event_id = p_event_id
      and action.mutation_request_id = v_request_id
  ) then
    raise exception 'requestId has already been committed for this event';
  end if;

  select *
    into v_window
  from public.voting_windows as voting_window
  where voting_window.event_id = p_event_id
    and voting_window.round_number = v_round_number
  for update;

  if not found then
    raise exception 'Voting has not opened for this round.';
  end if;

  v_resume_status := v_window.paused_from_status;
  v_remaining_ms := coalesce(
    v_window.remaining_ms_when_paused,
    v_window.remaining_seconds_at_pause * 1000
  );

  if v_window.status <> 'voting_paused'
     or v_resume_status is null
     or v_resume_status not in ('voting_open', 'final_30_seconds', 'extension_1_minute')
     or v_remaining_ms is null then
    raise exception 'Voting is not paused.';
  end if;

  v_closes_at := v_now + make_interval(secs => v_remaining_ms::double precision / 1000);

  update public.voting_windows
  set status = v_resume_status,
      closes_at = v_closes_at,
      paused_at = null,
      paused_from_status = null,
      remaining_seconds_at_pause = null,
      remaining_ms_when_paused = null,
      updated_at = v_now
  where event_id = p_event_id
    and round_number = v_round_number
  returning * into strict v_window;

  insert into public.admin_actions (
    id,
    event_id,
    admin_session_id,
    mutation_request_id,
    action_type,
    action_summary,
    requires_password_reentry,
    created_at,
    metadata
  )
  values (
    v_admin_action_id,
    p_event_id,
    v_admin_session_id,
    v_request_id,
    'resume_voting',
    format('Resumed voting for Round %s.', v_round_number),
    false,
    v_now,
    jsonb_build_object(
      'requestId', v_request_id,
      'roundNumber', v_round_number,
      'resumedStatus', v_resume_status,
      'closesAt', v_closes_at,
      'tournamentChanging', true,
      'source', 'normalized_resume_voting_window'
    )
  );

  v_projection := public.normalized_refresh_public_state_generation(
    p_event_id,
    v_round_number,
    'voting_resumed',
    'voting_open',
    null,
    v_now
  );

  return jsonb_build_object(
    'committed', true,
    'requestId', v_request_id,
    'roundNumber', v_round_number,
    'generation', v_projection.generation,
    'transitionKind', 'voting_resumed',
    'status', v_window.status,
    'closesAt', v_window.closes_at,
    'adminActionId', v_admin_action_id
  );
end;
$$;

revoke all on function public.normalized_resume_voting_window(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_resume_voting_window(text, jsonb) to service_role;

notify pgrst, 'reload schema';
