create or replace function public.normalized_acquire_host_lock(
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
  v_mode text := lower(trim(coalesce(v_payload->>'mode', '')));
  v_admin_session_id uuid := (v_payload->>'adminSessionId')::uuid;
  v_host_token_hash text := coalesce(v_payload->>'hostTokenHash', '');
  v_expected_host_token_hash text := coalesce(v_payload->>'expectedHostTokenHash', '');
  v_recovery_owner_session_id text := nullif(
    trim(coalesce(v_payload->>'recoveryOwnerSessionId', '')),
    ''
  );
  v_reason text := nullif(trim(coalesce(v_payload->>'reason', '')), '');
  v_now timestamptz;
  v_compatibility_expires_at constant timestamptz :=
    '9999-12-31 23:59:59.999+00'::timestamptz;
  v_lock public.host_locks%rowtype;
  v_previous_owner_session_id text;
  v_restore_owner_session_id text;
  v_next_acquired_at timestamptz;
  v_admin_action_id uuid := gen_random_uuid();
  v_outcome text;
  v_action_type text;
  v_action_summary text;
  v_requires_password_reentry boolean := false;
  v_dangerous boolean := false;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_request_id is null then
    raise exception 'requestId is required';
  end if;

  if v_mode not in ('take', 'restore', 'force') then
    raise exception 'mode must be take, restore, or force';
  end if;

  if v_admin_session_id is null then
    raise exception 'adminSessionId is required';
  end if;

  if v_host_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'hostTokenHash must be a lowercase SHA-256 hex digest';
  end if;

  if v_mode = 'force' and v_reason is null then
    raise exception 'reason is required for forced host takeover';
  end if;

  if v_mode = 'restore' and v_expected_host_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'expectedHostTokenHash is required for restore and must be a lowercase SHA-256 hex digest';
  end if;

  if v_payload ? 'recoveryOwnerSessionId'
     and v_payload->'recoveryOwnerSessionId' <> 'null'::jsonb
     and v_recovery_owner_session_id is null then
    raise exception 'recoveryOwnerSessionId must not be blank';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase3:host-lock:' || p_event_id, 0)
  );
  v_now := public.normalized_database_time();

  if not exists (
    select 1
    from public.admin_sessions as session
    where session.event_id = p_event_id
      and session.id = v_admin_session_id
      and session.revoked_at is null
      and session.expires_at > v_now
  ) then
    raise exception 'Admin session is missing, expired, or revoked.';
  end if;

  if exists (
    select 1
    from public.admin_actions as action
    where action.event_id = p_event_id
      and action.mutation_request_id = v_request_id
  ) then
    raise exception 'requestId has already been committed for this event';
  end if;

  select host_lock.*
    into v_lock
  from public.host_locks as host_lock
  where host_lock.event_id = p_event_id
    and host_lock.lock_name = 'tournament-host'
  for update;

  if found then
    v_previous_owner_session_id := coalesce(
      v_lock.owner_session_id,
      v_lock.admin_session_id::text
    );
  end if;

  if v_mode = 'take' then
    if v_lock.id is not null and v_lock.released_at is null then
      raise exception 'Host control is already owned. Use explicit forced takeover.';
    end if;

    if v_lock.id is null then
      insert into public.host_locks (
        id,
        event_id,
        lock_name,
        admin_session_id,
        owner_session_id,
        host_token_hash,
        acquired_at,
        heartbeat_at,
        expires_at,
        released_at
      )
      values (
        gen_random_uuid(),
        p_event_id,
        'tournament-host',
        v_admin_session_id,
        v_admin_session_id::text,
        v_host_token_hash,
        v_now,
        v_now,
        v_compatibility_expires_at,
        null
      )
      returning * into v_lock;
    else
      update public.host_locks
      set admin_session_id = v_admin_session_id,
          owner_session_id = v_admin_session_id::text,
          host_token_hash = v_host_token_hash,
          acquired_at = v_now,
          heartbeat_at = v_now,
          expires_at = v_compatibility_expires_at,
          released_at = null
      where id = v_lock.id
      returning * into v_lock;
    end if;

    v_outcome := 'acquired';
    v_action_type := 'host_lock_acquire';
    v_action_summary := 'Acquired host control.';
    v_previous_owner_session_id := null;
  elsif v_mode = 'restore' then
    if v_lock.id is null or v_lock.released_at is not null then
      raise exception 'There is no active host ownership to restore.';
    end if;

    v_restore_owner_session_id := coalesce(
      v_recovery_owner_session_id,
      v_admin_session_id::text
    );

    if v_previous_owner_session_id is null
       or v_restore_owner_session_id <> v_previous_owner_session_id then
      raise exception 'Recovery proof does not match the active host owner.';
    end if;

    if extensions.digest(v_lock.host_token_hash, 'sha256')
       <> extensions.digest(v_expected_host_token_hash, 'sha256') then
      raise exception 'Recovery proof is stale for the active host credential.';
    end if;

    update public.host_locks
    set admin_session_id = v_admin_session_id,
        owner_session_id = v_admin_session_id::text,
        host_token_hash = v_host_token_hash,
        heartbeat_at = v_now,
        expires_at = v_compatibility_expires_at,
        released_at = null
    where id = v_lock.id
    returning * into v_lock;

    v_outcome := 'restored';
    v_action_type := 'host_lock_restore';
    v_action_summary := 'Restored host control on the authorized host device.';
  else
    if v_lock.id is null or v_lock.released_at is not null then
      raise exception 'There is no active host ownership to force-take. Use normal Take Host Control.';
    end if;

    if v_previous_owner_session_id = v_admin_session_id::text then
      raise exception 'The current owner must use Restore instead of forced takeover.';
    end if;

    -- Preserve a strict acquisition ordering even if two serialized lifecycle
    -- transactions observe the same database clock tick.
    v_next_acquired_at := greatest(
      v_now,
      v_lock.acquired_at + interval '1 microsecond'
    );

    update public.host_locks
    set admin_session_id = v_admin_session_id,
        owner_session_id = v_admin_session_id::text,
        host_token_hash = v_host_token_hash,
        acquired_at = v_next_acquired_at,
        heartbeat_at = v_next_acquired_at,
        expires_at = v_compatibility_expires_at,
        released_at = null
    where id = v_lock.id
    returning * into v_lock;

    v_outcome := 'forced_takeover';
    v_action_type := 'host_lock_takeover';
    v_action_summary := 'Forced takeover of the active host lock.';
    v_requires_password_reentry := true;
    v_dangerous := true;
  end if;

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
    v_action_type,
    v_action_summary,
    case when v_mode = 'force' then v_reason else null end,
    v_requires_password_reentry,
    v_now,
    jsonb_build_object(
      'requestId', v_request_id,
      'mode', v_mode,
      'outcome', v_outcome,
      'previousOwnerSessionId', v_previous_owner_session_id,
      'ownerSessionId', v_lock.owner_session_id,
      'dangerous', v_dangerous,
      'tournamentChanging', false,
      'source', 'normalized_acquire_host_lock'
    )
  );

  return jsonb_build_object(
    'outcome', v_outcome,
    'ownerSessionId', v_lock.owner_session_id,
    'acquiredAt', v_lock.acquired_at,
    'heartbeatAt', v_lock.heartbeat_at,
    'expiresAt', v_lock.expires_at,
    'adminActionId', v_admin_action_id
  );
