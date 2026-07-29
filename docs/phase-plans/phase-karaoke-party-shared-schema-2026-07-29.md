# Karaoke Party shared-schema phase plan

Date: 2026-07-29
Status: implemented and validated against the canonical loopback-only local Supabase stack
Scope: additive shared Supabase schema required by Karaoke Party Phase 1
Consuming application: `jfung9021/karaoke-party` (application name: Karaoke Party)

## Objective

Add the complete prefixed Karaoke Party persistence and transaction contract to this repository,
which remains the sole canonical migration owner for the shared Supabase project. The change must
not alter tournament behavior, Protein Tracker behavior, existing objects, default privileges,
project-wide Auth configuration, or Realtime publications.

## Preconditions and evidence

- `AGENTS.md`, `docs/codex-current-brief.md`, `docs/security-notes.md`, `docs/phase-gates.md`, the
  Protein Tracker schema plan/migration patterns, and the full canonical karaoke plan were reviewed.
- The canonical plan's stale repository and product names are corrected for this work:
  `jfung9021/karaoke-party` and Karaoke Party.
- `npx supabase migration list --linked` reported exact local/remote parity through
  `20260727010000`; the new migration therefore uses `20260729010000`.
- A final read-only linked inspection shows `20260729010000` as the only local-only migration, and
  linked lint reports no errors in the unchanged hosted baseline. Neither check applies the migration.
- No existing `karaoke_` object or repository reference was found before implementation.
- Docker Desktop's Linux engine was restored later on 2026-07-29. The full local reset, clean
  database lint, executable database/concurrency suites, sibling regressions, guarded rollback, and
  post-rollback forward rebuild passed against the verified loopback stack.
- The initial execution did not authorize repository or hosted writes. The continuation later
  authorized an intentional local commit only; push, pull request, hosted migration, and remote
  mutation remain unauthorized. Linked inspection is read-only.

## Deliverables

1. One additive migration named `20260729010000_karaoke_party_schema.sql`.
2. Seven `karaoke_` tables with explicit checks, composite same-room foreign keys, supporting
   indexes, RLS, broad-role revokes, and explicit `service_role` grants.
3. Fixed-empty-search-path, service-role-only functions for room/session lifecycle, snapshots,
   round-robin queue operations, controller leases, playback transitions, recovery, cleanup,
   search cache, and global rate/quota coordination.
4. Transaction-scoped room advisory locks, version fencing, append-only idempotency/action records,
   exactly-once state-version increments, and public Realtime Broadcast invalidations whose payload
   contains only `stateVersion`.
5. A database/security test script plus a local concurrency runner that refuses remote database
   targets.
6. A dependency-ordered compensating rollback runbook that never uses `CASCADE`.
7. Checklist, phase-status evidence, and a manual-blocker handoff.

## Schema and security design

- Create only `public.karaoke_*` tables, indexes, constraints, and functions.
- Store only HMAC digests for host, recovery, and guest credentials; raw tokens are never function
  results, action payloads, tables, or Realtime messages.
- Enforce same-room participant/song references with composite foreign keys.
- Enforce one current `selected|playing` request per room with a partial unique index and a matching
  playback-state foreign key.
- Preserve per-participant FIFO with room-monotonic `enqueue_sequence`; preserve stable rotation with
  never-reused `rotation_order` counters held on the room row.
- Every room mutation authenticates the supplied trusted-server digest, takes a deterministic
  transaction advisory lock, checks replay fingerprint and expected state where applicable,
  performs one logical transition, increments `state_version` once, writes one sanitized action,
  and calls `realtime.send(..., false)` with only the new version.
- All exposed functions are `SECURITY DEFINER SET search_path = ''`, fully schema-qualified, revoked
  from `PUBLIC`, `anon`, and `authenticated`, and explicitly granted only to `service_role`.
- All tables enable RLS and grant browser roles no table privileges or policies. Exact backend table
  privileges are explicit; no default ACL changes are permitted.
- `karaoke_consume_rate_limit` coordinates YouTube and recovery throttles using HMAC-derived bucket
  identifiers supplied by trusted server code; raw IP addresses are rejected by validation and must
  never be supplied.

