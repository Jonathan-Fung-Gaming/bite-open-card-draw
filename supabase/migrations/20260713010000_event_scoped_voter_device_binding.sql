create table if not exists public.voter_device_bindings (
  event_id text not null,
  device_id text not null,
  player_id uuid not null references public.players(id) on delete cascade,
  bound_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  primary key (event_id, device_id),
  constraint voter_device_bindings_event_id_not_blank check (length(trim(event_id)) > 0),
  constraint voter_device_bindings_device_id_not_blank
    check (length(trim(device_id)) between 8 and 200)
);

alter table public.voter_device_bindings enable row level security;

create index if not exists voter_device_bindings_event_player_idx
  on public.voter_device_bindings (event_id, player_id);

revoke all on table public.voter_device_bindings from public, anon, authenticated;
grant select, insert, update, delete on table public.voter_device_bindings to service_role;

create or replace function public.normalized_assert_voter_device_available(
  p_event_id text,
  p_player_id uuid,
  p_device_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bound_player_id uuid;
begin
  select binding.player_id
    into v_bound_player_id
  from public.voter_device_bindings as binding
  where binding.event_id = p_event_id
    and binding.device_id = p_device_id;

  if v_bound_player_id is not null and v_bound_player_id <> p_player_id then
    raise exception
      'This device is already registered to a different start.gg username. Ask an admin for help.';
  end if;
end;
$$;

revoke all on function public.normalized_assert_voter_device_available(text, uuid, text)
  from public, anon, authenticated, service_role;

alter function public.normalized_claim_voter_presence(text, jsonb)
  rename to normalized_claim_voter_presence_without_device_binding_20260713;

revoke all on function
  public.normalized_claim_voter_presence_without_device_binding_20260713(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.normalized_claim_voter_presence(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_device_id text;
begin
  v_player_id := (p_payload->>'playerId')::uuid;
  v_device_id := nullif(trim(coalesce(p_payload->>'deviceId', '')), '');

  if v_player_id is null then
    raise exception 'playerId is required';
  end if;

  if v_device_id is null or length(v_device_id) not between 8 and 200 then
    raise exception 'deviceId must be between 8 and 200 characters';
  end if;

  perform public.normalized_assert_voter_device_available(
    p_event_id,
    v_player_id,
    v_device_id
  );

  return public.normalized_claim_voter_presence_without_device_binding_20260713(
    p_event_id,
    p_payload
  );
end;
$$;

revoke execute on function public.normalized_claim_voter_presence(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_claim_voter_presence(text, jsonb) to service_role;

alter function public.normalized_submit_ballot(text, jsonb)
  rename to normalized_submit_ballot_without_device_binding_20260713;

revoke all on function public.normalized_submit_ballot_without_device_binding_20260713(text, jsonb)
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
  v_player_id uuid;
  v_device_id text;
  v_bound_player_id uuid;
  v_now timestamptz := public.normalized_database_time();
  v_result jsonb;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  v_player_id := (p_payload->>'playerId')::uuid;
  v_device_id := nullif(trim(coalesce(p_payload->>'deviceId', '')), '');

  if v_player_id is null then
    raise exception 'playerId is required';
  end if;

  if v_device_id is null or length(v_device_id) not between 8 and 200 then
    raise exception 'deviceId must be between 8 and 200 characters';
  end if;

  if not exists (
    select 1
    from public.players as player
    where player.event_id = p_event_id
      and player.id = v_player_id
  ) then
    raise exception 'This start.gg username is not eligible for the open voting window.';
  end if;

  insert into public.voter_device_bindings (
    event_id,
    device_id,
    player_id,
    bound_at,
    last_used_at
  )
  values (
    p_event_id,
    v_device_id,
    v_player_id,
    v_now,
    v_now
  )
  on conflict (event_id, device_id)
  do update
    set last_used_at = excluded.last_used_at
    where voter_device_bindings.player_id = excluded.player_id;

  select binding.player_id
    into v_bound_player_id
  from public.voter_device_bindings as binding
  where binding.event_id = p_event_id
    and binding.device_id = v_device_id;

  if v_bound_player_id is null or v_bound_player_id <> v_player_id then
    raise exception
      'This device is already registered to a different start.gg username. Ask an admin for help.';
  end if;

  v_result := public.normalized_submit_ballot_without_device_binding_20260713(
    p_event_id,
    p_payload - 'deviceId'
  );

  return v_result;
end;
$$;

revoke execute on function public.normalized_submit_ballot(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.normalized_submit_ballot(text, jsonb) to service_role;
