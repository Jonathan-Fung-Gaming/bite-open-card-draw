# Karaoke Party pending-position ordering hotfix plan

Date: 2026-08-29
Status: implemented, reviewed, statically verified, and ready for release-owner handoff
Scope: one forward-only Karaoke selector/projector migration and focused SQL regression

## Objective

Correct the live queue projection so every active singer's first pending request is compared with
other singers' first pending requests, every second pending request is compared with other second
pending requests, and so on. Preserve the stable `front_tier_sequence` order for pending requests
that are already marked as a singer's unfinished front.

When Dom's first request is selected or playing, Dom's next pending request must be projected as
Dom's first pending request rather than as an absolute historical repeat. For the reported shape,
the projection must be `J1,E1,D2,J2,E2,J3`: Dom's remaining request is third, Emuwuly's second
pending request stays between Jonathan's second and third pending requests, and no late singer's
whole list skips ahead.

## Boundaries

- Do not edit the applied `20260829010000_karaoke_front_tier_ordering.sql` migration.
- Add only a collision-free forward migration replacing
  `public.karaoke_select_next_locked(uuid)` and
  `public.karaoke_project_upcoming(uuid, integer)`.
- Preserve function signatures, room locking, playback transitions, active-participant filtering,
  the 150-item projection cap, public JSON, security-definer settings, empty search paths, and
  execute revocations.
- Do not change persisted `queue_round`, `front_tier_sequence`, triggers, table schema, Auth,
  Realtime, default privileges, or sibling application objects.
- The selector runs only when there is no current song. The terminal transition trigger therefore
  remains responsible for promoting the next unfinished request and assigning its stable front
  marker before selection.

## Implementation

1. Rank each active participant's pending requests by `(queue_round, enqueue_sequence)` using
   `row_number() - 1`; use that zero-based pending position as `effective_tier`.
2. In the locked selector, order tier-zero rows by their persisted `front_tier_sequence`, with a
   deterministic enqueue fallback, then order later tiers by `enqueue_sequence`.
3. In the projector, a participant whose marked front is currently selected/playing can have an
   unmarked first pending request. Give that projected tier-zero row a synthetic order after all
   existing marked pending fronts (`room.state_version + 1`), with enqueue sequence as the final
   tie-breaker. This affects projection only and does not mutate queue state.
4. Add a transactional SQL regression with a current Dom song and the exact projected order
   `J1,E1,D2,J2,E2,J3`. Also assert the relative second-song order and internal-field
   non-disclosure.
5. Reassert the exact existing execute revocations for both replaced functions.

## Validation and release handoff

- Run PostgreSQL static parsing if the repository's parser dependency is available.
- Run `git diff --check` and focused static checks for signatures, ACLs, JSON shape, and migration
  isolation.
- Verify the configured linked Supabase project is unambiguous and run a dry run that names only
  this migration. Do not apply, commit, push, or merge from this workstream; hand the reviewed diff
  to the release owner.
- The release owner must run the full reset/lint/Karaoke harness and required sibling gates when
  local Docker is available, then merge and apply the forward migration to the verified target.

## Rollback

Do not roll back or rewrite applied history. Before publication, discard this forward migration.
After publication, ship another forward function replacement restoring the prior selector and
projector definitions if a deterministic regression is found. No stored queue rows are rewritten
by this migration.

## Plan review

Reviewed before implementation for the two photographed ordering failures, current-song handling,
late-participant multi-song behavior, stable front order, terminal promotion, inactive singers,
projection/selector parity at selection time, null-marker handling, deterministic ties, public JSON
compatibility, security boundaries, migration ordering, rollback safety, and sibling isolation.
The fix must derive relative tiers from pending requests, not persisted absolute rounds; otherwise
second and third songs from different singers remain incomparable after earlier songs leave the
pending queue.
