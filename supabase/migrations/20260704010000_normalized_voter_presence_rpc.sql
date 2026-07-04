create or replace function public.normalized_claim_voter_presence(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_number smallint;
  v_player_id uuid;
  v_device_id text;
  v_now timestamptz := public.normalized_database_time();
  v_expires_at timestamptz := v_now + interval '2 minutes';
  v_window public.voting_windows%rowtype;
  v_other_active_device_count integer := 0;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  v_round_number := (p_payload->>'roundNumber')::smallint;
  v_player_id := (p_payload->>'playerId')::uuid;
  v_device_id := nullif(trim(coalesce(p_payload->>'deviceId', '')), '');

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_player_id is null then
    raise exception 'playerId is required';
  end if;

  if v_device_id is null then
    raise exception 'deviceId is required';
  end if;

  select *
    into v_window
  from public.voting_windows
  where event_id = p_event_id
    and round_number = v_round_number;

  if not exists (
    select 1
    from public.round_player_eligibility as eligibility
    where eligibility.event_id = p_event_id
      and eligibility.round_number = v_round_number
      and eligibility.player_id = v_player_id
  ) then
    raise exception 'This start.gg username is not eligible for the open voting window.';
  end if;

  delete from public.active_voter_presence
  where event_id = p_event_id
    and round_number = v_round_number
    and expires_at <= v_now;

  if v_window.event_id is not null
     and v_window.status in ('voting_open', 'final_30_seconds', 'extension_1_minute')
     and (v_window.closes_at is null or v_now <= v_window.closes_at) then
    insert into public.active_voter_presence (
      event_id,
      round_number,
      player_id,
      device_id,
      claimed_at,
      last_seen_at,
      expires_at
    )
    values (
      p_event_id,
      v_round_number,
      v_player_id,
      v_device_id,
      v_now,
      v_now,
      v_expires_at
    )
    on conflict (event_id, round_number, player_id, device_id)
    do update
      set last_seen_at = excluded.last_seen_at,
          expires_at = excluded.expires_at;

    select count(*)::integer
      into v_other_active_device_count
    from public.active_voter_presence as presence
    where presence.event_id = p_event_id
      and presence.round_number = v_round_number
      and presence.player_id = v_player_id
      and presence.device_id <> v_device_id
      and presence.expires_at > v_now;
  end if;

  return jsonb_build_object(
    'otherActiveDeviceCount', v_other_active_device_count,
    'hasOtherActiveDevice', v_other_active_device_count > 0
  );
end;
$$;

revoke execute on function public.normalized_claim_voter_presence(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.normalized_claim_voter_presence(text, jsonb) to service_role;