## RPC contract

All room mutations use `p_room_code`, the applicable `p_host_token_hash` or
`p_guest_token_hash`, `p_request_id`, and `p_request_fingerprint`. Playback mutations also carry
expected version/current-song/controller fences. The public server-only contract includes:

- `karaoke_create_room(room code, realtime topic, host/recovery digests, expiry, limits, request)`
- `karaoke_recover_host(room code, recovery digest, new host digest, request)`
- `karaoke_join_room(room code, guest digest, display name, request)`
- `karaoke_get_room_snapshot(room code, optional host/guest digest, preview limit)`
- participant touch/add/remove, host pending/participant removal, controller claim/refresh/release,
  next-song claim, playing/pause/resume, complete/skip, failure replacement, close, and cleanup RPCs
- `karaoke_consume_rate_limit(p_bucket_key, p_limit, p_window_seconds, p_request_cost default 1)`
- `karaoke_get_search_cache(p_cache_key)` and `karaoke_put_search_cache(...)`

The migration comments and rollback runbook record the exact SQL signatures.

## Queue and transition rules

- The cursor is the last consumed participant's immutable rotation order and advances only on ended,
  host skip, or a failure after playback began.
- `host_skip` consumes a selected song even before `PLAYING`; normal `ended` requires playback to
  have started.
- Pre-playback failure marks the song `failed_preplay`, preserves the cursor, and selects a
  replacement from the unchanged cursor.
- Duplicate or stale completion cannot advance a second song because controller, expected current
  song, expected version, request replay, and the room lock are checked in one transaction.
- Snapshot upcoming order is a bounded projection produced by repeated application of the same
  participant-first/FIFO selection rule; it is not stored as mutable global positions.

## Implementation order

1. Create tables and constraints in dependency order.
2. Create indexes and the current-song uniqueness boundary.
3. Create internal lock/auth/action/selection/projection helpers.
4. Create all server-only lifecycle, queue, lease, recovery, cache, rate, and cleanup RPCs.
5. Enable RLS, revoke broad roles, and grant the reviewed `service_role` allowlist.
6. Add executable catalog/security/queue tests and a safe local concurrency runner.
7. Add rollback and blocker documentation.
8. Perform one correctness/concurrency review and one security/operations review, applying only
   deterministic fixes, then record results.

## Validation plan

- Static SQL scan: prefix isolation, no `CASCADE`, no default privilege changes, no Auth/global
  publication changes, fully qualified object references, empty function search paths, grants/RLS,
  and Realtime payload shape.
- Completed after Docker became available: `npx supabase db reset --local`, clean local database
  lint, the SQL harness, both two-session concurrency races, sibling regressions, transactional
  rollback rehearsal, and the required post-rollback forward rebuild.
- Catalog assertions: seven tables, expected RLS state, zero browser policies/privileges, exact
  function execute grants, same-room FKs, partial current-song uniqueness, and sibling-object
  snapshots.
- Behavioral assertions: create/join/add limits, stable rotation, FIFO, midway join, removal,
  preplay replacement, skip/ended consumption, duplicate completion, stale version/controller,
  close/cleanup, cross-room isolation, rate window atomicity, and cache expiry.
- Sibling checks: formatting where applicable, lint, typecheck, unit tests, build, and relevant
  existing Protein Tracker database tests if the local stack can run.

## Rollback

Before dependent deployment or user data, use the reviewed compensating runbook only after checking
all karaoke tables are empty. Drop grants/functions/tables in exact dependency order without
`CASCADE`. Rehearse inside a transaction and roll it back after catalog assertions. After data or an
enabled application exists, disable the Karaoke Party feature/deployment and ship additive fixes;
do not destructively reverse the schema.

## Plan review

Reviewed before implementation for naming correction, shared-project blast radius, migration-head
collision, Auth/global configuration, RLS/grants, raw-token leakage, cross-room ownership,
idempotency, queue fairness, stale callbacks, controller takeover, close/cleanup races, cache/quota
security, Realtime payload privacy, rollback dependency order, and test coverage. The design stays
within the canonical Phase 1 boundary and leaves all remote/deployment work explicitly deferred.
