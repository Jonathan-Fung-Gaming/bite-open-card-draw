create table if not exists public.event_persistence_locks (
  event_id text not null primary key,
  lock_token text not null,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint event_persistence_locks_event_id_not_blank check (length(trim(event_id)) > 0),
  constraint event_persistence_locks_lock_token_not_blank check (length(trim(lock_token)) > 0)
);

alter table public.event_persistence_locks enable row level security;

create or replace function public.normalized_database_time()
returns timestamptz
language sql
volatile
security definer
set search_path = public
as $$
  select clock_timestamp();
$$;

create or replace function public.normalized_acquire_event_persistence_lock(
  p_event_id text,
  p_lock_token text,
  p_locked_until timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if length(trim(coalesce(p_lock_token, ''))) = 0 then
    raise exception 'p_lock_token is required';
  end if;

  if p_locked_until is null then
    raise exception 'p_locked_until is required';
  end if;

  with attempted_lock as (
    insert into public.event_persistence_locks (
      event_id,
      lock_token,
      locked_until,
      updated_at
    )
    values (
      p_event_id,
      p_lock_token,
      p_locked_until,
      clock_timestamp()
    )
    on conflict (event_id) do update
      set lock_token = excluded.lock_token,
          locked_until = excluded.locked_until,
          updated_at = clock_timestamp()
      where public.event_persistence_locks.locked_until <= clock_timestamp()
        or public.event_persistence_locks.lock_token = excluded.lock_token
    returning true
  )
  select coalesce(bool_or(true), false)
    into acquired
  from attempted_lock;

  return acquired;
end;
$$;

create or replace function public.normalized_release_event_persistence_lock(
  p_event_id text,
  p_lock_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  released boolean;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if length(trim(coalesce(p_lock_token, ''))) = 0 then
    raise exception 'p_lock_token is required';
  end if;

  delete from public.event_persistence_locks
  where event_id = p_event_id
    and lock_token = p_lock_token
  returning true into released;

  return coalesce(released, false);
end;
$$;

revoke execute on function public.normalized_database_time() from public, anon, authenticated;
revoke execute on function public.normalized_acquire_event_persistence_lock(text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.normalized_release_event_persistence_lock(text, text)
  from public, anon, authenticated;

grant execute on function public.normalized_database_time() to service_role;
grant execute on function public.normalized_acquire_event_persistence_lock(text, text, timestamptz)
  to service_role;
grant execute on function public.normalized_release_event_persistence_lock(text, text)
  to service_role;
