# Karaoke Party shared-schema compensating rollback

Migration: `20260729010000_karaoke_party_schema.sql`

This is a pre-production compensating procedure, not an automatic down migration. Use it only in a
disposable local reset or before any Karaoke Party deployment/user data exists. After the application
is enabled or data exists, disable the application and ship an additive correction instead.

## Preconditions

1. Confirm the target is the canonical local Supabase database, never a hosted target.
2. Confirm no Karaoke Party application deployment depends on these objects.
3. Run the guarded script below with stop-on-error enabled.
4. For rehearsal, keep the final `rollback`. For a separately reviewed real pre-production reversal,
   change only that final transaction command after re-verifying all guards.
5. The procedure drops only explicitly named `karaoke_` objects in dependency order and does not use
   cascading drops or alter sibling objects/default privileges.

## Guarded dependency-ordered SQL

```sql
begin;

do $$
begin
  if exists (select 1 from public.karaoke_room_actions)
    or exists (select 1 from public.karaoke_playback_state)
    or exists (select 1 from public.karaoke_song_requests)
    or exists (select 1 from public.karaoke_participants)
    or exists (select 1 from public.karaoke_rooms)
    or exists (select 1 from public.karaoke_search_fill_leases)
    or exists (select 1 from public.karaoke_search_cache)
    or exists (select 1 from public.karaoke_rate_limit_buckets) then
    raise exception 'Karaoke Party rollback refused: prefixed tables are not empty';
  end if;
end;
$$;

drop function public.karaoke_cleanup_expired_rooms(timestamptz, integer, interval);
drop function public.karaoke_release_search_fill(text, uuid);
drop function public.karaoke_claim_search_fill(text, uuid, integer);
drop function public.karaoke_put_search_cache(text, text, text, text, jsonb, timestamptz);
drop function public.karaoke_get_search_cache(text);
drop function public.karaoke_reserve_youtube_quota(integer, integer, integer, integer, timestamptz);
drop function public.karaoke_consume_rate_limits(jsonb);
drop function public.karaoke_consume_rate_limit(text, integer, integer, integer);
drop function public.karaoke_close_room(text, text, bigint, uuid, text);
drop function public.karaoke_resume_playback(text, text, uuid, uuid, bigint, uuid, text);
drop function public.karaoke_pause_playback(text, text, uuid, uuid, bigint, uuid, text, text);
drop function public.karaoke_fail_and_select_replacement(text, text, uuid, uuid, bigint, text, text, uuid, text);
drop function public.karaoke_complete_and_select_next(text, text, uuid, uuid, bigint, text, uuid, text);
drop function public.karaoke_mark_song_playing(text, text, uuid, uuid, bigint, uuid, text);
drop function public.karaoke_claim_next_song(text, text, uuid, bigint, uuid, text);
drop function public.karaoke_release_controller(text, text, uuid, bigint, uuid, text);
drop function public.karaoke_refresh_controller_lease(text, text, uuid, bigint, uuid, text, integer);
drop function public.karaoke_claim_controller(text, text, uuid, boolean, bigint, uuid, text, integer);
drop function public.karaoke_host_remove_participant(text, text, uuid, uuid, text);
drop function public.karaoke_host_remove_pending_song(text, text, uuid, uuid, text);
drop function public.karaoke_remove_own_song(text, text, uuid, uuid, text);
drop function public.karaoke_add_song(text, text, text, text, text, text, integer, timestamptz, uuid, uuid, text);
drop function public.karaoke_touch_participant(text, text, uuid, text);
drop function public.karaoke_get_room_snapshot(text, text, text, integer);
drop function public.karaoke_join_room(text, text, text, uuid, text);
drop function public.karaoke_recover_host(text, text, text, uuid, text);
drop function public.karaoke_create_room(text, uuid, text, text, timestamptz, uuid, text, smallint, smallint, integer);

drop function public.karaoke_bump_room_version(uuid);
drop function public.karaoke_require_open_room(uuid);
drop trigger karaoke_song_request_integrity_trigger on public.karaoke_song_requests;
drop trigger karaoke_playback_state_integrity_trigger on public.karaoke_playback_state;
drop function public.karaoke_validate_playback_integrity();
drop function public.karaoke_finish_mutation(uuid, uuid, text, uuid, text, uuid, text, bigint, bigint, jsonb);
drop function public.karaoke_project_upcoming(uuid, integer);
drop function public.karaoke_select_next_locked(uuid);
drop function public.karaoke_song_json(uuid);
drop function public.karaoke_assert_controller(uuid, uuid);
drop function public.karaoke_assert_expected_version(uuid, bigint);
drop function public.karaoke_replay_result(uuid, uuid, text);
drop function public.karaoke_require_participant(uuid, text);
drop function public.karaoke_require_host(uuid, text);
drop function public.karaoke_lock_room(uuid);
drop function public.karaoke_assert_request(uuid, text);
drop function public.karaoke_assert_digest(text, text);

drop table public.karaoke_room_actions;
drop table public.karaoke_playback_state;
drop table public.karaoke_song_requests;
drop table public.karaoke_participants;
drop table public.karaoke_rooms;
drop table public.karaoke_search_fill_leases;
drop table public.karaoke_search_cache;
drop table public.karaoke_rate_limit_buckets;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'karaoke\_%' escape '\'
  ) or exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'karaoke\_%' escape '\'
  ) then
    raise exception 'Karaoke Party rollback left prefixed objects behind';
  end if;
end;
$$;

rollback;
```

## Rehearsal evidence — completed 2026-07-29

The canonical stack was verified at loopback and reset through the Karaoke Party migration. All
seven Karaoke Party tables were empty before the guarded transaction. The procedure executed with
stop-on-error and no `CASCADE`:

- prefixed relations/functions/triggers moved from 34/38/2 to 0/0/0 inside the transaction;
- sibling relations/functions/triggers/policies/default ACLs remained 135/89/30/15/27;
- representative tournament rounds remained 4 and Protein Tracker profiles remained 0; and
- `ROLLBACK` restored the exact 34/38/2 Karaoke Party catalog.

The required forward reset, full Karaoke Party schema/concurrency runner, and clean local database
lint passed again afterward. This proves dependency order only; hosted rollback remains prohibited
after user data or a dependent deployment exists.

## Rehearsal evidence — completed 2026-08-25

The procedure was updated for the provider-quota and lifecycle additions that followed the original
rehearsal: the search-fill lease table and the claim/release, multi-bucket admission, and YouTube
quota functions. Against the verified loopback database, all Karaoke tables were empty and the
guarded transaction ran with stop-on-error and no `CASCADE`:

- prefixed relations/functions/triggers moved from 39/42/2 to 0/0/0 inside the transaction;
- `ROLLBACK` restored the exact 39/42/2 catalog with zero Karaoke room rows; and
- a fresh canonical reset through `20260825010000`, the complete Karaoke
  schema/security/queue/concurrency runner, and database lint with zero findings passed afterward.

This remains a disposable-local rehearsal only. Hosted rollback is prohibited after user data or a
dependent deployment exists.
