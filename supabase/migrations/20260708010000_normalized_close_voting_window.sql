create or replace function public.normalized_close_voting_window(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_number smallint;
  v_admin_session_id uuid;
  v_now timestamptz := public.normalized_database_time();
  v_window public.voting_windows%rowtype;
  v_admin_action_id uuid := gen_random_uuid();
  v_closed_at timestamptz;
  v_rows_changed integer := 0;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  v_round_number := (coalesce(p_payload, '{}'::jsonb)->>'roundNumber')::smallint;
  v_admin_session_id := (coalesce(p_payload, '{}'::jsonb)->>'adminSessionId')::uuid;

  if v_round_number is null or v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_admin_session_id is null then
    raise exception 'adminSessionId is required';
  end if;

  if not exists (
    select 1
    from public.admin_sessions as session
    where session.event_id = p_event_id
      and session.id = v_admin_session_id
      and session.revoked_at is null
      and session.expires_at > v_now
  ) then
    raise exception 'Admin session is not active.';
  end if;

  if not exists (
    select 1
    from public.host_locks as host_lock
    where host_lock.event_id = p_event_id
      and host_lock.lock_name = 'tournament-host'
      and host_lock.released_at is null
      and host_lock.expires_at > v_now
      and (
        host_lock.admin_session_id = v_admin_session_id
        or host_lock.owner_session_id = v_admin_session_id::text
      )
  ) then
    raise exception 'Host control is required for this action.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_event_id || ':closeVotingWindow:' || v_round_number::text, 0)
  );

  select *
    into v_window
  from public.voting_windows
  where event_id = p_event_id
    and round_number = v_round_number
  for update;

  if not found then
    raise exception 'Voting has not opened for this round.';
  end if;

  if v_window.status in (
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

  return jsonb_build_object(
    'roundNumber', v_round_number,
    'status', 'voting_closed',
    'closedAt', v_closed_at,
    'adminActionId', v_admin_action_id,
    'rowsChanged', v_rows_changed
  );
end;
$$;

revoke execute on function public.normalized_close_voting_window(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.normalized_close_voting_window(text, jsonb) to service_role;
