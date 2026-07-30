# Karaoke Party lifecycle and admission correction plan

Date: 2026-07-30
Status: implemented and locally validated; publication pending
Scope: additive Karaoke Party lifecycle, admission, cleanup, and search-fill coordination
Consuming application: `jfung9021/karaoke-party`

## Objective

Correct the deterministic production lifecycle and capacity defects found after the initial hosted
release without changing tournament, Protein Tracker, Auth, or shared default-privilege behavior.
The database remains the authoritative concurrency boundary and this repository remains the sole
owner of the production migration chain.

## Frozen findings

1. Guest presence touches and controller lease refreshes version and broadcast room state even
   though neither changes guest-visible queue state. A supported 50-person room can therefore
   sustain a Realtime-triggered snapshot storm and accumulate tens of thousands of action rows.
2. Daily cleanup capacity is below the rate-bucket and room volume admitted by the application.
3. Joining commits a participant before a second snapshot RPC supplies the cookie expiry. A
   transient failure between those calls strands the participant and display name.
4. The database and application expose only 50 projected requests although a room accepts 150,
   preventing the host from moderating the tail of a supported queue.
5. Independent rate-limit RPCs partially consume earlier buckets when a later dimension denies a
   request.
6. Concurrent cache misses across server instances can duplicate the scarce YouTube search fill.

## Deliverables

1. Exactly one forward-only migration after `20260730010000` that:
   - makes participant touches non-versioning and non-broadcasting;
   - renews a valid controller lease without a global-version dependency, room version bump,
     action row, or Realtime broadcast;
   - includes `expiresAt` in the existing join RPC result;
   - raises authoritative queue projection and snapshot limits to 150;
   - adds an atomic, all-or-nothing multi-bucket rate reservation RPC;
   - adds a small RLS-enabled search-fill lease table plus claim/release RPCs for distributed
     single-flight behavior;
   - raises bounded cleanup capacity for rooms and expired ephemeral rows, including search leases;
   - preserves browser denial and the reviewed service-role-only RPC surface.
2. Executable database tests for non-versioning presence/lease behavior, stale-version-independent
   lease renewal, join expiry, 150-song projection, atomic denial, cleanup above the previous
   1,000-row ceiling, lease ownership/expiry, and grant/RLS inventory.
3. Consuming application changes for one-call join, atomic admission, bounded retained cookies,
   fallback-safe/explicit snapshot roles, the 150-item snapshot, required close version input,
   cleanup capacity, memory parity, database types, and focused tests.

## Migration order and compatibility

1. Merge and apply the canonical migration before deploying application code that invokes the new
   atomic-admission and search-fill functions.
2. Existing function signatures are retained when behavior changes, so the currently deployed
   application remains compatible while the migration is applied.
3. New RPCs are additive and inaccessible to browser roles. The consuming deployment must remain on
   the prior admission/search path until the hosted migration is verified.
4. After parity and linked lint pass, deploy the application and run create/join/snapshot,
   controller, cleanup, and search-fill smokes before enabling search.

## Safety and rollback

- All new or replaced objects are `public.karaoke_*`, schema-qualified, `SECURITY DEFINER`, and use
  an empty `search_path`.
- The new lease table has RLS enabled, no browser policies, no browser grants, and read-only direct
  access for `service_role`; mutation remains RPC-only.
- Atomic rate reservations acquire the same deterministic advisory locks used by the existing
  single-bucket limiter, in sorted order, and perform no writes before every bucket passes.
- Cleanup remains bounded per invocation. The application-wide room-create ceiling is aligned with
  the maximum room expiry/purge batch.
- After use, rollback is forward-only: disable room creation/search or deploy the prior application,
  then issue a corrective migration. Before use, the new functions/table could be explicitly
  revoked and dropped without `CASCADE`; replaced functions would still require a forward
  corrective migration to restore behavior.

## Validation

- Reset the complete local migration chain and run local database lint.
- Run the full Karaoke schema/security/queue/concurrency harness with the new assertions.
- Run consuming application formatting, lint, typecheck, focused unit tests, complete unit/property
  tests, production build, local Supabase suite, and affected Playwright scenarios when feasible.
- Run relevant sibling repository lint, typecheck, tests, and build before publication.
- Review the final diff once for lock order, partial writes, lease takeover/expiry, stale-state
  behavior, queue completeness, RLS/grants, cleanup bounds, sibling isolation, and destructive risk.

## Plan review

Reviewed before implementation. The migration keeps existing public RPC signatures stable while
adding only three service RPCs and one service-owned table. Presence and lease operations retain
credential, room-status, and controller validation but deliberately leave the authoritative queue
version unchanged. Atomic admission shares lock keys with the legacy limiter to avoid split-brain
counts. Distributed search fills use opaque caller-generated lease tokens and short expirations;
release is ownership-checked, and cleanup removes abandoned leases. No shared sibling object,
default privilege, Auth setting, or tournament rule changes.
