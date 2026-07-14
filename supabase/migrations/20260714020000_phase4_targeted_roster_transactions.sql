-- Phase 4 production-readiness remediation: targeted, host-authorized roster
-- mutations and a sanitized monotonic invalidation generation.

create table if not exists public.event_invalidation_generations (
  event_id text not null,
  scope text not null,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (event_id, scope),
  constraint event_invalidation_generations_event_id_not_blank
    check (length(trim(event_id)) > 0),
  constraint event_invalidation_generations_scope_not_blank
    check (length(trim(scope)) > 0),
  constraint event_invalidation_generations_version_nonnegative
    check (version >= 0)
);

comment on table public.event_invalidation_generations is
  'Browser-readable invalidation metadata only: event id, state scope, monotonic version, and timestamp. Never store roster or secret payloads here.';

alter table public.event_invalidation_generations enable row level security;

revoke all on table public.event_invalidation_generations from public, anon, authenticated;
grant select on table public.event_invalidation_generations to anon, authenticated;
grant select, insert, update, delete on table public.event_invalidation_generations to service_role;

drop policy if exists event_invalidation_generations_browser_read
  on public.event_invalidation_generations;
create policy event_invalidation_generations_browser_read
  on public.event_invalidation_generations
  for select
  to anon, authenticated
  using (true);

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_invalidation_generations'
  ) then
    alter publication supabase_realtime
      add table public.event_invalidation_generations;
  end if;
end;
$$;

create or replace function public.normalized_read_roster_version(p_event_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'eventId', p_event_id,
    'scope', 'roster',
    'version', coalesce(invalidation.version, 0),
    'updatedAt', coalesce(
      invalidation.updated_at,
      '1970-01-01 00:00:00+00'::timestamptz
    )
  )
  from (select 1) as singleton
  left join public.event_invalidation_generations as invalidation
    on invalidation.event_id = p_event_id
   and invalidation.scope = 'roster';
$$;

revoke all on function public.normalized_read_roster_version(text)
  from public, anon, authenticated;
grant execute on function public.normalized_read_roster_version(text) to service_role;

