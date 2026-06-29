# Normalized Runtime Persistence Plan - 2026-06-29

## Purpose

This is a follow-up architecture plan. It is not implemented by the 2026-06-29 remediation pass.

Goal: replace the singleton `tournament_state_snapshots` runtime with normalized Supabase tables as
the authoritative deployed/event state, while keeping snapshots only as backup/debug export.

## Phase 1 - Event Scope And Schema

- Add `TOURNAMENT_EVENT_ID` to server configuration and fail deployed/event mutations when missing.
- Add event scope to operational tables:
  - players
  - chart exclusions
  - draws and drawn charts
  - voting windows
  - round player eligibility
  - ballots, choices, and revisions
  - result snapshots and rows
  - tiebreaks
  - admin sessions and actions
  - host locks
- Update unique constraints to include event scope where data can collide across rehearsals and
  production.
- Keep static chart catalog rows global unless a later requirement needs per-event chart catalogs.
- Regenerate `src/lib/db/database.types.ts` from the applied Supabase migration and require every
  runtime table to be represented.

## Phase 2 - Repository Boundaries

- Create server-only repositories for each operational boundary:
  - `PlayerRepository`
  - `ChartExclusionRepository`
  - `DrawRepository`
  - `VotingWindowRepository`
  - `BallotRepository`
  - `ResultRepository`
  - `AdminSessionRepository`
  - `AdminAuditRepository`
  - `HostLockRepository`
- Do not expose service-role clients, service keys, password hashes, or session token hashes to
  browser components.
- Keep the existing in-memory stores only for unit tests and local fake runs.

## Phase 3 - Transactional Mutations

Implement SQL RPCs or equivalent service-role transactional functions for:

- ballot submit/edit
- manual ballot override
- active voter presence claim/touch
- host lock acquire/heartbeat/release
- voting window open/pause/resume/close/reopen/timer advancement
- draw/reroll operations
- post-vote reroll invalidation
- result compute/reveal/override
- admin session create/touch/logout/revoke

Each mutation should commit all dependent records together or leave the previous committed state
unchanged.

## Phase 4 - Runtime Cutover

- Replace `SupabaseOperationalStateRepository` snapshot load/save with normalized repositories.
- Stop hydrating the entire app from `tournament_state_snapshots`.
- Make reads reconstruct round/admin/public views from normalized records.
- Keep snapshot export as an explicit debug/admin export path only.
- Production must throw before admin/vote mutations when `TOURNAMENT_STATE_BACKEND` is not
  `supabase`.

## Phase 5 - Admin Sessions And Host Locks

- Store only opaque admin session token hashes in `admin_sessions`.
- Touch `last_seen_at` and `expires_at = now() + interval '10 hours'` on admin activity.
- Treat expired or revoked sessions as invalid even if a signed cookie remains.
- Store host locks in `host_locks` with short TTL heartbeat updates.
- Ensure logout revokes server-side session records and clears cookies.

## Phase 6 - Audit, Export, And Recovery

- Preserve ballot revisions, invalidated ballots, reroll reasons, and admin action ids for CSV and
  audit export.
- Include tiebreak candidates, backend winner, reveal start times, and final reveal times.
- Add an explicit backup/debug snapshot export that is never read as deployed authority.

## Phase 7 - Test And Rehearsal Gates

Required automated coverage:

- concurrent ballot submissions survive with all ballots present
- persistence failure keeps previous confirmed ballot valid
- post-vote reroll invalidates affected ballots and prevents silent zero-count results
- timer expiry, 75% extension, final-30 warning, pause, and close persist across fresh repository reads
- production rejects unsafe backend and event config
- admin sessions refresh to sliding 10-hour expiry and logout revokes server-side
- full generated Supabase types include all runtime tables

Required rehearsal coverage:

- four-round hosted Supabase rehearsal using a non-production `TOURNAMENT_EVENT_ID`
- refresh/redeploy survival for draws, voting windows, ballots, results, tiebreak reveals, and admin
  sessions
- private CSV auto-download and manual download after each final reveal
- QR scans from event phones to the public `/room` URL
