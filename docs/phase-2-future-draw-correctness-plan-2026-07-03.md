# Phase 2 Future Draw Correctness Plan - 2026-07-03

Status: implemented and locally verified.

Parent plan: `docs/production-readiness-remediation-plan-2026-07-03.md`

Primary issue: PRC-001, future-round draws can bypass prior selected-song
exclusion.

Authoritative behavior sources:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Product Rule Being Protected

Selected songs from earlier rounds cannot appear in later-round active draws,
voting windows, or computed results. Drawn-but-not-selected songs remain
eligible for later rounds.

The block starts when an earlier round result is computed. It does not wait for
the final stage reveal, because the backend-selected result is already known at
`computed` reveal phase.

## Current Gap

The codebase already has selected-song blocking when a new draw is created
after selected songs are known. It also syncs memory selected-song blocks from
computed result snapshots.

The remaining risky path is stale future state:

1. Round 2 can be drawn before Round 1 results are computed.
2. Round 1 can later compute a selected song that is already present in the
   earlier Round 2 draw.
3. Round 2 currently has readiness checks focused on draw count and set
   presence, so the stale draw can still be opened or computed unless the draw
   is rerolled or reset.

The SQL trigger in
`supabase/migrations/20260630010000_phase1_rpc_lockdown_and_draw_guards.sql`
also blocks selected prior songs only when the earlier result snapshot has
`reveal_phase = 'final'`, which conflicts with the required
computed-or-later behavior.

## Implementation Strategy

Use the smallest safe remediation from the parent plan: reject stale future
draws until an operator rerolls or resets the affected future round/set. Do not
auto-delete, auto-reroll, or silently mutate future draws.

### TypeScript Guards

Add pure validation helpers near `src/lib/results/selected-song-blocks.ts`:

- Derive prior selected song keys from result snapshots whose
  `roundNumber < target round`.
- Inspect active draw records for the target round.
- Return structured conflicts including round, set, chart id, chart name, and
  prior selected song key.
- Throw a direct operator-facing error telling the host to reroll or reset the
  affected future draw before opening voting or computing results.

Apply the helper in memory/server paths:

- `drawRoundSetAction`
- `rerollOneChartAction`
- `rerollRoundSetAction`
- `rerollFullRoundAction`
- `openVotingAction`
- `computeResultsAction`
- `computeRoundResult` or its readiness boundary, so non-admin direct result
  computation cannot bypass the guard.
- `overrideResultAction` must continue to reject result corrections that would
  create future selected-song conflicts. This path is already guarded by
  `assertNoFutureSelectedSongConflicts`; Phase 2 should add non-regression
  coverage rather than weakening that behavior.

The draw and reroll action checks are defense in depth. Normal draw eligibility
should already avoid selected prior songs once result blocks are synced, but
explicit chart replacement and future maintenance paths should still be
validated after mutation.

### Supabase SQL Guards

Add a new migration rather than editing historical migrations only. The
migration should:

- Replace `validate_drawn_chart_invariants()` so prior selected-song blocking
  treats result phases `computed`, `set_1_counts`, `set_1_resolved`,
  `set_2_counts`, `set_2_resolved`, and `final` as selected-song-known phases.
- Replace or extend `validate_voting_window_draw_completion()` so opening
  voting fails if any active draw in that round contains a song selected by an
  earlier computed-or-later result.
- Add a helper used by `normalized_compute_results()` so result computation
  fails if active draws contain selected prior songs. The compute RPC must not
  rely only on insert-time trigger behavior because stale draws may predate the
  earlier computed result.

Keep service-role-only execute grants unchanged.

## Tests

Focused tests should prove both memory behavior and SQL source behavior.

### Pure TypeScript

Add or update tests in `src/lib/results/selected-song-blocks.test.ts`:

- Prior selected-song conflict is found only for results from earlier rounds.
- Results in the same or later round do not block the target round.
- Drawn-but-not-selected result rows do not block later rounds.
- Error copy tells the host to reroll or reset the stale future draw.

Add or update tests in `src/lib/draw/round-readiness.test.ts`:

- Round readiness remains pass for two complete seven-chart sets when no prior
  selected conflict exists.
- Readiness or assertion fails when a target-round draw contains a prior
  selected song.

Add or keep focused tests in `src/lib/draw/draw-state.test.ts`:

- New draws continue to snapshot selected-song keys.
- Same-round duplicate and draw eligibility behavior remain unchanged while the
  stale future-draw guard is added.

Add or update tests in `src/lib/results/result-engine.test.ts`:

- Direct result computation rejects stale active draws with prior selected-song
  conflicts.

Add or update tests in `src/lib/integration/tournament-flow.test.ts`:

- Draw Round 2 early with a shared song.
- Compute Round 1 selecting that song.
- Assert Round 2 open/readiness/compute paths are blocked until corrected.
- Assert a rerolled Round 2 set that removes the song can proceed.
- Assert a drawn-but-not-selected Round 1 song remains eligible later.
- Assert result override still blocks changing an earlier selected chart to a
  song that already appears in future active draw or result state.
- If a future voting window was already opened before the earlier result was
  computed, assert compute still rejects the stale draw. Opening state that
  predates the computed result is not auto-invalidated in this phase.

### Supabase SQL Source Tests

Update `src/lib/db/schema.test.ts` and/or
`src/lib/server/transactions/normalized-runtime.test.ts` to assert:

- The latest SQL guard no longer uses only `reveal_phase = 'final'`.
- The selected prior-song guard includes computed-or-later phases.
- Voting-window validation checks selected prior-song conflicts.
- `normalized_compute_results` calls the selected prior-song validation helper.
- The compute RPC guard covers stale draws that predate the earlier computed
  result, not only inserts that happen after the earlier result exists.

## Review Checklist

- No tournament rule changes.
- No browser-side randomness or client-side tournament mutation paths added.
- Drawn-but-not-selected songs remain eligible.
- Same-round duplicate-song blocking remains unchanged.
- Future stale draws are rejected with a clear correction path.
- SQL and TypeScript use the same computed-or-later selected-song boundary.
- No `.github/workflows` files are added.
- Required focused checks and default phase gates pass or are documented.

## Risks And Assumptions

- Existing live data with stale future draws may fail to open or compute after
  this change. That is intentional; operators should reroll or reset the
  affected future draw.
- SQL source tests are not a substitute for a disposable Supabase rehearsal,
  but they are the practical Phase 2 guard available without expanding this
  phase into later Supabase evidence phases.
- The fix assumes result snapshots are authoritative once created, even before
  the stage reaches the final reveal phase.