-- Participate in the legacy normalized event-persistence lease from inside the
-- roster transaction. This preserves coordination with the remaining broad
-- add/import paths without adding acquire/release network round trips.
create or replace function public.normalized_acquire_phase4_event_lock(
  p_event_id text,
  p_lock_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acquired boolean;
  v_deadline timestamptz := clock_timestamp() + interval '35 seconds';
begin
  loop
    v_acquired := public.normalized_acquire_event_persistence_lock(
      p_event_id,
      p_lock_token,
      clock_timestamp() + interval '30 seconds'
    );

    if v_acquired then
      return;
    end if;

    if clock_timestamp() >= v_deadline then
      raise exception 'Timed out waiting for the normalized runtime event lock.';
    end if;

    perform pg_sleep(0.05);
  end loop;
end;
$$;

revoke all on function public.normalized_acquire_phase4_event_lock(text, text)
  from public, anon, authenticated, service_role;

create or replace function public.normalized_rename_roster_player(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_request_id uuid := (v_payload->>'requestId')::uuid;
  v_event_lock_token text := gen_random_uuid()::text;
  v_admin_session_id uuid := (v_payload->>'adminSessionId')::uuid;
  v_host_token_hash text := coalesce(v_payload->>'hostTokenHash', '');
  v_expected_version bigint := (v_payload->>'expectedVersion')::bigint;
  v_player_id uuid := (v_payload->>'playerId')::uuid;
  v_expected_updated_at timestamptz := (v_payload->>'expectedUpdatedAt')::timestamptz;
  v_startgg_username text := trim(coalesce(v_payload->>'startggUsername', ''));
  v_startgg_username_normalized text := trim(
    coalesce(v_payload->>'startggUsernameNormalized', '')
  );
  v_computed_normalized text;
  v_request_fingerprint text;
  v_existing_action public.admin_actions%rowtype;
  v_existing_fingerprint text;
  v_existing_result jsonb;
  v_player public.players%rowtype;
  v_now timestamptz;
  v_current_version bigint;
  v_changed boolean;
  v_active_count integer;
  v_admin_action_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_request_id is null then
    raise exception 'requestId is required';
  end if;

  if v_admin_session_id is null then
    raise exception 'adminSessionId is required';
  end if;

  if v_host_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'hostTokenHash must be a lowercase SHA-256 hex digest';
  end if;

  if v_expected_version is null or v_expected_version < 0 then
    raise exception 'expectedVersion must be a nonnegative integer';
  end if;

  if v_player_id is null then
    raise exception 'playerId is required';
  end if;

  if v_expected_updated_at is null then
    raise exception 'expectedUpdatedAt is required';
  end if;

  if length(v_startgg_username) = 0 then
    raise exception 'start.gg username is required.';
  end if;

  if length(v_startgg_username) > 100 then
    raise exception 'start.gg username must be 100 characters or fewer.';
  end if;

  v_computed_normalized := lower(
    regexp_replace(v_startgg_username, '[[:space:]]+', ' ', 'g')
  );

  if length(v_startgg_username_normalized) = 0
     or v_startgg_username_normalized <> v_computed_normalized then
    raise exception 'startggUsernameNormalized does not match the normalized username';
  end if;

  v_request_fingerprint := encode(
    extensions.digest(
      jsonb_build_object(
        'mutation', 'normalized_rename_roster_player',
        'expectedVersion', v_expected_version,
        'playerId', v_player_id,
        'expectedUpdatedAt', v_expected_updated_at,
        'startggUsername', v_startgg_username,
        'startggUsernameNormalized', v_startgg_username_normalized
      )::text,
      'sha256'
    ),
    'hex'
  );

  perform public.normalized_acquire_phase4_event_lock(p_event_id, v_event_lock_token);
  perform pg_advisory_xact_lock(
    hashtextextended('phase4:roster:' || p_event_id, 0)
  );
  v_now := public.normalized_database_time();

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  select action.*
    into v_existing_action
  from public.admin_actions as action
  where action.event_id = p_event_id
    and action.mutation_request_id = v_request_id;

  if found then
    v_existing_fingerprint := v_existing_action.metadata
      #>> '{phase4,requestFingerprint}';
    v_existing_result := v_existing_action.metadata
      #> '{phase4,response}';

    if v_existing_action.action_type <> 'roster_username_edit'
       or v_existing_fingerprint is distinct from v_request_fingerprint
       or v_existing_result is null then
      raise exception 'requestId has already been used with a different mutation payload';
    end if;

    perform public.normalized_release_event_persistence_lock(
      p_event_id,
      v_event_lock_token
    );
    return v_existing_result;
  end if;

  insert into public.event_invalidation_generations (
    event_id,
    scope,
    version,
    updated_at
  ) values (
    p_event_id,
    'roster',
    0,
    v_now
  )
  on conflict (event_id, scope) do nothing;

  select invalidation.version
    into v_current_version
  from public.event_invalidation_generations as invalidation
  where invalidation.event_id = p_event_id
    and invalidation.scope = 'roster'
  for update;

  if v_current_version is distinct from v_expected_version then
    raise exception 'Roster version changed before rename. Expected %, found %.',
      v_expected_version,
      v_current_version;
  end if;

  select player.*
    into v_player
  from public.players as player
  where player.event_id = p_event_id
    and player.id = v_player_id
  for update;

  if not found then
    raise exception 'Roster player was not found for this event.';
  end if;

  if v_player.updated_at is distinct from v_expected_updated_at then
    raise exception 'Roster player changed before rename.';
  end if;

  v_changed := v_player.startgg_username is distinct from v_startgg_username
    or v_player.startgg_username_normalized is distinct from v_startgg_username_normalized;

  if v_player.has_tournament_history and v_changed then
    raise exception 'Cannot edit a start.gg username after tournament history exists.';
  end if;

  if v_player.active and exists (
    select 1
    from public.players as duplicate_player
    where duplicate_player.event_id = p_event_id
      and duplicate_player.id <> v_player_id
      and duplicate_player.active = true
      and duplicate_player.startgg_username_normalized = v_startgg_username_normalized
  ) then
    raise exception 'Active start.gg username already exists: %', v_startgg_username;
  end if;

  if v_changed then
    update public.players
    set startgg_username = v_startgg_username,
        startgg_username_normalized = v_startgg_username_normalized,
        updated_at = v_now
    where event_id = p_event_id
      and id = v_player_id
    returning * into strict v_player;

    update public.event_invalidation_generations
    set version = version + 1,
        updated_at = v_now
    where event_id = p_event_id
      and scope = 'roster'
    returning version into strict v_current_version;
  end if;

  select count(*)::integer
    into v_active_count
  from public.players as player
  where player.event_id = p_event_id
    and player.active = true;

  v_result := jsonb_build_object(
    'requestId', v_request_id,
    'scope', 'roster',
    'version', v_current_version,
    'changed', v_changed,
    'activeCount', v_active_count,
    'adminActionId', v_admin_action_id,
    'player', jsonb_build_object(
      'id', v_player.id,
      'startggUsername', v_player.startgg_username,
      'normalizedUsername', v_player.startgg_username_normalized,
      'active', v_player.active,
      'hasTournamentHistory', v_player.has_tournament_history,
      'createdAt', v_player.created_at,
      'updatedAt', v_player.updated_at
    )
  );

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
  ) values (
    v_admin_action_id,
    p_event_id,
    v_admin_session_id,
    v_request_id,
    'roster_username_edit',
    case
      when v_changed then 'Edited start.gg username to ' || v_player.startgg_username || '.'
      else 'Roster username rename request made no changes.'
    end,
    null,
    false,
    v_now,
    jsonb_build_object(
      'metadata', jsonb_build_object('changed', v_changed),
      'affectedRecords', jsonb_build_array(
        jsonb_build_object('type', 'player', 'id', v_player.id)
      ),
      'dangerous', false,
      'tournamentChanging', v_changed,
      'phase4', jsonb_build_object(
        'requestFingerprint', v_request_fingerprint,
        'response', v_result
      )
    )
  );

  perform public.normalized_release_event_persistence_lock(
    p_event_id,
    v_event_lock_token
  );
  return v_result;
end;
$$;

revoke execute on function public.normalized_rename_roster_player(text, jsonb) from public, anon, authenticated;
grant execute on function public.normalized_rename_roster_player(text, jsonb) to service_role;

create or replace function public.normalized_set_roster_player_active_states(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_changes jsonb := v_payload->'changes';
  v_request_id uuid := (v_payload->>'requestId')::uuid;
  v_event_lock_token text := gen_random_uuid()::text;
  v_admin_session_id uuid := (v_payload->>'adminSessionId')::uuid;
  v_host_token_hash text := coalesce(v_payload->>'hostTokenHash', '');
  v_expected_version bigint := (v_payload->>'expectedVersion')::bigint;
  v_request_fingerprint text;
  v_existing_action public.admin_actions%rowtype;
  v_existing_fingerprint text;
  v_existing_result jsonb;
  v_now timestamptz;
  v_current_version bigint;
  v_change_count integer;
  v_target_count integer;
  v_changed_player_ids uuid[] := array[]::uuid[];
  v_changed_count integer;
  v_active_count integer;
  v_canonical_players jsonb;
  v_admin_action_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_request_id is null then
    raise exception 'requestId is required';
  end if;

  if v_admin_session_id is null then
    raise exception 'adminSessionId is required';
  end if;

  if v_host_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'hostTokenHash must be a lowercase SHA-256 hex digest';
  end if;

  if v_expected_version is null or v_expected_version < 0 then
    raise exception 'expectedVersion must be a nonnegative integer';
  end if;

  if v_changes is null or jsonb_typeof(v_changes) is distinct from 'array' then
    raise exception 'changes must be an array';
  end if;

  v_change_count := jsonb_array_length(v_changes);

  if v_change_count < 1 or v_change_count > 100 then
    raise exception 'changes must include between 1 and 100 players';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_changes) as change(value)
    where jsonb_typeof(change.value) <> 'object'
      or coalesce(change.value->>'playerId', '') = ''
      or jsonb_typeof(change.value->'active') is distinct from 'boolean'
      or coalesce(change.value->>'expectedUpdatedAt', '') = ''
  ) then
    raise exception 'Each status change requires playerId, boolean active, and expectedUpdatedAt';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_changes) as change(value)
    group by (change.value->>'playerId')::uuid
    having count(*) > 1
  ) then
    raise exception 'changes contains a duplicate playerId';
  end if;

  v_request_fingerprint := encode(
    extensions.digest(
      jsonb_build_object(
        'mutation', 'normalized_set_roster_player_active_states',
        'expectedVersion', v_expected_version,
        'changes', (
          select jsonb_agg(
            jsonb_build_object(
              'playerId', change.value->>'playerId',
              'active', (change.value->>'active')::boolean,
              'expectedUpdatedAt', (change.value->>'expectedUpdatedAt')::timestamptz
            )
            order by change.ordinality
          )
          from jsonb_array_elements(v_changes) with ordinality as change(value, ordinality)
        )
      )::text,
      'sha256'
    ),
    'hex'
  );

  perform public.normalized_acquire_phase4_event_lock(p_event_id, v_event_lock_token);
  perform pg_advisory_xact_lock(
    hashtextextended('phase4:roster:' || p_event_id, 0)
  );
  v_now := public.normalized_database_time();

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  select action.*
    into v_existing_action
  from public.admin_actions as action
  where action.event_id = p_event_id
    and action.mutation_request_id = v_request_id;

  if found then
    v_existing_fingerprint := v_existing_action.metadata
      #>> '{phase4,requestFingerprint}';
    v_existing_result := v_existing_action.metadata
      #> '{phase4,response}';

    if v_existing_action.action_type <> 'roster_active_status_update'
       or v_existing_fingerprint is distinct from v_request_fingerprint
       or v_existing_result is null then
      raise exception 'requestId has already been used with a different mutation payload';
    end if;

    perform public.normalized_release_event_persistence_lock(
      p_event_id,
      v_event_lock_token
    );
    return v_existing_result;
  end if;

  insert into public.event_invalidation_generations (
    event_id,
    scope,
    version,
    updated_at
  ) values (
    p_event_id,
    'roster',
    0,
    v_now
  )
  on conflict (event_id, scope) do nothing;

  select invalidation.version
    into v_current_version
  from public.event_invalidation_generations as invalidation
  where invalidation.event_id = p_event_id
    and invalidation.scope = 'roster'
  for update;

  if v_current_version is distinct from v_expected_version then
    raise exception 'Roster version changed before status update. Expected %, found %.',
      v_expected_version,
      v_current_version;
  end if;

  perform 1
  from public.players as player
  join jsonb_array_elements(v_changes) as change(value)
    on player.id = (change.value->>'playerId')::uuid
  where player.event_id = p_event_id
  order by player.id
  for update of player;

  select count(*)::integer
    into v_target_count
  from public.players as player
  join jsonb_array_elements(v_changes) as change(value)
    on player.id = (change.value->>'playerId')::uuid
  where player.event_id = p_event_id;

  if v_target_count <> v_change_count then
    raise exception 'One or more roster players were not found for this event.';
  end if;

  if exists (
    select 1
    from public.players as player
    join jsonb_array_elements(v_changes) as change(value)
      on player.id = (change.value->>'playerId')::uuid
    where player.event_id = p_event_id
      and player.updated_at is distinct from
        (change.value->>'expectedUpdatedAt')::timestamptz
  ) then
    raise exception 'One or more roster players changed before the status update.';
  end if;

  if exists (
    with desired_states as (
      select
        (change.value->>'playerId')::uuid as player_id,
        (change.value->>'active')::boolean as active
      from jsonb_array_elements(v_changes) as change(value)
    ), final_active_names as (
      select player.startgg_username_normalized
      from public.players as player
      left join desired_states as desired
        on desired.player_id = player.id
      where player.event_id = p_event_id
        and coalesce(desired.active, player.active) = true
    )
    select 1
    from final_active_names
    group by startgg_username_normalized
    having count(*) > 1
  ) then
    raise exception 'The requested active roster contains duplicate start.gg usernames.';
  end if;

  select coalesce(array_agg(player.id order by change.ordinality), array[]::uuid[])
    into v_changed_player_ids
  from jsonb_array_elements(v_changes) with ordinality as change(value, ordinality)
  join public.players as player
    on player.id = (change.value->>'playerId')::uuid
   and player.event_id = p_event_id
  where player.active is distinct from (change.value->>'active')::boolean;

  v_changed_count := cardinality(v_changed_player_ids);

  if v_changed_count > 0 then
    update public.players as player
    set active = (change.value->>'active')::boolean,
        updated_at = v_now
    from jsonb_array_elements(v_changes) as change(value)
    where player.event_id = p_event_id
      and player.id = (change.value->>'playerId')::uuid
      and player.active is distinct from (change.value->>'active')::boolean;

    update public.event_invalidation_generations
    set version = version + 1,
        updated_at = v_now
    where event_id = p_event_id
      and scope = 'roster'
    returning version into strict v_current_version;
  end if;

  select count(*)::integer
    into v_active_count
  from public.players as player
  where player.event_id = p_event_id
    and player.active = true;

  select jsonb_agg(
    jsonb_build_object(
      'id', player.id,
      'startggUsername', player.startgg_username,
      'normalizedUsername', player.startgg_username_normalized,
      'active', player.active,
      'hasTournamentHistory', player.has_tournament_history,
      'createdAt', player.created_at,
      'updatedAt', player.updated_at
    )
    order by change.ordinality
  )
    into v_canonical_players
  from jsonb_array_elements(v_changes) with ordinality as change(value, ordinality)
  join public.players as player
    on player.id = (change.value->>'playerId')::uuid
   and player.event_id = p_event_id;

  v_result := jsonb_build_object(
    'requestId', v_request_id,
    'scope', 'roster',
    'version', v_current_version,
    'changed', v_changed_count > 0,
    'changedPlayerIds', to_jsonb(v_changed_player_ids),
    'activeCount', v_active_count,
    'adminActionId', v_admin_action_id,
    'players', coalesce(v_canonical_players, '[]'::jsonb)
  );

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
  ) values (
    v_admin_action_id,
    p_event_id,
    v_admin_session_id,
    v_request_id,
    'roster_active_status_update',
    case
      when v_changed_count > 0 then
        'Updated active state for ' || v_changed_count::text || ' roster player(s).'
      else 'Roster active-state request made no changes.'
    end,
    null,
    false,
    v_now,
    jsonb_build_object(
      'metadata', jsonb_build_object(
        'changed', v_changed_count > 0,
        'changedPlayerCount', v_changed_count
      ),
      'affectedRecords', (
        select coalesce(
          jsonb_agg(jsonb_build_object('type', 'player', 'id', player_id)),
          '[]'::jsonb
        )
        from unnest(v_changed_player_ids) as player_id
      ),
      'dangerous', false,
      'tournamentChanging', v_changed_count > 0,
      'phase4', jsonb_build_object(
        'requestFingerprint', v_request_fingerprint,
        'response', v_result
      )
    )
  );

  perform public.normalized_release_event_persistence_lock(
    p_event_id,
    v_event_lock_token
  );
  return v_result;
end;
$$;

revoke execute on function public.normalized_set_roster_player_active_states(text, jsonb) from public, anon, authenticated;
grant execute on function public.normalized_set_roster_player_active_states(text, jsonb) to service_role;

-- Keep the existing generation-key payload backward-compatible while adding a
-- roster version for cache invalidation and light phone polling. No roster row
-- or username is returned by this read boundary.
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
  roster_generation as (
    select
      coalesce(invalidation.version, 0)::bigint as version,
      invalidation.updated_at
    from (select 1) as singleton
    left join public.event_invalidation_generations as invalidation
      on invalidation.event_id = p_event_id
     and invalidation.scope = 'roster'
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
        'rosterVersion', (select roster_generation.version from roster_generation),
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
    'rosterVersion', roster_generation.version,
    'rosterUpdatedAt', roster_generation.updated_at,
    'generationKey', current_event.current_round::text || '|' ||
      roster_generation.version::text || '|' || public_state_fingerprint.value || '|' || (
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
  cross join roster_generation
  cross join public_state_fingerprint;
$$;

revoke all on function public.normalized_read_public_generation_key(text)
  from public, anon, authenticated;
grant execute on function public.normalized_read_public_generation_key(text) to service_role;
