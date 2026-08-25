# Karaoke Party queue-round ordering phase plan

Date: 2026-08-25
Status: implemented and statically validated; local database execution blocked by unavailable Docker
Scope: one forward-only canonical Supabase migration and focused executable database coverage

## Objective

Persist an internal nonnegative queue round for every Karaoke Party song request so a singer's
first active request joins the tail of the currently eligible round while later active requests
remain after all first requests. Selection and snapshot projection must use exactly the same
`(queue_round, enqueue_sequence)` ordering. The public RPC signatures and JSON contracts remain
unchanged.

The motivating regression is an existing pending order `B1, C1, B2`: when Alice adds her first
active request `A1`, the resulting order must be `B1, C1, A1, B2`, not `A1, B1, C1, B2`.

## Preconditions and boundaries

- The canonical repository owns the shared Supabase migration history; applied migrations will not
  be edited.
- Only `public.karaoke_song_requests`, the existing queue helpers, and the existing add-song RPC are
  in schema scope. Tournament and Protein Tracker objects are out of scope.
- `queue_round` is an internal scheduling field. Existing public JSON returned by add, snapshot,
  current-song, and upcoming projection will not expose it.
- Room advisory locking, guest authentication, idempotent replay, metadata validation, admission
  limits, state-version increments, action recording, Realtime invalidation, RPC signatures,
  security-definer settings, search paths, and grants remain unchanged.
- No hosted database operation is authorized. Database execution is permitted only after the target
  is confirmed as the canonical loopback-only local Supabase stack.

## Implementation

1. Add nullable `queue_round bigint`, backfill active requests with zero-based per-participant rounds
   in enqueue order and inactive history with zero, then add a nonnegative check, default zero, and
   `NOT NULL`.
2. Add a partial unique index on `(room_id, participant_id, queue_round)` for
   `pending|selected|playing` requests and a partial pending selection index on
   `(room_id, queue_round, enqueue_sequence)`.
3. Replace `karaoke_add_song` without changing its signature. Under the existing room lock, assign
   a subsequent round after the participant's greatest active round, or assign a first active
   request to the room's lowest active round (zero for an empty room).
4. Replace `karaoke_select_next_locked` so the next active-participant request is the first pending
   row by `(queue_round, enqueue_sequence)`.
5. Replace `karaoke_project_upcoming` with the same predicate and ordering, retaining its 150-item
   bound and exact public JSON shape.
6. Reassert the existing role ACL contract for the three replaced functions.
7. Extend the existing transactional schema test with catalog/backfill constraints, the exact
   `B1,C1,A1,B2` regression, selection/projection parity, and queue-round values. Adapt direct test
   fixtures that intentionally create multiple pending requests for one participant.

## Validation and review

- Confirm the configured database target is loopback-only before any reset or SQL harness run.
- Reset the complete local migration history, run local database lint, and run the guarded Karaoke
  schema/security/queue/concurrency harness.
- Generate database types from the verified local schema into the consuming repository if the CLI
  is available, then run the consuming application's typecheck if coordination permits.
- Run `git diff --check` and one focused diff review for migration safety, queue parity, ACL drift,
  sibling-object scope, data loss, and race behavior.
- Do not push, merge, apply hosted migrations, or perform recursive review/repair cycles in this
  delegated implementation session.

## Rollback

This is a forward-only change once application code depends on round ordering. Before dependent
deployment, rollback is a local reset to the prior migration head. After deployment, keep the
column and ship a forward repair; do not destructively drop scheduling data from a live shared
database.

## Plan review

Reviewed before implementation for applied-migration immutability, backfill determinism, active-row
uniqueness, empty and mid-round enqueue behavior, current-song non-preemption, direct-fixture
compatibility, selector/projector drift, room-lock serialization, public-contract stability,
security-definer ACL preservation, migration ordering, sibling-project isolation, and hosted-target
safety. No tournament rule or global Supabase configuration changes are required.
