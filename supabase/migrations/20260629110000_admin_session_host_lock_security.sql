create index if not exists admin_sessions_event_token_active_idx
  on public.admin_sessions (event_id, session_token_hash)
  where revoked_at is null;

create index if not exists admin_sessions_event_expiry_active_idx
  on public.admin_sessions (event_id, expires_at)
  where revoked_at is null;

alter table public.host_locks
  add constraint host_locks_owner_session_id_not_blank
  check (owner_session_id is null or length(trim(owner_session_id)) > 0);

create index if not exists host_locks_event_active_ttl_idx
  on public.host_locks (event_id, lock_name, expires_at)
  where released_at is null;
