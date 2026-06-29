# Normalized Runtime Persistence Plan - 2026-06-29

## Purpose

This is a follow-up architecture plan. It is not implemented by the 2026-06-29 remediation pass.

Goal: replace the singleton `tournament_state_snapshots` runtime with normalized Supabase tables as
the authoritative deployed/event state, while keeping snapshots only as backup/debug export.

## 2026-06-29 Blocker And Decision

Phase 4 runtime cutover is blocked by an identifier model mismatch:

- The current app uses ballot/result `roundSetId` as the active `DrawRecord.id`.
- The normalized schema currently defines `round_set_id` as the static `round_sets.id` foreign key.
- Cutting over while those meanings differ would either reject valid runtime data or, worse, attach
  ballot choices and result rows to the wrong static set/draw version.

Decision: add draw-level references to normalized ballot/result persistence, and then update runtime
contracts to distinguish static chart-set identity from active draw identity before cutover.

This is the most likely best path because ballots and results must be tied to the exact 7-chart draw
version the player saw. Static `round_sets.id` is still needed for tournament configuration, labels,
and grouping, but it is not enough to validate choices after rerolls or preserve audit history.
A pure rewrite to use only static round-set IDs would still need draw references to prove that banned
chart IDs belonged to the active draw at submission time.

Identifier invariants:

- `round_sets.id` is static configuration for Round 1 S16, Round 1 S17, and so on.
- `draws.id` is the event/runtime draw attempt, including reroll version.
- Ballot choices, result rows, and tiebreaks must store the exact `draw_id` they apply to.
- These records may also store `round_set_id` for grouping and constraints, but it must match
  `draws.round_set_id`.
- Runtime/domain payloads must stop using ambiguous `roundSetId` when the value is a draw id. Use
  `drawId` for active draw identity and `roundSetId` only for static `round_sets.id`.

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

Do not implement ballot/result RPCs against normalized tables until Phase 4 corrects the draw/static
round-set identifier split.

## Phase 4 - Draw-Aware Ballot And Result Model Correction

Do not cut over runtime persistence in this phase. First correct the persistence model so normalized
tables can represent the existing tournament semantics without corrupting choices or results.

Schema changes:

- Add `draw_id` to `ballot_choices`, referencing `draws(id)`.
- Add `draw_id` to `result_rows`, referencing `draws(id)`.
- Add `draw_id` to `tiebreaks`, referencing `draws(id)`.
- Keep `round_set_id` on those tables as the static `round_sets.id` reference for grouping,
  set-order queries, CSV export, and consistency checks.
- Enforce, by SQL trigger, RPC assertion, or equivalent transactional service check, that
  `draws.round_set_id = ballot_choices.round_set_id`, `draws.round_set_id =
  result_rows.round_set_id`, and `draws.round_set_id = tiebreaks.round_set_id`.
- Ensure all event-scoped uniqueness and indexes include the corrected identifiers. Latest ballot
  choices should remain unique per `(event_id, ballot_id, round_set_id)` while recording the current
  `draw_id`; result rows should be unique per selected result snapshot, draw, chart, and reveal
  order.
- Validate that every banned chart id belongs to `drawn_charts` for the referenced `draw_id`.
  If this is too awkward with the current `uuid[]` column, plan a follow-up join table for banned
  chart ids before production cutover.
- Regenerate `src/lib/db/database.types.ts` after the migration and require the new `draw_id`
  columns in generated types.

Runtime contract changes:

- Split domain/API names before persistence cutover:
  - `drawId`: the active draw attempt/version.
  - `roundSetId`: the static `round_sets.id`.
  - `setOrder` and `displayLabel`: UI grouping/label data, not identity substitutes.
- Update `BallotSetChoice`, result set snapshots, mutation contracts, and repository DTOs so
  ballot validation and result counting key against `drawId`.
- Preserve compatibility only as an internal migration shim where needed; do not write a draw id into
  a `round_set_id` database column.
- Update draw repositories to expose both identifiers when reconstructing app views.
- Update CSV export to include static set labels and the draw version/draw id used for each set.

Required automated gates before leaving this phase:

- A ballot using static `roundSetId` where `drawId` is required is rejected.
- A ballot choice whose banned chart id is not in `drawn_charts` for that `draw_id` is rejected.
- Result rows and tiebreaks cannot be committed for charts outside their referenced draw.
- Rerolling a set creates a new `draw_id`; old ballot/result audit data remains tied to the old
  draw, and new submissions/results use the new draw.
- Tests fail if a runtime `DrawRecord.id` can be persisted into a normalized `round_set_id` column.

## Phase 5 - Runtime Cutover

- Replace `SupabaseOperationalStateRepository` snapshot load/save with normalized repositories.
- Stop hydrating the entire app from `tournament_state_snapshots`.
- Make reads reconstruct round/admin/public views from normalized records.
- Keep snapshot export as an explicit debug/admin export path only.
- Production must throw before admin/vote mutations when `TOURNAMENT_STATE_BACKEND` is not
  `supabase`.
- Runtime cutover is allowed only after Phase 4 gates pass and the app can reconstruct every ballot,
  result row, and tiebreak with both static `roundSetId` and active `drawId` present.

## Phase 6 - Admin Sessions And Host Locks

- Store only opaque admin session token hashes in `admin_sessions`.
- Touch `last_seen_at` and `expires_at = now() + interval '10 hours'` on admin activity.
- Treat expired or revoked sessions as invalid even if a signed cookie remains.
- Store host locks in `host_locks` with short TTL heartbeat updates.
- Ensure logout revokes server-side session records and clears cookies.

## Phase 7 - Audit, Export, And Recovery

- Preserve ballot revisions, invalidated ballots, reroll reasons, and admin action ids for CSV and
  audit export.
- Include tiebreak candidates, backend winner, reveal start times, and final reveal times.
- Include static `round_set_id`, `draw_id`, and draw version in audit/debug exports where applicable.
- Add an explicit backup/debug snapshot export that is never read as deployed authority.

## Phase 8 - Test And Rehearsal Gates

Required automated coverage:

- concurrent ballot submissions survive with all ballots present
- persistence failure keeps previous confirmed ballot valid
- post-vote reroll invalidates affected ballots and prevents silent zero-count results
- timer expiry, 75% extension, final-30 warning, pause, and close persist across fresh repository reads
- production rejects unsafe backend and event config
- admin sessions refresh to sliding 10-hour expiry and logout revokes server-side
- full generated Supabase types include all runtime tables
- normalized ballot/result persistence distinguishes static `round_set_id` from active `draw_id`
- cutover cannot persist active draw ids into static round-set FK columns

Required rehearsal coverage:

- four-round hosted Supabase rehearsal using a non-production `TOURNAMENT_EVENT_ID`
- refresh/redeploy survival for draws, voting windows, ballots, results, tiebreak reveals, and admin
  sessions
- private CSV auto-download and manual download after each final reveal
- QR scans from event phones to the public `/room` URL