end;
$$;

create or replace function public.normalized_heartbeat_host_lock(
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
  v_admin_session_id uuid := (v_payload->>'adminSessionId')::uuid;
  v_host_token_hash text := coalesce(v_payload->>'hostTokenHash', '');
  v_now timestamptz;
  v_compatibility_expires_at constant timestamptz :=
    '9999-12-31 23:59:59.999+00'::timestamptz;
  v_lock public.host_locks%rowtype;
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

  perform pg_advisory_xact_lock(
    hashtextextended('phase3:host-lock:' || p_event_id, 0)
  );
  v_now := public.normalized_database_time();

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  select host_lock.*
    into v_lock
  from public.host_locks as host_lock
  where host_lock.event_id = p_event_id
    and host_lock.lock_name = 'tournament-host'
    and host_lock.released_at is null
  for update;

  if not found then
    raise exception 'Host control is required for this action.';
  end if;

  update public.host_locks
  set heartbeat_at = v_now,
      expires_at = v_compatibility_expires_at
  where id = v_lock.id
  returning * into v_lock;

  -- Heartbeat is health telemetry only. It deliberately creates no audit row
  -- and never changes ownership, acquisition time, or release state.
  return jsonb_build_object(
    'outcome', 'refreshed',
    'ownerSessionId', coalesce(v_lock.owner_session_id, v_lock.admin_session_id::text),
    'heartbeatAt', v_lock.heartbeat_at,
    'expiresAt', v_lock.expires_at
  );
end;
$$;

create or replace function public.normalized_release_host_lock(
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
  v_admin_session_id uuid := (v_payload->>'adminSessionId')::uuid;
  v_host_token_hash text := coalesce(v_payload->>'hostTokenHash', '');
  v_now timestamptz;
  v_lock public.host_locks%rowtype;
  v_previous_owner_session_id text;
  v_admin_action_id uuid := gen_random_uuid();
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

  perform pg_advisory_xact_lock(
    hashtextextended('phase3:host-lock:' || p_event_id, 0)
  );
  v_now := public.normalized_database_time();

  if not exists (
    select 1
    from public.admin_sessions as session
    where session.event_id = p_event_id
      and session.id = v_admin_session_id
      and session.revoked_at is null
      and session.expires_at > v_now
  ) then
    raise exception 'Admin session is missing, expired, or revoked.';
  end if;

  if exists (
    select 1
    from public.admin_actions as action
    where action.event_id = p_event_id
      and action.mutation_request_id = v_request_id
  ) then
    raise exception 'requestId has already been committed for this event';
  end if;

  perform public.normalized_assert_phase1_host(
    p_event_id,
    v_admin_session_id,
    v_host_token_hash,
    v_now
  );

  select host_lock.*
    into v_lock
  from public.host_locks as host_lock
  where host_lock.event_id = p_event_id
    and host_lock.lock_name = 'tournament-host'
    and host_lock.released_at is null
  for update;

  if not found then
    raise exception 'There is no active host ownership to release.';
  end if;

  v_previous_owner_session_id := coalesce(
    v_lock.owner_session_id,
    v_lock.admin_session_id::text
  );

  -- The normalized application snapshot represents release as the absence of
  -- a host row. Delete it inside this same transaction so a subsequent hydrate
  -- cannot reinterpret a tombstone as an active owner.
  delete from public.host_locks
  where id = v_lock.id;

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
    'host_lock_release',
    'Released host control.',
    null,
    false,
    v_now,
    jsonb_build_object(
      'requestId', v_request_id,
      'outcome', 'released',
      'previousOwnerSessionId', v_previous_owner_session_id,
      'dangerous', false,
      'tournamentChanging', false,
      'source', 'normalized_release_host_lock'
    )
  );

  return jsonb_build_object(
    'outcome', 'released',
    'previousOwnerSessionId', v_previous_owner_session_id,
    'releasedAt', v_now,
    'adminActionId', v_admin_action_id
  );
end;
$$;

-- Close voting no longer delegates to the pre-Phase-1 implementation, whose
-- host predicate treated expires_at as authority and could not verify the
-- primary host credential. The close and generation publication remain one
-- event/round transaction under the Phase 1 advisory lock.
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
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_round_number smallint := (v_payload->>'roundNumber')::smallint;
  v_admin_session_id uuid := (v_payload->>'adminSessionId')::uuid;
  v_host_token_hash text := coalesce(v_payload->>'hostTokenHash', '');
  v_now timestamptz;
  v_window public.voting_windows%rowtype;
  v_projection public.public_state_generations%rowtype;
  v_admin_action_id uuid := gen_random_uuid();
  v_closed_at timestamptz;
  v_rows_changed integer := 0;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_round_number is null or v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_admin_session_id is null then
    raise exception 'adminSessionId is required';
  end if;

  if v_host_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'hostTokenHash must be a lowercase SHA-256 hex digest';
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

  -- Keep an explicit owner assertion in the close transaction as a defensive
  -- postcondition. expires_at is intentionally absent: the credential-aware
  -- assertion above and an unreleased matching owner are the authority.
  if not exists (
    select 1
    from public.host_locks as host_lock
    where host_lock.event_id = p_event_id
      and host_lock.lock_name = 'tournament-host'
      and host_lock.released_at is null
      and coalesce(host_lock.owner_session_id, host_lock.admin_session_id::text)
        = v_admin_session_id::text
  ) then
    raise exception 'Host control is required for this action.';
  end if;

  v_projection := public.normalized_ensure_public_state_generation_locked(
    p_event_id,
    v_round_number,
    v_now
  );

  select voting_window.*
    into v_window
  from public.voting_windows as voting_window
  where voting_window.event_id = p_event_id
    and voting_window.round_number = v_round_number
  for update;

  if not found then
    raise exception 'Voting has not opened for this round.';
  end if;

  if v_window.status in (
    'voting_closed',
    'results_computed',
    'results_revealing',
    'results_revealed',
    'round_complete'
  ) then
    raise exception 'Voting is already past the close stage.';
  end if;

  v_closed_at := coalesce(v_window.closed_at, v_now);

  insert into public.admin_actions (
    id,
    event_id,
    admin_session_id,
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
    'close_voting',
    format('Closed voting for Round %s.', v_round_number),
    null,
    false,
    v_now,
    jsonb_build_object(
      'metadata', jsonb_build_object('roundNumber', v_round_number),
      'affectedRecords', jsonb_build_array(),
      'dangerous', false,
      'tournamentChanging', true,
      'sessionId', v_admin_session_id::text,
      'source', 'normalized_close_voting_window'
    )
  );

  update public.voting_windows
  set status = 'voting_closed',
      closed_at = v_closed_at,
      closes_at = v_closed_at,
      final_warning_started_at = null,
      paused_at = null,
      paused_from_status = null,
      remaining_seconds_at_pause = null,
      remaining_ms_when_paused = null,
      updated_at = v_now
  where event_id = p_event_id
    and round_number = v_round_number;

  get diagnostics v_rows_changed = row_count;

  v_projection := public.normalized_refresh_public_state_generation(
    p_event_id,
    v_round_number,
    'voting_closed',
    'closed_revealing',
    null,
    v_now
  );

  return jsonb_build_object(
    'roundNumber', v_round_number,
    'status', 'voting_closed',
    'closedAt', v_closed_at,
    'adminActionId', v_admin_action_id,
    'rowsChanged', v_rows_changed,
    'generation', v_projection.generation,
    'transitionKind', 'voting_closed'
  );
end;
$$;

drop function if exists public.normalized_close_window_pre_phase1_20260713(text, jsonb);

revoke all on function public.normalized_acquire_host_lock(text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.normalized_heartbeat_host_lock(text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.normalized_release_host_lock(text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.normalized_close_voting_window(text, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.normalized_acquire_host_lock(text, jsonb) to service_role;
grant execute on function public.normalized_heartbeat_host_lock(text, jsonb) to service_role;
grant execute on function public.normalized_release_host_lock(text, jsonb) to service_role;
grant execute on function public.normalized_close_voting_window(text, jsonb) to service_role;
