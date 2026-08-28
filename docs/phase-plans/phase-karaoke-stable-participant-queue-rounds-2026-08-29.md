# Karaoke Party stable front-tier queue repair plan

Date: 2026-08-29
Status: reviewed and ready for implementation
Scope: one forward-only Karaoke RPC migration plus consuming queue-model and contract coverage

## Objective

Promote a singer's next unfinished request after their earlier request becomes terminal without
allowing every song from a late singer to jump ahead or allowing the promotion to displace people
who were already waiting at the front. Persisted `queue_round` assignment remains active-only. A
nullable internal `front_tier_sequence` records when each singer's earliest unfinished request
entered the front tier. Later unfinished requests retain their persisted `queue_round` until they
are promoted.

The motivating regression is:

1. Bob, Alice, and Cara enqueue `B1`, `A1`, and `C1` in round `0`.
2. Bob enqueues `B2` in round `1`.
3. `B1` and `A1` become terminal while `C1` remains pending.
4. Alice enqueues `A2` after `B2`; late-arriving Diego enqueues `D1,D2`.

The current result must be `C1, B2, A2, D1, D2`. Although `B2` retains persisted round `1`, it is
now Bob's front request. `C1` stays ahead because it was already waiting in the front tier before
`B2` was promoted; `B2` stays ahead of later `A2` and `D1` front entries. Only `D1`, not Diego's
whole list, joins the front tier.

## Preconditions and boundaries

- The canonical repository remains the sole owner of shared Supabase migration history; the
  applied `20260825010000` migration will not be edited.
- The hosted schema change is limited to one internal nullable song-request column, its invariant
  trigger functions/triggers/indexes, and `public.karaoke_select_next_locked` plus
  `public.karaoke_project_upcoming`. No public type, Auth, Realtime, default-privilege, tournament,
  Protein Tracker, or Pumbility object changes.
- Existing RPC signatures, room locking, playback transitions, public JSON, security-definer
  settings, empty search paths, and execute revocations remain unchanged.
- `queue_round` remains internal and absent from public JSON.
- Selected and playing rows remain unfinished until terminal, so a singer's next
  request is not promoted early.
- The consuming selector and projector must match the database rule exactly. Production continues
  to use the database functions as authority.

## Implementation

1. Add one collision-free forward migration after `20260825010000` that adds nullable
   `front_tier_sequence` and backfills exactly the earliest unfinished request per participant.
   Backfill sequence follows the existing raw `(queue_round, enqueue_sequence)` order per room.
2. Add a `BEFORE INSERT` trigger that assigns `room.state_version + 1` only when the inserted row is
   the participant's first unfinished request. Keep repeats null.
3. Add an `AFTER UPDATE` transition-table trigger for active-to-terminal status changes. When the
   former front becomes terminal, promote the earliest remaining unfinished request with
   `room.state_version + 1`. A statement-level trigger avoids unsafe row-by-row promotion during
   bulk terminal updates.
4. Order pending requests by effective tier (`0` for a non-null front marker, otherwise persisted
   `queue_round`), then front-entry sequence and enqueue sequence. Preserve selected/playing rows as
   the unfinished set used by the triggers.
5. Add partial invariant/index support so at most one unfinished front marker exists per singer,
   and reassert the exact existing function/trigger-helper revoke contract.
6. Update the consuming selector/projector and current queue contracts to the same rule while
   leaving active-only round assignment unchanged.
7. Add deterministic application and SQL regressions for `C1, B2, A2, D1, D2`, including raw
   persisted rounds and front-entry ordering that prove only the earliest unfinished request is
   promoted and existing front waiters remain stable.
8. Record implementation, review, local database, CI, merge, hosted migration, parity, and lint
   evidence in the checklist and phase status.

## Validation

- Application: formatting, lint, typecheck, all unit/property/load tests, focused queue regression,
  production build, and relevant Playwright queue coverage when the browser environment is
  available.
- Canonical database: confirm loopback target, reset the complete history, run local database
  lint, the guarded Karaoke schema/security/queue/concurrency harness, and focused sibling database
  gates required by repository routing.
- Static review: `git diff --check`; verify the new migration keeps selector/projector signatures
  and security boundaries, the new column remains internal, trigger helpers are not executable by
  API roles, and there is no broad or destructive DDL.
- Release: merge the reviewed schema-owner PR, verify the linked project, require a dry run naming
  only this migration, apply it, then prove exact local/remote parity and zero-finding linked lint.
  Merge the consuming application PR after its checks pass and synchronize both default branches.

## Rollback

Do not destructively roll back the hosted shared database or edit the prior migration. Before
publication, discard the new forward migration. After publication, disable Karaoke playback
advancement if the ordering rule proves unsafe and ship another forward function replacement.
Existing `queue_round` values remain intact. A corrective forward migration can drop the triggers,
indexes, and internal marker after first restoring raw-round selector/projector definitions.

## Plan review

Reviewed before implementation for the reported terminal transition, late-singer multi-song
behavior, stability of existing front waiters, selected/playing retention, bulk terminal updates,
removal, room-lock serialization, selector/projector parity, public JSON stability,
ACL/search-path drift, sibling isolation, migration ordering, hosted-target ambiguity, and rollback
safety. A persisted internal front-entry marker is necessary because deriving position only from
the current active set loses when each request actually entered the front tier.
