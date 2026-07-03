create or replace function public.normalized_advance_voting_timer(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_number smallint;
  v_now timestamptz := public.normalized_database_time();
  v_before public.voting_windows%rowtype;
  v_after public.voting_windows%rowtype;
  v_changed boolean;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  v_round_number := (coalesce(p_payload, '{}'::jsonb)->>'roundNumber')::smallint;

  if v_round_number is null or v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_event_id || ':advanceVotingTimer:' || v_round_number::text, 0)
  );

  select *
    into v_before
  from public.voting_windows
  where event_id = p_event_id
    and round_number = v_round_number
  for update;

  if not found then
    raise exception 'Voting has not opened for this round.';
  end if;

  v_after := public.normalized_apply_voting_deadline_locked(p_event_id, v_round_number, v_now);

  v_changed :=
    v_before.status is distinct from v_after.status
    or v_before.closes_at is distinct from v_after.closes_at
    or v_before.closed_at is distinct from v_after.closed_at
    or v_before.extension_used is distinct from v_after.extension_used
    or v_before.final_warning_started_at is distinct from v_after.final_warning_started_at;

  return jsonb_build_object(
    'committed', true,
    'changed', v_changed,
    'rows_changed', case when v_changed then 1 else 0 end,
    'status', v_after.status,
    'closesAt', v_after.closes_at,
    'closedAt', v_after.closed_at,
    'serverNow', v_now
  );
end;
$$;

revoke execute on function public.normalized_advance_voting_timer(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.normalized_advance_voting_timer(text, jsonb) to service_role;
