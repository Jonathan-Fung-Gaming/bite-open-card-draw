# Phase Status

## Current Remediation Status

Status: A new production-readiness remediation workstream was planned on 2026-07-13. Its active
execution plan is `docs/production-readiness-remediation-plan-2026-07-13.md`, with
`docs/production-readiness-remediation-checklist-2026-07-13.md` as its closure checklist. Start
future work from `docs/codex-current-brief.md`. The dated entries below are an evidence ledger, not
current behavioral requirements; archived plans and checklists are historical unless the user
explicitly references them.

Final tournament readiness still depends on completing and merging every phase in the current plan,
applying and verifying any required Supabase migrations after each merge, deploying the latest code,
selecting or resetting the production event namespace, and completing event-day data/operator
checks. The authoritative
behavior sources during remediation are `docs/product-spec.md` and
`docs/pump_open_stage_repo_validation_checklist.md`; they override stale execution-plan or phase
status text when there is a conflict.

## Production Readiness Remediation Phase 0 - Reproduction And Contracts - 2026-07-13

Status: implementation, hosted/memory evidence, default checks, and manual diff review complete;
ready for the required pull request. PR merge and the post-merge migration-not-applicable closeout
remain open until the merge workflow completes. Phase 0 changed diagnostics and documentation only;
it did not change tournament rules, production state behavior, database schema, or migrations.

### Scope And Changed Files

- Added the reviewed Phase 0 plan and two diagnostic timeout/isolation retrospectives under
  `docs/phase-plans/`.
- Added `docs/production-readiness-phase-0-prr-contract-report-2026-07-13.md` with reproduction or
  source evidence, measurable closure criteria, and later-phase test ownership for PRR-001 through
  PRR-013.
- Added `playwright.phase0.config.ts`, `tests/phase0/visual-baseline.spec.ts`, and
  `tests/phase0/hosted-diagnostics.spec.ts` for opt-in visual, transition, timer, RSC, roster, and
  disposable-hosted baselines.
- Added `tests/phase0/diagnostic-evidence.ts` and its 32-test safety suite. The writer rejects
  sensitive keys/values before allowlist filtering and writes only sanitizer-approved JSON.
- Added `scripts/run-phase0-diagnostics.mjs` and package scripts that generate a fresh `phase0-`
  event id, require explicit destructive-reset opt-in, redact the id in output, isolate the Next
  build, and keep evidence outside the default Playwright cleanup root.
- Extended existing rehearsal/deployment guards to recognize `phase0-` only as an explicitly
  enabled disposable namespace, forwarded isolated build/public URL settings, and made narrow test
  page-object fixes found by the diagnostic runs.
- Updated `.gitignore`, `eslint.config.mjs`, `next.config.mjs`, and `tsconfig.json` for the isolated
  `.next-phase0` and `phase0-test-results` directories.

### Checks Run

- Prettier check on changed supported files - passed after formatting the Phase 0 report.
- `npm run lint` - passed. The first run correctly exposed that `.next-phase0` needed an ESLint
  ignore; that finding was fixed before the passing rerun.
- `npm run typecheck` - passed.
- `npm run test` - passed, 61 files / 404 tests, including all 32 evidence-safety tests.
- `npm run build` - passed for the default `.next` output and during isolated hosted Phase 0 runs.
- `npm run test:e2e` - passed, 6 Playwright tests in 7.1 minutes.
- Phase 0 memory Chromium - passed, 1 test / 9 route-width samples in 54.3 seconds.
- Phase 0 memory WebKit - passed, 1 test / 9 route-width samples in 1.2 minutes.
- Phase 0 hosted direct roster floor - passed, 1 test in 3.9 seconds after build.
- Phase 0 hosted transition/timer/RSC diagnostic - passed, 1 test in 2.2 minutes after build.
- `git diff --check` - passed.
- Secret-like scan - 21 changed/untracked text files and 8 retained sanitized JSON artifacts;
  zero JWT, Supabase secret, private key, password hash, assigned secret, or sensitive JSON-key
  matches; no `.env` file changed.

The required `rtk` wrapper crashed and became unavailable during the diagnostic work. Equivalent
direct commands were used for the final checks; this tooling failure did not change test scope.

### Evidence

- Hosted transition: both draw versions advanced 1 -> 2 on reroll and stayed at version 2 on
  restart; reveal phases were `set_1_counts`, `set_1_resolved`, `set_2_counts`, `set_2_resolved`,
  and `final`, followed by `results_revealed`; all 32 captured public responses were 200 and no
  sanitized page/RSC error was captured.
- Countdown: stage reported 600 seconds, but the phone header produced no parseable countdown;
  phone/stage skew remains unestablished and is an explicit Phase 2 defect contract.
- Hosted admin roster observation: 30 actions yielded 25 confirmations and five timeouts, p50
  14.46 seconds, p95 28.18 seconds, 120.57 seconds total, and 0.86-second second-admin propagation.
- Direct database floor: 30/30 mutations, p50 165.03ms, p95 205.20ms, 208.47ms total, and 51.09ms
  observation through a second client. This isolates the slow admin workflow above the mutation
  layer.
- Aged host observation: after aging disposable host/session timestamps by 31 minutes, original
  control was unavailable and recovery did not succeed, preserving PRR-011 as a Phase 3 defect.
- Visual evidence: Chromium and WebKit each recorded 9 route-width samples for `/charts`, `/vote`,
  and `/results` at 320/360/390px; no sample overflowed horizontally, and all logo samples had
  identical earliest/loaded/settled boxes with zero measured layout shift.
- Retained artifacts are ignored under `phase0-test-results/`; committed aggregate evidence is in
  the Phase 0 PRR contract report.

### Manual Diff Review

- Reviewed against `docs/product-spec.md`, the validation checklist, security notes, admin action
  policy, and phase gates. No tournament rule, draw randomness, result selection, public mutation
  authority, secret boundary, or database schema changed.
- Verified hosted destructive writes require explicit opt-in plus a generated namespace distinct
  from the configured event. Only event-id prefixes and aggregate/allowlisted fields reach evidence.
- Fixed actionable harness findings: stale/strict admin locators, collapsed rehearsal panel checks,
  rehearsal environment forwarding, isolated build/output directories, list-only runner behavior,
  full tiebreak sequencing, and generated-directory lint coverage.
- Initial concurrent/stale diagnostic processes contaminated shared `.next`/output directories;
  those runs were rejected. The accepted evidence was rerun serially with isolated paths.
- No migration exists. Rollback is to revert the diagnostics/report commit; disposable hosted
  namespaces are never promoted to the real tournament namespace.

### Risks And Assumptions

- Phase 0 records current defects; it intentionally does not remediate PRR-001 through PRR-013.
- The admin roster and aged-host aggregates came from sanitizer-approved failed-run evidence and
  are committed in the report; retained passing artifacts cover the direct floor and transitions.
- The visual sample found no logo shift on the measured routes, so Phase 5 must still cover every
  shared-logo consumer and cold/cache loading condition before closing PRR-003.
- The transition run captured no RSC failure, which does not prove atomicity or mounted-ballot
  freshness; the Phase 1 contracts remain required.

## Vote, Results, And Chart Filtering Follow-Up Phase 6 - Short Cut And Full Song Filtering - 2026-07-09

Status: complete for local source, unit, build, memory-dev browser evidence, and regenerated ignored
chart artifacts. This phase did not change draw randomness, round rules, result computation,
persistence schema, RPCs, Supabase migrations, or tournament-changing action boundaries.

### Scope

- Confirmed `data/source/charts.csv` has no category field for Short Cuts, Full Songs, or Remixes;
  it contains only `name`, `name_kr`, `artist`, `label`, `type`, `level`, and `bg_img`.
- Added normalized title matching for disallowed `Short Cut`, `Shortcut`, and `Full Song` markers
  across both `name` and `name_kr`.
- Kept Remix charts eligible unless they also contain a disallowed Short Cut or Full Song marker.
- Filtered disallowed special charts before chart normalization, dedupe, pool counting, and draw
  eligibility.
- Added a dedicated `filteredRows` import-report bucket with source row numbers and clear reasons so
  intentional special-chart filtering is not mixed with malformed skipped rows.
- Added a runtime stale-artifact filter so ignored generated catalogs cannot reintroduce Short Cut or
  Full Song charts if local generated files lag behind source code.
- Regenerated local ignored chart artifacts with `import:charts` and `cache:chart-images` for
  validation.

### Changed Files

- `docs/phase-status.md`
- `scripts/import-charts.ts`
- `src/lib/charts/importer.ts`
- `src/lib/charts/importer.test.ts`
- `src/lib/charts/normalize.ts`
- `src/lib/charts/normalize.test.ts`
- `src/lib/charts/release-data-gate.test.ts`
- `src/lib/charts/runtime-catalog.ts`
- `src/lib/charts/runtime-catalog.test.ts`
- `src/lib/charts/types.ts`

### Checks Run

- `rtk npx prettier --write src/lib/charts/normalize.ts src/lib/charts/normalize.test.ts src/lib/charts/importer.ts src/lib/charts/importer.test.ts src/lib/charts/runtime-catalog.ts src/lib/charts/runtime-catalog.test.ts src/lib/charts/release-data-gate.test.ts src/lib/charts/types.ts scripts/import-charts.ts` - passed.
- `rtk npx vitest run src/lib/charts/normalize.test.ts src/lib/charts/importer.test.ts src/lib/charts/runtime-catalog.test.ts src/lib/charts/release-data-gate.test.ts` - passed, 4 files / 32 tests.
- `rtk npm run import:charts` - passed; imported 4,135 charts and filtered 295 Short Cut or Full
  Song source rows.
- `rtk npm run cache:chart-images` - passed; prepared 559 image assets, all cached, against the
  filtered local chart catalog.
- `rtk npm run verify:release-data` - failed after artifact regeneration only because the existing
  source import still has unsigned repaired/skipped diagnostics requiring `reviewedBy`,
  `reviewedAt`, and `reviewedCommit` release evidence; chart/image artifact identity and pool counts
  no longer failed.
- `rtk git diff --check` - passed.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 60 files / 365 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.

### Evidence

- Local regenerated `chart-import-report.json` recorded 295 filtered rows with source-row reasons:
  232 raw Short Cut rows and 63 raw Full Song rows; no `Shortcut` rows existed in the source CSV.
- Local regenerated `charts.json` and `charts-with-images.json` had 4,135 charts with zero remaining
  Short Cut, Shortcut, or Full Song matches.
- Remix rows remained present: 40 generated remix charts remained after filtering.
- Required pool counts after filtering were S16 175, S17 184, S18 166, S19 154, S20 124, S21 131,
  S22 90, and D23 113; every required pool stayed far above the 7-chart minimum.
- Unit tests cover Short Cut, Shortcut, Full Song, `name_kr` filtering, Remix preservation, false
  positives such as `Short Fuse`, import-report `filteredRows`, pool-count effects, and stale
  generated runtime catalog filtering.

### Manual Review

- Reviewed against `docs/product-spec.md` chart and draw requirements: only eligible chart catalog
  inputs changed; draw randomness, selected-song blocking, result rules, and voting behavior remain
  unchanged.
- No browser-side tournament-changing actions, secrets, service-role keys, admin password data, or
  database mutations were added.

### Risks And Assumptions

- Because the source CSV has no category field, filtering depends on normalized title markers in
  `name` and `name_kr`.
- A chart containing both `Remix` and `Short Cut` is intentionally filtered as a Short Cut, not kept
  by the Remix preservation rule.
- Already-persisted draws or results from before this phase are not retroactively invalidated; reset
  and redraw any active event namespace that already contains a now-filtered chart.
- Generated chart artifacts are ignored by git in this repository; they were regenerated locally for
  validation, and runtime loading now defensively filters stale generated catalogs.
- Full release-data validation still needs signed review evidence for pre-existing repaired/skipped
  source diagnostics.

## Vote, Results, And Chart Filtering Follow-Up Phase 5 - Route Transition Flicker Guard - 2026-07-09

Status: complete for local source, unit, build, and memory-dev browser evidence. This phase did not
change tournament rules, result computation, tiebreak selection, persistence schema, RPCs, or
Supabase migrations.

### Scope

- Added semantic public-route freshness keys with current/displayed rounds, route source, voting
  status, voting-window timestamps, active draw versions, result snapshot/phase timestamps, ballot
  revision timestamp, and tournament-changing audit timestamp.
- Added a client public-route freshness guard that keeps the last accepted route payload and rejects
  stale refresh payloads that arrive after a newer state is accepted.
- Wrapped `/stage`, `/vote`, `/charts`, and `/results` route branches with freshness guards while
  preserving the existing stage result-phase marker used by browser evidence.
- Added voting snapshot `updatedAt` so pause, resume, reopen, and recompute transitions can advance
  route freshness even when the screen moves to a lower-ranked status.
- Covered legitimate backward transitions for reset, round advance, emergency reopen, final-warning
  rollback, pause from final-warning/extension states, and unrevealed computed-result invalidation.
- Hardened e2e admin action clicks used by the full-flow route evidence so refreshes and hydrated
  button replacement do not create no-op clicks during long browser runs.

### Changed Files

- `docs/phase-status.md`
- `src/app/charts/page.tsx`
- `src/app/results/page.tsx`
- `src/app/stage/StageResultPhaseGuard.tsx`
- `src/app/stage/page.tsx`
- `src/app/vote/page.tsx`
- `src/lib/client/PublicRouteFreshnessGuard.tsx`
- `src/lib/round/public-route-freshness.ts`
- `src/lib/round/public-route-freshness.test.ts`
- `src/lib/server/public-route-freshness.ts`
- `src/lib/vote/voting-window.ts`
- `tests/e2e/admin-helpers.ts`
- `tests/e2e/full-flow.spec.ts`

### Checks Run

- `rtk npx prettier --write tests/e2e/full-flow.spec.ts src/lib/round/public-route-freshness.ts src/lib/round/public-route-freshness.test.ts` - passed.
- `rtk npx vitest run src/lib/round/public-route-freshness.test.ts src/lib/vote/voting-window.test.ts` - passed, 2 files / 33 tests.
- `rtk git diff --check` - passed.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 60 files / 362 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e:no-build -- --project=desktop-chromium --grep "full round smoke flow reaches final reveal and downloads private CSV"` - passed after the admin-action click hardening; earlier attempts exposed a Next dev `.next` manifest/chunk race and a stale manual CSV click.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.

### Evidence

- Pure unit tests verify stale same-result reveal payload rejection, newer correction acceptance,
  reset acceptance, stale reset rejection, emergency reopen acceptance, pause/resume acceptance,
  final-warning and extension pause acceptance, final-warning rollback acceptance, computed-result
  invalidation acceptance, stale invalidation rejection, and round advance/older-round rejection.
- Full-flow e2e verifies the public route freshness markers on `/stage`, `/vote`, `/charts`, and
  `/results` through final release, previous-round result fallback, reset, and round advance.
- Full-flow e2e continues to cover stage final reloads, private CSV download, public result release,
  pause/resume draft survival, and tiebreak reveal behavior.

### Manual Review

- Reviewed the diff against `docs/product-spec.md` public route, voting-window, ballot, and result
  visibility requirements.
- No browser-only tournament mutation paths were added; freshness construction reads server state
  and all tournament-changing actions remain server-side.
- No public route now exposes chart-by-chart live counts before results reveal; the guard only emits
  route state markers used by e2e evidence.

### Risks And Assumptions

- Freshness ordering depends on server-maintained voting-window `updatedAt`, result timestamps,
  ballot revision timestamps, active draw version data, and tournament-changing audit timestamps.
- The guard intentionally allows newer payloads to move the UI backward for legitimate admin
  transitions; stale backward payloads remain covered by unit tests.
- Browser evidence verifies guard wiring and accepted markers through real route transitions, while
  the pure comparator tests cover the harder stale-payload ordering cases directly.

## Vote, Results, And Chart Filtering Follow-Up Phase 4 - Rune Wheel Radial Image Orientation - 2026-07-08

Status: complete for local source, unit, build, and memory-dev browser evidence. This phase did not
change result computation, tiebreak selection, winner persistence, RPCs, or Supabase migrations. The
first full e2e run exposed an unrelated manual private CSV download timeout; focused reruns for the
affected desktop specs passed.

### Scope

- Kept the backend-decided winner and existing final wheel landing math unchanged.
- Removed the viewport-upright slot counter-rotation so each rune wheel chart image is oriented
  radially with its bottom edge facing the wheel center.
- Added a small rotation helper for slot image orientation and unit coverage for the 12-slot wheel.
- Added DOM evidence attributes for radial orientation without adding new chart identity or
  selected-winner data beyond the existing slot markup.
- Added full-flow and Phase 9 tiebreak evidence assertions for the 12 slot rotations and a Phase 9
  screenshot attachment after the wheel renders.

### Changed Files

- `docs/phase-status.md`
- `src/app/globals.css`
- `src/components/RuneWheel.tsx`
- `src/components/rune-wheel-rotation.ts`
- `src/components/rune-wheel-rotation.test.ts`
- `tests/e2e/full-flow.spec.ts`
- `tests/phase9/pfr-timer-tiebreak-evidence.spec.ts`

### Checks Run

- `rtk npx prettier --write src/components/RuneWheel.tsx src/components/rune-wheel-rotation.ts src/components/rune-wheel-rotation.test.ts src/app/globals.css tests/e2e/full-flow.spec.ts tests/phase9/pfr-timer-tiebreak-evidence.spec.ts` - passed.
- `rtk npx vitest run src/components/rune-wheel-rotation.test.ts` - passed, 1 file / 4 tests.
- `rtk git diff --check` - passed.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 59 files / 346 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - first run failed in the desktop full-flow smoke on
  `Download private ballot CSV` after final reveal; the mobile route projects and visual evidence
  project passed before the run aborted.
- `rtk npm run test:e2e:no-build -- --project=desktop-chromium --grep "full round smoke flow reaches final reveal and downloads private CSV"` - passed on rerun.
- `rtk npm run test:e2e:no-build -- --project=desktop-chromium --grep "unsaved vote draft survives pause"` - passed.
- `rtk npm run test:e2e:no-build -- --project=desktop-chromium --grep "stage tiebreak wheel hides"` - passed.

### Additional Observed Gate Debt

- `rtk npm run test:e2e:no-build -- --config=playwright.phase9.config.ts --grep "PFR-023 browser tiebreak evidence"` failed before the Phase 4 assertions during Phase 9 rehearsal setup.
- `rtk npm run test:phase9` failed in the same existing Phase 9 memory-profile rehearsal setup path:
  the admin page stayed in tournament mode/host-lock-inactive while waiting for `Rehearsal mode`.

### Evidence

- Unit tests verify the 12-slot radial orientation sequence `[0, 30, 60, ... 330]` and invalid input
  fallbacks.
- The focused stage tiebreak e2e verifies all 12 wheel slots report the radial orientation data while
  visible selected styling and status text remain hidden until reveal completion.
- Phase 9 tiebreak evidence code now records `slotOrientations` and attaches
  `pfr-023-rune-wheel-radial-orientation.png` once that broader rehearsal setup reaches the wheel.

### Risks And Assumptions

- The actual wheel selection math remains covered by the existing final-rotation tests; only per-slot
  visual orientation changed.
- The new DOM orientation attributes are evidence markers; they do not add chart names, chart
  difficulties, or selected-winner status beyond the existing sealed-slot markup.
- The Phase 9 setup failure is outside this phase's code path and should be handled separately; the
  Phase 4-specific full-flow tiebreak browser evidence passed under the memory-dev profile.

## Vote, Results, And Chart Filtering Follow-Up Phase 3 - Result Reveal And Least-Ban Presentation - 2026-07-08

Status: complete for local source, unit, build, and memory-dev browser evidence. This phase did not
change result computation, tiebreak selection, persistence schema, RPCs, or Supabase migrations.

### Scope

- Kept result count rows physically ordered least-banned to most-banned so winner candidates stay at
  the top.
- Preserved the stage reveal tension by assigning a separate most-banned-to-least-banned reveal rank
  while rows remain in their final least-first positions.
- Highlighted every row where `tiedForFewest` is true, and kept the selected winner styling
  strongest once selection is revealed.
- Added selected chart art to the unique least-ban reveal panel.
- Added selected chart art to the 5-or-more fallback tiebreak reveal once the sealed winner is
  revealed.
- Added least-ban highlights to public/phone full ban-count rows while keeping final selected chart
  cards before expandable full counts.

### Changed Files

- `src/components/ResultSetPanel.tsx`
- `src/components/PublicResultSummary.tsx`
- `src/components/result-presentation.test.ts`
- `tests/e2e/full-flow.spec.ts`

### Checks Run

- `rtk npx vitest run src/components/result-presentation.test.ts src/lib/results/result-engine.test.ts src/components/rune-wheel-rotation.test.ts` - passed, 3 files / 14 tests.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 59 files / 345 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.

### Evidence

- Component tests verify unique least-ban and fallback reveal panels render selected chart artwork.
- Component tests verify least-ban rows are flagged and public final selected chart cards render
  before the full ban counts.
- Full-flow e2e verifies stage count rows are least-banned to most-banned while reveal ranks still
  run most-banned to least-banned.
- Full-flow e2e continues to cover stage layout fit, final chart release, and phone/public final
  result visibility.

### Risks And Assumptions

- The result engine already supplied least-first rows; this phase removes the stage-only physical
  resort and uses a separate reveal rank for animation timing.
- Least-ban tie highlights intentionally appear before the final selected winner is known; the
  selected winner receives stronger styling after reveal.

## Vote, Results, And Chart Filtering Follow-Up Phase 2 - Ban Count Clarification And Invariants - 2026-07-08

Status: complete for local source, unit, build, and memory-dev browser evidence. This phase did not
change tournament rules, result selection, persistence schema, RPCs, or Supabase migrations.

### Scope

- Documented the existing rule in code with constants for 2 bans per set and 4 bans per round
  ballot.
- Strengthened tests proving valid submitted ballots can cast up to 4 bans total across both sets.
- Added result-engine invariant coverage proving total counted bans stay within
  `ballotCount * 4`, per-set bans stay within `ballotCount * 2`, and each chart count stays within
  the counted ballot count for that set.
- Added admin live-count invariant coverage proving live per-set and per-chart rows stay within the
  same valid maxima.
- Kept duplicate chart-id rejection coverage in ballot validation.
- Clarified public/stage/admin copy from `Ban selections cast` to
  `Ban selections cast across both sets` where the full label is shown, and clarified compact admin
  voting controls as across both sets.

### Changed Files

- `src/app/coolguy69/page.tsx`
- `src/app/stage/page.tsx`
- `src/lib/admin/live-counts.test.ts`
- `src/lib/results/result-engine.test.ts`
- `src/lib/vote/ballot.ts`
- `src/lib/vote/ballot.test.ts`
- `tests/phase9/assertions/public-ui.assert.ts`

### Checks Run

- `rtk npx vitest run src/lib/vote/ballot.test.ts src/lib/results/result-engine.test.ts src/lib/admin/live-counts.test.ts` - passed, 3 files / 29 tests.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed after rerun; an earlier parallel run raced with `next build`
  deleting/regenerating `.next/types`.
- `rtk npm run test` - passed, 58 files / 342 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.

### Evidence

- Unit tests now explicitly show that totals like 15 bans from 4 ballots are valid because each
  ballot may cast up to 4 bans across the two sets.
- Result-engine tests prove valid counted result rows cannot exceed the round, set, or per-chart
  maxima.
- Admin live-count tests prove live count rows stay within the same valid maxima.
- Browser e2e confirms the clarified public/admin/stage copy does not break the public voting flow.

### Risks And Assumptions

- No counting algorithm changed; the new constants and tests document existing validated-ballot
  behavior.
- The `Ban selections cast across both sets` label is intentionally longer. The compact admin card
  uses the same concept and remains covered by build/e2e layout smoke checks.

## Vote, Results, And Chart Filtering Follow-Up Phase 1 - Player Identity And Ban Instruction UX - 2026-07-08

Status: complete for local source, unit, build, and memory-dev browser evidence. This phase did not
change tournament rules, result computation, persistence schema, RPCs, or Supabase migrations.

### Scope

- Added an explicit identity checkbox after username selection:
  `I confirm that I am <username>`.
- Disabled the username `Confirm` action until the checkbox is checked, and reset that confirmation
  whenever the selected username changes.
- Kept remembered identity as a preselect convenience only; the remembered identity can resume a
  previously confirmed same-round/same-draw browser flow, but it does not bypass the first explicit
  checkbox confirmation for a new flow.
- Added a non-skippable centered `Please ban up to two charts` pop-in before chart selection.
- Disabled ballot controls for 2 seconds while the pop-in is active, then faded it out
  automatically.
- Keyed the completed intro state by round, player, and active draw ids so refreshes do not replay
  the intro unnecessarily while changed draws do.
- Changed selected ban-card styling from ember/orange to red borders, red selected outline, and red
  selected badge treatment while preserving `aria-pressed`.
- Guarded confirmed remembered-identity reloads so local unsaved drafts are not overwritten by the
  default empty ballot state while the saved-ballot/draft lookup is still resolving.

### Changed Files

- `src/app/vote/BallotFlow.tsx`
- `tests/e2e/full-flow.spec.ts`
- `tests/e2e/mobile-routes.spec.ts`
- `tests/e2e/projector-mobile-evidence.spec.ts`
- `tests/phase9/pages/vote.page.ts`
- `tests/phase9/pfr-timer-tiebreak-evidence.spec.ts`

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 57 files / 338 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e -- tests/e2e/full-flow.spec.ts --grep "unsaved vote draft survives pause and resume reloads"` - passed after fixing the remembered-identity draft reload guard.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.

### Evidence

- Mobile route e2e verifies the identity checkbox touch target, disabled confirm-before-checkbox
  state, the non-skippable ban instruction pop-in, disabled chart controls during the pause, and
  automatic dismissal.
- Full-flow e2e verifies duplicate-device warning behavior still appears before chart selection
  after the checkbox is checked.
- Projector/mobile evidence e2e now captures mobile vote evidence after the required checkbox and
  ban-instruction sequence.
- The unsaved-draft pause/resume e2e verifies selected bans still survive paused and resumed reloads.

### Risks And Assumptions

- The two-second instruction pause is intentionally user-visible and therefore adds time to browser
  tests that drive real ballot confirmations.
- The intro replay suppression is session-scoped; a fresh browser session sees the instruction
  again, while a same-session refresh for the same round/player/draw ids does not.
- Existing saved ballots still open at the saved-ballot review screen first; editing a saved set
  triggers the ban instruction before chart controls are usable.

## UX/UI Follow-Up Remediation - Stage Stability, Host Run Controls, Font, And Phone Fit - 2026-07-06

Status: complete for local source, unit, build, and memory-dev browser evidence. This phase did not
change tournament rules, voting logic, result selection, host-lock enforcement, dangerous-action
confirmation rules, database schema, RPCs, or Supabase migrations.

### Scope

- Stabilized `/stage` so result-status rounds stay in result mode even if result hydration is briefly
  missing, with a holding shell instead of falling back to draw rows.
- Reworked `/coolguy69` around one default-open `Host Run Controls` panel for the normal host flow:
  host control, Set 1/Set 2 draw, voting controls, result computation/reveal, CSV download, stage
  completion, and next-round advance.
- Moved recovery/setup/support admin areas behind collapsed panels by default, with persisted
  open/closed state through auto-refresh.
- Copied and loaded the attached `Amazdoomright-o1B0.ttf` with `next/font/local`, removed Geist usage,
  and mapped body/display/mono Tailwind font families to the local Doom font with fallbacks.
- Compressed `/vote` mobile layout with a dense header, tighter ballot cards, and the required
  `No bans for this set` option as the eighth grid tile beside the seventh chart.
- Enlarged difficulty labels in stage reveal/final cards and public/phone result cards so difficulty
  reads at a comparable weight and scale to chart titles.

### Changed Files

- `src/app/coolguy69/_components/AdminCollapsiblePanel.tsx`
- `src/app/coolguy69/page.tsx`
- `src/app/fonts/Amazdoomright-o1B0.ttf`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/stage/page.tsx`
- `src/app/vote/BallotFlow.tsx`
- `src/app/vote/page.tsx`
- `src/components/PublicResultSummary.tsx`
- `src/components/ResultSetPanel.tsx`
- `src/components/StageDrawCard.tsx`
- `src/lib/stage/stage-view.ts`
- `src/lib/stage/stage-view.test.ts`
- `tailwind.config.ts`
- `tests/e2e/admin-helpers.ts`
- `tests/e2e/full-flow.spec.ts`
- `tests/e2e/mobile-routes.spec.ts`
- `tests/e2e/projector-mobile-evidence.spec.ts`
- `tests/phase9/pages/admin.page.ts`

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed after rerun; an earlier parallel run raced with `next build`
  deleting/regenerating `.next/types`.
- `rtk npm run test` - passed, 57 files / 334 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.

### Evidence

- Unit coverage now verifies stage result statuses remain in result mode even without a hydrated
  result snapshot.
- Full e2e now samples `/stage` during Set 1 counts and Set 1 resolved reveal phases and asserts it
  never returns to draw mode.
- Full e2e verifies the new admin run controls order, collapsed secondary/support defaults, persisted
  panel state across refresh, local Amazdoom font usage, final difficulty/title comparability, and
  Host Run Controls CSV download.
- Mobile and projector e2e verify the `/vote` 390px layout has no horizontal overflow, keeps the
  no-bans tile visible beside the seventh chart, preserves 44px touch targets, and renders with the
  compressed mobile ballot layout.

### Risks And Assumptions

- Secondary admin tools remain available but are intentionally hidden behind collapsed recovery
  panels; Playwright helpers now open those panels when tests need rehearsal, manual setup, or
  recovery controls.
- The attached font is applied globally, including `font-mono` surfaces. Fallback fonts remain only
  for unsupported glyphs.
- The next-round action is surfaced after final public release; it advances the round so the next
  Set 1/Set 2 draw controls are immediately available, but it does not auto-draw charts.
- No database schema, RPC, or Supabase migration changed in this phase.

## UX/UI Tournament Readiness Phase 5 - Admin Secondary Panels, Host Lock, Counts, And Data Exposure - 2026-07-05

Status: complete for local source, unit, build, and browser evidence. This phase did not change
tournament rules or database schema. Supabase migrations are not applicable.

### Scope

- Added and reviewed the phase plan:
  `docs/ux-ui-phase-5-admin-secondary-panels-plan-2026-07-05.md`.
- Expanded `/coolguy69` host-lock presentation with active/read-only/no-host context, short owner
  session prefix, takeover/expiry guidance, and visible heartbeat confidence using the existing
  host heartbeat server action.
- Kept host-lock enforcement unchanged: non-host controls remain disabled, normal host control stays
  server-side, and forced takeover remains password and audit-reason gated.
- Added `Hide live counts` to the admin live-count disclosure, kept chart rows absent when hidden,
  and contained live-count row names with a fixed count column.
- Hardened long-name containment across roster rows, draw controls, manual ballot correction,
  chart eligibility rows, live counts, dangerous-action summaries, audit snippets, and native admin
  selects.
- Replaced the public `/charts` client props with a display-safe chart view model that omits draw
  metadata, eligibility snapshots, reasons, timestamps, source image URLs, chart keys, and song keys.

### Checklist Items Closed

- `UXR-029`
- `UXR-030`
- `UXR-032`
- `UXR-033`

### Evidence

- `tests/e2e/full-flow.spec.ts` asserts no-host, active-host, and second-browser read-only host-lock
  context plus heartbeat confidence UI, then captures admin evidence through the full smoke flow.
- `uxr-032-admin-desktop-long-names.png` and `uxr-032-admin-narrow-long-names.png` cover seeded long
  roster text plus deterministic long chart catalog text with desktop and narrow admin containment
  assertions.
- `uxr-032-admin-draw-controls-long-name.png` covers deterministic long selected-chart text inside
  the primary admin draw-control cards after both current-round sets are drawn.
- `uxr-030-admin-live-counts-long-name.png` covers live counts after show and refresh with
  deterministic long live-count text contained, followed by an assertion that `Hide live counts`
  removes chart rows from the DOM.
- `src/lib/charts/public-chart-view.test.ts` proves the `/charts` public view model includes only
  display-safe set/chart fields and omits draw metadata/snapshot/reason/source fields.
- Full e2e still verifies `/charts` renders the two view-only sets and no vote controls after the
  public prop reduction.

### Changed Files

- `docs/phase-status.md`
- `docs/ux-ui-phase-5-admin-secondary-panels-plan-2026-07-05.md`
- `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`
- `src/app/charts/ChartsSetNavigator.tsx`
- `src/app/charts/page.tsx`
- `src/app/coolguy69/_components/AdminLiveCountsDisclosure.tsx`
- `src/app/coolguy69/_components/HostHeartbeat.tsx`
- `src/app/coolguy69/_components/ManualBallotForm.tsx`
- `src/app/coolguy69/page.tsx`
- `src/components/AdminLayout.tsx`
- `src/components/DangerousActionDialog.tsx`
- `src/components/PublicDrawSetPanel.tsx`
- `src/lib/charts/public-chart-view.ts`
- `src/lib/charts/public-chart-view.test.ts`
- `tests/e2e/full-flow.spec.ts`

### Checks Run

- `rtk npm run test -- src/lib/charts/public-chart-view.test.ts` - passed, 2 tests.
- `rtk npm run test:e2e -- tests/e2e/full-flow.spec.ts --grep "full round smoke flow"` - passed.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 55 files / 318 tests.
- `rtk npm run build` - passed.
- `rtk git diff --check` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- Earlier focused e2e attempts exposed two implementation/test issues: the seeded long-name roster
  player was still active and therefore changed private CSV row expectations, and long native admin
  select values could widen the admin page. The long-name player is now marked inactive before the
  voting snapshot, and admin layout/select containment was fixed before final gates were rerun.

### Manual Review

- Product rules were unchanged: four rounds, two chart sets per round, seven charts per set, one
  10-minute voting window, explicit no-ban completion, least-ban selection, backend-decided
  tiebreaks, and final two-chart reveal remain intact.
- Host-lock behavior remains aligned with `docs/product-spec.md`: one active host controls the
  tournament, other admin browsers are read-only, heartbeat expiry enables takeover, and forced
  takeover is explicitly password/audit gated.
- Admin live counts remain admin-only, hidden by default, warning-gated, and passwordless because
  they are sensitive but non-destructive. Public routes still do not show chart-by-chart live counts
  during voting.
- `/charts` remains view-only and public-safe: it cannot submit votes or affect turnout, and its
  client props no longer carry full draw records or non-display draw metadata.
- Security boundaries remain server-side. No service-role keys, password hashes, plaintext
  passwords, browser-side tournament decisions, or new tournament-changing client mutations were
  added.

### Risks And Assumptions

- The heartbeat confidence panel updates from the existing active-host heartbeat action; if a
  browser tab is heavily throttled, the server-side host lock still remains authoritative and the UI
  refreshes on heartbeat failure.
- `overflow-x-hidden` on the admin root prevents native input/select internal scroll width from
  creating page-level horizontal scroll. Playwright also asserts the relevant admin panels remain
  visually contained at desktop and narrow widths.
- The live-count long-name evidence uses a deterministic browser-test text fixture after counts are
  fetched, so it proves the layout containment path without changing tournament chart data.
- Full production-flow 48 -> 36 -> 24 -> 12 rehearsal evidence was not rerun because Phase 5
  targeted secondary admin UX and public data shaping. The release-blocking full rehearsal remains
  part of the Phase 6 closure gate.
- No database schema, RPC, or Supabase migration changed in this phase.

## UX/UI Tournament Readiness Phase 4 - Room, View-Only, And Results Clarity - 2026-07-05

Status: complete for local source, unit, build, and browser evidence. This phase did not change
tournament rules or database schema. Supabase migrations are not applicable.

### Scope

- Added and reviewed the phase plan:
  `docs/ux-ui-phase-4-room-view-results-clarity-plan-2026-07-05.md`.
- Made `/room` dynamic and added concise current-round/status context while preserving the exact
  required choices `I am a player voting` and `View charts only`.
- Added light `/room` auto-refresh so already-open room pages update as the host draws charts,
  opens voting, and releases results.
- Rewrote `/charts` waiting/ready copy in spectator-safe event language and removed public
  reroll/ballot-invalidation wording.
- Added distinct `/charts` copy for no-set, one-set, and both-sets-drawn states.
- Made mobile `/charts` read as a view-only chart browser, exposed anchor targets for set tabs, and
  kept panels server-visible until hydration takes over.
- Prevented stale mobile set-tab state from hiding the only drawn set during one-set-drawn states.
- Added current-round pending and previous-round notice panels to `/results`.
- Replaced public `/vote` missing-result fallback wording that referenced result computation and
  committed snapshots.
- Added route-specific browser titles for `/room`, `/stage`, `/vote`, `/charts`, `/results`, and
  `/coolguy69`.
- Added automatic retry and clearer projector recovery copy to the `/stage` error boundary, plus a
  matching event-day runbook note.
- Eager-loaded public view-only chart images so the `/charts` inspection page and mobile WebKit
  evidence reliably render visible artwork.

### Checklist Items Closed

- `UXR-011`
- `UXR-012`
- `UXR-017`
- `UXR-018`
- `UXR-019`
- `UXR-020`
- `UXR-021`
- `UXR-023`

### Evidence

- `tests/e2e/mobile-routes.spec.ts` captures `uxr-012-mobile-room-awaiting-draw.png`,
  `uxr-018-mobile-charts-one-set-drawn.png`, `uxr-019-mobile-results-pending.png`, existing mobile
  `/charts` set screenshots, and asserts route titles, room auto-refresh, required `/room` links,
  no public internal copy, partial-draw stale-tab recovery, view-only navigation labels, no ballot
  controls on `/charts`, and no horizontal overflow.
- `tests/e2e/full-flow.spec.ts` asserts `/stage`, `/room`, `/charts`, and `/coolguy69` route titles,
  verifies one-set `/charts` copy during the live draw flow, and captures
  `uxr-019-results-previous-round-fallback.png` after Round 1 is final and Round 2 is not final.
- `src/app/stage/error.test.ts` verifies the stage error boundary renders automatic retry copy,
  manual retry, projector recovery instructions, and calls `reset()` after the auto-retry delay.

### Changed Files

- `docs/event-day-runbook.md`
- `docs/phase-status.md`
- `docs/ux-ui-phase-4-room-view-results-clarity-plan-2026-07-05.md`
- `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`
- `src/app/charts/ChartsSetNavigator.tsx`
- `src/app/charts/page.tsx`
- `src/app/coolguy69/page.tsx`
- `src/app/layout.tsx`
- `src/app/results/page.tsx`
- `src/app/room/RoomAutoRefresh.tsx`
- `src/app/room/page.tsx`
- `src/app/stage/error.test.ts`
- `src/app/stage/error.tsx`
- `src/app/stage/page.tsx`
- `src/app/vote/page.tsx`
- `src/components/PublicDrawSetPanel.tsx`
- `tests/e2e/full-flow.spec.ts`
- `tests/e2e/mobile-routes.spec.ts`

### Checks Run

- `rtk npm run test -- src/app/stage/error.test.ts` - passed, 2 tests.
- `rtk npm run test:e2e -- tests/e2e/mobile-routes.spec.ts` - passed, 2 Playwright tests.
- `rtk npm run test:e2e -- tests/e2e/full-flow.spec.ts` - passed, 3 Playwright tests.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 54 files / 316 tests.
- `rtk npm run build` - passed.
- `rtk git diff --check` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- Earlier focused mobile e2e runs exposed two implementation/test issues: admin setup was trying to
  click host controls after navigating the same page to public routes, and mobile WebKit did not
  complete lazy public chart-image loads before the metadata check. The final passing run uses a
  separate public evidence page and eager public chart images.
- Post-implementation review found that `/room` needed refresh behavior, the stage retry timer
  needed direct verification, and a remembered Set 2 mobile tab could hide the only drawn set during
  one-set-drawn `/charts` states. These were fixed before final gates were rerun.
- One final full e2e attempt reached the manual CSV section as the old 300-second full-flow test
  budget expired; the expanded smoke test budget is now 420 seconds and the final full e2e rerun
  passed.

### Manual Review

- Product rules were unchanged: four rounds, two chart sets per round, seven charts per set, one
  10-minute voting window, explicit no-ban completion, least-ban selection, backend-decided
  tiebreaks, and final two-chart stage reveal remain intact.
- `/room` still offers the exact required choices and does not collect identity or submit votes.
- `/charts` remains view-only: no username selector, ballot controls, submit action, or
  turnout-affecting behavior was added.
- The anti-spoiler boundary remains intact. `/vote`, `/charts`, and `/results` still show holding
  copy until the host releases final results after the stage reveal.
- Public routes still do not show chart-by-chart live counts during voting.
- Security boundaries remain server-side. No browser randomness, client-side tournament decisions,
  service-role keys, password hashes, plaintext passwords, or new tournament-changing client
  mutations were added.

### Risks And Assumptions

- The `/stage` error boundary retries through Next's `reset()` every five seconds. If the underlying
  server/backend failure persists, the runbook still instructs the operator to confirm
  `/coolguy69` health and refresh the projector browser.
- `/charts` now eager-loads public chart images for inspection reliability. This intentionally adds
  earlier image requests on the view-only route, but uses the existing local cached/fallback image
  strategy.
- `/room` now refreshes on the same public-inspection cadence used by view-only public routes.
  Background tabs may still be browser-throttled, so users can manually navigate if a venue phone is
  heavily throttled.
- Full production-flow 48 -> 36 -> 24 -> 12 rehearsal evidence was not rerun because this phase
  targeted public route clarity and local memory-backend browser evidence passed. The
  release-blocking full rehearsal remains part of the later closure gate.
- No database schema, RPC, or Supabase migration changed in this phase.

## UX/UI Tournament Readiness Phase 3 - Phone And Stage Chart Readability - 2026-07-05

Status: complete for local source, unit, build, and browser evidence. This phase did not change
tournament rules or database schema. Supabase migrations are not applicable.

### Scope

- Added and reviewed the phase plan:
  `docs/ux-ui-phase-3-phone-stage-readability-plan-2026-07-05.md`.
- Added `ChartArtImage`, a shared client-side chart art primitive that keeps local cache paths as
  the preferred source, switches to `/chart-images/fallback-card.svg` on render-time image errors,
  and also recovers if a cache 404 completes before hydration attaches the error handler.
- Replaced dim CSS-background chart art on mobile ballot, public chart, and selected result cards
  with visible image bands plus separate metadata areas.
- Removed selected-result title/artist clamps so primary final cards can preserve long chart
  identity on `/vote`, `/charts`, and `/results`.
- Tightened 720p stage chrome and raised standard stage card readability while preserving exactly
  two horizontal rows of seven cards.
- Moved the exact `No bans for this set` choice above the ballot grid, kept it as the only zero-ban
  path, and enlarged phone secondary controls.
- Added explicit server-confirmed saved-ballot copy and an unsaved-edit warning that the previous
  server-confirmed ballot remains valid until a new save succeeds.
- Moved duplicate active-device warning earlier by checking existing ballots on username selection
  and reusing the existing server-side voter presence action at Confirm, before ballot cards render.
  A detected active-device conflict stays on the identity screen for one explicit continue click; no
  browser database writes or new secrets were added.
- Rewrote `/vote` waiting copy for not-drawn and not-open states.
- Strengthened Phase 11 visual evidence helpers so later release evidence uses the same projector
  readability expectations.

### Checklist Items Closed

- `UXR-002`
- `UXR-003`
- `UXR-004`
- `UXR-010`
- `UXR-013`
- `UXR-014`
- `UXR-015`
- `UXR-016`
- `UXR-022`

### Evidence

- `tests/e2e/projector-mobile-evidence.spec.ts` forces `/chart-images/cache/*` failures and
  captures fallback evidence for `/stage`, `/charts`, and `/vote`.
- `tests/e2e/full-flow.spec.ts` forces final `/results` cache-image failures and captures
  `uxr-002-mobile-results-image-fallback.png`.
- Mobile route evidence captures readable `/charts` cards for both sets:
  `uxr-003-*-mobile-charts-set-1.png` and `uxr-003-*-mobile-charts-set-2.png`.
- Final results evidence captures `uxr-004-mobile-results-final.png` and
  `uxr-004-mobile-results-corrected-long-name.png`.
- Waiting-state evidence captures `uxr-013-mobile-vote-waiting-not-drawn.png`,
  `uxr-013-mobile-vote-waiting-not-open.png`, `uxr-013-mobile-vote-paused.png`, and
  `uxr-013-mobile-vote-closed-revealing.png`.
- 720p projector evidence captures `pfr-031-stage-1280x720-voting.png` and asserts title, artist,
  difficulty, minimum card height, no overlap, no scroll, and QR/timer geometry.
- Mobile ballot evidence asserts no vague skip action, empty selection cannot advance, the explicit
  no-ban choice advances, selecting a ban clears no-ban, and secondary controls meet minimum
  tap-target height.
- Browser save/edit evidence covers saved ballot, edit draft, forced failed save, previous
  server-confirmed reassurance, and reload preserving the previous saved revision.
- Duplicate identity evidence covers existing-ballot and active-device warnings before ballot cards
  render on a second device, then verifies the second Confirm can continue.

### Changed Files

- `docs/phase-status.md`
- `docs/ux-ui-phase-3-phone-stage-readability-plan-2026-07-05.md`
- `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`
- `src/app/vote/BallotFlow.tsx`
- `src/app/vote/page.tsx`
- `src/components/ChartArtImage.tsx`
- `src/components/PublicDrawSetPanel.tsx`
- `src/components/PublicResultSummary.tsx`
- `src/components/ResultSetPanel.tsx`
- `src/components/RoundHeader.tsx`
- `src/components/StageDrawCard.tsx`
- `src/components/StageSetPanel.tsx`
- `src/components/index.ts`
- `tests/e2e/full-flow.spec.ts`
- `tests/e2e/mobile-routes.spec.ts`
- `tests/e2e/projector-mobile-evidence.spec.ts`
- `tests/phase9/fixtures/phase11-visual-evidence.ts`

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test -- src/lib/vote/phone-view.test.ts` - passed, 6 tests.
- `rtk npm run test` - passed, 53 files / 314 tests.
- `rtk npm run build` - passed.
- `rtk git diff --check` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- Earlier e2e attempts exposed 720p stage overflow, a hydration-missed image 404 fallback path, and
  stale expected copy in tests. Those were fixed before the final passing gate run.

### Manual Review

- Product rules were unchanged: four rounds, two chart sets per round, seven charts per set, one
  10-minute voting window, 1-2 bans or explicit no-ban completion, least-ban winner selection,
  server-decided tiebreaks, and final two-chart reveal remain intact.
- The stage draw layout still uses exactly two horizontal rows of seven charts.
- The no-ban path remains explicit and uses the required label `No bans for this set`; no skip
  action was added.
- Save-failure behavior remains aligned with the product spec: if a later edit fails, the previous
  server-confirmed ballot remains valid.
- Duplicate-device behavior still warns but allows the latest valid submitted ballot to count.
- Security boundaries remain server-side. The earlier active-device warning reuses
  `claimVoterPresenceAction` only after the required username confirmation; no presence writes
  happen while browsing dropdown options, and no browser Supabase writes, service-role keys,
  password hashes, plaintext passwords, or client-side tournament decisions were added.

### Risks And Assumptions

- Phase 3 evidence is local memory-backend browser evidence. Release-blocking production-flow
  48 -> 36 -> 24 -> 12 rehearsal evidence remains part of the later closure gate.
- Forced image fallback evidence aborts cache requests in Playwright. It proves render-time
  fallback behavior, not that the deployed production artifact includes cache images; `UXR-001`
  remains open for deployed cache evidence.
- 720p stage readability is balanced against the fixed two-row-by-seven layout and QR/timer
  requirements. The automated geometry checks now guard this balance.
- No database schema, RPC, or Supabase migration changed in this phase.

## UX/UI Tournament Readiness Phase 2 - Reveal Synchronization And Public Route Freshness - 2026-07-05

Status: complete for local source, unit, build, and browser evidence. This phase did not change
tournament rules or database schema. Supabase migrations are not applicable.

### Scope

- Added and reviewed the phase plan:
  `docs/ux-ui-phase-2-reveal-sync-public-freshness-plan-2026-07-05.md`.
- Split the final stage reveal from public phone/result release. Advancing reveal to `final` now
  lets `/stage` show the two final charts while `/vote`, `/charts`, and `/results` continue to show
  the required holding copy until the host clicks `Confirm Stage Reveal Complete`.
- Kept private CSV auto-download and manual download behind the final public release state, so CSV
  export does not fire while phones/results are still intentionally held.
- Kept final `/stage`, `/vote`, `/charts`, and `/results` pages refreshing so already-open tabs can
  recover from final result correction, reset, and round advance.
- Added tiebreak-aware stage refresh behavior: stage polling uses a separate reveal cadence and
  skips `router.refresh()` while a rune-wheel or fallback tiebreak is still unrevealed.
- Updated normalized Supabase-derived phone status so a final result snapshot alone does not reveal
  phones unless the voting window is also `results_revealed` or `round_complete`.
- Added Playwright evidence for already-open public tabs through final release, correction, reset,
  and round advance without manual browser reload.

### Checklist Items Closed

- `UXR-007`
- `UXR-008`
- `UXR-009`

### Evidence

- `tests/e2e/full-flow.spec.ts` asserts `/stage` uses tiebreak refresh deferral during result
  reveal, then waits for the tiebreak winner to reveal before advancing.
- The same e2e flow captures `uxr-008-vote-holding-before-final.png` and
  `uxr-008-results-holding-before-final.png`, proving phones/results hold before final public
  release.
- The same e2e flow captures `uxr-009-open-stage-final.png`, `uxr-009-open-vote-final.png`,
  `uxr-009-open-charts-final.png`, and `uxr-009-open-results-final.png` after the explicit public
  release action updates already-open tabs.
- `uxr-009-open-route-correction.json` records the corrected chart target used to prove
  already-open `/stage`, `/vote`, `/charts`, and `/results` update after a result override.
- The same e2e flow keeps public tabs open and verifies they drop stale final content after reset
  and then update after round advance.
- Unit coverage proves the phone helper holds when a result is final but status is still
  `results_revealing`, result-store tiebreak timing blocks final advance until second-set tiebreak
  completion, and normalized persistence keeps phones held until the voting window is released.

### Changed Files

- `docs/phase-status.md`
- `docs/ux-ui-phase-2-reveal-sync-public-freshness-plan-2026-07-05.md`
- `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`
- `src/app/charts/ChartsAutoRefresh.tsx`
- `src/app/charts/page.tsx`
- `src/app/coolguy69/actions.ts`
- `src/app/coolguy69/page.tsx`
- `src/app/results/ResultsAutoRefresh.tsx`
- `src/app/results/page.tsx`
- `src/app/stage/StageAutoRefresh.tsx`
- `src/app/stage/page.tsx`
- `src/app/vote/VoteAutoRefresh.tsx`
- `src/app/vote/page.tsx`
- `src/lib/admin/action-policy.ts`
- `src/lib/results/result-store.test.ts`
- `src/lib/server/admin-actions.test.ts`
- `src/lib/server/normalized-operational-state.test.ts`
- `src/lib/server/normalized-operational-state.ts`
- `src/lib/vote/phone-view.test.ts`
- `src/lib/vote/phone-view.ts`
- `tests/e2e/full-flow.spec.ts`

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test -- src/lib/vote/phone-view.test.ts src/lib/results/result-store.test.ts src/lib/server/admin-actions.test.ts src/lib/server/normalized-operational-state.test.ts`
  - passed, 4 files / 40 tests.
- `rtk npm run test` - passed, 53 files / 314 tests.
- `rtk npm run build` - passed.
- `rtk git diff --check` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- An earlier parallel typecheck/build attempt hit Next `.next/types` contention while build was
  regenerating `.next`; the serial rerun of `rtk npm run typecheck` passed.

### Manual Review

- Product rules were unchanged: four rounds, two chart sets per round, seven charts per set, one
  voting window, explicit no-ban completion, least-ban result selection, server-decided tiebreaks,
  and final two-chart stage reveal remain intact.
- The anti-spoiler requirement is stronger after this phase: `/stage` can show final charts before
  phones/results are released, and phones/results continue to show `Voting is closed. Results are
being revealed on stage.` until the host confirms stage completion.
- Security boundaries remain server-side: reveal advancement, final public release, result
  override, reset, round advance, and CSV export all go through server actions with existing host
  lock/session checks. Dangerous actions still require password re-entry where required.
- Public routes still do not expose chart-by-chart live counts during voting.
- No browser randomness, client-side tournament decisions, secrets, service-role keys, password
  hashes, or plaintext passwords were added.

### Risks And Assumptions

- The host must click `Confirm Stage Reveal Complete` after the projector visibly reaches the final
  two-chart screen; this deliberate step is what releases phones/results and CSV download.
- Final public pages refresh on a light polling cadence. Background browser tabs can throttle timers,
  so the e2e evidence brings already-open tabs to the front before waiting for refresh-driven
  assertions without manually reloading them.
- No database schema, RPC, or Supabase migration changed in this phase. The public-release boundary
  uses the existing voting-window status.
- Full production-flow 48 -> 36 -> 24 -> 12 rehearsal evidence was not rerun because this phase
  targeted one-round reveal synchronization and public route freshness. The release-blocking full
  rehearsal remains part of the later closure gate.

## UX/UI Tournament Readiness Phase 1 - Event-Day Admin Flow And Reroll Confirmation Cleanup - 2026-07-05

Status: complete for local source, unit, build, and browser evidence. This phase did not change
tournament rules or database schema. Supabase migrations are not applicable.

### Scope

- Added and reviewed the phase plan:
  `docs/ux-ui-phase-1-event-day-admin-flow-plan-2026-07-05.md`.
- Reordered `/coolguy69` visually around the event-day runbook path: host control, current
  readiness, draw current round, reveal drawn charts on stage, open/monitor voting, manual
  corrections, compute/reveal, and private CSV export.
- Added a top current-round readiness panel with host lock status, current-round draw count,
  active-player count, required pool readiness, and local image-cache metadata readiness.
- Added a `Reveal Drawn Charts` stage checkpoint before voting controls so the host verifies the
  projector has shown both seven-chart rows before voting opens.
- Moved chart eligibility and tournament configuration below day-of controls and collapsed the
  detailed chart eligibility list by default.
- Moved manual ballot correction visually before result computation/reveal controls.
- Replaced inline full-round, set, and chart reroll warning blocks with closed confirmation details
  using the existing `DangerousActionDialog` summary-before-password pattern.
- Centered the QR square inside `QRPanel`.
- Added e2e evidence for admin flow order, hidden live counts, collapsed chart eligibility, hidden
  reroll warning copy until confirmation, manual correction before result reveal, and QR centering.

### Checklist Items Closed

- `UXR-005`
- `UXR-024`
- `UXR-025`
- `UXR-026`
- `UXR-027`
- `UXR-028`
- `UXR-031`

### Evidence

- `tests/e2e/full-flow.spec.ts` now captures `uxr-phase1-admin-event-day-flow.png` and asserts the
  `/coolguy69` visual order from host control through readiness, draw, stage reveal check, voting,
  manual correction, result reveal, and secondary chart eligibility.
- The same e2e evidence asserts chart eligibility details are closed by default and live counts have
  no visible rows before deliberate disclosure.
- The same e2e evidence asserts active roster count is visible in the top readiness panel.
- The chart-reroll e2e path opens the new confirmation details, verifies the dangerous-action
  summary/consequence before password entry, and then submits the reroll through the existing server
  action.
- `tests/e2e/full-flow.spec.ts`, `tests/e2e/projector-mobile-evidence.spec.ts`, and
  `tests/phase9/fixtures/phase11-visual-evidence.ts` assert the QR square is centered within
  `room-qr-panel` while retaining the `/room` QR target.
- `rtk npm run test:e2e` passed with desktop admin/stage evidence, mobile route evidence, and
  1280x720/desktop projector screenshots.

### Changed Files

- `docs/phase-status.md`
- `docs/ux-ui-phase-1-event-day-admin-flow-plan-2026-07-05.md`
- `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`
- `src/app/coolguy69/page.tsx`
- `src/app/coolguy69/_components/ManualBallotForm.tsx`
- `src/components/QRPanel.tsx`
- `src/lib/server/admin-actions.test.ts`
- `tests/e2e/admin-helpers.ts`
- `tests/e2e/full-flow.spec.ts`
- `tests/e2e/mobile-routes.spec.ts`
- `tests/e2e/projector-mobile-evidence.spec.ts`
- `tests/phase9/fixtures/phase11-visual-evidence.ts`
- `tests/phase9/pages/admin.page.ts`

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test -- src/lib/server/admin-actions.test.ts src/lib/public-url.test.ts` - passed,
  23 tests.
- `rtk npm run test` - passed, 53 files / 310 tests.
- `rtk npm run build` - passed.
- `rtk git diff --check` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- An earlier parallel build/e2e attempt hit Next `.next` contention during page collection; the
  serial `rtk npm run build` rerun passed.

### Manual Review

- Product rules were unchanged: four rounds, two chart sets per round, seven charts per set, one
  10-minute voting window, explicit no-ban completion, least-ban result selection, server-decided
  tiebreaks, and final two-chart reveal remain intact.
- Security boundaries were unchanged: rerolls, manual ballots, result overrides, emergency reopen,
  reset, and current-round eligibility changes still go through server actions with password
  re-entry and audit reasons where required.
- Admin live counts remain hidden by default behind `AdminLiveCountsDisclosure`; no public
  chart-by-chart live counts were added.
- QR behavior remains a general `/room` target, not a player-specific or `/vote` link.
- The local image-cache readiness card is explicitly a local metadata signal. It does not close
  `UXR-001`, which still requires deployed cache-asset evidence after merge/deploy.

### Risks And Assumptions

- The admin page uses CSS order classes to produce the event-day visual sequence while preserving
  existing server-action component structure. Browser evidence verifies the current visual order.
- Rehearsal controls are collapsed in the event mode panel to keep current-round draw/vote/reveal
  controls primary. Tests that intentionally use rehearsal setup now open that disclosure
  deliberately.
- No database schema, RPC, or Supabase migration changed in this phase.
- Full production-flow 48 -> 36 -> 24 -> 12 rehearsal evidence was not rerun because this phase
  targeted admin/QR UX and the available e2e/projector evidence passed. The release-blocking full
  rehearsal remains part of the later closure gate.

## UX/UI Tournament Readiness Phase 0 - Production Image And Environment Triage - 2026-07-05

Status: triage complete. `UXR-001` remains open because the current production alias still serves
placeholder/fallback chart art. `UXR-006` is closed with live route evidence: the stage QR target is
an absolute public `/room` URL.

### Scope

- Classified the live production placeholder-image cause for
  `https://bite-open-card-draw.vercel.app`.
- Checked public `/stage`, `/charts`, `/vote`, and `/results` route behavior where chart cards were
  available in the current live state.
- Checked the deployed sample cache asset path and fallback asset path directly.
- Checked the current Vercel production deployment metadata and build logs.
- Checked the local release data/image gates and the current QR public URL configuration.
- Updated release/deployment notes so the next deployment must prove public cache assets and QR
  target correctness before event use.

### Evidence

- Vercel production alias points to deployment `dpl_CbcYUupwVHcCXXPPH6gE3AquE8Y5`, created
  2026-07-02 01:11 JST from a 2026-07-01 UTC build.
- Vercel build logs reported `Downloading 247 deployment files` and `Collected static files
(public/, static/, .next/static): 7.036ms`. Current `main` has 935 tracked files, including 640
  tracked `public/chart-images` entries and 639 cache PNGs.
- Direct live asset probe:
  `https://bite-open-card-draw.vercel.app/chart-images/cache/72c9c23d2dabd62504d6a6c5.png`
  returned 404.
- Direct live fallback probe:
  `https://bite-open-card-draw.vercel.app/chart-images/fallback-card.svg` returned 200.
- Live Playwright route probe:
  - `/stage`: QR target `https://bite-open-card-draw.vercel.app/room`; requested
    `/chart-images/fallback-card.svg` with 200.
  - `/charts`: rendered `data-chart-image-path="/chart-images/fallback-card.svg"` and requested
    fallback art with 200.
  - `/vote` and `/results`: no chart image requests were present in the currently rendered live
    state.
- Local image verification passed: `rtk npm run verify:real-chart-images` verified
  `data/generated/charts-with-images.json`, 639 public cache files, and 4,426 runtime charts using
  non-fallback artwork.
- Local `public/chart-images/cache` contains 639 PNGs, and `git ls-files` confirms the cache PNGs
  are tracked.
- `data/generated/*.json` and `*.sha256` are ignored by git and are not generated by the Vercel
  build command. The deployed app can still derive deterministic `/chart-images/cache/...` paths
  from `data/source/charts.csv` when the public cache files are present.
- Local `.env.local` sets `NEXT_PUBLIC_SITE_URL=https://bite-open-card-draw.vercel.app`.

### Classification

- Primary `UXR-001` cause: deployment artifact / stale production artifact missing
  `public/chart-images/cache/*`.
- Not classified as an app rendering bug yet: local runtime validates real cached art and the live
  server falls back because the sampled public cache asset is absent.
- Not classified as missing QR environment: production `/stage` generated an absolute QR target for
  `/room`.
- `data/generated/charts-with-images.json` and `data/generated/image-assets.json` are local release
  evidence artifacts under the current repository strategy, not deployed runtime requirements unless
  the build/deploy strategy is changed to generate or include them.

### Required Next Step

Redeploy the current `main` source so the production artifact includes the tracked
`public/chart-images/cache/*.png` files. After deployment, rerun an external route probe and do not
close `UXR-001` until:

- at least one sampled `/chart-images/cache/*.png` URL returns 200 from the deployed URL,
- `/stage` and `/charts` route evidence requests `/chart-images/cache/*` rather than only
  `/chart-images/fallback-card.svg`, and
- any `/vote` or `/results` chart-card state available during rehearsal also uses cache art.

If a redeploy of current `main` still returns 404 for tracked cache files, inspect Vercel file
upload inputs, ignored files, deployment source branch/commit, and any controlled-storage
configuration before changing app code. If cache files return 200 but routes still render fallback,
then investigate runtime catalog/data behavior.

### Changed Files

- `docs/deployment-readiness.md`
- `docs/phase-status.md`
- `docs/release-checklist.md`
- `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`

### Checks Run

- `rtk npm run verify:real-chart-images` - passed for 4,426 runtime charts and 639 public cache
  files.
- `rtk proxy npx vercel inspect https://bite-open-card-draw.vercel.app` - passed; production
  deployment metadata captured.
- `rtk proxy npx vercel inspect https://bite-open-card-draw.vercel.app --logs` - passed; build-file
  count and build timing captured.
- Live Playwright route probe against `/stage`, `/charts`, `/vote`, and `/results` - completed;
  route image/QR evidence captured above.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 53 files / 310 tests.
- `rtk npm run verify:release-data` - passed with signed diagnostics and verified 639 public cache
  files for 4,426 runtime charts.
- `rtk proxy git diff --check` - passed.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.

### Manual Review

- Product rules were unchanged. No draw, ballot, result, timer, player identity, admin, host lock,
  or tournament route behavior was modified.
- Public QR behavior remains the required general `/room` target, not a player-specific or `/vote`
  link.
- `UXR-001` remains open because production still serves fallback chart art.
- `UXR-006` is closed by live route evidence and deployment checklist coverage.

### Risks And Assumptions

- The live app was probed in its current public state. `/vote` and `/results` did not currently
  render chart cards, so their image evidence must be collected again during a rehearsal state that
  displays cards.
- Generated JSON files are ignored and reproducible. If the release policy changes to require those
  files inside the deployed lambda bundle, that is deployment/build work, not tournament-rule work.
- The current production alias is not event-ready until deployed cache-art probes pass.

## Production Readiness Remediation Phase 12 - Release Metadata Closure - 2026-07-04

Status: implemented for source-side metadata, final-phase CI, and local/release evidence gates.
External deployed evidence, production environment verification, real event roster setup,
venue-distance QR scan evidence, private CSV file location confirmation, and post-merge deployed
commit matching remain release checklist items and were not claimed as complete.

### Scope

- Added and reviewed `docs/phase-12-release-metadata-closure-plan-2026-07-04.md`.
- Created final-phase GitHub Actions workflow `.github/workflows/ci.yml` with source-only gates:
  `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`.
- Updated CI/secret hygiene tests to validate the Phase 12 workflow and prove it does not require
  production secrets, Supabase migration pushes, image-cache downloads, or production-flow gates.
- Recorded Phase 12 source metadata in `docs/release-checklist.md`, including branch, base commit,
  operator, chart CSV hash, import report hash, imported catalog hash, runtime catalog hash, image
  manifest hash, and public chart-art cache count/bytes.
- Renamed the older Supabase-dev four-round command from `test:phase9:full` to
  `test:diagnostic:supabase-dev-full` so it cannot be mistaken for release evidence.
- Reconciled stale remediation checklist language so Phase 11's linked-Supabase production-flow
  evidence replaces the older hosted-Supabase blocker.
- Hardened private CSV export audit persistence to use the result-admin partial persistence path,
  avoiding unnecessary full player/draw/ballot rewrites during a read/export action.

### Changed Files

- `.github/workflows/ci.yml`
- `docs/asset-audit.md`
- `docs/deployment-readiness.md`
- `docs/event-day-runbook.md`
- `docs/phase-12-release-metadata-closure-plan-2026-07-04.md`
- `docs/phase-status.md`
- `docs/production-flow-risk-remediation-plan-2026-07-02.md`
- `docs/production-readiness-remediation-plan-2026-07-03.md`
- `docs/production-readiness-review-checklist-2026-07-03.md`
- `docs/rehearsal-runbook.md`
- `docs/release-checklist.md`
- `docs/remediation-issue-checklist.md`
- `package.json`
- `src/app/coolguy69/actions.ts`
- `src/lib/server/ci-workflow.test.ts`
- `src/lib/server/normalized-operational-state.test.ts`

### Checks Run

- `rtk npm run test -- src/lib/server/ci-workflow.test.ts` - passed, 3 tests.
- `rtk npm run test -- src/lib/server/normalized-operational-state.test.ts src/lib/server/ci-workflow.test.ts`
  - passed, 15 tests.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 53 files / 310 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- `rtk npm run test:phase9` - passed, 2 passed and 1 Supabase-only invariant skipped under memory.
- `rtk npm run test:e2e:production-flow:validate` - passed against linked Supabase disposable event
  `rehearsal-2026-07-03-prod-db-01`.
- `rtk npm run test:e2e:production-flow` - passed after the private CSV persistence change in 20.0
  minutes against linked Supabase disposable event `rehearsal-2026-07-03-prod-db-01`; host-lock
  two-session evidence and the full four-round 48 -> 36 -> 24 -> 12 rehearsal passed.
- `rtk npm run import:charts` - passed, then rerun with
  `--reviewed-by=Codex --reviewed-commit=a67f4f1e1f5bfbe2c46869586a45a3932bb2f6f2` so repaired and
  skipped diagnostics retain signed review evidence.
- `rtk npm run cache:chart-images` - passed with 639 cached assets and 0 fallback assets.
- `rtk npm run verify:real-chart-images` - passed for 4,426 runtime charts and 639 public cache
  files.
- `rtk npm run verify:release-data` - passed with signed diagnostics and current import report hash
  `43ac5e28174a2912338e9d2a905c38f317c0d04081b9cf761cce31f9631041fd`.
- `rtk npm run test:load` - passed, API-injection load profile.
- `rtk npm run test:load:player-routes` - passed, normal `/room -> /vote` route-player profile with
  spectator traffic.
- `rtk npm audit --omit=dev` - passed with 0 vulnerabilities.
- `rtk npm run supabase:migration:list` - passed; local and remote migrations are aligned through
  `20260704010000`.
- `rtk npm run supabase:db:lint` - failed because local Supabase Postgres is not running
  (`LegacyDbConnectError`).
- `rtk npx supabase db lint --linked` - passed, no remote schema errors found.
- `rtk git diff --check` - passed.
- `rtk npm run test:diagnostic:supabase-dev-full` - not a release gate and intentionally not rerun
  after the command rename. The previous legacy command name exposed why the dev-profile full run
  was too expensive and easy to confuse with production-flow evidence.

### Manual Review

- Product rules were unchanged: 4 rounds, 2 chart sets per round, 7 charts per set, one 10-minute
  voting window, explicit `No bans for this set`, least-ban winners, server-side tiebreak decisions,
  and final two-chart reveal remain intact.
- The GitHub Actions workflow does not include production secrets, Supabase service-role values,
  migration pushes, production-flow credentials, or chart-image network/cache operations.
- Private CSV export still requires admin session and active host control; the change only narrows
  persistence for export audit rows so a read/export path does not rewrite unrelated runtime tables.
- Release checklist rows for deployed commit, production Vercel environment, real event namespace,
  real roster, manual venue QR scan, and CSV file location remain intentionally unchecked.

### Risks And Assumptions

- A tracked release checklist cannot truthfully contain the final SHA of the same commit that edits
  it. The post-merge source commit and deployed commit must be recorded in PR/release evidence after
  merge/deploy.
- The old `test:phase9:full` name was removed to prevent accidental release use. The remaining
  `test:diagnostic:supabase-dev-full` command is diagnostic only; the release-blocking full gate is
  `rtk npm run test:e2e:production-flow`.
- External deployed production-flow evidence still requires `E2E_BASE_URL`,
  `E2E_DEPLOYED_COMMIT_SHA`, and the deployed e2e-route probe token after merge/deploy.
- The linked Supabase disposable event id must not be reused as the real tournament event namespace.

## Production Readiness Remediation Phase 11 - Production-Flow And Visual Evidence - 2026-07-04

Status: implemented and verified in local production-start mode against the linked Supabase
database. External deployed evidence is now guarded and documented, but still requires a deployed
URL, deployed commit SHA, and deployed e2e-route token after merge/deploy before it can be treated
as completed release evidence.

### Scope

- A Phase 11 plan was written and reviewed before implementation:
  `docs/phase-11-production-flow-deployed-evidence-plan-2026-07-04.md`.
- The full production-flow rehearsal now attaches visual/image evidence during Round 1 voting for
  `/stage` at 1280x720, 1366x768, and 1920x1080, plus mobile `/room -> /vote` at 390x844.
- The visual evidence asserts two horizontal 7-card stage rows, no page overflow, QR target/size,
  timer/QR separation, readable chart titles, centered seventh mobile card, local cached chart
  artwork, successful image responses, and no live third-party chart-art URLs.
- Production-flow external mode now fails fast unless the commit served by `E2E_BASE_URL` is
  provided explicitly through `E2E_DEPLOYED_COMMIT_SHA`; the runner logs the deployed commit in
  profile metadata.
- The production-flow plan now asserts exact active-player counts of 48, 36, 24, and 12 and verifies
  that each 12-player attrition batch is active before deactivation and inactive afterward.
- QR geometry gates were raised to a 176 px minimum for projector/mobile evidence, with title
  overflow and minimum-font checks for stage chart titles.
- Phase 11 keeps GitHub Actions deferred until Phase 12 by removing `.github/workflows/ci.yml` and
  updating the local CI-workflow test to assert no workflow files exist before that phase.
- Supabase npm aliases were added for release operations:
  `supabase:version`, `supabase:status`, `supabase:migration:list`, `supabase:db:push`, and
  `supabase:db:lint`.
- The Phase 9 Playwright JSON reporter was removed so ignored `test-results` artifacts do not write
  broad environment snapshots.

### Changed Files

- `.github/workflows/ci.yml` removed
- `docs/asset-audit.md`
- `docs/deployment-readiness.md`
- `docs/event-day-runbook.md`
- `docs/phase-11-production-flow-deployed-evidence-plan-2026-07-04.md`
- `docs/phase-status.md`
- `docs/production-readiness-review-checklist-2026-07-03.md`
- `docs/rehearsal-runbook.md`
- `docs/release-checklist.md`
- `docs/remediation-issue-checklist.md`
- `docs/testing-checklist.md`
- `package.json`
- `playwright.env.ts`
- `playwright.phase9.config.ts`
- `scripts/run-playwright.mjs`
- `scripts/write-asset-audit.ps1`
- `src/components/QRPanel.tsx`
- `src/components/StageDrawCard.tsx`
- `src/lib/server/ci-workflow.test.ts`
- `tests/e2e/full-flow.spec.ts`
- `tests/e2e/projector-mobile-evidence.spec.ts`
- `tests/phase9/fixtures/phase11-visual-evidence.ts`
- `tests/phase9/fixtures/rehearsal-plan.ts`
- `tests/phase9/flows/rehearsal.flow.ts`
- `tests/phase9/hosted-full-rehearsal.spec.ts`
- `tests/phase9/pages/admin.page.ts`

### Checks Run

- `rtk npm run test -- tests/phase9/fixtures/rehearsal-plan.test.ts src/lib/server/ci-workflow.test.ts`
  - passed, 5 tests.
- `rtk npm run typecheck` - passed.
- `rtk npm run lint` - passed.
- `rtk npm run test` - passed, 53 files / 309 tests.
- `rtk npm run build` - passed. An earlier parallel build/e2e attempt contended for `.next`; the
  serial rerun passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests. An earlier parallel build/e2e attempt
  contended for `.next`; the serial rerun passed.
- `rtk npm run test:e2e:no-build -- --project=visual-evidence-chromium` - passed after tightening
  the QR sizing layout to avoid 1280x720 overflow.
- `rtk npm run test:e2e:production-flow:validate` - passed against linked Supabase event
  `rehearsal-2026-07-03-prod-db-01`, with backend `supabase`, server mode `start`, test routes
  disabled, and a fresh build.
- `rtk npm run test:phase9` - passed, 2 smoke tests passed and the Supabase-only invariant spec
  skipped under memory.
- `rtk npm run test:load:player-routes` - passed.
- `rtk npm run test:load:api-injection` - passed.
- `rtk npm run verify:real-chart-images` - passed for 4,426 runtime charts and 639 public cache
  files.
- `rtk npm run verify:release-data` - passed.
- `rtk npm run supabase:migration:list` - passed; local and remote migrations are aligned through
  `20260704010000`.
- `rtk npm run test:e2e:production-flow` - passed in 21.6 minutes against linked Supabase event
  `rehearsal-2026-07-03-prod-db-01`; host-lock two-session evidence passed and the hosted four-round
  rehearsal passed.
- `rtk git diff --check` - passed.

### Full Production-Flow Evidence

- Round 1 started with 48 active voting players, prewarmed 48 voter room pages, submitted 48 valid
  UI ballots through `/room -> /vote`, and verified public privacy, gated admin counts, final
  reveal, and private CSV content.
- Round 2 marked exactly 12 Round 1 voting players inactive before voting, verified the inactive
  transition, and submitted 36 valid UI ballots.
- Round 3 marked exactly 12 more voting players inactive before voting, verified the inactive
  transition, and submitted 24 valid UI ballots.
- Round 4 marked exactly 12 more voting players inactive before voting, verified the inactive
  transition, and submitted 12 valid UI ballots.
- The Round 1 visual artifact was written under Playwright `test-results` as
  `phase11-deployed-visual-evidence.json` with screenshots for stage 1280x720, 1366x768, 1920x1080,
  and mobile vote 390x844. It recorded the local production-start base URL, source/deployed commit
  metadata from the local HEAD at test time, backend `supabase`, server mode `start`, event id
  `rehearsal-2026-07-03-prod-db-01`, and the 176 px QR threshold.

### Manual Review

- Tournament rules remain unchanged: 4 rounds, 2 chart sets per round, 7 charts per set, one
  10-minute voting window per round, 1-2 bans or explicit no-ban completion per set, least-ban
  winners, server-decided tiebreaks, and final two-chart reveal.
- Browser code still receives no service-role keys, password hashes, session secrets, plaintext
  admin passwords, or tournament-changing authority.
- Production-flow external mode now makes commit identity explicit, but no external deployed run
  was executed in this local phase closure because the merged deployment URL/commit/token must be
  supplied after merge/deploy.
- No new Supabase migration was created for Phase 11. The linked database already has all local
  migrations through `20260704010000`.

### Risks And Assumptions

- The automated QR geometry threshold is stronger than the prior gate, but a real phone scan at
  venue distance remains an event-day/release checklist item.
- The generated Playwright evidence artifacts remain ignored under `test-results`; they should be
  attached to release records when a specific release is certified, not committed to the repo.
- External deployed production-flow evidence should be run only against a disposable event namespace,
  not the live tournament namespace.
- GitHub Actions remain intentionally absent until Phase 12; release readiness before that phase is
  proven by explicit local/deployed commands rather than workflow status.

## Production Readiness Remediation Phase 10 - Playwright Helper Upgrades - 2026-07-03

Status: implemented and verified. The production-flow rehearsal now completes the required
48 -> 36 -> 24 -> 12 active-voter browser path inside the real voting windows.

### Scope

- PRC-002/PRC-003 are covered by the full production-flow rehearsal helper and evidence run:
  Round 1 starts with 48 active voting players, then exactly 12 voting players are removed before
  each later round for 36, 24, and 12 active voting players.
- PRC-011 is covered by replacing hard-coded public aggregate expectations with per-round
  expectation objects.
- PRC-012 is covered in helpers by per-round CSV row, submitted row, active-at-round-start, required
  player, and revision assertions, with browser download paths configured for every round.
- PRC-013 is extended by roster setup, active-count, attrition, voting eligibility, and Supabase
  round-snapshot helper assertions.
- Production-flow validation now rejects enabled e2e test routes and memory backend fallback. Local
  production-flow start mode owns the route env directly; external production-flow mode now also
  requires `E2E_DEPLOYED_TEST_ROUTE_TOKEN` so deployed `/api/e2e/*` 404 probes cannot be masked by a
  token mismatch.
- A deterministic planner fixture defines smoke and production-flow expectations, exact 12-player
  attrition batches, submitted-player maps, revision maps, CSV expectations, and lightweight valid
  no-ban ballots after the first three tie-shaping voters.
- Voting throughput was improved by removing duplicate username-presence checks, using a row-scoped
  normalized Supabase voter-presence RPC, allowing player ballot submits to rely on the SQL
  transaction's database locks instead of an outer event-wide lock, prewarming voter room pages
  before the voting window opens, and replacing strict Playwright ballot batches with a worker pool.
- Public turnout denominator evidence now runs twice per round: immediately after opening voting
  before any ballot submissions (`0 / activePlayerCount`) and after the planned submissions complete.

### Changed Files

- `docs/phase-status.md`
- `package.json`
- `playwright.phase9.config.ts`
- `scripts/run-playwright.mjs`
- `src/app/vote/BallotFlow.tsx`
- `src/app/vote/actions.ts`
- `src/app/vote/page.tsx`
- `src/lib/server/normalized-ballots.ts`
- `src/lib/server/normalized-rpc-locking.test.ts`
- `src/lib/server/normalized-voter-presence.ts`
- `src/lib/server/transactions/normalized-runtime.test.ts`
- `src/lib/server/transactions/normalized-runtime.ts`
- `supabase/migrations/20260704010000_normalized_voter_presence_rpc.sql`
- `tests/phase9/assertions/public-ui.assert.ts`
- `tests/phase9/fixtures/phase9-env.ts`
- `tests/phase9/fixtures/private-csv.ts`
- `tests/phase9/fixtures/production-flow-safety.ts`
- `tests/phase9/fixtures/rehearsal-plan.ts`
- `tests/phase9/fixtures/rehearsal-plan.test.ts`
- `tests/phase9/fixtures/supabase-state.ts`
- `tests/phase9/flows/ballot-submission.flow.ts`
- `tests/phase9/flows/rehearsal.flow.ts`
- `tests/phase9/flows/results-reveal.flow.ts`
- `tests/phase9/flows/voting-window.flow.ts`
- `tests/phase9/hosted-full-rehearsal.spec.ts`
- `tests/phase9/pages/admin.page.ts`
- `tests/phase9/pages/vote.page.ts`
- `tests/phase9/production-flow-validation.spec.ts`
- `vitest.config.ts`

### Checks Run

- `rtk npm run test -- tests/phase9/fixtures/rehearsal-plan.test.ts` - passed, 3 tests.
- `rtk npm run test -- src/lib/server/transactions/normalized-runtime.test.ts src/lib/server/normalized-rpc-locking.test.ts tests/phase9/fixtures/rehearsal-plan.test.ts` - passed, 22 tests.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 53 files / 309 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:phase9` - passed, 2 smoke tests passed and the Supabase-only invariant spec
  skipped under memory. The smoke run covered the new initial public voting denominator assertion.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- `rtk npm run test:e2e:production-flow:validate` - passed against disposable Supabase event id
  `rehearsal-2026-07-03-prod-db-01`; this now runs a lightweight `@validate` Playwright route
  probe and verifies `/api/e2e/*` returns 404 with no token and with the configured test token.
- `rtk npm run test:e2e:production-flow:list` - passed and selected exactly the two current
  `@full` specs: host-lock two-session evidence and hosted four-round rehearsal.
- `rtk npx supabase migration list` - passed before and after migration; it initially showed
  `20260704010000` pending remotely and then showed local/remote in sync.
- `rtk npx supabase db push` - applied
  `20260704010000_normalized_voter_presence_rpc.sql` to the linked Supabase database. The CLI
  exited successfully after applying the migration, with a post-apply pg-delta catalog cache warning.
- `rtk npx supabase db lint` - could not run because the local Supabase Postgres instance was not
  running (`LegacyDbConnectError`).
- `rtk git diff --check` - passed.

### Full Production-Flow Probe

- `rtk npm run test:e2e:production-flow` passed against linked Supabase event
  `rehearsal-2026-07-03-prod-db-01`: host-lock two-session evidence passed and the hosted four-round
  rehearsal passed.
- Round 1 prewarmed 48 voter room pages and submitted all 48 browser ballots before the real
  10-minute voting window expired. The slowest logged Round 1 ballot submission completed in about
  30.9 seconds after its worker started.
- Round 2 marked exactly 12 voting players inactive and submitted 36 browser ballots.
- Round 3 marked exactly 12 more voting players inactive and submitted 24 browser ballots.
- Round 4 marked exactly 12 more voting players inactive and submitted 12 browser ballots.
- Each round verified the initial `0 / active` public turnout denominator, public privacy states,
  gated admin live counts, final reveal, downloaded private CSV content, submitted-player
  revisions, active-at-round-start rows, and Supabase result/CSV reconciliation.

### Manual Review

- Product rules remain unchanged: 4 rounds, 2 sets per round, 7 charts per set, one round voting
  window, explicit `No bans for this set`, least-ban winners, server-side tiebreaks, and final
  two-chart reveal are unchanged.
- The production-flow planner marks exactly 12 Round 1 voters inactive before Round 2, exactly 12
  more before Round 3, and exactly 12 more before Round 4.
- Test-only route access remains fail-closed in local production-flow validation; route files still
  ship in the app tree and deployed probes with the deployed token remain Phase 11 evidence work.
- Browser code still receives no service-role keys, password hashes, session secrets, plaintext
  passwords, or tournament decision authority.
- No `.github/workflows/*` files were added or changed.

### Risks And Assumptions

- The production-flow plan uses explicit no-ban ballots for most voters to reduce browser work
  while preserving valid complete ballots and a deterministic supported tiebreak through the first
  three voters.
- `test:e2e:production-flow:list` performs a production build before listing because production-flow
  validation intentionally rejects local start mode with skipped builds.
- The disposable Supabase event namespace used by validation/list/full probes must not be reused as
  the real tournament namespace.
- The linked Supabase database has already received migration `20260704010000`; after merge/deploy,
  re-run `rtk npx supabase migration list` to confirm there are no pending migrations.

## Production Readiness Remediation Phase 9 - Real Supabase And Load Confidence - 2026-07-03

Status: implemented and locally/hosted-disposable verified. No Supabase migration is applicable for
this phase because the changes are limited to Playwright evidence, runner guard behavior, and
operator documentation.

### Scope

- PRC-009 is covered by a new Supabase-only invariant/concurrency smoke that runs under
  `test:phase9:supabase-dev`: service-role database time, event-scoped runtime table queries, anon
  denial for critical RPCs, production host-lock persistence invariants against the real
  `tournament-host` row, neighbor-event route isolation, concurrent Supabase load-ballot
  submissions, concurrent `normalized_compute_results` calls, and final event-scoped DB row
  reconciliation.
- PRC-014 is covered by splitting the previous hybrid load test into separate `@api-injection` and
  `@player-route` profiles with distinct Playwright project names and JSON evidence labels.
- PRC-030 remains covered by route-level private CSV security tests; the manual Supabase guide now
  calls out that deployed e2e-route probes remain later production-flow evidence work.
- Memory Playwright profiles now ignore `.env.local` event ids and use disposable `e2e-*` event ids
  unless the backend is Supabase.

### Changed Files

- `docs/phase-9-real-supabase-load-confidence-plan-2026-07-03.md`
- `docs/phase-9-hosted-supabase-manual-guide.md`
- `docs/phase-status.md`
- `package.json`
- `playwright.load.config.ts`
- `scripts/run-playwright.mjs`
- `tests/load/load-rehearsal.spec.ts`
- `tests/phase9/hosted-one-round-smoke.spec.ts`
- `tests/phase9/pages/admin.page.ts`
- `tests/phase9/phase8-phone-roster-regressions.spec.ts`
- `tests/phase9/supabase-invariants.spec.ts`

### Checks Run

- `rtk npm run test -- src/app/api/e2e/private-csv/route.test.ts` - passed, 7 tests.
- `rtk npm run typecheck` - passed.
- `rtk npm run test:load:player-routes` - initially exposed unstable dynamic Playwright project
  naming and memory event-id inheritance from `.env.local`; after runner/config fixes, rerun passed.
  A later parallel rerun with the API-injection profile was discarded because simultaneous dev
  servers contended for `.next`; the serial rerun passed.
- `rtk npm run test:load:api-injection` - passed.
- `rtk npm run test:phase9` - passed, 2 smoke tests passed and the Supabase-only invariant spec
  skipped under memory.
- `rtk npm run test:phase9:supabase-dev` - initially exposed the Supabase RPC payload assertion and
  the memory-only Phase 8 regression being selected by the Supabase script; after fixes, rerun
  passed with hosted one-round smoke and Supabase invariant/concurrency/host-lock evidence passing.
- `rtk node scripts/run-playwright.mjs --profile=supabase-dev-rehearsal test --config=playwright.phase9.config.ts tests/phase9/host-lock-two-session.spec.ts --grep "@full"` -
  attempted twice; both attempts failed before host-lock assertions because admin login hit
  `Supabase rate limit failed: TypeError: fetch failed`, and the wrapper did not exit before the
  tool timeout. Phase 9 host-lock database invariants are covered by the passing
  `test:phase9:supabase-dev` smoke instead; browser-level host-lock rehearsal remains later
  production-flow/deployed evidence work.
- `rtk npm run lint` - passed.
- `rtk npm run test` - passed, 52 files / 305 tests.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- `rtk npm run build` - an initial parallel run conflicted with simultaneous typecheck/e2e access
  to `.next`; serial rerun passed.
- `rtk npm run test:e2e:production-flow:validate` - passed.
- `rtk git diff --check` - passed.

### Manual Review

- Product behavior is unchanged: tournament rules, voting rules, result computation, tiebreak
  behavior, final reveal, admin password policy, and route purposes were not changed.
- The API-injection profile is now clearly labeled as test-route pressure evidence and no longer
  stands in for normal phone-route submissions.
- The player-route profile submits through `/room -> /vote`, opens spectator traffic on `/room`,
  `/charts`, and `/results`, follows the `View charts only` path, and asserts view-only pages expose
  no username selector or submit control.
- The Supabase invariant spec writes only inside the configured disposable Supabase event namespace
  plus a derived `-neighbor` event used only to prove route isolation; it still depends on the
  existing `E2E_ALLOW_DESTRUCTIVE_RESET=true` runner guard.
- Host-lock Supabase evidence uses production `HostLockStore` /
  `resolveHostLockPersistence` semantics against the real `tournament-host` row, with disposable
  admin-session rows satisfying the production foreign key. It verifies one current event-scoped
  lock row, non-owner read-only semantics, heartbeat refresh, replacement after expiry, and forced
  takeover ownership changes.
- The load runner now rejects `playwright.load.config.ts` invocations unless exactly one of
  `@api-injection` or `@player-route` is selected.
- Critical RPC permission coverage checks anon denial for `normalized_database_time`,
  `normalized_submit_ballot`, and `normalized_compute_results`.
- Browser code still receives no service-role keys, password hashes, session secrets, or plaintext
  passwords.

### Risks And Assumptions

- `test:phase9:supabase-dev` used the locally configured disposable Supabase event id
  `rehearsal-2026-07-03-prod-db-01`. Do not reuse that namespace for the real tournament.
- A non-fatal Next server log from a private CSV action can appear after the Supabase-dev command
  exits successfully; it did not fail the Playwright run.
- The older browser-only host-lock `@full` spec is not used as the Phase 9 gate because the current
  disposable Supabase environment repeatedly failed during admin-login rate-limit fetches before
  host-lock assertions. Re-run it during Phase 11/deployed evidence if that path is needed.
- Deployed 404 probes for `/api/e2e/*` remain Phase 11/deployed-evidence work because the route
  files still ship in the app tree.
- Full 48 -> 36 -> 24 -> 12 production-flow rehearsal remains Phase 11 and was not claimed here.

## Production Readiness Remediation Phase 8 - Focused Phone And Roster Browser Regressions - 2026-07-03

Status: implemented and locally verified. No Supabase migration is applicable for this phase because
the changes are limited to test selectors, Playwright helpers, browser regression coverage, and
test-only private CSV parity with the admin export path.

### Scope

- PRC-013 is closed: admin roster/count markers and page helpers now support named inactive-player
  changes plus active-count, current voting denominator, and vote-dropdown membership/order
  assertions.
- PRC-015 is closed: two browser contexts open the same start.gg username, the second context sees
  the active-device warning, both submit different valid ballots, and final private CSV evidence
  proves the newer choices/revision win.
- PRC-016 is closed: a browser regression forces an edit submit failure, verifies the
  previous-server-confirmed-ballot reassurance, reloads the phone, and proves the original timestamp,
  choices, and revision remain.
- PRC-017 is closed: focused phone e2e coverage proves inactive-before-open hiding, after-open
  snapshot stability, dangerous emergency current-round add, and next-round routine roster
  exclusion.

### Changed Files

- `docs/phase-8-focused-phone-roster-browser-regressions-plan-2026-07-03.md`
- `docs/phase-status.md`
- `docs/production-readiness-review-checklist-2026-07-03.md`
- `src/app/api/e2e/private-csv/route.ts`
- `src/app/coolguy69/page.tsx`
- `src/app/vote/BallotFlow.tsx`
- `tests/phase9/pages/admin.page.ts`
- `tests/phase9/pages/vote.page.ts`
- `tests/phase9/phase8-phone-roster-regressions.spec.ts`

### Checks Run

- `rtk npm run typecheck` - passed.
- `rtk npm run test:phase9` - passed, 2 Playwright smoke tests including the focused Phase 8
  regression.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - rerun passed.
- `rtk npm run test` - passed, 52 files / 305 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- `rtk npm run test:e2e:production-flow:validate` - passed.
- `rtk git diff --check` - passed.

### Manual Review

- Product rules remain unchanged: active roster snapshots are still taken when voting opens,
  routine roster changes after open apply to future rounds, emergency current-round add remains a
  dangerous password-confirmed action, same-username second devices still warn and latest valid
  ballot wins, and failed saves keep the prior server-confirmed ballot.
- Browser code still receives no service-role keys, password hashes, session secrets, plaintext
  passwords, or tournament decision authority.
- The e2e private CSV route now mirrors the admin export path for emergency current-round
  eligibility metadata; it remains guarded by the existing test-route safety checks.
- No `.github/workflows/*` files were added or changed.

### Risks And Assumptions

- The focused regression runs in the memory-dev smoke profile. Emergency current-round add is not a
  normalized Supabase RPC, so hosted Supabase parity for that workflow remains outside this phase.
- A direct one-off Playwright runner invocation for only the Phase 8 spec passed the test body but
  did not exit before the tool timeout; the recorded evidence uses the normal `rtk npm run
test:phase9` command, which exited successfully.

## Production Readiness Remediation Phase 6 - Chart Import And Release Data Gates - 2026-07-03

Status: implemented and locally verified. No Supabase migration is applicable for this phase because
the changes are limited to chart import validation, generated release artifact gates, image
verification wiring, e2e assertion robustness, and operator documentation.

### Acceptance Criteria

- PRC-025 is closed for local release gating: final chart import now has an explicit signed-review
  path with `reviewedBy`, ISO `reviewedAt`, and `reviewedCommit` evidence in
  `data/generated/chart-import-report.json`.
- PRC-026 is closed: CSV header validation now requires exactly
  `name,name_kr,artist,label,type,level,bg_img` in that order, with no extra headers.
- Unexpected extra row columns after `bg_img` are rejected. The repair path is limited to the known
  9-column mirrored-title comma shape present in the current source CSV.
- PRC-027 is closed: Unicode-only title/artist key parts now receive deterministic hash-backed
  `unicode-...` key parts instead of collapsing to `unknown`.
- PRC-028 is closed locally: `rtk npm run verify:release-data` validates source CSV SHA, import
  report SHA, fixture mode, pool counts, duplicate keys, signed diagnostics, imported chart catalog
  identity, image manifest identity, runtime catalog identity, imported/runtime/image chart ID
  consistency, and the same public-cache checks used by `verify:real-chart-images`.
- Current generated local artifacts pass the signed-review release gate: 4,426 imported charts,
  9 repaired rows, 145 skipped unsupported rows, 639 cached image assets, 0 fallback image assets,
  and 4,426 runtime charts with non-fallback cached artwork.

### Changed Files

- `docs/asset-audit.md`
- `docs/data-audit.md`
- `docs/deployment-readiness.md`
- `docs/event-day-runbook.md`
- `docs/phase-6-chart-import-release-data-gates-plan-2026-07-03.md`
- `docs/phase-status.md`
- `docs/release-checklist.md`
- `package.json`
- `scripts/import-charts.ts`
- `scripts/verify-real-chart-images.ts`
- `scripts/verify-release-data.ts`
- `src/lib/charts/importer.ts`
- `src/lib/charts/importer.test.ts`
- `src/lib/charts/normalize.ts`
- `src/lib/charts/normalize.test.ts`
- `src/lib/charts/release-data-gate.ts`
- `src/lib/charts/release-data-gate.test.ts`
- `src/lib/charts/types.ts`
- `tests/e2e/full-flow.spec.ts`

### Checks Run

- `rtk npm run test -- src/lib/charts/importer.test.ts src/lib/charts/normalize.test.ts src/lib/charts/runtime-catalog.test.ts src/lib/charts/image-cache.test.ts src/lib/charts/release-data-gate.test.ts`
  - passed, 5 files / 32 tests.
- `rtk npm run import:charts -- --strict`
  - expected failure: strict mode found 154 diagnostics from the current source CSV
    (9 repaired mirrored-title rows and 145 skipped unsupported rows).
- `rtk npm run import:charts -- --reviewed-by=Codex --reviewed-commit=c58dda2496db13d9b16a74a63dfde9a9e1e64343`
  - passed, generated signed local import evidence.
- `rtk npm run cache:chart-images`
  - passed, 639 cached assets / 0 fallback assets.
- `rtk npm run verify:real-chart-images`
  - passed, verified `data/generated/charts-with-images.json` against 639 public cache files for
    4,426 charts.
- `rtk npm run verify:release-data`
  - passed with `strictClean=false`, `signedDiagnostics=true`, import report SHA
    `c36424754ec19d615fa6057e34d852fbbc96df2fb8a991a2a9813a167a9331b7`, imported catalog SHA
    `ac5d46321c151bb748f102acf739c00ce6f310da96e5e0480dfda5b526f23175`, runtime catalog SHA
    `f5dc28ca048e69c33af9cd97b0c566a87bac1e386796c0743f028f1dbf2f2e2b`, and image manifest SHA
    `f5d886138bee349a88f942d1196f0bc219c5e2211bcff0014497a437d76653e0`.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 52 files / 304 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e`
  - first run exposed an existing hard-coded memory event id in private CSV filename assertions;
    after the assertion was made event-id aware, rerun passed, 6 Playwright tests.
- `rtk git diff --check` - passed.

### Manual Review

- Product rules remain unchanged: tournament rounds, chart sets, draw counts, voting, results,
  tiebreaks, final reveal, admin, and player identity behavior were not changed.
- The importer still uses `data/source/charts.csv`, preserves `bg_img`, validates required pools,
  and keeps missing-image fallback behavior intact.
- The Unicode fallback is scoped only to key parts that previously became `unknown`; existing ASCII
  key behavior remains unchanged.
- The release gate is local/operator tooling. It does not expose service-role keys, password hashes,
  session secrets, plaintext passwords, or browser-side tournament-changing behavior.
- The private CSV e2e assertion now follows the configured disposable event id instead of assuming
  `e2e-memory-dev-smoke`, matching the runtime filename behavior.
- Independent final review initially found release-data gate false positives around stale runtime
  catalogs, non-strict unsigned clean imports, and loose review timestamps. The gate now validates
  imported/runtime/image chart ID consistency, requires strict-clean or signed evidence, and accepts
  only generated ISO UTC review timestamps.
- No `.github/workflows/*` files were added or changed.
- No Supabase migration was added or required.

### Risks And Assumptions

- The current event CSV is not strict-clean. It remains release-gated through signed review evidence
  until the source CSV is cleaned or the unsupported rows are otherwise resolved.
- Generated `data/generated/*.json` and `*.sha256` files are ignored by git. The final event release
  still needs those artifacts archived or attached outside normal source tracking.
- The signed generated report currently records pre-PR commit
  `c58dda2496db13d9b16a74a63dfde9a9e1e64343`; rerun the signed import and release gate after the
  final merge if the event release checklist needs exact final commit evidence.

## Production Readiness Remediation Phase 5 - Audit, Exclusion, And Host-Lock Persistence - 2026-07-03

Status: implemented and locally verified. The new Supabase migration must be applied to every target
Supabase project before relying on `(event_id, chart_id)` chart-exclusion upserts there.

### Acceptance Criteria

- PRC-005 is closed in local source/runtime wiring: normalized persistence no longer deletes
  `admin_actions` during full, voting-admin, or result-admin save paths.
- Admin audit rows are persisted append-only/idempotently with `upsert` by audit `id`, and local
  snapshot merging now unions audit rows instead of treating missing current rows as deletes.
- PRC-029 is closed for current-state storage: chart exclusions remain latest-only by design, are
  defensively normalized by chart key, and persist through `upsert` on `(event_id, chart_id)`.
- A new migration removes duplicate chart-exclusion rows by latest `updated_at`/`created_at` before
  adding the `chart_exclusions_event_chart_unique` constraint.
- PRC-033 is closed for normal browser operation: logout and inactivity expiry now attempt
  best-effort host-lock release before clearing cookies or redirecting. Host-lock TTL remains the
  fallback if the cleanup request never reaches the server.
- Expired admin session cookies still cannot authenticate admin actions; the cleanup-only decoder is
  scoped to host-lock release and cookie cleanup.

### Changed Files

- `docs/phase-status.md`
- `src/app/coolguy69/_components/AdminInactivityTimer.tsx`
- `src/app/coolguy69/actions.ts`
- `src/lib/admin/action-policy.ts`
- `src/lib/admin/session.ts`
- `src/lib/charts/exclusions.ts`
- `src/lib/draw/draw-state.ts`
- `src/lib/persistence/merge.ts`
- `src/lib/server/admin-auth.ts`
- `src/lib/server/normalized-operational-state.ts`
- `supabase/migrations/20260703050000_audit_exclusion_host_lock_persistence.sql`
- Focused tests under `src/lib/**`.

### Checks Run

- `rtk npm run test -- src/lib/server/normalized-operational-state.test.ts src/lib/server/persistence.test.ts src/lib/persistence/merge.test.ts src/lib/admin/host-lock.test.ts src/lib/charts/normalize.test.ts src/lib/draw/draw-state.test.ts src/lib/db/schema.test.ts src/lib/admin/session.test.ts src/lib/server/admin-auth.test.ts src/lib/server/admin-actions.test.ts`
  - passed, 10 files / 84 tests.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 51 files / 290 tests.
- `rtk npm run build` - passed.
- `rtk powershell -NoProfile -Command "& { $env:E2E_TOURNAMENT_EVENT_ID='e2e-memory-dev-smoke'; $env:TOURNAMENT_EVENT_ID='e2e-memory-dev-smoke'; npm.cmd run test:e2e }"`
  - passed, 6 Playwright tests.
- `rtk npm run test:phase9:supabase-dev` - failed in the existing direct Supabase fixture setup
  after the fixture wrote `start_rehearsal_mode`: the page showed rehearsal mode but active roster
  stayed at 0. This appears tied to the Supabase-dev fixture/stale in-memory persistence path, not
  the Phase 5 migration; production-flow env validation below still passed.
- `rtk npm run test:e2e:production-flow:validate` - passed.
- `rtk git diff --check` - passed.

### Manual Review

- Product rules remain unchanged: no tournament rules, voting rules, result rules, dangerous-action
  password policy, or route behavior changed.
- Audit persistence is append-only; chart exclusions intentionally keep one current state and rely
  on admin audit rows for history.
- Host-lock release on logout/inactivity is best-effort only and cannot grant tournament mutation
  authority to expired sessions.
- No browser code imports service-role keys, session secrets, password hashes, or plaintext admin
  passwords.
- No `.github/workflows/*` files were added or changed.

## Production Readiness Remediation Phase 4 - Supabase Emergency Admin Workflows - 2026-07-03

Status: implemented and locally verified. Hosted/disposable Supabase rehearsal remains blocked by
missing local Supabase rehearsal environment variables, and the new migration must be applied to the
target Supabase project before these workflows are available in Supabase mode.

### Acceptance Criteria

- PRC-004 is closed in local source/runtime wiring: Supabase mode no longer falls through to
  snapshot-style persistence for manual ballot override, emergency reopen, or reset round.
- `manualBallotOverride`, `reopenVotingWindow`, and `resetRound` are implemented normalized
  transaction mutations with sanitized server-side payloads.
- The normalized payload schemas omit `adminPassword` and require the verified `adminSessionId`.
- `/coolguy69` still verifies dangerous-action passwords in application code before invoking the
  normalized RPC wrappers.
- New service-role SQL RPC definitions replace the disabled stubs for:
  - `normalized_manual_ballot_override`
  - `normalized_reopen_voting_window`
  - `normalized_reset_round`
- Manual ballot override SQL validates eligibility, completed choices, replacement confirmation,
  revision updates, audit rows, manual override export fields, and computed-but-unrevealed result
  invalidation after successful validation.
- Emergency reopen SQL validates duration/reason/session, clears unrevealed computed results, and
  reopens the existing voting window without deleting ballots.
- Reset SQL clears target-round ballots, choices, revisions, results, tiebreaks, voting window,
  round eligibility, presence, draws, and drawn charts while preserving players, audit rows, host
  lock, chart catalog, exclusions, and other rounds.

### Changed Files

- `docs/phase-4-supabase-emergency-admin-workflows-plan-2026-07-03.md`
- `docs/phase-status.md`
- `src/app/coolguy69/actions.ts`
- `src/lib/server/normalized-admin-workflows.ts`
- `src/lib/server/admin-actions.test.ts`
- `src/lib/server/transactions/normalized-runtime.ts`
- `src/lib/server/transactions/normalized-runtime.test.ts`
- `supabase/migrations/20260703040000_supabase_emergency_admin_workflows.sql`

### Checks Run

- `rtk npm run test -- src/lib/server/transactions/normalized-runtime.test.ts src/lib/server/admin-actions.test.ts`
  - passed, 2 files / 33 tests.
- `rtk npm run test -- src/lib/server/transactions/normalized-runtime.test.ts src/lib/server/normalized-operational-state.test.ts src/lib/results/private-csv.test.ts src/lib/server/admin-actions.test.ts`
  - passed, 4 files / 47 tests.
- `rtk npm run test -- src/lib/vote/voting-window.test.ts src/lib/vote/ballot.test.ts src/lib/server/admin-local-flow.test.ts src/lib/server/mutation-contracts.test.ts src/lib/admin/action-policy.test.ts src/lib/db/schema.test.ts src/lib/server/authoritative-clock.test.ts`
  - passed, 7 files / 71 tests.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 51 files / 280 tests.
- `rtk npm run build` - passed.
- `rtk git diff --check` - passed.
- `rtk npm run test:e2e` - first run had one existing timing-sensitive tiebreak-wheel assertion
  miss the pre-reveal window; rerun passed, 6 Playwright tests.
- `rtk npm run test:phase9` - passed, one-round memory smoke rehearsal.
- `rtk npm run test:phase9:supabase-dev` - not run; environment validation failed because
  `E2E_TOURNAMENT_EVENT_ID` is unset and `E2E_ALLOW_DESTRUCTIVE_RESET=true` is not configured.
- `rtk npm run test:e2e:production-flow:validate` - not run; environment validation failed for the
  same missing disposable Supabase settings.
- `rtk npx supabase db lint --linked` - passed, no schema errors found.

### Manual Review

- Product rules remain unchanged: dangerous manual ballot, reopen, and reset actions still require
  active host control, password re-entry, action summaries, and audit reasons.
- Password verification remains in server-side application code. The normalized RPC payloads and
  SQL tests intentionally do not include `adminPassword`.
- Browser code still receives no service-role key, admin password hash, session secret, plaintext
  password, or direct tournament-changing RPC access.
- Supabase server actions now return after normalized RPC calls and do not call
  `persistTournamentState()`, avoiding the unsafe snapshot rewrite path for PRC-004.
- Manual ballot override invalidates unrevealed computed results only after payload validation and
  ballot persistence. Failed validation should leave computed results intact.
- Reset scope is round-limited and audit-preserving.
- No `.github/workflows/*` files were added or changed.

### Risks And Assumptions

- SQL source tests verify the migration shape, service-role grants, and disabled-stub removal, but
  disposable Supabase execution is still required once the rehearsal environment is configured.
- The new migration must be applied to any target Supabase project before relying on these
  workflows in Supabase mode.
- Supabase reset deletes current `round_player_eligibility` rows for the target round because they
  are round-scoped state. Memory mode behavior was intentionally left unchanged in this phase.

## Production Readiness Remediation Phase 3 - Durable Timer Transitions - 2026-07-03

Status: implemented and locally verified. Hosted/disposable Supabase rehearsal remains blocked by
missing local Supabase rehearsal environment variables.

### Acceptance Criteria

- PRC-010 is closed for local memory runtime by adding request-scoped durable voting timer
  advancement before public/admin snapshots.
- `/stage`, `/vote`, `/charts`, `/results`, and `/coolguy69` call the server-side timer
  advancement helper before rendering voting snapshots.
- Phone live-state polling and duplicate-device presence checks call the same helper before
  returning state.
- The helper writes only when a real transition is due: deadline expiration or all eligible players
  submitted before the active deadline.
- Paused, missing, closed, result, and not-yet-due active windows do not write.
- Supabase `normalized_advance_voting_timer` is implemented in a new migration with database time,
  an advisory transaction lock, the locked deadline helper, row-change metadata, and service-role
  execute grants.
- The normalized TypeScript transaction facade now treats only `advanceVotingTimer` as implemented;
  unrelated emergency workflow RPCs remain blocked for later phases.

### Changed Files

- `docs/phase-3-durable-timer-transitions-plan-2026-07-03.md`
- `docs/phase-status.md`
- `src/app/charts/page.tsx`
- `src/app/coolguy69/page.tsx`
- `src/app/results/page.tsx`
- `src/app/stage/page.tsx`
- `src/app/vote/actions.ts`
- `src/app/vote/page.tsx`
- `src/lib/server/voting-round.ts`
- `src/lib/server/voting-round.test.ts`
- `src/lib/server/transactions/normalized-runtime.ts`
- `src/lib/server/transactions/normalized-runtime.test.ts`
- `src/lib/vote/voting-window.test.ts`
- `supabase/migrations/20260703030000_durable_voting_timer_rpc.sql`

### Checks Run

- `rtk npm run test -- src/lib/vote/voting-window.test.ts src/lib/server/voting-round.test.ts src/lib/server/transactions/normalized-runtime.test.ts` - passed, 3 files / 39 tests.
- `rtk npm run test -- src/lib/db/schema.test.ts src/lib/server/normalized-operational-state.test.ts src/lib/server/persistence.test.ts` - passed, 3 files / 33 tests.
- `rtk npm run typecheck` - passed.
- `rtk npm run lint` - passed.
- `rtk npm run test` - passed, 51 files / 278 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- `rtk npm run test:phase9` - passed, one-round memory smoke rehearsal.
- `rtk npm run test:phase9:supabase-dev` - not run; environment validation failed because
  `E2E_TOURNAMENT_EVENT_ID` is unset and `E2E_ALLOW_DESTRUCTIVE_RESET=true` is not configured.
- `rtk npm run test:e2e:production-flow:validate` - not run; environment validation failed for the
  same missing disposable Supabase settings.
- `rtk git diff --check` - passed.

### Manual Review

- Product rules remain unchanged: one 10-minute round voting window covers both chart sets, below
  75 percent turnout extends once, the extension closes regardless of turnout, all-submitted rounds
  enter a 30-second final-change warning, and pause freezes timer/submissions.
- Timer advancement remains server-side. No browser randomness, browser timer authority, or
  client-side tournament mutation path was added.
- Public routes can trigger only an idempotent server-side timer advancement when the hydrated
  authoritative state is actually due to transition.
- Supabase timer advancement uses `normalized_database_time()` and the existing
  `normalized_apply_voting_deadline_locked()` helper so submit, compute, and poll-triggered
  advancement share the same deadline rules.
- Public screens still show aggregate turnout/ban-selection information only; no live
  chart-by-chart counts were exposed.
- No `.github/workflows/*` files were added.

### Risks And Assumptions

- The new Supabase migration must be applied to the target Supabase project before relying on
  poll-triggered durable timer advancement in Supabase mode.
- Local source/unit tests verify the SQL shape, but disposable hosted Supabase rehearsal is still
  required once `E2E_TOURNAMENT_EVENT_ID` and `E2E_ALLOW_DESTRUCTIVE_RESET=true` are configured.
- Poll-triggered writes are deliberately request-scoped. A completely idle site with no public,
  phone, or admin polling will advance on the next request rather than via a background job.

## Production Readiness Remediation Phase 0 - Policy And Decision Lock - 2026-07-03

Status: complete.

### Acceptance Criteria

- PRC-018 is closed by aligning `docs/product-spec.md` and
  `docs/pump_open_stage_repo_validation_checklist.md`: zero-ballot seven-way least-ban ties use the
  same fallback reveal as other 5+ ties, with the backend winner committed before reveal.
- PRC-022 is closed with an explicit admin action policy matrix in
  `src/lib/admin/action-policy.ts` and `docs/admin-action-policy.md`.
- Password-required dangerous actions are tested for password re-entry, audit reason, and dangerous
  audit coverage.
- Active-host-only tournament actions are tested for active host control, audit coverage, and no
  password re-entry expansion.

### Changed Files

- `src/lib/admin/action-policy.ts`
- `src/lib/admin/action-policy.test.ts`
- `src/lib/results/result-engine.ts`
- `src/lib/results/result-engine.test.ts`
- `src/lib/server/normalized-operational-state.ts`
- `src/components/rune-wheel-rotation.test.ts`
- `docs/admin-action-policy.md`
- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/production-readiness-review-checklist-2026-07-03.md`
- `docs/testing-checklist.md`
- `docs/decision-log.md`
- `docs/comprehensive-review-checklist-2026-06-30.md`
- `docs/phase-status.md`

### Checks Run

- `rtk npm run test -- src/lib/admin/action-policy.test.ts src/lib/server/admin-actions.test.ts src/lib/results/result-engine.test.ts src/components/rune-wheel-rotation.test.ts` - passed, 4 files / 30 tests.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 47 files / 242 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- `rtk git diff --check` - passed.

### Manual Review

- Product rules remain unchanged except for resolving the documented conflict in favor of
  `docs/product-spec.md`: 2-, 3-, and 4-way least-ban ties use the 12-slot rune wheel; 5+ ties,
  including zero-ballot seven-way ties, use fallback reveal.
- Routine host controls such as open, pause, resume, close, compute, reveal, and round advancement
  remain active-host-only plus audit.
- Dangerous actions listed in the product policy remain password-reentry guarded with audit reasons.

### Risks And Assumptions

- Historical docs still contain older remediation context, but current source-of-truth docs and the
  2026-07-03 checklist now point to the Phase 0 fallback decision.
- Full production-flow Supabase evidence remains deferred to the later production-readiness phases.

## Production Flow Risk Follow-Up - 2026-07-03

Status: local code, test, and documentation follow-up completed for several remaining items in
`docs/production-flow-risk-checklist-2026-07-02.md`. This pass did not run Playwright; live
Supabase, two-browser, target-download, load, and projector/mobile visual evidence remains required
where the checklist says so.

### Changes

- Serialized app-level Supabase ballot submission and result-compute RPC calls with the same
  normalized event persistence lock used by snapshot persistence.
- Wired `/results` through the public route-state resolver so previous final results stay
  addressable after advancing to a not-started future round.
- Added chart-exclusion audit snapshot metadata that preserves chart identity/display fields after
  future catalog changes.
- Required an audit reason for the password-gated debug snapshot export.
- Added `public/brand/tournament-logo-web.png` and switched `TournamentLogo` to the optimized app
  rendition while keeping the required source logo at `public/brand/tournament-logo.png`.
- Updated Phase 9 CSV download helper expectations for collision-resistant private CSV filenames.
- Updated asset/release docs with current chart CSV, import report, runtime catalog, image manifest,
  cache, and logo asset identities.

### Checks Run

- `rtk npm run test -- src/lib/vote/ballot.test.ts src/lib/vote/phone-view.test.ts src/lib/round/round-state.test.ts src/lib/server/admin-actions.test.ts src/lib/admin/audit.test.ts` - passed, 5 files / 38 tests.
- `rtk npm run test -- src/lib/server/normalized-rpc-locking.test.ts src/lib/server/transactions/normalized-runtime.test.ts src/lib/server/normalized-operational-state.test.ts src/lib/admin/host-lock.test.ts src/lib/server/admin-actions.test.ts src/lib/server/persistence.test.ts src/lib/persistence/merge.test.ts` - passed, 7 files / 48 tests.
- `rtk npm run test -- src/lib/vote/ballot.test.ts src/lib/vote/phone-view.test.ts src/lib/round/round-state.test.ts src/lib/admin/audit.test.ts` - passed, 4 files / 29 tests.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 45 files / 221 tests.
- `rtk npm run build` - passed.
- `rtk git diff --check` - passed.
- `rtk powershell -NoProfile -ExecutionPolicy Bypass -File scripts/write-asset-audit.ps1` - passed.
- Playwright was not run because the local changes were covered by unit/source/build checks and the
  remaining Playwright items require a deliberate live Supabase/browser evidence window.

### Remaining Risks

- PFR-001 still needs live Supabase interleaving evidence after the lock-wrapper implementation.
- PFR-002, PFR-003, PFR-018, PFR-021 through PFR-024, PFR-031, PFR-033, PFR-043, PFR-046, and the
  production readiness evidence checklist still need the specified live/browser/manual evidence.
- PFR-040 still requires either a cleaned event CSV or dated acceptance of the strict import report.

## Production Flow Risk Remediation - 2026-07-02

Status: implementation pass complete for Phases 1 through 6 of
`docs/production-flow-risk-remediation-plan-2026-07-02.md`. This did not close checklist items in
`docs/production-flow-risk-checklist-2026-07-02.md`; Phase 7 grouped browser evidence and Phase 8
release evidence are still required before production readiness can be claimed.

### Issue IDs Addressed In Code

- PFR-001, PFR-002, PFR-006 through PFR-018, PFR-020, PFR-021, PFR-025 through PFR-030, PFR-032
  through PFR-049 received implementation, guard, test, or documentation updates.
- PFR-003, PFR-005, PFR-019 through PFR-024, PFR-027 through PFR-033, and PFR-046 still require
  the grouped Phase 7 browser evidence window for closure.
- PFR-040 remains a release data issue until the real chart CSV is either cleaned or the generated
  strict import report is reviewed and accepted with dated release evidence.

### Changed Areas

- Persistence/admin transactions: normalized mutation facade, blocked Supabase snapshot actions,
  host-lock CAS persistence, admin scalar contracts, and Supabase eligibility/result SQL.
- Voting and public UX: pause-safe in-progress ballots, early duplicate-device warning,
  first-submit/edit failure copy, reroll recovery copy, lighter polling, non-navigating stage QR,
  and final-state refresh stability.
- Admin event safety: production/event rehearsal controls are server-guarded and hidden unless an
  explicit disposable rehearsal event is configured; private CSV export is active-host gated,
  audited, and uses event/round/timestamp/nonce filenames.
- Data/export/assets: formula-safe private CSV, unambiguous chart IDs/difficulty in export,
  original/latest ballot timestamps, strict chart level parsing, import reports/checksums, runtime
  image verification, and release artifact checklist sections.
- Rehearsal commands: explicit memory smoke, Supabase dev rehearsal, production-flow validation,
  production-flow browser evidence, and synthetic API-load command profiles.

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 44 files / 214 tests.
- `rtk npm run import:charts` - passed, 4,426 charts imported; 9 repaired rows and 145 skipped
  malformed rows were reported for release review.
- `rtk npm run import:charts -- --strict` - failed as intended with 154 strict issues, proving final
  event imports fail closed instead of silently accepting repaired/skipped source data.
- `rtk npm run verify:real-chart-images` - passed against
  `data/generated/charts-with-images.json`, 639 public cache files, and 4,426 charts.
- `rtk npm run cache:chart-images` - passed, 639 cached image assets and 0 fallbacks.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e:memory-dev-smoke -- --validate-env-only` - passed.
- `rtk npm run test:e2e:production-flow:validate` - passed with disposable dummy Supabase-shaped
  env values for validation only; no browser run or external Supabase mutation was performed.
- `rtk git diff --check` - passed.

### Manual Review

- Product rules remain unchanged: four rounds, two chart sets per round, seven charts per set, one
  round ballot covering both sets, explicit no-bans completion, backend draw/result/tiebreak
  authority, and final two-chart reveal.
- Security boundaries were tightened: production test flags fail closed, rehearsal/reset controls
  are deployment guarded, private CSV export requires active host control, and public/player routes
  still do not expose live chart counts before reveal.
- Supabase production manual ballot, reopen, and reset now fail closed while normalized RPCs for
  those operations remain migration-disabled. That avoids unsafe snapshot rewrites but leaves those
  emergency workflows blocked in Supabase until real transactional RPCs are implemented.

### Risks And Assumptions

- Full Playwright/browser evidence was intentionally not run in this pass. Run the grouped
  `rtk npm run test:e2e:production-flow` window with real disposable Supabase credentials before
  checking off browser-dependent PFR items.
- The current real chart CSV is not strict-clean. Release requires either corrected source data or
  an approved import report with reviewer/date/commit evidence.
- Live Supabase two-session evidence is still needed for host-lock CAS and production persistence
  closure; current evidence is local/unit/fake-Supabase plus command validation.
- Because Supabase manual ballot/reopen/reset fail closed, operators need a documented fallback or
  implemented transactional RPCs before relying on those emergency workflows in production.

## Phase 9 Rehearsal Harness Refactor - 2026-07-02

Status: complete for local validation. The full hosted four-round rehearsal remains an explicit
pre-event command, not a default PR/smoke gate.

### Changed Files

- Replaced `tests/phase9/hosted-four-round.spec.ts` with `tests/phase9/hosted-one-round-smoke.spec.ts`
  and `tests/phase9/hosted-full-rehearsal.spec.ts`.
- Added Phase 9 helper modules under `tests/phase9/fixtures`, `tests/phase9/pages`,
  `tests/phase9/flows`, and `tests/phase9/assertions`.
- Updated `package.json` so `rtk npm run test:phase9` runs the `@smoke` one-round path and the
  Supabase-dev full diagnostic command runs the `@full` four-round path.
- Updated rehearsal/release/deployment docs with the new command split.

### Checks Run

- `rtk npm run typecheck` - passed.
- `rtk npm run lint` - passed.
- `rtk npx playwright test --config=playwright.phase9.config.ts --grep "@smoke" --list` - passed,
  one smoke spec selected.
- `rtk npx playwright test --config=playwright.phase9.config.ts --grep "@full" --list` - passed,
  one full rehearsal spec selected.
- `rtk npm run test:phase9` - passed, one-round smoke rehearsal.
- `rtk npm run test` - passed, 41 files / 163 tests.
- `rtk git diff --check` - passed.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 4 Playwright tests.

### Risks And Assumptions

- The Supabase-dev full diagnostic was not run during this refactor because it is the long hosted
  four-round rehearsal profile. It is diagnostic only; current release evidence uses
  `rtk npm run test:e2e:production-flow` with hosted Supabase variables and a disposable
  `TOURNAMENT_EVENT_ID`.
- The refactor preserves the existing hosted fallback helpers for Supabase host lock, current-round
  updates, and final reveal recovery; those are harness stabilizers rather than tournament logic.

As of Phase 9 completion on 2026-06-30, real cached chart artwork population and rendering
verification are closed (`RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028`), Phase 8 local e2e/load
gates are clean, and the hosted Supabase rehearsal has passed. Production Supabase was used by
explicit exception because no spare hosted project remained; the accepted risk is that global
migrations were applied to the existing production project before final event use.

`docs/pump_open_stage_repo_validation_checklist.md` is present in the workspace and is intentionally
called out as a required-read project document. As of this Phase 0 remediation note, `rtk git status
--short` reports it as untracked alongside the remediation plan and issue checklist, so these docs
must be added to version control before release if they are not already tracked by the user's
branch workflow.

## Production Readiness Remediation - 2026-07-01

Status: complete for code and local validation; not event-ready until the release checklist and
external deployment gates are complete.

### Acceptance Criteria

- Supabase ballot submission, voting-window advancement, and result computation now run through
  transactional RPCs with row locks, validation, duplicate-result protection, result snapshots,
  result rows, and server-side tiebreak records.
- Supabase result computation is wired into the admin action path instead of using in-memory
  computation followed by persistence.
- Durable Supabase-backed rate limiting covers admin password/session and voting mutation attempts.
- Public vote live state no longer exposes eligible or submitted player id lists to browsers.
- Duplicate start.gg username confirmation now claims presence before confirming the voter identity
  and keeps the warning visible across ballot states.
- `/api/e2e/load-ballot` is blocked in production and requires `TOURNAMENT_TEST_ROUTE_TOKEN` for
  non-production e2e use.
- Rehearsal tiebreak seeding is treated as a dangerous action with password re-entry and audit
  reason.
- Playwright load/phase9 harnesses send the test-route token and use the dev-server harness where
  synthetic e2e mutation helpers are required.

### Changed Files

- Supabase/runtime: `supabase/migrations/20260701010000_production_readiness_transactions.sql`,
  `src/lib/server/normalized-results.ts`, `src/lib/server/rate-limit.ts`,
  `src/lib/server/repositories/normalized-runtime.ts`, `src/lib/db/database.types.ts`,
  `src/lib/db/schema.ts`.
- Admin/voting surfaces: `src/app/coolguy69/actions.ts`, `src/app/coolguy69/page.tsx`,
  `src/app/vote/actions.ts`, `src/app/vote/BallotFlow.tsx`, `src/app/vote/page.tsx`,
  `src/app/api/e2e/load-ballot/route.ts`.
- Tests and harnesses: `playwright.env.ts`, `scripts/run-playwright.mjs`, `package.json`,
  `.github/workflows/ci.yml`, `src/app/api/e2e/load-ballot/route.test.ts`,
  `src/lib/server/security-boundary.test.ts`,
  `src/lib/server/transactions/normalized-runtime.test.ts`,
  `src/lib/server/rate-limit.test.ts`, `src/lib/vote/voting-window.test.ts`,
  `tests/e2e/full-flow.spec.ts`, `tests/e2e/mobile-routes.spec.ts`,
  `tests/load/load-rehearsal.spec.ts`, `tests/phase9/hosted-four-round.spec.ts`.
- Release docs: `docs/production-readiness-remediation-2026-07-01.md`,
  `docs/deployment-readiness.md`, `docs/release-checklist.md`, `docs/phase-status.md`,
  `.env.example`.

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 38 files / 149 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 4 Playwright tests.
- `rtk npm run test:load` - passed, 100-player browser rehearsal.
- `rtk npm run test:phase9` - passed, four-round hosted-rehearsal spec.
- `rtk npm run import:charts` - passed, 4,426 charts imported with required pool counts.
- `rtk npm run cache:chart-images` - passed, 639 cached and 0 fallback image assets.
- `rtk npm run verify:real-chart-images` - passed, 639 non-fallback cached images for 4,426 charts.
- `rtk npm audit --omit=dev` - passed, 0 vulnerabilities.
- `rtk git diff --check` - passed.

### Manual Review

- Product rules were not changed: four rounds, two sets per round, seven drawn charts, max two bans
  per set, no-ban completion, server tiebreaks, and final dual-chart reveal remain intact.
- Browser code still cannot access service-role keys, session secrets, password hashes, or the new
  test-route token.
- The e2e load route remains available only for non-production test configurations with an explicit
  shared token.

### Risks And Assumptions

- The Supabase migration must be applied through
  `20260701010000_production_readiness_transactions.sql` before running with
  `TOURNAMENT_STATE_BACKEND=supabase`.
- `TOURNAMENT_TEST_ROUTE_TOKEN` must not be configured in production.
- Local phase9 now uses the dev-server harness unless explicitly configured otherwise; a separate
  hosted Supabase rehearsal still depends on valid hosted Supabase credentials and a disposable
  `TOURNAMENT_EVENT_ID`.
- `tmp-trace-phase9-close-22/` remains an unrelated untracked local artifact and was not modified.

## Release Closure - 2026-06-29

Status: complete for real cached artwork and automated repository-backed rehearsal coverage; not
event-ready until an explicitly approved hosted Supabase rehearsal is completed with a
non-production `TOURNAMENT_EVENT_ID`.

### Acceptance Criteria

- Real chart artwork: `rtk npm run cache:chart-images` runs through Node with `--use-system-ca` and
  produced `639 cached, 0 using fallback /chart-images/fallback-card.svg`.
- Deployable cache: `public/chart-images/cache` contains 639 real PNG files totaling 209,721,036
  bytes.
- Real-image gate: `rtk npm run verify:real-chart-images` verifies 639 non-fallback cached image
  assets assigned across 4,426 charts.
- Rendering verification: Playwright now requires rendered image paths to use `/chart-images/cache/`
  and not `fallback-card.svg` on `/stage`, `/vote`, `/charts`, and `/results`.
- Persistent rehearsal coverage: `persistent-tournament-flow.test.ts` now completes all four rounds
  through the operational repository boundary, persists/restores between rounds, verifies selected
  prior songs do not reappear, completes final reveal, and generates private CSV data for each round.
- CSV verification: e2e still verifies private CSV auto-download after final reveal and the manual
  `Download private ballot CSV` button; the four-round repository-backed test verifies manual
  override markers and selected chart data in generated CSV content.

### Changed Files

- Cache scripts: `package.json`, `scripts/verify-real-chart-images.ts`
- Real cached assets: `public/chart-images/cache/*.png`
- Tests: `src/lib/integration/persistent-tournament-flow.test.ts`,
  `tests/e2e/full-flow.spec.ts`
- Documentation: `docs/deployment-readiness.md`, `docs/event-day-runbook.md`,
  `docs/release-checklist.md`, `docs/release-closure-handover-2026-06-29.md`,
  `docs/remediation-issue-checklist.md`, `docs/phase-status.md`

### Checks Run

- `rtk npm run cache:chart-images` - initially reproduced `0 cached, 639 using fallback` before the
  Node CA fix; after the fix, repeated normal runs passed with `639 cached, 0 using fallback`.
- `rtk curl.exe -I https://piugame.com/data/song_img/3f951d73d3c1c32c7d238b2ce184459d.png` -
  returned `200 OK`, proving the source URL was reachable outside Node.
- `rtk node -e "fetch(...)"` - reproduced Node's `UNABLE_TO_VERIFY_LEAF_SIGNATURE` cause.
- `rtk node --use-system-ca -e "fetch(...)"` - fetched the representative image successfully.
- `rtk npm run import:charts` - passed, imported 4,426 charts with required pool counts S16 189,
  S17 196, S18 189, S19 167, S20 135, S21 150, S22 97, D23 125.
- `rtk npm run verify:real-chart-images` - passed, verified 639 non-fallback cached image assets for
  4,426 charts.
- Cache file count check - passed, 639 real files and 209,721,036 bytes under
  `public/chart-images/cache`.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 26 files / 76 tests.
- `rtk npm audit --omit=dev` - passed, 0 vulnerabilities.
- `rtk git diff --check` - passed.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.

### Manual Review

- Product rules: no round/set definitions, draw counts, ban rules, no-ban completion, voting window
  rules, result selection, or tiebreak authority changed.
- Artwork: fallback rendering remains available for resilience, but release closure checks now prove
  real cached artwork exists and renders on public/player surfaces.
- Persistence: the four-round repository-backed rehearsal uses the operational repository boundary
  shared with the Supabase backend, but it does not write to hosted Supabase.
- Security: `.env.local` was checked only for variable-name presence and public URL host; no secret
  values were printed or committed.
- CSV: browser e2e verifies auto/manual private CSV download for Round 1, and integration coverage
  verifies generated CSV content across all four rounds.

### Risks And Assumptions

- Hosted Supabase rehearsal remains intentionally unrun. Running it needs explicit approval, a
  confirmed non-production Supabase project/ref, and a disposable `TOURNAMENT_EVENT_ID` so real
  remote event state is not overwritten.
- The real cached image files add about 200 MB of deployable public assets. Individual files are well
  below common Git host single-file limits, but the repository and deployment artifact are larger.
- If future environments cannot reach `piugame.com` or cannot use the system CA store, keep the
  committed cache files in place and rerun `rtk npm run verify:real-chart-images` before release.

## Remediation Phase 0 - Align Instructions And Docs

Status: complete

### Acceptance Criteria

- Required-read docs: `AGENTS.md` now includes `docs/pump_open_stage_repo_validation_checklist.md`.
- Source-of-truth order: project instructions now state that the product spec and validation checklist
  override stale execution-plan text when they conflict.
- Stage layout docs: stale projector-preview layout guidance was replaced with the required two
  horizontal 7-card rows, Set 1 on top and Set 2 on bottom.
- Event readiness: this file now states the app is not event-ready until the remediation issue
  checklist is closed with evidence.
- Remediation links: event-day and release docs link the remediation plan and issue checklist.
- Gate repair: fixed the ambiguous Playwright `getByText("final")` selector exposed during
  verification by scoping the check to the result reveal controls.

### Changed Files

- `AGENTS.md`
- `docs/codex-execution-plan.md`
- `docs/testing-checklist.md`
- `docs/phase-status.md`
- `docs/event-day-runbook.md`
- `docs/release-checklist.md`
- `docs/remediation-issue-checklist.md`
- `tests/e2e/full-flow.spec.ts`

### Checks Run

- `rtk rg -n "4\\+3|4 cards on top|3 cards on bottom|compact 4\\+3|compact set panel" docs AGENTS.md`
- `rtk rg -n "not event-ready|remediation in progress|remediation-plan-2026-06-28|remediation-issue-checklist|pump_open_stage_repo_validation_checklist|source of truth" AGENTS.md docs/phase-status.md docs/event-day-runbook.md docs/release-checklist.md`
- `rtk npm run lint`
- `rtk npm run typecheck`
- `rtk npm run test`
- `rtk npm run build`
- `rtk npm run test:e2e`

### Manual Review

- Product rules: no tournament behavior was changed; this phase only aligned documentation with the
  product spec and validation checklist.
- Security: no secrets or implementation files were changed.
- Stage layout: docs now preserve the phone two-column layout as separate from the projector two-row
  layout.
- Tests: the e2e selector repair is test-only and targets the admin reveal-phase status instead of
  arbitrary chart text.

### Risks And Assumptions

- The remediation plan, remediation issue checklist, and validation checklist are currently untracked
  according to local Git status. This note documents that status; commit/staging is left to the user
  unless explicitly requested.
- Later remediation phases still need implementation work before event use.

## Remediation Phase 1 - Visible Stage And Image Fixes

Status: complete for the Phase 1 code paths; not event-ready because real cached artwork population
remains open in `docs/remediation-issue-checklist.md`.

### Acceptance Criteria

- Stage auto-refresh: `/stage` now includes `StageAutoRefresh`, which polls with `router.refresh()`
  every 2000ms.
- Public revalidation: admin draw and reroll actions now call `revalidateTournamentViews`, matching
  existing voting/reveal/reset revalidation behavior.
- Stage reveal sequence: projector rows reveal from committed draw `createdAt` timestamps at 1800ms
  per card, with Set 2 scheduled after all 7 Set 1 cards plus the reveal gap.
- Stage layout: projector preview is two labeled horizontal 7-card rows, Set 1 on top and Set 2 below.
- Phone layout: phone voting remains its separate two-column card grid with the 7th card centered.
- Runtime images: draw state now prefers `data/generated/charts-with-images.json` and verifies cached
  local public files before preserving non-fallback `localImagePath`.
- Fallback behavior: fallback art is used for missing, failed, or absent cached images.
- Real image cache attempt: `rtk npm run cache:chart-images` completed with 0 cached real images and
  639 fallback assets; `public/chart-images/cache` contained 0 files.

### Changed Files

- Stage/public UI: `src/app/stage/page.tsx`, `src/app/stage/StageAutoRefresh.tsx`,
  `src/components/StageSetPanel.tsx`, `src/components/StageDrawCard.tsx`,
  `src/components/ResultSetPanel.tsx`, `src/app/globals.css`
- Admin/public state: `src/app/coolguy69/actions.ts`, `src/lib/stage/stage-view.ts`,
  `src/lib/stage/stage-view.test.ts`
- Image/runtime data: `src/lib/charts/image-paths.ts`, `src/lib/charts/runtime-catalog.ts`,
  `src/lib/charts/runtime-catalog.test.ts`, `src/lib/charts/image-cache.ts`,
  `src/lib/charts/image-cache.test.ts`, `src/lib/draw/draw-state.ts`
- Phone/result image use: `src/app/vote/BallotFlow.tsx`, `src/app/vote/page.tsx`,
  `src/lib/vote/ballot.ts`
- E2E coverage: `tests/e2e/full-flow.spec.ts`
- Documentation: `docs/phase-status.md`, `docs/remediation-issue-checklist.md`

### Checks Run

- `rtk npm run lint` - passed
- `rtk npm run typecheck` - passed
- `rtk npm run test` - passed, 20 files / 54 tests
- `rtk npm run build` - passed
- `rtk npm run test:e2e` - passed, 1 Playwright test
- `rtk npm run cache:chart-images` - completed, but cached 0 real images and generated fallback
  metadata for all 639 image assets
- `rtk proxy powershell -NoProfile -Command "Get-ChildItem -Recurse -File -LiteralPath 'public\chart-images\cache' -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count"` - returned 0

### Manual Review

- Product rules: no tournament rules changed; round/set definitions, one voting window, ban rules,
  and server-side draw/reroll/result authority remain intact.
- Stage UI: projector rows are no longer 4+3 panels; reveal order is Set 1 cards 1-7, then Set 2
  cards 1-7; final reveal still shows exactly the two selected charts.
- Phone UI: the voter layout remains separate from projector layout and still uses two columns with
  the 7th card centered.
- Security: public refresh is read-only client polling; tournament-changing actions remain server
  actions behind admin session and host control.
- Tests: e2e now keeps a second `/stage` tab open and verifies draw, reroll, voting-open, and final
  reveal updates without manual stage navigation.

### Risks And Assumptions

- Real cached image files were not produced in this environment because all upstream image fetches
  failed. `RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028` remain open.
- `data/generated/*.json` and `public/chart-images/cache/` remain ignored/reproducible. Deployment
  still needs an event setup step or build workflow that provides generated metadata and real cached
  assets.
- The stage polling interval is 2000ms, so projector updates are intentionally lightweight rather
  than instant.
- Operational state is still in-memory until the later Supabase persistence remediation phase.

## Remediation Phase 2 - Stage, QR, And Result Reveal Polish

Status: complete for the Phase 2 code paths; not event-ready because real cached artwork population
and later remediation phases remain open.

### Acceptance Criteria

- QR code: `QRPanel` now generates a real SVG QR code with the `qrcode` package.
- QR target: the encoded room URL is built from `NEXT_PUBLIC_SITE_URL` plus `/room`, with a `/room`
  fallback if the event origin is not configured.
- Short URL: the stage QR panel shows the short event URL beneath the QR code.
- Timer and QR readability: the projector side rail is widened and Playwright verifies QR/timer
  bounding boxes during voting.
- Tiebreak reveal: the selected chart row and winner text stay hidden until the 5-second reveal
  duration completes.
- Backend authority: `ResultStore` records `winnerRevealStartedAt` for resolved tiebreak phases and
  blocks advancing past a tiebreak reveal before 5 seconds have elapsed.
- Final stage stability: Playwright verifies the final stage screen has exactly two selected chart
  cards.
- Visual/e2e coverage: Playwright covers two 7-card stage rows, QR SVG/target/short URL, timer,
  rendered stage image natural width, tiebreak hide/reveal behavior, and final reveal.

### Changed Files

- QR/public URL: `src/components/QRPanel.tsx`, `src/lib/public-url.ts`,
  `src/lib/public-url.test.ts`, `package.json`, `package-lock.json`
- Stage readability/test hooks: `src/app/stage/page.tsx`, `src/components/CountdownTimer.tsx`,
  `src/components/StageDrawCard.tsx`, `src/components/StageSetPanel.tsx`, `src/app/globals.css`
- Tiebreak reveal: `src/components/ResultSetPanel.tsx`, `src/components/RuneWheel.tsx`,
  `src/lib/results/result-engine.ts`, `src/lib/results/result-store.ts`,
  `src/lib/results/reveal-timing.ts`, `src/lib/results/result-store.test.ts`,
  `src/lib/results/private-csv.test.ts`
- E2E/docs: `tests/e2e/full-flow.spec.ts`, `docs/phase-status.md`,
  `docs/remediation-issue-checklist.md`

### Checks Run

- `rtk npm run typecheck` - passed
- `rtk npm run test -- src/lib/public-url.test.ts src/lib/results/result-store.test.ts src/lib/results/result-engine.test.ts` - passed
- `rtk npm run test:e2e` - initially exposed an e2e wait issue around the second tiebreak panel, then passed after the helper waited for the current reveal panel
- `rtk npm run lint` - passed
- `rtk npm run test` - passed, 22 files / 58 tests
- `rtk npm run build` - passed
- Final required checks were rerun after documentation updates; see the final Phase 2 handoff.

### Manual Review

- Product rules: QR remains a general `/room` link; no player-specific QR or `/vote` QR target was
  introduced.
- Results: tiebreak winners are still chosen by the server-side result computation before animation;
  the client only reveals the committed winner after the 5-second delay.
- Stage UI: the voting screen keeps the large timer and QR in a readable projector side rail, while
  the chart preview remains two horizontal 7-card rows.
- Final reveal: the final stage path maps only the two selected charts and the e2e test asserts
  exactly two final cards.
- Security: no secrets or password hashes were introduced; QR URL construction uses only the public
  `NEXT_PUBLIC_SITE_URL` value.

### Risks And Assumptions

- `NEXT_PUBLIC_SITE_URL` must be configured to the real event origin for phone scanning outside
  localhost. Without it, the QR falls back to `/room`, which is useful locally but not event-ready.
- Real cached artwork is still not populated in `public/chart-images/cache`; `RIC-020`, `RIC-021`,
  `RIC-022`, and `RIC-028` remain open.
- The stage polling interval is still 2000ms, so e2e waits account for lightweight refresh timing.
- Operational state remains in-memory until the later Supabase persistence remediation phase.

## Remediation Phase 3 - Phone Live State And Ballot UX

Status: complete for the Phase 3 code paths; not event-ready because real cached artwork population,
admin safety, persistence, and later remediation phases remain open.

### Acceptance Criteria

- Phone live refresh: active ballot screens poll server-backed voting state every 1500ms through
  `getVoteLiveStateAction`; paused, closed, revealed, and waiting `/vote` states refresh every 2000ms.
- Status transitions: phone UI updates from server state for pause/resume, final 30 seconds,
  one-minute extension, close, results revealing, and final reveal without manual navigation.
- Saved ballot recovery: selecting a start.gg username or reloading a remembered phone uses the
  existing ballot lookup to prefill saved choices and the server-confirmed timestamp.
- Remembered identity: the selected start.gg username is stored in device `localStorage` for the
  event and reused after refresh.
- Duplicate-use warning: a second device selecting an already-submitted username sees a warning before
  confirmation, including that the latest valid submitted ballot counts.
- Stale mutation safety: active ballot controls disable when the live snapshot reports voting is not
  accepting changes, and the server action still rejects stale invalid submissions.
- Emergency eligibility: password-gated current-round inactive-player add now updates an already-open
  voting snapshot and recalculates the turnout denominator.

### Changed Files

- Phone voting UI and polling: `src/app/vote/BallotFlow.tsx`,
  `src/app/vote/VoteAutoRefresh.tsx`, `src/app/vote/actions.ts`, `src/app/vote/page.tsx`
- Voting state: `src/lib/vote/voting-window.ts`, `src/lib/vote/voting-window.test.ts`
- Admin eligibility action: `src/app/coolguy69/actions.ts`
- E2E coverage: `tests/e2e/full-flow.spec.ts`
- Documentation: `docs/phase-status.md`, `docs/remediation-issue-checklist.md`

### Checks Run

- `rtk npm run lint` - passed
- `rtk npm run typecheck` - passed
- `rtk npm run test` - passed, 22 files / 59 tests
- `rtk npm run test:e2e` - passed, 2 Playwright tests
- `rtk npm run build` - passed

### Manual Review

- Product rules: voting still uses one round ballot covering both chart sets, explicit no-ban remains
  required for zero bans, and latest valid submitted ballot continues to win.
- Phone UX: saved choices and timestamps are visible after refresh; `Change vote` remains available
  only while server state allows player ballot changes.
- Security: phone polling exposes only voting status, turnout summary, eligibility/submitted IDs, and
  the selected player's existing ballot lookup; ballot mutations still go through server actions.
- Eligibility: emergency current-round additions keep the active voting snapshot authoritative for the
  in-memory phase and update turnout math.

### Risks And Assumptions

- Operational state remains in-memory until the later Supabase persistence remediation phase.
- Phone polling is intentionally lightweight rather than instant; the server remains the final guard
  against stale submissions during the interval between polls.
- Real cached artwork remains unverified and `RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028` remain open.

## Remediation Phase 4 - Admin Safety And Missing Workflows

Status: complete for the Phase 4 code paths; not event-ready because operational persistence and real
cached artwork population remain open.

### Acceptance Criteria

- Host lock safety: unexpired host locks cannot be silently stolen; takeover now requires the
  explicit force path and warning when another active host holds the lock.
- Admin audit trail: host control, draw/reroll, voting, manual ballot, emergency, result correction,
  rehearsal, round, and roster-changing server actions write in-memory audit records with session,
  action, reason, summary, metadata, affected records, and danger flags.
- Dangerous summaries: reroll, reset/rehearsal, manual ballot/replacement, emergency reopen,
  reset-round, and result override forms show clear consequences before password entry.
- Sensitive counts: admin-only live chart-by-chart counts sit behind a warning disclosure and do not
  require a second password, while public routes still expose only safe voting status/turnout before
  close.
- Emergency workflows: admins can reopen closed voting for a chosen 1-10 minute duration, reset one
  round's operational state, and override a computed selected chart through dangerous password-gated
  actions with required audit reasons.
- Manual ballot timing: manual ballots are allowed while voting is open or closed before reveal
  starts; a computed-but-unrevealed result is invalidated and must be recomputed after the manual
  ballot.

### Changed Files

- Admin audit and host safety: `src/lib/admin/audit.ts`, `src/lib/admin/audit.test.ts`,
  `src/lib/admin/host-lock.ts`, `src/lib/admin/host-lock.test.ts`,
  `src/lib/server/admin-state.ts`
- Admin workflows/UI: `src/app/coolguy69/actions.ts`, `src/app/coolguy69/page.tsx`,
  `src/app/coolguy69/_components/ManualBallotForm.tsx`,
  `src/components/DangerousActionDialog.tsx`
- Operational stores: `src/lib/vote/voting-window.ts`, `src/lib/vote/ballot-store.ts`,
  `src/lib/draw/draw-state.ts`, `src/lib/results/result-store.ts`
- Tests and docs: `src/lib/vote/voting-window.test.ts`,
  `src/lib/results/result-store.test.ts`, `tests/e2e/full-flow.spec.ts`,
  `docs/phase-status.md`, `docs/remediation-issue-checklist.md`

### Checks Run

- `rtk npm run typecheck` - passed
- `rtk npm run test -- src/lib/admin/host-lock.test.ts src/lib/admin/audit.test.ts src/lib/vote/voting-window.test.ts src/lib/results/result-store.test.ts` - passed
- `rtk npm run lint` - passed
- `rtk npm run test` - passed, 23 files / 64 tests
- `rtk git diff --check` - passed
- `rtk npm run test:e2e` - passed, 2 Playwright tests
- `rtk npm run build` - passed

### Manual Review

- Product rules: round/set definitions, two-set round ballots, explicit no-ban completion, least-ban
  selection, and server-decided tiebreaks are unchanged.
- Host lock: read-only admins see disabled tournament controls until they take the explicit force
  path or the existing host lock expires.
- Security: dangerous actions remain server actions requiring active host control and password
  re-entry; public route payloads were not expanded with live chart-by-chart counts.
- Result integrity: manual ballots after computation clear the computed result before reveal begins,
  and post-reveal corrections use an explicit override workflow instead of mutating ballots silently.

### Risks And Assumptions

- The Phase 4 audit store is still in memory until the persistence remediation phase moves
  operational state to Supabase.
- Reset-round is intentionally emergency-only and clears current in-memory state for the selected
  round; it does not repair already-exported CSV files outside the app.
- Real cached artwork remains unverified and `RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028` remain open.

## Remediation Phase 5 - Supabase Persistence

Status: complete for the Phase 5 persistence layer; not event-ready because real cached artwork,
chart exclusion UI/image pipeline hardening, and final rehearsal/CI reconciliation remain open.

### Acceptance Criteria

- Supabase repository: added a server-only `SupabaseOperationalStateRepository` that stores the
  authoritative tournament snapshot in `public.tournament_state_snapshots`.
- Runtime backend mode: `TOURNAMENT_STATE_BACKEND=supabase` selects Supabase persistence for
  deployed/event use; the memory backend remains only for tests, local demos, and single-process
  development.
- Hydration and saves: admin, stage, vote, charts, and results server reads hydrate from persistence;
  successful tournament-changing server actions persist state before revalidating views.
- Persisted operational state: roster, inactive/restored players, current-round eligibility, host
  lock/heartbeat, draw/reroll history, drawn chart order, excluded chart keys, voting windows,
  ballots/revisions/manual metadata, result snapshots/reveal phase, current round, rehearsal mode,
  and admin audit records are included in the snapshot.
- Selected-song exclusions: restored draw state derives selected prior songs from persisted final
  result snapshots rather than trusting only an in-memory set.
- Placeholder cleanup: removed the unused Phase 2 `tournament-mutations` placeholder module now that
  implemented server actions are the mutation boundary.

### Changed Files

- Persistence service: `src/lib/persistence/operational-state.ts`,
  `src/lib/persistence/repository.ts`, `src/lib/server/persistence.ts`,
  `src/lib/server/supabase-operational-state.ts`
- Store snapshots: `src/lib/admin/audit.ts`, `src/lib/admin/host-lock.ts`,
  `src/lib/admin/roster.ts`, `src/lib/draw/draw-state.ts`,
  `src/lib/vote/ballot-store.ts`, `src/lib/vote/voting-window.ts`,
  `src/lib/results/result-store.ts`, `src/lib/round/round-state.ts`,
  `src/lib/server/admin-state.ts`
- App wiring: `src/app/coolguy69/actions.ts`, `src/app/coolguy69/page.tsx`,
  `src/app/vote/actions.ts`, `src/app/vote/page.tsx`, `src/app/stage/page.tsx`,
  `src/app/charts/page.tsx`, `src/app/results/page.tsx`
- Schema/docs/tests: `supabase/migrations/20260628050200_initial_schema.sql`,
  `src/lib/db/database.types.ts`, `src/lib/db/schema.ts`, `.env.example`,
  `src/lib/persistence/operational-state.test.ts`, `docs/deployment-readiness.md`,
  `docs/phase-status.md`, `docs/remediation-issue-checklist.md`

### Checks Run

- `rtk npm run typecheck` - passed
- `rtk npm run test -- src/lib/persistence/operational-state.test.ts src/lib/admin/host-lock.test.ts src/lib/vote/voting-window.test.ts src/lib/results/result-store.test.ts src/lib/draw/draw-state.test.ts` - passed
- `rtk npm run lint` - passed
- `rtk npm run test` - passed, 24 files / 67 tests
- `rtk git diff --check` - passed
- `rtk npm run build` - passed
- `rtk npm run test:e2e` - passed, 2 Playwright tests

### Manual Review

- Product rules: no tournament rules changed; the existing server-side draw, voting, result, and
  tiebreak logic remains the authority inside the persisted operational snapshot.
- Security: service-role Supabase access stays in server-only modules; browser code only receives
  existing public/read payloads and no password hashes or service keys.
- Persistence: server components and server actions hydrate before reading mutable tournament state;
  successful mutations persist the snapshot before public revalidation.
- CSV/privacy: private CSV generation remains admin-session gated and now hydrates persisted
  result/ballot state before exporting.

### Risks And Assumptions

- `TOURNAMENT_STATE_BACKEND=supabase` must be set for deployed/event use. The default memory backend
  is only for local tests and demos.
- The Phase 5 persistence layer stores an operational snapshot row rather than fully rewriting every
  workflow against each normalized Supabase table. The existing normalized tables remain available
  for later reporting or migration hardening.
- Real cached artwork remains unverified and `RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028` remain open.

## Remediation Phase 6 - Data And Image Pipeline Hardening

Status: complete for the Phase 6 app/pipeline hardening code paths; not event-ready because full
event setup still produced 0 real cached artwork files in this environment.

### Acceptance Criteria

- Chart import exclusions: `rtk npm run import:charts` now reads
  `data/generated/chart-exclusions.json` before validating required pool counts.
- Admin chart eligibility: `/coolguy69` shows required pool counts and renders a selected pool's
  chart exclusion/re-inclusion controls.
- Exclusion auditability: chart exclusion changes require active host control, admin password
  re-entry, and an audit reason; persisted snapshots store full `chartExclusions` records.
- Pool validation: live chart exclusions are rejected when they would leave the chart's required pool
  below 7 eligible charts.
- Draw eligibility: live exclusions overlay runtime chart data before draw/reroll eligibility, and
  re-inclusions can return a chart to eligibility.
- Deployable cache support: `public/chart-images/cache` is no longer ignored, and runtime can derive
  deterministic cache paths from source `bg_img` when deployable public cache files exist.
- Image rendering checks: Playwright now verifies rendered artwork on `/stage`, `/vote`, `/charts`,
  and `/results` through natural-width checks.
- Real artwork blocker: normal and unsandboxed `rtk npm run cache:chart-images` both completed with
  `0 cached, 639 using fallback`; `public/chart-images/cache` still had 0 real files.

### Changed Files

- Chart import/cache/runtime: `.gitignore`, `public/chart-images/cache/.gitkeep`,
  `scripts/import-charts.ts`, `src/lib/charts/exclusions.ts`,
  `src/lib/charts/runtime-catalog.ts`
- Draw/persistence/contracts: `src/lib/draw/draw-state.ts`,
  `src/lib/persistence/operational-state.test.ts`,
  `src/lib/server/mutation-contracts.ts`
- Admin/player/e2e UI: `src/app/coolguy69/actions.ts`, `src/app/coolguy69/page.tsx`,
  `src/app/vote/BallotFlow.tsx`, `src/app/vote/page.tsx`,
  `tests/e2e/full-flow.spec.ts`
- Tests/docs: `src/lib/charts/importer.test.ts`, `src/lib/charts/runtime-catalog.test.ts`,
  `src/lib/draw/draw-state.test.ts`, `src/lib/server/mutation-contracts.test.ts`,
  `docs/deployment-readiness.md`, `docs/event-day-runbook.md`,
  `docs/release-checklist.md`, `docs/testing-checklist.md`,
  `docs/remediation-issue-checklist.md`, `docs/phase-status.md`

### Checks Run

- `rtk npm run test -- --run src/lib/charts/importer.test.ts src/lib/draw/draw-state.test.ts src/lib/charts/runtime-catalog.test.ts src/lib/server/mutation-contracts.test.ts` - passed, 4 files / 12 tests
- `rtk npm run import:charts` - passed, imported 4426 charts with required pool counts S16 189, S17 196, S18 189, S19 167, S20 135, S21 150, S22 97, D23 125
- `rtk npm run cache:chart-images` - completed with 0 cached, 639 fallback
- `rtk npm run cache:chart-images` unsandboxed - completed with 0 cached, 639 fallback
- Real cache file count: `public/chart-images/cache` contained 0 files excluding `.gitkeep`
- `rtk npm run lint` - passed
- `rtk npm run typecheck` - passed
- `rtk npm run test` - passed, 24 files / 71 tests
- `rtk git diff --check` - passed
- `rtk npm run build` - passed
- `rtk npm run test:e2e` - passed, 2 Playwright tests

### Manual Review

- Product rules: no round/set, draw-count, ban-count, no-ban, voting-window, result, or tiebreak
  tournament rules were changed.
- Admin safety: chart exclusion/re-inclusion is treated as dangerous because it changes future draw
  eligibility; it requires password re-entry and reasoned audit metadata.
- Runtime images: missing artwork still falls back and does not block draw, stage, phone, charts, or
  results; deterministic cache derivation only preserves non-fallback paths when public files exist.
- UI performance: the admin chart eligibility UI renders one selected pool's forms at a time so the
  private CSV client controls still hydrate promptly.

### Risks And Assumptions

- Full event setup still cannot claim non-fallback artwork: both cache attempts produced 0 real cached
  images with `failureReason: "fetch failed"`. `RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028` remain
  open.
- Generated JSON under `data/generated/*.json` remains reproducible and ignored; real cache image
  files under `public/chart-images/cache` are now deployable when populated.
- The chart exclusion UI defaults to the current round's first pool and lets the host switch pools;
  it intentionally avoids rendering every chart form at once.

## Remediation Phase 7 - Test And CI Repair

Status: complete for the Phase 7 test and CI reliability scope; not event-ready because remaining
remediation rows still include real cached artwork population and `/charts` live-refresh coverage.

### Acceptance Criteria

- Repository-backed integration: added a persistent tournament flow test that saves/restores through
  the operational repository boundary between roster/host-lock setup, draws, voting, ballot submit,
  result computation, and result reveal.
- Persistent load coverage: added a 100-player load-sized path that submits and edits every ballot,
  persists through the repository, restores, and verifies one latest revision-2 ballot per player.
- CI stability: added workflow tests that enforce the current GitHub Actions quality gates and block
  production secret references in `.github/workflows/ci.yml`.
- Secret hygiene: added a test proving `.env` and `.env.local` remain ignored and untracked while
  `.env.example` is allowed.
- CI/local parity: CI continues to run install, Playwright browser install, lint, typecheck, tests,
  chart import, fallback image cache, production audit, build, and e2e.

### Changed Files

- Added `src/lib/integration/persistent-tournament-flow.test.ts`
- Added `src/lib/server/ci-workflow.test.ts`
- Updated `docs/remediation-issue-checklist.md`
- Updated `docs/testing-checklist.md`
- Updated `docs/phase-status.md`

### Checks Run

- `rtk npm run test -- --run src/lib/integration/persistent-tournament-flow.test.ts src/lib/server/ci-workflow.test.ts` - passed, 2 files / 4 tests
- `rtk npm run test` - passed, 26 files / 75 tests
- `rtk npm run import:charts` - passed, imported 4426 charts with all required pools at 7+
- `rtk npm run cache:chart-images -- --fallback-only` - passed, 639 fallback assets
- `rtk npm run lint` - passed
- `rtk npm run typecheck` - passed
- `rtk git diff --check` - passed
- `rtk npm run build` - passed
- `rtk npm run test:e2e` - passed, 2 Playwright tests

### Manual Review

- Product rules: new tests exercise existing flows and do not change tournament behavior.
- Persistence: repository-backed tests use the same operational snapshot abstraction selected by the
  Supabase backend, without requiring production Supabase secrets in CI.
- CI security: workflow tests reject `secrets.` and production secret env names in CI configuration;
  Playwright generates test-only admin/session/service values at runtime.
- Load: the 100-player path uses normal ballot submission and replacement semantics and restores the
  persisted latest revisions before asserting final state.

### Risks And Assumptions

- Phase 7 does not run against a live Supabase project in CI; it verifies the repository/snapshot
  boundary used by both memory and Supabase persistence without production credentials.
- CI intentionally runs fallback image cache generation. Real non-fallback artwork remains an event
  setup blocker until `rtk npm run cache:chart-images` can produce cached assets.
- `/charts` live-refresh coverage remains open until Remediation Phase 8.

## Remediation Phase 8 - Final Documentation And Release Reconciliation

Status: complete for final route-refresh and documentation reconciliation; not event-ready because
real cached artwork verification and the full four-round persistent rehearsal remain open.

### Acceptance Criteria

- `/charts` live refresh: `/charts` now includes `ChartsAutoRefresh`, which polls with
  `router.refresh()` every 2000ms.
- `/charts` evidence: Playwright keeps an already-open `/charts` page through draw, reroll,
  both-set display, and final reveal without manual navigation.
- Release docs: release, deployment, event-day, admin, and testing docs now agree that deployed or
  event use requires `TOURNAMENT_STATE_BACKEND=supabase`.
- Final gates: release docs explicitly require the remediation issue checklist, real cached artwork
  verification, a full four-round rehearsal against persistent state, and private CSV verification
  after final reveal.
- Stale docs: the current admin runbook no longer says operational mutations are in-memory only, and
  the historical phase archive below is marked as superseded by the remediation status above.
- Closure status: `RIC-094` is closed with e2e evidence; `RIC-020`, `RIC-021`, `RIC-022`, and
  `RIC-028` remain open because real cached artwork was not verified.

### Changed Files

- `/charts` live refresh: `src/app/charts/ChartsAutoRefresh.tsx`, `src/app/charts/page.tsx`
- E2E coverage: `tests/e2e/full-flow.spec.ts`
- Documentation: `docs/admin-runbook.md`, `docs/deployment-readiness.md`,
  `docs/event-day-runbook.md`, `docs/release-checklist.md`,
  `docs/remediation-issue-checklist.md`, `docs/testing-checklist.md`,
  `docs/phase-status.md`

### Checks Run

- `rtk npm run typecheck` - passed
- `rtk npm run test:e2e` - passed, 2 Playwright tests
- `rtk npm run lint` - passed
- `rtk npm run test` - passed, 26 files / 75 tests
- `rtk npm run import:charts` - passed, imported 4426 charts with required pool counts S16 189,
  S17 196, S18 189, S19 167, S20 135, S21 150, S22 97, D23 125
- `rtk npm run cache:chart-images -- --fallback-only` - passed, 0 cached and 639 fallback assets
- `rtk npm audit --omit=dev` - passed
- `rtk git diff --check` - passed
- `rtk npm run build` - passed

### Manual Review

- Product rules: no round/set definitions, draw counts, ban rules, no-ban completion, voting window
  rules, result selection, or tiebreak authority changed.
- `/charts`: the new client polling is read-only and mirrors the existing public refresh pattern;
  tournament-changing actions remain server-side.
- Docs: deployment and runbook guidance now preserves the Phase 5 persistence requirement and does
  not claim event readiness while the remediation closure gate remains blocked.
- CSV: Playwright still verifies private CSV auto-download after final reveal and the manual admin
  download button; release docs require repeating that check during full rehearsal.

### Risks And Assumptions

- A full four-round browser rehearsal against persistent state was not completed in this phase; it
  remains a release blocker.
- Real cached artwork is still unverified. Prior Phase 6 non-fallback cache attempts produced
  `0 cached, 639 using fallback`; do not close `RIC-020`, `RIC-021`, `RIC-022`, or `RIC-028` until
  real cached files and rendering are verified.
- CI/local checks use fallback image cache generation; non-fallback artwork remains an event setup
  gate.

## Historical Implementation Phase Archive

The sections below predate the remediation plan and are retained as historical implementation notes.
When they conflict with the current remediation status above, `docs/product-spec.md`,
`docs/pump_open_stage_repo_validation_checklist.md`, and `docs/remediation-issue-checklist.md` are
authoritative.

## Phase 1 - Project Scaffold, Docs, And Route Skeleton

Status: complete

### Acceptance Criteria

- Required routes: complete
- Uploaded logo: present at `public/brand/tournament-logo.png`
- Documentation files: complete
- `AGENTS.md`: present
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test`
- Production build: passed with `npm run build`
- E2E: not available in Phase 1 because Playwright is not introduced yet

### Changed Files

- App scaffold: `package.json`, `package-lock.json`, Next, TypeScript, ESLint, Tailwind, PostCSS, Vitest, and Prettier config files
- Routes: `/stage`, `/room`, `/vote`, `/charts`, `/results`, `/coolguy69`
- Shared components: `TournamentLogo`, `ChartCard`, `ChartSetPanel`, `RoundHeader`, `CountdownTimer`, `QRPanel`, `AdminLayout`, `DangerousActionDialog`, `HostLockBadge`
- Shared constants and tests: `src/lib/tournament.ts`, `src/lib/tournament.test.ts`, `vitest.config.ts`
- Docs: `docs/implementation-plan.md`, `docs/data-model.md`, `docs/admin-runbook.md`, `docs/phase-status.md`, plus README/testing/runbook updates
- Ignore rules: `.gitignore` now covers Next output, generated TypeScript build info, local env files, Vercel, Supabase runtime files, logs, caches, and test output

### Manual Review

- Product rules: required routes exist, locked round set map is represented, the player label text is exact, the room offers voting and view-only choices, and no tournament decisions are made in browser code.
- Security: no secret values were added; only `.env.example` contains secret variable names; admin auth and dangerous actions remain non-operational placeholders until their planned phases.
- Data: Phase 1 has only typed constants and placeholder charts; database schema and chart import are deferred to Phases 2 and 3.
- UI: the shell uses the uploaded logo, black industrial panels, orange/red glow, rune-style accents, and readable placeholder screens without official DOOM assets.
- Tests: placeholder unit tests cover the locked route list and round set map.

### Risks And Assumptions

- Admin authentication, host lock, roster management, draw logic, voting logic, results, and CSV export are not implemented yet by design.
- E2E tests are not available yet; they should be added when Playwright is introduced in a later phase.
- The production build detected a local `.env.local`, but `.gitignore` excludes it and no local secret value was read or committed.
- npm audit for production dependencies passed after forcing patched PostCSS via npm overrides.

## Phase 2 - Database Schema And Server Foundation

Status: complete

### Acceptance Criteria

- Migrations: SQL migration created at `supabase/migrations/20260628050200_initial_schema.sql`
- Local migration apply: blocked because neither Supabase CLI nor `psql` is installed in this environment
- Round set seed data: present in migration and statically tested
- Server-side Supabase client: created in `src/lib/server/supabase.ts`
- Client-side code cannot import server-only secrets: server secret modules import `server-only`; browser client uses only `NEXT_PUBLIC_*`
- Placeholder mutation functions: complete for all Phase 2 required contracts
- Basic database tests: passed with `npm run test`
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Production build: passed with `npm run build`
- Production dependency audit: passed with `npm audit --omit=dev`
- E2E: not available because Playwright is not introduced yet

### Changed Files

- Added Supabase migration with core tournament tables, indexes, locked round/set seed data, and row level security enabled on all core tables
- Added database metadata and partial Supabase database types in `src/lib/db`
- Added browser-safe Supabase anon client helper in `src/lib/db/browser-client.ts`
- Added server-only environment and service-role Supabase helpers in `src/lib/server`
- Added Zod mutation contracts and placeholder server-side mutation functions for all tournament-changing operations
- Added migration and mutation contract tests
- Updated data model and security docs
- Updated package dependencies for Supabase, `server-only`, and Zod

### Manual Review

- Product rules: schema preserves four rounds, two fixed sets per round, draw count 7, max bans 2, duplicate active username blocking, round player eligibility snapshots, ballot revisions, manual overrides, result snapshots, and tiebreak records.
- Security: service-role key, admin password hash, and session secret are read only from server-only modules; RLS is enabled with no permissive browser policies; tournament mutation functions are server-only placeholders.
- Data: tables cover the Phase 2 required list plus `round_player_eligibility` for the active-player snapshot rule.
- UI: no Phase 2 UI behavior was added beyond existing route shells.
- Tests: static migration tests verify required tables, RLS, round-set seed rows, active username uniqueness, and completed ballot choice constraints.

### Risks And Assumptions

- The SQL migration has not been applied to a live or local Supabase database because required local tooling is unavailable. It is statically tested but still needs a real Supabase apply check once tooling/project credentials are available.
- Mutation functions validate input shape and clearly return `not_implemented`; real database behavior begins in later phases.
- Database types are partial hand-written types for the Phase 2 scaffold and should be replaced or expanded from Supabase-generated types once the schema stabilizes.

## Phase 3 - Chart Import, Normalization, Image Caching, And Exclusions

Status: complete

### Acceptance Criteria

- Chart import: passed with `npm run import:charts`
- Source data: imported from `data/source/charts.csv`
- Import result: 4,426 unique S/D charts imported from 4,571 source rows
- Unsupported rows: 145 `c` type rows skipped because tournament pools only use S/D charts
- Duplicate chart keys: 0 in the supplied CSV
- Required pools: S16=189, S17=196, S18=189, S19=167, S20=135, S21=150, S22=97, D23=125
- Image cache/fallback: passed with `npm run cache:chart-images -- --fallback-only`
- Image result: 639 unique image asset records planned with fallback art at `public/chart-images/fallback-card.svg`
- Exclusions and re-inclusions: covered by unit tests in `src/lib/charts/normalize.test.ts`
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (6 files, 19 tests)
- Production build: passed with `npm run build`
- E2E: placeholder passed with `npm run test:e2e`; Playwright is not introduced yet
- Production dependency audit: passed with `npm audit --omit=dev`

### Changed Files

- Added chart domain modules in `src/lib/charts`
- Added `npm run import:charts` and `npm run cache:chart-images`
- Added chart import and fallback cache scripts in `scripts`
- Added local fallback chart art in `public/chart-images/fallback-card.svg`
- Added generated-output ignore rules and `data/generated/.gitkeep`
- Updated README, testing checklist, and event-day runbook with import/cache workflow
- Added `csv-parse` and `tsx` dependencies

### Manual Review

- Product rules: normalization limits active tournament pools to S16/S17, S18/S19, S20/S21, and S22/D23; each required pool has far more than 7 eligible charts in current source data.
- Security: import/cache scripts do not read service-role keys or browser secrets; generated chart data contains public chart metadata and remote art references only.
- Data: chart type, level, display difficulty, song key, and chart key are stable; duplicate chart keys are detected and skipped; unsupported `c` chart rows are reported rather than silently mixed into tournament pools.
- Exclusions: helper functions require a reason and support both exclusion and re-inclusion by chart key.
- Images: cache planning deduplicates remote `bg_img` URLs and uses a committed original fallback card when live downloads are unavailable.
- Tests: unit tests cover normalization, duplicate handling, required pool validation against the real CSV, exclusion/re-inclusion, and image fallback planning.

### Risks And Assumptions

- The fallback-only cache run does not download third-party images. Full image fetching is available through `npm run cache:chart-images` and should be run before the event on a network-enabled machine.
- Generated manifests under `data/generated/*.json` are ignored because they are reproducible from the source CSV and can be several megabytes.
- Real Supabase chart upserts still depend on Phase 2 credentials/tooling becoming available; local generated JSON is the offline/import verification artifact for this phase.

## Phase 4 - Admin Authentication, Host Lock, And Roster Management

Status: complete

### Acceptance Criteria

- `/coolguy69` requires password: implemented with login-only unauthenticated view
- Admin password storage: verifies `ADMIN_PASSWORD_HASH`; plaintext password is never stored
- Admin session cookie: signed HTTP-only cookie with 30-minute max age
- Host lock: implemented with server-side lock, host token cookie, heartbeat client, release action, and takeover behavior after expiry
- Read-only admin browsers: roster and dangerous controls are disabled and server actions reject mutations without active host control
- Roster management: add player, bulk import, mark active/inactive, reactivate inactive players, and active count are implemented
- Duplicate active start.gg usernames: blocked in the roster store and covered by tests
- Current-round eligibility: inactive player addition requires active host control, admin password re-entry, and audit reason
- Dangerous action dialog: reusable password/reason-capable component is wired for current-round eligibility
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (9 files, 25 tests)
- E2E: placeholder passed with `npm run test:e2e`
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added admin password hash verification, signed session tokens, host lock store, and roster store
- Added server-only admin auth/state helpers
- Added `/coolguy69` server actions for login/logout, host lock, roster edits, and dangerous eligibility changes
- Replaced the admin route shell with password-gated admin UI and host-lock-aware controls
- Added host heartbeat and inactivity timer client components
- Added unit tests for password hashing, host lock behavior, and roster behavior
- Updated admin docs, testing checklist, and `.env.example`

### Manual Review

- Product rules: roster uses start.gg usernames, keeps inactive players visible/restorable, blocks duplicate active usernames, and gates current-round eligibility changes behind dangerous confirmation.
- Security: admin password is checked against a hash only; sessions and host tokens use HTTP-only cookies; tournament-changing admin actions require a server-side session and active host control.
- Data: Phase 4 uses server-only in-memory stores because Supabase credentials/tooling are unavailable; later phases should move these operations to Supabase tables.
- UI: `/coolguy69` is no longer a public console; unauthenticated users see only login. Read-only admins can view state but cannot operate roster or dangerous controls.
- Tests: unit coverage verifies password hashing, duplicate active username blocking, inactive restore, current-round eligibility reason requirement, host lock ownership, and host lock expiry takeover.

### Risks And Assumptions

- In-memory admin state survives browser refresh in the same dev/server process but does not survive server restart or multi-instance deployment. Supabase persistence is required before event use.
- Login requires `ADMIN_PASSWORD_HASH` and `SESSION_SECRET` to be configured. Without them, the admin page still loads but login returns a configuration error.
- The current dangerous eligibility form is the first use of the dangerous action dialog; later dangerous actions must reuse the same password re-entry pattern.

## Phase 5 - Chart Draw Engine And Reroll Controls

Status: complete

### Acceptance Criteria

- Each set draws exactly 7 unique charts: implemented and covered by unit tests
- Excluded chart keys are filtered before draw: implemented and covered by unit tests
- Selected songs from prior rounds are excluded: implemented and covered by unit tests
- Same song is not drawn in both sets of the same round: implemented and covered by unit tests
- Rerolls preserve history: one-chart and set rerolls create new versions and supersede prior active draw records
- Voting cannot open until both sets are drawn: implemented as `canOpenVoting`
- Backend randomness: draw engine uses Node `crypto.randomInt`, never browser randomness
- Backend draw state survives browser refresh: server-only in-memory draw state is shared across admin page refreshes in the same process
- Admin draw controls: active host can draw every required set and reroll one chart, one set, or one round
- Dangerous rerolls: reroll actions require active host control, admin password re-entry, and reason
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (11 files, 31 tests)
- E2E: placeholder passed with `npm run test:e2e`
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added draw engine and draw state store under `src/lib/draw`
- Added draw engine/state unit tests
- Extended server-only admin state with draw state
- Added admin server actions for draw set, reroll chart, reroll set, and reroll round
- Added `/coolguy69` draw controls for all required round sets
- Updated admin runbook, testing checklist, README, and phase status

### Manual Review

- Product rules: draw set definitions still match the product spec; draws are 7 charts; only selected prior songs are blocked from future draws; same-round duplicate songs are blocked across the two sets.
- Security: draw/reroll actions run server-side, require a valid admin session and active host control, and rerolls require password re-entry plus reason.
- Data: draw versions are preserved in server memory with superseded timestamps, eligible pool counts, chart order, and reason.
- UI: admin controls expose all required sets and keep controls disabled for read-only admins.
- Tests: unit coverage verifies draw count, uniqueness, exclusions, prior selected song blocking, same-round duplicate blocking, history preservation, one-chart reroll, and voting-open readiness.

### Risks And Assumptions

- Draw state is in-memory until Supabase credentials/tooling are available. It survives browser refresh in one server process but not server restart, serverless cold starts, or multiple instances.
- The admin UI displays draw controls in the admin route only; dramatic stage visualization begins in Phase 6.
- Chart exclusion UI is not fully wired to the draw store yet. The draw engine supports excluded chart keys, and persistent exclusion management should be connected when Supabase-backed chart exclusions are implemented.

## Phase 6 - Stage Display And Draw Visualization

Status: complete

### Acceptance Criteria

- Stage can reveal Set 1 and Set 2: implemented with animated stage cards for active draw records
- Stage shows both sets together: `/stage` renders both round set panels from server draw state
- QR code points to `/room`: existing `QRPanel` remains on the stage page
- Timer and QR are readable on projector: stage sidebar keeps large timer/status and QR panel
- Missing chart image fallback: stage cards use `public/chart-images/fallback-card.svg` when no local image path exists
- Refresh returns stage to current state: `/stage` reads server-only draw state on every request and is marked dynamic
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (12 files, 32 tests)
- E2E: placeholder passed with `npm run test:e2e`
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added stage view helper and unit test in `src/lib/stage`
- Added stage-specific draw card and set panel components
- Updated `/stage` to render dynamic server draw state instead of static placeholders
- Added card reveal animation CSS
- Updated README, testing checklist, and phase status

### Manual Review

- Product rules: stage still shows the two fixed sets for the current round and does not decide draw results in browser code.
- Security: stage route reads server state only; it does not expose admin secrets, password hashes, service-role keys, or mutation controls.
- Data: stage refresh reflects the in-memory active draw records created by admin draw controls in the same server process.
- UI: stage uses uploaded logo through `RoundHeader`, a readable timer/QR sidebar, original industrial/rune styling, and animated chart cards. The original projector card layout noted in this historical phase is superseded by the remediation requirement for two horizontal 7-card rows.
- Tests: unit coverage verifies stage readiness depends on both set draws.

### Risks And Assumptions

- Stage currently displays Round 1 because current-round state is not persistent yet. Later voting/round state phases should drive the active round.
- Draw animation is CSS reveal-on-render, not a host-stepped reveal sequence. More detailed stage control can build on the same draw state in later phases.
- Visual verification was limited to build/static checks in this phase; full browser-driven E2E and screenshot coverage begins when Playwright is introduced.

## Phase 7 - Player Room, View-Only Mode, And Ballot Flow

Status: complete

### Acceptance Criteria

- Room landing: `/room` already offers `I am a player voting` and `View charts only`
- Player identity: `/vote` uses active roster players only and exact label `Select your start.gg username`
- Username confirmation: exact confirmation copy appears after selection
- Existing ballot detection: submitted player IDs trigger the duplicate-device warning and latest valid ballot wins in the server store
- Ballot flow: Set 1, Set 2, and Review/Submit steps are implemented
- Submit blocking: player cannot submit until both sets are complete
- No bans: `No bans for this set` explicitly completes a set and clears bans
- Ban max: UI and server validation cap bans at 2 per set
- Ballot editing: saved view offers `Change vote`; new save revisions replace prior valid ballot
- View-only mode: `/charts` reads draw state and exposes no submit controls
- Inactive players: filtered out of the voting dropdown
- After close/reveal phone behavior: `/vote` has closed/revealing and revealed phone status views for later state-machine phases
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (13 files, 35 tests)
- E2E: placeholder passed with `npm run test:e2e`
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added ballot validation and in-memory ballot store under `src/lib/vote`
- Extended server-only admin state with ballot state
- Added `/vote` server actions and client ballot flow
- Replaced `/vote` placeholder with active-player identity, set voting, review, submit, saved/edit, closed, and revealed views
- Updated `/charts` to view draw state without voting controls
- Updated README, testing checklist, and phase status

### Manual Review

- Product rules: the voting form covers both chart sets in one round ballot, bans are capped at 2 per set, no-ban is explicit, no vague skip button was added, and latest valid ballot revision wins.
- Security: ballot submission is a server action and validates drawn chart IDs server-side; view-only route has no mutation action.
- Data: ballots are stored server-side in memory with revision count and submitted timestamp until Supabase persistence is wired.
- UI: phone card layout uses two columns with the 7th card centered; identity and duplicate warning copy match the product spec.
- Tests: unit coverage verifies no-ban completion, ban completion, latest ballot replacement, and phone status transitions.

### Risks And Assumptions

- Voting open/closed timers and pause behavior are not implemented until Phase 8. Phase 7 adds the phone display states that Phase 8 and Phase 9 will drive.
- Ballot state is in-memory until Supabase persistence is wired. It survives browser refresh in one server process but not server restart or multiple instances.
- Current route state is still fixed to Round 1 until later round-state work.

## Phase 8 - Voting Window, Timer Logic, Pause, Turnout, And Manual Ballots

Status: complete

### Acceptance Criteria

- Timer source: voting windows use server-side time for `openedAt`, `closesAt`, pause remaining time, extension deadlines, final-change deadlines, and ballot timestamps
- One 10-minute window: opening voting snapshots eligible players and sets one deadline for both drawn sets
- Draw gate: voting cannot open until both sets are drawn
- Turnout display: stage and admin show `Ballots submitted: X / Y` and `Ban selections cast: Z` without public chart-by-chart live counts
- 75% extension: normal expiration below 75% turnout automatically enters one `extension_1_minute` state and then closes regardless of turnout
- Everyone submitted early: all eligible submitted before normal expiration enters `final_30_seconds`, allows edits, and then closes
- Pause behavior: host pause freezes countdown, submissions, and edits; resume restores the remaining official time
- Player saves: `/vote` accepts submissions only while `voting_open`, `final_30_seconds`, or `extension_1_minute`
- Eligible snapshot: `/vote` uses the active/current-round eligible snapshot captured when voting opens, not later roster edits
- Manual ballots: admin can enter a password-gated manual ballot while voting is open or after close before result reveal
- Existing ballot warning: manual admin entry shows `This player already has a submitted ballot.` and `Are you sure you want to replace it?`
- Post-close overrides: manual ballots saved after close are marked `manualOverride` for the future private CSV export
- Reveal lock: manual and player ballot saves are blocked after `results_revealed`
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (14 files, 42 tests)
- E2E: placeholder passed with `npm run test:e2e`
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added `VotingWindowStore` state machine and tests under `src/lib/vote`
- Extended ballot records with player/manual source, manual reason, and manual override metadata
- Added server-only voting round snapshot helpers for draw records, eligible players, turnout, and view revalidation
- Wired `/vote` submissions to the voting-window state and eligible-player snapshot
- Wired `/stage` to server-time timer state and public turnout display
- Added admin voting controls for open, pause, resume, and close
- Added password-gated manual ballot entry with replace-existing warning
- Extended roster eligibility resolution to include current-round emergency additions
- Updated README, testing checklist, and phase status

### Manual Review

- Product rules: one round ballot still covers both sets, voting opens only after both sets are drawn, the active eligible roster is snapshotted on open, and edits are allowed only while server state says voting is open.
- Security: tournament-changing actions remain server actions; manual ballots require host control plus admin password re-entry; public screens expose only turnout totals, not live chart counts.
- Timer behavior: client countdowns are visual only; official deadlines and transitions are computed by the server-side voting store.
- Data: post-close manual ballots carry `manualOverride` and reason metadata so Phase 9 CSV export can include them.
- Tests: unit coverage verifies the 10-minute deadline, 75% extension, final 30 seconds, pause/resume, post-reveal manual lock, manual override metadata, and current-round eligibility resolution.

### Risks And Assumptions

- Voting window state is still in-memory until Supabase persistence is wired. It survives refresh in one server process but not server restart or multiple instances.
- Current route state remains fixed to Round 1 until later round progression work.
- There is no special correction workflow yet after results reveal; Phase 8 blocks normal/manual ballot changes at that point as required.
- Manual ballot checkbox UX relies on server validation for the 1-2 ban limit and no-bans exclusivity; richer client validation can be added later without changing the server contract.

## Phase 9 - Results Computation, Rune-Wheel Tiebreak, Final Reveal, And CSV Export

Status: complete

### Acceptance Criteria

- Result computation: each drawn chart gets a ban count, including zero-ban charts
- Sort order: result rows reveal from least banned to most banned, with tied rows sorted alphabetically
- Selection: each set selects the chart with the fewest bans
- Tiebreaks: tied least-ban charts use a backend-decided winner before reveal
- Rune wheel: 2-4 chart least-ban ties produce a 12-slot wheel animation that reveals the committed winner
- Fallback ties: 5+ chart least-ban ties use a plain fallback reveal with the backend winner already committed
- Stage sequence: host can reveal Set 1 counts, Set 1 selected chart, Set 2 counts, Set 2 selected chart, then the final two charts
- Final screen: `/stage` shows `ROUND X FINAL CHARTS` with exactly two selected charts after final reveal
- Phone behavior: `/vote` shows the closed/revealing message until final reveal, then selected charts first and expandable full ban counts
- View-only behavior: `/charts` and `/results` show post-reveal results only after final reveal
- Private CSV: admin download includes player-level rows, manual overrides, selected charts, and tiebreak flags
- CSV auto-download: admin client attempts one automatic private CSV download after final reveal and keeps a manual button
- Selected songs: final reveal marks selected song keys for later draw exclusion
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (16 files, 45 tests)
- E2E: placeholder passed with `npm run test:e2e`
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added result computation, reveal state, and private CSV modules under `src/lib/results`
- Extended server-only admin state with a result store
- Added result display components for count rows, selected highlights, and rune-wheel tiebreak reveal
- Added admin result controls and private CSV download behavior
- Updated `/stage`, `/vote`, `/charts`, and `/results` to use committed result state
- Extended ballot metadata with `replacedExistingBallot`
- Added result and CSV unit tests
- Updated README, testing checklist, and phase status

### Manual Review

- Product rules: results use ban counts only, include zero-ban charts, choose least-ban charts, and do not use browser randomness for tiebreak decisions.
- Reveal flow: public phones and view-only pages do not show result details until the host reaches the final reveal.
- Security: result computation and reveal actions are server actions behind admin session and host lock; private CSV download requires an admin session.
- Data: private CSV rows include unsubmitted eligible players, manual override fields, selected charts, and tiebreak flags.
- UI: stage final screen shows exactly the two selected charts, and result rows use both count badges and small bars.

### Risks And Assumptions

- Result state is still in-memory until Supabase persistence is wired. It survives refresh in one server process but not server restart or multiple instances.
- Current route state remains fixed to Round 1 until later round progression work.
- Manual ballots are blocked after result computation to avoid stale committed results; a future correction/override workflow should handle post-compute changes.
- CSV auto-download depends on browser download permissions; the manual button remains available after final reveal.

## Phase 10 - Testing, Edge Cases, And Review Hardening

Status: complete

### Acceptance Criteria

- Unit coverage: chart import, active player eligibility, duplicate active usernames, draw count, excluded/selected songs, same-round duplicate songs, ban completion, result sorting/selection, tiebreaks, and private CSV generation are covered
- Integration coverage: full round flow, player edit/latest ballot, post-reveal voting lock, Round 2 selected-song exclusion, and 100-player/multiple-edit load-sized ballot behavior are covered
- E2E coverage: Playwright smoke flow covers stage load, room links, admin login, host control, roster import, both set draws, player vote, close, result reveal, final screens, and private CSV download
- Security coverage: client components are scanned for server-only secret environment names
- Result integrity: no known issue can change a committed result without a later explicit correction workflow
- Ballot integrity: latest valid ballot wins and submitted ballots are not lost across edits in tested flows
- Post-reveal lock: server state blocks ballot changes after `results_revealed`
- View-only behavior: `/charts` and `/results` expose no submit controls and only show result details after final reveal
- Service-key safety: no client component references service-role keys, session secrets, or admin password hash names
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (18 files, 49 tests)
- E2E: passed with `npm run test:e2e` (1 Playwright test)
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added Playwright dependency, config, `start` script, and full-flow e2e smoke test
- Replaced the placeholder e2e script with `playwright test`
- Added integration hardening tests under `src/lib/integration`
- Added browser security-boundary test under `src/lib/server`
- Updated README, testing checklist, and phase status

### Manual Review

- Product rules: the new integration tests exercise result-relevant round flow, selected-song exclusion, latest-ballot behavior, post-reveal lock, and load-sized submissions.
- Security: the browser-boundary test guards against accidentally referencing server-only secret names from client components.
- E2E: the Playwright smoke test uses a deterministic test-only admin hash and runtime-generated session/service placeholders, not production secrets.
- Load: the 100-player test uses normal store submissions and multiple edits without realtime connections.

### Risks And Assumptions

- Playwright browser binaries must be installed locally or in CI with `npx playwright install chromium`.
- E2E uses a test-only admin password and in-memory state on a local production Next server.
- Full multi-round browser e2e coverage remains limited to a Round 1 smoke path; deeper round progression is still tied to later current-round work.

## Phase 11 - Deployment Readiness And Rehearsal Tooling

Status: complete

### Acceptance Criteria

- Production build readiness: `npm run build` passes with dynamic public/admin routes
- Deployment workflow: `docs/deployment-readiness.md` documents Vercel, Supabase, environment variables, build checks, and free-tier constraints
- Data setup workflow: chart import, image cache, chart exclusion review, roster import, active-player review, duplicate username blocking, and pool validation are documented
- Rehearsal mode: admin can start rehearsal mode, reset rehearsal data, and see a visible rehearsal/tournament mode indicator
- Test roster: starting rehearsal mode resets operational state and loads 12 disposable rehearsal players
- Current round control: admin can set or advance the current round; `/stage`, `/vote`, `/charts`, and `/results` read that server current-round state
- Forced tiebreak rehearsal: rehearsal-only seeding creates two-way least-ban tiebreak ballots after both current-round sets are drawn
- Data separation: rehearsal reset clears operational state and returns to tournament mode before real event use
- Venue checklist: `docs/event-day-runbook.md` includes stage laptop, projector/stream capture, QR readability, phone testing, admin laptop, host lock, and private CSV download location checklists
- Rehearsal runbook: `docs/rehearsal-runbook.md` documents a complete four-round rehearsal using test data
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (19 files, 51 tests)
- E2E: passed with `npm run test:e2e` (1 Playwright test)
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added current-round and rehearsal state under `src/lib/round`
- Extended server-only admin state with round state and operational reset support
- Added admin actions and UI for current round, rehearsal mode, rehearsal reset, and forced tiebreak seeding
- Updated current-round public routes to use server current-round state
- Added deployment readiness and rehearsal runbooks
- Expanded event-day and admin runbooks
- Updated README, testing checklist, and phase status

### Manual Review

- Product rules: fixed round chart-set definitions are unchanged; current-round state only selects which already-defined round is active.
- Rehearsal safety: rehearsal controls are host-only; start/reset require admin password re-entry and clear destructive summaries.
- Data separation: rehearsal mode visibly labels the admin page and reset returns to tournament mode.
- Deployment: documentation keeps secrets out of Git and calls out the remaining Supabase persistence requirement before multi-instance/serverless event use.

### Risks And Assumptions

- Operational stores remain in-memory. Local rehearsal works in one server process; production event use still needs Supabase-backed persistence or an explicitly controlled single-process host.
- Forced tiebreak seeding is a rehearsal helper only and is blocked outside rehearsal mode.
- Full browser e2e still exercises Round 1; the four-round rehearsal workflow is documented and supported through current-round admin controls.

## Phase 12 - Final Polish, Runbook Verification, And Release Checklist

Status: complete

### Acceptance Criteria

- Release checklist: `docs/release-checklist.md` exists and covers environment, data, roster, admin/host, public screens, results/export, and final checks
- Event-day runbook: includes before-event, stage laptop, projector/stream capture, QR, phone, admin laptop, host lock, before-round, during-voting, after-close, CSV location, and website-failure sections
- GitHub Actions: `.github/workflows/ci.yml` exists and runs install, Playwright browser install, lint, typecheck, tests, chart import, fallback image cache, production audit, build, and e2e
- Critical UI flow review: release checklist explicitly covers stage readability, phone voting, QR, timer readability, selected chart highlight, final two-chart screen, inactive restore, manual override, and CSV download behavior
- Full four-round rehearsal: supported through Phase 11 current-round/rehearsal controls and documented in `docs/rehearsal-runbook.md`
- Private CSV verification: release checklist and Playwright e2e cover private CSV download behavior
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (19 files, 51 tests)
- E2E: passed with `npm run test:e2e` (1 Playwright test)
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added GitHub Actions CI workflow
- Added release checklist
- Expanded event-day runbook with final operating flow
- Updated README, testing checklist, and phase status

### Manual Review

- Tournament rules: no tournament rule constants changed; final docs preserve two sets per round, one voting window, explicit no-ban, least-ban selection, server-decided tiebreaks, and private CSV handling.
- Security: CI uses no production secrets; Playwright e2e generates test-only auth material at runtime; release docs keep secrets in Vercel/local env only.
- UI/ops: release checklist requires manual verification of the projector, phone, QR, timer, final selected chart, admin dangerous action, inactive restore, manual override, and CSV flows.
- Tests: local final gates match the workflow gates, with Playwright e2e included because it runs against generated local test credentials.

### Risks And Assumptions

- Operational stores remain in-memory. Production event use still needs Supabase-backed persistence or an explicitly controlled single-process host.
- GitHub Actions includes Playwright e2e and installs Chromium; if CI browser install becomes unreliable, keep e2e as a documented local rehearsal gate rather than requiring production secrets.
- Playwright currently covers a full Round 1 smoke path; four-round validation is supported and documented as a rehearsal workflow.

## Normalized Runtime Persistence Phase 1 - Event Scope And Schema

Status: complete

### Acceptance Criteria

- `TOURNAMENT_EVENT_ID` is part of server runtime configuration and Supabase-backed runtime
  persistence refuses to initialize when it is missing.
- Mutable runtime tables now have an `event_id` column and nonblank event-id constraints.
- Cross-event-colliding uniqueness now includes `event_id` for active player usernames, admin
  sessions, draws, voting windows, eligibility, ballots, result snapshots, tiebreaks, and host
  locks.
- Static chart catalog, fixed rounds, fixed round sets, image assets, and the existing debug snapshot
  table remain global for this phase.
- Local Supabase database types now represent every core runtime table.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (28 files, 87 tests)
- E2E: passed with `npm run test:e2e` (2 Playwright tests)
- Production build: passed with `npm run build`
- Prettier check: passed for touched TypeScript and Markdown files. SQL formatting is not configured
  because Prettier has no SQL parser in this project.

### Changed Files

- Added `supabase/migrations/20260629090000_event_scoped_runtime.sql`
- Expanded `src/lib/db/database.types.ts` to cover all core tables and event-scoped columns
- Added event-scoped schema constants and migration/type coverage tests
- Added `TOURNAMENT_EVENT_ID` server configuration and Supabase persistence guard
- Updated deployment/admin/event-day docs for the required event namespace
- Added a Playwright-only public URL override so local `.env.local` event URLs cannot break e2e QR
  assertions

### Manual Review

- Tournament rules: no round, draw, vote, result, tiebreak, or UI tournament behavior changed.
- Security: `TOURNAMENT_EVENT_ID` is runtime configuration, not a browser public value or secret; the
  service-role key, session secret, and admin password hash remain server-only.
- Persistence: this phase prepares normalized event-scoped tables but does not yet cut runtime reads
  or writes over from `tournament_state_snapshots`.

### Risks And Assumptions

- Existing Supabase projects need the new migration applied before normalized repositories can write
  event-scoped runtime records.
- Runtime state is still snapshot-authoritative until later normalized persistence phases replace the
  snapshot repository.
- Existing rows receive the migration default `local-dev`; event/rehearsal repositories must set the
  configured `TOURNAMENT_EVENT_ID` explicitly when they are introduced.

## Normalized Runtime Persistence Phase 2 - Repository Boundaries

Status: complete

### Acceptance Criteria

- Added server-only repository classes for players, chart exclusions, draws, voting windows, ballots,
  results, admin sessions, admin audit, and host locks.
- Repository boundaries share a configured event id and service-role Supabase client dependency.
- Every mutable event-scoped runtime table is assigned to exactly one repository boundary.
- Repository scoped selects attach `event_id` before returning a query boundary.
- Existing in-memory stores remain available for tests and local fake runs; runtime cutover is still
  deferred to later phases.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (29 files, 92 tests)
- Production build: passed with `npm run build`
- E2E: passed with `npm run test:e2e` (2 Playwright tests)

### Changed Files

- Added `src/lib/server/repositories/normalized-runtime.ts`
- Added `src/lib/server/repositories/normalized-runtime.test.ts`
- Updated phase status

### Manual Review

- Tournament rules: no player, draw, voting, result, tiebreak, or admin UI behavior changed.
- Security: repositories import `server-only`, use the service-role client only inside server code,
  and carry event ids without exposing service keys, password hashes, session secrets, or token
  hashes to browser components.
- Persistence: this phase creates the repository boundary layer only; no runtime reads or writes have
  been cut over from snapshots yet.

### Risks And Assumptions

- Repository methods are intentionally minimal boundary primitives; transactional writes are deferred
  to Phase 3.
- Runtime state remains snapshot-authoritative until the Phase 4 cutover.

## Normalized Runtime Persistence Phase 3 - Transactional Mutations

Status: complete

### Acceptance Criteria

- Added normalized transactional RPC entrypoints for ballot submit/edit, manual ballot override,
  active voter presence claim/touch, host lock acquire/heartbeat/release, voting window state
  changes, draw/reroll operations, post-vote reroll invalidation, result compute/reveal/override,
  round reset, and admin session create/touch/logout/revoke.
- Added `active_voter_presence` with event scope and RLS for duplicate-device/presence workflows.
- Added ballot invalidation columns needed for post-vote reroll recovery and audit.
- Added a server-only transactional executor that validates payloads, attaches `TOURNAMENT_EVENT_ID`,
  and calls the mapped Supabase RPC through the service-role client.
- Local Supabase database types now include the presence table, ballot invalidation columns, and
  normalized RPC function signatures.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (30 files, 99 tests)
- Production build: passed with `npm run build`
- E2E: passed with `npm run test:e2e` (2 Playwright tests)

### Changed Files

- Added `supabase/migrations/20260629093000_transactional_runtime_rpc.sql`
- Added `src/lib/server/transactions/normalized-runtime.ts`
- Added `src/lib/server/transactions/normalized-runtime.test.ts`
- Updated schema constants, database types, schema tests, and player repository table coverage
- Updated phase status

### Manual Review

- Tournament rules: no current runtime tournament behavior changed; existing actions still use the
  snapshot-backed stores until cutover.
- Security: transactional executor imports `server-only`, uses the service-role RPC boundary, and
  does not expose service keys, admin password hashes, session secrets, or token hashes to browser
  components.
- Transactionality: each normalized mutation goes through a single Supabase RPC call, so the
  database-side implementation has an atomic commit/rollback boundary for dependent records.

### Risks And Assumptions

- Runtime state remains snapshot-authoritative until Phase 4 replaces snapshot load/save with
  normalized repositories and RPC calls.
- RPC bodies currently establish the operation-specific transaction boundary and validation surface;
  Phase 4 must connect the existing tournament logic to these boundaries before deployed Supabase
  state is authoritative.

## Normalized Runtime Persistence Phase 4 - Draw-Aware Ballot And Result Model Correction

Status: complete

### Acceptance Criteria

- Added draw-level `draw_id` references to normalized `ballot_choices`, `result_rows`, and
  `tiebreaks` persistence.
- Preserved static `round_set_id` as the fixed `round_sets.id` reference for grouping, labels, CSV,
  and consistency checks.
- Added database trigger validation so ballot choices, result rows, and tiebreaks cannot mix a
  static round set with an unrelated active draw.
- Added validation that banned/result/tiebreak chart ids belong to `drawn_charts` for the referenced
  `draw_id`.
- Split runtime/domain payloads so `drawId` is the active draw attempt and `roundSetId` is the
  static chart-set id.
- Updated vote, admin/manual ballot, result computation, live counts, private CSV, persistence
  snapshots, mutation contracts, and tests to use draw-aware identity.
- Runtime cutover is still deferred; snapshot persistence remains authoritative until the next
  phase replaces `SupabaseOperationalStateRepository` load/save with normalized reads/writes.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (30 files, 104 tests)
- Production build: passed with `npm run build`
- E2E: passed with `npm run test:e2e` (2 Playwright tests)

### Changed Files

- Added `supabase/migrations/20260629100000_draw_aware_ballot_result_identity.sql`
- Updated `supabase/migrations/20260628050200_initial_schema.sql`
- Updated `src/lib/tournament.ts`, draw state, ballot validation/store consumers, result engine/store,
  private CSV export, snapshot restore, mutation contracts, database types, schema constants, and
  tests
- Updated `/vote` and `/coolguy69` ballot payload construction to submit both `drawId` and
  `roundSetId`
- Updated `docs/normalized-runtime-persistence-plan-2026-06-29.md`

### Manual Review

- Tournament rules: no round, draw count, vote, no-ban, result, tiebreak, or reveal behavior changed.
  This phase only corrected identifiers so existing behavior can be represented safely in normalized
  persistence.
- Security: no new browser secret exposure; the new SQL checks run at the database boundary and
  tournament-changing mutations remain server-side.
- Persistence: normalized ballot/result tables now have enough identity to avoid corrupting choices
  or result rows during rerolls. Snapshot restore includes a compatibility shim for old debug
  snapshots that stored active draw ids in `roundSetId`.

### Risks And Assumptions

- Existing Supabase projects need the new migration applied before normalized cutover work resumes.
- The forward migration updates deterministic static `round_sets.id` values with `on update cascade`
  on related normalized FKs; this is safe for normalized rows, but should still be rehearsed against
  a non-production Supabase project before event use.
- Initial parallel execution of `npm run build` and `npm run test:e2e` conflicted on `.next` cache
  writes; after clearing generated `.next`, both passed sequentially.

## Normalized Runtime Persistence Phase 5 - Runtime Cutover

Status: complete

### Acceptance Criteria

- Supabase-backed operational persistence now uses normalized runtime tables instead of
  `tournament_state_snapshots` for load/save.
- Runtime reads reconstruct the existing operational store snapshot from normalized players, draws,
  voting windows, ballots, results, admin sessions/actions, presence, host locks, and event runtime
  state.
- Runtime writes persist draw-aware ballot/result identity with both active `draw_id` and static
  `round_set_id`.
- Added cutover support columns/tables for event runtime state, draw reasons, eligibility reasons,
  voting pause state, result reveal timestamps, tiebreak reveal timestamps, host lock owners, and
  ballot invalidation audit.
- Repository boundary coverage now includes `event_runtime_state` and `ballot_invalidations`.
- Snapshot persistence remains available only as the old debug table; the Supabase runtime backend no
  longer hydrates from or writes to it.
- Production still rejects unsafe non-Supabase runtime backend configuration.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (31 files, 105 tests)
- Production build: passed with `npm run build`
- E2E: passed with `npm run test:e2e` (2 Playwright tests)

### Changed Files

- Added `supabase/migrations/20260629103000_normalized_runtime_cutover_support.sql`
- Added `src/lib/server/normalized-operational-state.ts`
- Added `src/lib/server/normalized-operational-state.test.ts`
- Updated `src/lib/server/persistence.ts` to use normalized Supabase operational persistence
- Updated database types, schema table lists, normalized repository boundaries, and persistence
  safety tests

### Manual Review

- Tournament rules: no round definitions, draw counts, ban limits, no-ban behavior, least-ban result
  selection, tiebreak reveal timing, or final reveal behavior changed.
- Security: normalized persistence imports `server-only`, uses the service-role Supabase client only
  on the server, and does not expose service keys, password hashes, session secrets, or token hashes
  to browser code.
- Persistence: the new round-trip test proves normalized save/load does not touch
  `tournament_state_snapshots` and preserves draw-aware ballot/result identity across reconstruction.

### Risks And Assumptions

- Existing Supabase projects need all normalized runtime migrations through
  `20260629103000_normalized_runtime_cutover_support.sql` applied before enabling
  `TOURNAMENT_STATE_BACKEND=supabase`.
- The phase was validated with an in-memory Supabase-shaped client and local app gates; a hosted
  Supabase rehearsal with a non-production `TOURNAMENT_EVENT_ID` is still required before event use.
- Active voter presence is now round-scoped for runtime reconstruction, but hosted rehearsal should
  still verify duplicate-device warnings across refresh/redeploy boundaries.

## Normalized Runtime Persistence Phase 6 - Admin Sessions And Host Locks

Status: complete

### Acceptance Criteria

- Supabase-backed admin login now writes only a SHA-256 hash of the opaque admin session token to
  `admin_sessions`.
- Admin session validation requires both a valid signed cookie and an active, unrevoked normalized
  `admin_sessions` row for the configured `TOURNAMENT_EVENT_ID`.
- Admin heartbeat refresh rotates the signed cookie, updates the stored token hash, touches
  `last_seen_at`, and slides `expires_at` to the 10-hour inactivity window.
- Admin logout revokes the normalized server-side session before clearing admin and host cookies.
- Operational runtime save/load no longer deletes or creates placeholder `admin_sessions` rows;
  session lifecycle is owned by the auth path.
- Host locks remain persisted in normalized `host_locks` with owner session id, token hash,
  heartbeat, expiry, and active-lock indexes for TTL lookup.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (32 files, 107 tests)
- Production build: passed with `npm run build`
- E2E: passed with `npm run test:e2e` (2 Playwright tests)

### Changed Files

- Added `supabase/migrations/20260629110000_admin_session_host_lock_security.sql`
- Added `src/lib/server/admin-session-store.ts`
- Added `src/lib/server/admin-session-store.test.ts`
- Updated `src/lib/server/admin-auth.ts` to create, validate, refresh, and revoke normalized admin
  sessions when the runtime backend is Supabase
- Updated `src/lib/server/normalized-operational-state.ts` so operational state replacement no
  longer manages `admin_sessions`
- Updated normalized cutover tests and phase docs

### Manual Review

- Tournament rules: no player, draw, voting, result, tiebreak, or reveal behavior changed.
- Security: admin session database rows store token hashes only; signed cookie validation alone is no
  longer sufficient when Supabase-backed runtime persistence is enabled.
- Host control: the existing host-lock token hash and 15-second TTL behavior is preserved, with
  normalized indexes added for active lock lookup.

### Risks And Assumptions

- Existing Supabase projects need all normalized runtime migrations through
  `20260629110000_admin_session_host_lock_security.sql` applied before enabling the Supabase
  backend.
- A hosted Supabase rehearsal is still required to verify admin heartbeat, logout revocation, and
  host-lock takeover behavior across refresh/redeploy boundaries.
- Admin session token hash rotation means a stale pre-refresh cookie becomes invalid once a refreshed
  cookie has been persisted for the same session id.

## Normalized Runtime Persistence Phase 7 - Audit, Export, And Recovery

Status: complete

### Acceptance Criteria

- Private ballot CSV now includes result id, result compute/reveal timestamps, reveal phase, final
  reveal timestamp, ballot revision, static `round_set_id`, active `draw_id`, and draw version for
  each set.
- Private ballot CSV now includes tiebreak candidate ids, backend winner chart id, and winner reveal
  start timestamp for each set.
- Manual override markers and reasons remain in the CSV export.
- Admin console now exposes a password-session-gated debug operational snapshot download.
- Debug snapshot exports are labeled `debug_operational_state_snapshot` with
  `authoritativeRuntimeSource: false` and a warning that deployed runtime authority comes from
  normalized Supabase tables.
- Downloading a debug snapshot records a non-tournament-changing audit action before export.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (33 files, 108 tests)
- Production build: passed with `npm run build`
- E2E: passed with `npm run test:e2e` (2 Playwright tests)

### Changed Files

- Added `src/lib/persistence/debug-export.ts`
- Added `src/lib/persistence/debug-export.test.ts`
- Added `src/app/coolguy69/_components/DebugSnapshotDownload.tsx`
- Updated private CSV generation/tests and four-round persistent rehearsal CSV assertions
- Updated admin actions/page to provide the debug snapshot download
- Updated phase docs

### Manual Review

- Tournament rules: no draw, vote, result, tiebreak, or reveal behavior changed.
- Security: debug snapshots require an admin session, are not exposed to browser code until an admin
  explicitly downloads them, and are labeled as non-authoritative backup/debug exports.
- Recovery: the export preserves the existing operational snapshot shape, including audit records,
  ballot invalidations, draw ids, static round-set ids, result/tiebreak metadata, and host state for
  manual inspection.

### Risks And Assumptions

- Debug snapshot import/restore is intentionally not implemented; deployed runtime reads continue to
  use normalized Supabase tables.
- Hosted Supabase rehearsal remains the next required gate to validate export behavior against the
  real remote backend and event namespace.

## Comprehensive Review Remediation Phase 1 - Authoritative State And Concurrency

Status: complete with `CR-001` explicitly deferred to remediation Phase 9.

### Checklist Items Addressed

- CR-013: closed. Placeholder mutation RPC acknowledgements now fail the server-side wrapper unless
  row-change evidence is returned, and the migration overrides mutation-named RPC bodies so they
  raise instead of reporting false commits.
- CR-014: closed. Added database guards for active draw uniqueness, draw status, drawn chart
  pool/exclusion/same-round/prior-selected-song rules, and voting-open draw completion.
- CR-018: closed. Added explicit `REVOKE EXECUTE` from `public`, `anon`, and `authenticated`, with
  `GRANT EXECUTE` only to `service_role`, for each normalized mutation RPC.
- CR-001: improved but still open; moved to remediation Phase 9. Persistence now merges baseline/current/latest snapshots and
  serializes in-process saves, with regression tests for concurrent different-player ballots,
  same-player latest-ballot wins, and host-heartbeat/ballot races. The Supabase save path still
  needs a cross-instance database transaction, row-scoped mutation, or optimistic event revision
  before this item is closed.

### Changed Files

- Added `src/lib/persistence/merge.ts`
- Added `supabase/migrations/20260630010000_phase1_rpc_lockdown_and_draw_guards.sql`
- Updated `src/lib/server/persistence.ts`
- Updated `src/lib/server/persistence.test.ts`
- Updated `src/lib/server/transactions/normalized-runtime.ts`
- Updated `src/lib/server/transactions/normalized-runtime.test.ts`
- Updated `src/lib/db/schema.test.ts`
- Updated `docs/comprehensive-review-checklist-2026-06-30.md`

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 33 files / 115 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.
  - Note: one attempted parallel `build` + `test:e2e` run hit a `.next` rename race while
    Playwright was also building/starting the app. Rerunning the gates sequentially passed.

### Manual Review

- Product spec: no tournament rule, route, voting, draw, result, tiebreak, admin, or visual behavior
  was intentionally changed.
- Security: public and authenticated clients are explicitly revoked from normalized mutation RPCs;
  service-role execution remains server-side only.
- Persistence: app-instance races are covered by merge and queue tests, but hosted Supabase
  multi-instance writes still need a database-transactional closeout before event readiness.

### Risks And Assumptions

- Existing Supabase projects need the new Phase 1 remediation migration applied after the prior
  normalized runtime migrations.
- The new RPC override intentionally disables mutation-named RPCs until they are implemented as real
  row-changing transactions; current application actions continue through the existing persistence
  path.
- The draw guard migration is statically covered by tests but still needs hosted Supabase rehearsal
  before treating the database boundary as event-verified.

## Comprehensive Review Remediation Phase 2 - Ballot Privacy And Public Mutation Safety

Status: complete.

### Checklist Items Addressed

- CR-002: closed. Public ballot lookup and live polling no longer return another player's `choices`
  unless the caller presents the matching device-scoped edit token. Duplicate-name warnings still
  work from existence/revision metadata, and second devices can submit replacements without reading
  the prior ballot.
- CR-017: closed. Added basic fixed-window throttling for admin login, dangerous password re-entry,
  voter presence claims, and public ballot submissions/edits, plus action-boundary length caps for
  sensitive free-text and identifier inputs.

### Changed Files

- Added `src/lib/vote/ballot-privacy.ts`
- Added `src/lib/vote/ballot-privacy.test.ts`
- Added `src/lib/server/rate-limit.ts`
- Added `src/lib/server/rate-limit.test.ts`
- Added `src/lib/server/input-limits.ts`
- Added `supabase/migrations/20260630020000_ballot_edit_token_hash.sql`
- Updated `src/app/vote/actions.ts`
- Updated `src/app/vote/BallotFlow.tsx`
- Updated `src/app/coolguy69/actions.ts`
- Updated `src/lib/server/admin-auth.ts`
- Updated ballot, DB type, normalized persistence, schema, and phase documentation files

### Checks Run

- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 35 files / 122 tests.
- `rtk npm run lint` - passed.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.

### Manual Review

- Product spec: no tournament rules, round structure, draw logic, result selection, or reveal order
  changed.
- Security: browser clients receive only public ballot metadata unless a private device token
  authorizes editing; stored edit tokens are hashed and stripped from public responses.
- Voting behavior: latest valid submitted ballot still replaces prior same-player revisions.

### Risks And Assumptions

- The rate limiter is process-local. It provides basic abuse protection for this runtime but is not
  a cross-instance/global throttle.
- Local-storage edit tokens are device/browser scoped. Clearing browser storage removes same-device
  edit authorization, but the player can still submit a replacement ballot after the duplicate
  warning.

## Comprehensive Review Remediation Phase 3 - Voting Timer Correctness

Status: complete for `CR-015`, `CR-026`, and the poll-dependent portion of `CR-003`; hosted
database-time timer mutation remains deferred to remediation Phase 9.

### Checklist Items Addressed

- CR-015: closed. Emergency reopen now marks the window extension-used, so the selected reopen
  duration does not receive another low-turnout extension.
- CR-026: closed. `/vote` renders final selected charts for both `results_revealed` and
  `round_complete` when the committed result phase is final.
- CR-003: improved but still open. Voting snapshots no longer mutate official state during reads,
  and deadline derivation is anchored to persisted close times. True hosted database-time
  transactional timer mutation is moved to Phase 9 with the remaining Supabase runtime closure work.

### Changed Files

- Added `src/lib/vote/phone-view.ts`
- Added `src/lib/vote/phone-view.test.ts`
- Updated `src/lib/vote/voting-window.ts`
- Updated `src/lib/vote/voting-window.test.ts`
- Updated `src/app/coolguy69/actions.ts`
- Updated `src/app/vote/actions.ts`
- Updated `src/app/vote/page.tsx`
- Updated remediation checklist and plan documentation

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 36 files / 127 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.

### Manual Review

- Product spec: tournament voting, draw, result selection, tiebreak, and reveal rules were not
  changed.
- Timer behavior: snapshots are read-only derivations; actions that mutate tournament state now
  explicitly advance timer state before persisting where needed.
- Phone results: final selected chart cards continue to render before full ban counts through
  `PublicResultSummary`.

### Risks And Assumptions

- Official database-time timer decisions are not fully closed until Phase 9 implements real hosted
  Supabase row-scoped/transactional mutations.
- A late read can derive closed/extension status without persisting it; the next timer-related
  mutation persists the advanced state.

## Comprehensive Review Remediation Phase 4 - Draw And Result Rule Hardening

Status: complete.

### Checklist Items Addressed

- CR-004: closed. Selected-song blocks are synchronized from all computed result snapshots, not only
  final reveals, so future draws after compute but before final stage reveal exclude prior selected
  songs.
- CR-009: superseded by the 2026-07-03 production-readiness Phase 0 decision lock. True
  zero-ballot seven-way ties now use the same fallback reveal as other 5+ least-ban ties, with a
  backend-decided winner committed before reveal.
- CR-010: closed. Draw records are planned and validated before active history is superseded, and
  full-round rerolls commit only after both replacement sets are planned successfully.
- CR-011: closed. One-chart rerolls exclude the exact target chart and prefer a different song,
  falling back only to a different chart from the target song if needed.
- CR-012: closed. Draw records now persist eligible chart IDs plus exclusion, selected-song, and
  same-round-blocking snapshots in operational state and normalized `draws` rows.
- CR-032: closed. Stale source docs now describe result reveal order as least banned to most banned.

### Changed Files

- Added `src/lib/results/selected-song-blocks.ts`
- Added `supabase/migrations/20260630030000_draw_eligible_pool_snapshots.sql`
- Updated `src/lib/draw/draw-state.ts` and `src/lib/draw/draw-state.test.ts`
- Updated `src/lib/results/result-engine.ts` and `src/lib/results/result-engine.test.ts`
- Updated `src/components/RuneWheel.tsx`
- Updated `src/app/coolguy69/actions.ts`
- Updated operational restore and normalized persistence files/tests
- Updated database type/schema tests and remediation documentation

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 36 files / 134 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.
- Additional focused regression command passed before full gates:
  `rtk npm run test -- src/lib/draw/draw-state.test.ts src/lib/results/result-engine.test.ts src/lib/integration/tournament-flow.test.ts src/lib/persistence/operational-state.test.ts src/lib/server/normalized-operational-state.test.ts src/lib/db/schema.test.ts`

### Manual Review

- Product spec: least-banned winner selection, least-to-most reveal order, backend-decided
  tiebreaks, same-round duplicate blocking, and selected-prior-song blocking remain aligned.
- Security: no browser randomness or client-side tournament mutation path was added; selected-song
  block synchronization happens through server-side result/admin state.
- Data/audit: new draw audit arrays are additive and persisted in both snapshot and normalized
  runtime paths.

### Risks And Assumptions

- Existing Supabase projects need migration `20260630030000_draw_eligible_pool_snapshots.sql`
  applied before relying on normalized draw audit columns.
- Phase 4 has no deferred items. Existing Phase 9 deferrals for hosted Supabase row-scoped
  persistence and database-time transactional timer mutation remain open.

## Comprehensive Review Remediation Phase 5 - Admin Security And Dangerous Actions

Status: complete.

### Checklist Items Addressed

- CR-016: closed. Admin sessions now use a 30-minute TTL. Browser activity refreshes are
  interaction-driven and debounced; passive host-lock heartbeat validates without sliding the admin
  session.
- CR-019: closed. Debug operational snapshot export now requires active host control and password
  re-entry, is blocked during active/paused voting, and redacts session/host/edit-token/device
  internals.
- CR-020: closed. Shared dangerous-action prompts render target fields before a visible summary and
  password field. Reopen/reset/override/current-round-add pass selected-target summary fields.
- CR-021: closed. Manual ballot replacement warnings and confirmation controls name the selected
  start.gg username, and the server-side rejection also names the player.
- CR-022: closed. Manual ballot UI caps bans at two per set and enforces no-bans mutual exclusion
  before submit.

### Changed Files

- Updated `src/lib/admin/session.ts` and `src/lib/admin/session.test.ts`
- Updated `src/app/coolguy69/actions.ts`
- Updated `src/app/coolguy69/page.tsx`
- Updated `src/app/coolguy69/_components/AdminSessionHeartbeat.tsx`
- Updated `src/app/coolguy69/_components/AdminInactivityTimer.tsx`
- Updated `src/app/coolguy69/_components/DebugSnapshotDownload.tsx`
- Updated `src/app/coolguy69/_components/ManualBallotForm.tsx`
- Updated `src/components/DangerousActionDialog.tsx`
- Updated `src/lib/persistence/debug-export.ts` and `src/lib/persistence/debug-export.test.ts`
- Updated remediation checklist and plan documentation

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 36 files / 134 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.
- Additional focused regression command passed before full gates:
  `rtk npm run test -- src/lib/admin/session.test.ts src/lib/server/admin-session-store.test.ts src/lib/persistence/debug-export.test.ts`

### Manual Review

- Product spec: admin route, shared password, dangerous-action password re-entry, host lock, and
  manual ballot rules remain aligned.
- Security: passive host heartbeat no longer extends admin sessions; debug exports are gated and
  redacted; password re-entry remains server-verified.
- UI: dangerous prompts now put target inputs and action summary before password entry; manual
  ballot replacement and set completion controls match the required admin workflow more closely.

### Risks And Assumptions

- Debug snapshots are still an admin/host backup tool in non-production and production, but now
  require active host control and password re-entry and are blocked during active voting.
- Phase 5 has no deferred items.

## Comprehensive Review Remediation Phase 6 - Stage And Results Visual UX

Status: complete.

### Checklist Items Addressed

- CR-005: closed. `/stage` voting now uses a top voting band with a large countdown timer on the
  left and compact QR/short URL on the right, above the two chart rows.
- CR-006: closed. Set 2 result reveal phases collapse Set 1 into a selected-chart summary, and
  stage-mode result panels use compact rows with reveal details beside the active count grid.
- CR-007: closed. Rune-wheel slots show chart names during the sealed animation, and the final
  rotation lands a slot for the backend-committed winner under the pointer.
- CR-027: closed. Stage-only compact header, timer, QR, and chart-card sizing keep voting display
  readable at the default 1280x720 projector viewport while retaining larger 2xl cards.
- CR-028: closed. Final `/stage` results now use a dedicated two-card selected-chart layout with set
  labels and featured chart cards.

### Changed Files

- Added `src/components/rune-wheel-rotation.ts`
- Added `src/components/rune-wheel-rotation.test.ts`
- Updated `src/app/stage/page.tsx`
- Updated `src/app/globals.css`
- Updated `src/components/CountdownTimer.tsx`
- Updated `src/components/QRPanel.tsx`
- Updated `src/components/ResultSetPanel.tsx`
- Updated `src/components/RoundHeader.tsx`
- Updated `src/components/RuneWheel.tsx`
- Updated `src/components/StageDrawCard.tsx`
- Updated `src/components/StageSetPanel.tsx`
- Updated `src/components/TournamentLogo.tsx`
- Updated `tests/e2e/full-flow.spec.ts`
- Updated remediation checklist and plan documentation

### Checks Run

- `rtk npm run typecheck` - passed.
- `rtk npm run test -- src/components/rune-wheel-rotation.test.ts` - passed, 1 file / 3 tests.
- `rtk npm run lint` - passed.
- `rtk npm run test` - passed, 37 files / 137 tests.
- `rtk npm run test:e2e` - initially exposed voting-stage overflow and an obsolete two-visible-wheel
  assertion, then passed after layout tuning and test update. GitHub Actions later reproduced an
  Ubuntu-only 11px voting-stage overflow, fixed by trimming standard stage card height below `2xl`;
  local e2e passed again after that fix.
- `rtk npm run build` - passed.
- Final `rtk npm run test:e2e` after the CI-height fix passed, 2 Playwright tests.

### Manual Review

- Product spec: no round structure, voting, ban, result-selection, or tiebreak authority rules were
  changed. The final stage screen still shows exactly two selected charts for the round.
- Stage UI: QR still targets `/room`, short URL remains visible, the voting display remains two
  horizontal seven-card rows, and public screens still avoid live chart-by-chart counts during
  voting.
- Results: the rune wheel remains a reveal of the already committed backend winner; client rotation
  now aligns the visual pointer to a winner slot but does not choose the winner.
- Security: no secrets, password hashes, service keys, or tournament-changing client mutations were
  introduced.

### Risks And Assumptions

- Phase 6 has no deferred items.
- Existing Phase 9 deferrals remain open for hosted Supabase row-scoped persistence, database-time
  transactional timer mutation, and hosted rehearsal evidence.
- Stage layout was automatically verified at Playwright's Desktop Chrome viewport, 1280x720. The
  code is tuned for the documented 1024x768, 1280x720, and 1920x1080 targets, but only the 1280x720
  geometry is currently enforced by e2e.

## Comprehensive Review Remediation Phase 7 - Phone And View-Only UX

Status: complete.

### Checklist Items Addressed

- CR-023: closed. `/charts` now has a compact view-only status banner and mobile Set 1/Set 2 tabs
  with next/back controls, while desktop still shows both sets side by side.
- CR-024: closed. Vote cards now expose `aria-pressed`, visible selected state, a `0/2 bans selected`
  counter, and third-ban feedback that preserves existing selections.
- CR-025: closed. Phone ballot cards use stable dimensions, constrained seventh-card width,
  `break-words`, and line clamps for chart names and artists.
- CR-033: closed. Saved-ballot and review screens include direct `Edit [set label]` actions for each
  set.
- CR-034: closed. The unused legacy `ChartSetPanel` component and barrel export were removed.

### Changed Files

- Added `src/app/charts/ChartsSetNavigator.tsx`
- Updated `src/app/charts/page.tsx`
- Updated `src/app/vote/BallotFlow.tsx`
- Removed `src/components/ChartSetPanel.tsx`
- Updated `src/components/index.ts`
- Updated `tests/e2e/full-flow.spec.ts`
- Updated remediation checklist and plan documentation

### Checks Run

- `rtk npm run typecheck` - passed during implementation.
- `rtk npm run lint` - passed during implementation.
- `rtk npm run test:e2e` - initially exposed a strict locator conflict after adding `Edit S16`,
  then passed after the set-label assertion was made exact.
- Final `rtk npm run lint` - passed.
- Final `rtk npm run typecheck` - passed.
- Final `rtk npm run test` - passed, 37 files / 137 tests.
- Final `rtk npm run build` - passed.
- Final `rtk npm run test:e2e` - passed, 2 Playwright tests.

### Manual Review

- Product spec: voting still uses one round ballot covering both chart sets, each set still requires
  1-2 bans or explicit `No bans for this set`, and view-only users still cannot submit votes or
  affect turnout.
- Phone UX: the seventh vote card remains centered in the two-column phone layout; selected bans are
  visible to sighted users and exposed through `aria-pressed` for assistive tech.
- View-only UX: `/charts` exposes chart and voting/reveal status without rendering a username
  selector, ballot controls, or turnout-affecting actions.
- Security: all ballot mutations still go through server actions; no browser-side tournament
  decisions or public live chart counts were added.

### Risks And Assumptions

- Phase 7 has no deferred items.
- Existing Phase 9 deferrals remain open for hosted Supabase row-scoped persistence, database-time
  transactional timer mutation, and hosted rehearsal evidence.
- Automated mobile coverage added here uses Chromium at 390px. Broader mobile Chromium/WebKit
  project coverage remains part of Phase 8.

## Comprehensive Review Remediation Phase 8 - Test Harness, Mobile Coverage, And Load

Status: complete.

### Checklist Items Addressed

- CR-029: closed. The Playwright wrapper now selects a free port, sets matching public URL env,
  builds once before Playwright starts, and starts only the already-built app in Playwright's
  web server.
- CR-030: closed. Default e2e coverage now includes desktop Chromium, mobile Chromium, and mobile
  WebKit projects with route and phone-layout checks.
- CR-031: closed. `npm run test:load` now runs a Playwright/API hybrid 100-player rehearsal with
  stage, admin, room, charts, and results routes active and final private CSV verification.

### Changed Files

- Added `scripts/run-playwright.mjs`
- Added `playwright.env.ts`
- Added `playwright.load.config.ts`
- Added `src/app/api/e2e/load-ballot/route.ts`
- Added `tests/e2e/mobile-routes.spec.ts`
- Added `tests/load/load-rehearsal.spec.ts`
- Updated `package.json`
- Updated `playwright.config.ts`
- Updated `.github/workflows/ci.yml`
- Updated `src/lib/server/ci-workflow.test.ts`
- Updated `tests/e2e/full-flow.spec.ts`
- Updated remediation checklist and plan documentation

### Checks Run

- Final `rtk npm run lint` - passed.
- Final `rtk npm run typecheck` - passed.
- Final `rtk npm run test` - passed, 37 files / 137 tests.
- Final `rtk npm run build` - passed.
- Final `rtk npm run test:e2e` - passed, 4 Playwright tests across desktop Chromium, mobile
  Chromium, and mobile WebKit.
- Final `rtk npm run test:load` - passed, 1 Playwright load test with 100 player submissions and
  edits plus final private CSV verification.
- `rtk npm run test:e2e` - initially exposed the mobile WebKit admin-host setup issue, then passed
  after WebKit was scoped to public/player phone routes and Chromium handled setup. Final passing
  run: 4 Playwright tests.
- `rtk npm run test:load` - initially exposed the impractical runtime of 200 browser-only mobile
  ballot interactions and a reveal-timing assumption, then passed after switching ballot load to a
  gated HTTP route and waiting through reveal timing. Final passing run: 1 load Playwright test,
  100 player submissions and edits, final CSV verified.

### Manual Review

- Product spec: tournament rules, ballot completion rules, backend result/tiebreak authority, and
  final CSV contents were not changed. The load helper submits normal server-side player ballots
  for the open round and then edits them before reveal.
- Test harness: e2e no longer hard-codes port 3100, and Playwright no longer builds inside the
  server command. Single-worker execution is intentional because the memory backend is shared by
  the e2e server process.
- Mobile UI: mobile Chromium performs setup and verifies a real phone ballot; mobile WebKit covers
  public/player phone routes, view-only boundaries, no horizontal overflow, and the centered seventh
  card against the same open-voting state.
- Security: `/api/e2e/load-ballot` returns 404 unless the explicit memory test backend env is set.
  No production Supabase, service-role, admin hash, or session secret values are exposed to browser
  code or workflow config.

### Risks And Assumptions

- The WebKit project intentionally does not drive `/coolguy69` host controls. Admin/host operation
  remains covered by desktop Chromium and should be manually rehearsed in the real host browser
  during Phase 9.
- The 100-player load rehearsal is local memory-backend HTTP coverage, not hosted Supabase
  concurrency proof. Hosted row-scoped persistence, database-time timer mutation, and hosted
  rehearsal evidence remain Phase 9 work.

## Comprehensive Review Remediation Phase 9 - Hosted Rehearsal And Release Evidence

Status: complete.

### Checklist Items Triage

- CR-001: closed. Supabase-backed player ballot writes now use the service-role
  `normalized_submit_ballot` RPC for row-scoped ballot/choice/revision mutation. Admin state
  mutations run through queued hydrate/mutate/persist helpers, and host heartbeats persist only
  host-lock state so they cannot overwrite unrelated voting/result changes.
- CR-003: closed. Supabase backend operation reads authoritative time through
  `normalized_database_time`; hosted voting/admin mutations exercised this path during the Phase 9
  rehearsal and the Supabase load/e2e checks.
- CR-008: closed. A full hosted Supabase four-round rehearsal passed against production Supabase by
  approved exception using event id `phase9-fourround-2026-06-30-prod-05`.
- CR-035: closed. Final clean Phase 8 gate evidence is now recorded in this file and in
  `docs/comprehensive-review-checklist-2026-06-30.md`; the previous e2e port-conflict risk is
  addressed by the free-port Playwright wrapper.

### Evidence

- Production Supabase exception: approved by the user because no spare project remained. Do not
  reuse the rehearsal event id for the real tournament.
- Migrations applied to the linked hosted Supabase project through
  `20260630041000_normalized_submit_ballot_rpc.sql`.
- Supabase schema lint passed with `rtk npx supabase db lint --linked`.
- Supabase migration list confirmed remote migration `20260630041000`.
- Hosted route issue reported as Vercel digest `2042555441` was fixed by setting the production
  Vercel environment variables and redeploying; non-root route smoke checks passed afterward.
- Hosted e2e passed with `TOURNAMENT_STATE_BACKEND=supabase` and event id
  `phase9-e2e-2026-06-30-prod-23`.
- Hosted load passed with `TOURNAMENT_STATE_BACKEND=supabase` and event id
  `phase9-load-2026-06-30-prod-07`, covering 100 player submissions/edits and final private CSV.
- Hosted four-round rehearsal passed with `TOURNAMENT_STATE_BACKEND=supabase` and event id
  `phase9-fourround-2026-06-30-prod-05`, covering all four rounds, Round 1 seeded tiebreaks,
  API-backed ballot submit/edit for later rounds, manual no-ban admin ballots, `/stage`, `/charts`,
  `/results`, final reveal, and manual private CSV download.

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 37 files / 143 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 4 Playwright tests.
- `rtk npm run test:load` - passed, 1 Playwright load test with 100 player submissions/edits and
  final private CSV verification.
- Hosted `rtk npm run test:e2e` with `TOURNAMENT_STATE_BACKEND=supabase` - passed, 4 Playwright
  tests.
- Hosted `rtk npm run test:load` with `TOURNAMENT_STATE_BACKEND=supabase` - passed, 1 Playwright
  load test.
- Hosted `rtk npm run test:phase9` with `TOURNAMENT_STATE_BACKEND=supabase` - passed, 1 Playwright
  four-round rehearsal test in about 6.3 minutes.
- `rtk npx supabase db lint --linked` - passed, no schema errors found.
- `rtk npx supabase migration list --linked` - passed and showed remote migration
  `20260630041000`.
- `rtk git diff --check` - passed after the final documentation update.

### Remaining Release Notes

- Reset or replace the production `TOURNAMENT_EVENT_ID` before the real tournament so Phase 9
  rehearsal data cannot be confused with event data.
- Re-run final release gates after any additional code/configuration changes.

## Production Readiness Remediation Phase 1 - Fail-Closed Security Primitives

Status: complete.

### Scope

- PRC-006: closed for route handler behavior. Test-only e2e routes now use shared production
  deployment semantics and return 404 when either `NODE_ENV=production` or
  `VERCEL_ENV=production`.
- PRC-030: closed for `/api/e2e/private-csv` route-level security coverage.
- PRC-031: closed for direct authoritative-clock boundary coverage.
- PRC-032: closed. Admin and host cookies use `Secure` under production deployment semantics.
- PRC-034: guarded. The route handlers fail closed, but deployed route probes remain required in
  the later production-flow/deployed-evidence phase because the route files still ship in the app
  tree.

### Changed Files

- Added `docs/phase-1-fail-closed-security-primitives-plan-2026-07-03.md`.
- Updated `docs/deployment-readiness.md`.
- Added shared e2e route guard `src/lib/server/test-route-safety.ts`.
- Updated `/api/e2e/load-ballot` and `/api/e2e/private-csv` to use the shared guard.
- Updated admin cookie, deployment-safety, and backend-selection production checks to use
  centralized production deployment semantics.
- Added focused tests for e2e route denial, private CSV export gating, secure cookies,
  authoritative database time, Vercel production backend safety, and client secret/import
  boundaries.

### Checks Run

- `rtk npm run test -- src/app/api/e2e/load-ballot/route.test.ts src/app/api/e2e/private-csv/route.test.ts src/lib/server/authoritative-clock.test.ts src/lib/server/admin-auth.test.ts src/lib/server/deployment-safety.test.ts src/lib/server/persistence.test.ts src/lib/server/security-boundary.test.ts`
  - passed, 7 files / 38 tests.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 50 files / 263 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- `rtk rg -n 'SUPABASE_SERVICE_ROLE_KEY|SESSION_SECRET|ADMIN_PASSWORD_HASH|TOURNAMENT_TEST_ROUTE_TOKEN' .next/static`
  - no matches in generated browser chunks.

### Manual Review

- Product rules were unchanged. No draw, ballot, result, roster, admin dangerous-action, or stage
  reveal behavior was modified.
- Test-only route denial remains 404 for unavailable test surfaces.
- Non-production e2e and memory rehearsal helper behavior remains available only with the private
  test token plus explicit test/rehearsal flags.
- No `.github/workflows/*` files were added or changed in this phase.
- `docs/phase-1-fail-closed-security-primitives-plan-2026-07-03.md` was reviewed against the source
  remediation plan and corrected before implementation completed.

### Risks And Assumptions

- `/api/e2e/load-ballot` and `/api/e2e/private-csv` still appear in the Next app route tree, so the
  later deployed production route probe must still verify 404 responses with and without a token.
- Existing repository CI workflow files predate this phase and were not changed.
- The generated bundle scan was run after the local production build from this phase; rerun it after
  future build or bundling changes.

## Production Readiness Remediation Phase 2 - Future Draw Correctness - 2026-07-03

Status: complete for local memory, source, and browser-smoke validation. Hosted/disposable
Supabase behavior still needs a configured Supabase-dev rehearsal environment before production
release evidence can claim live database execution.

### Scope

- PRC-001: closed in code for memory/runtime paths and guarded in SQL source. Future rounds now
  reject active draws that contain a song selected in an earlier computed-or-later result.
- The selected-song block starts at result `computed` phase, not only at final stage reveal.
- Drawn-but-not-selected songs remain eligible for later rounds.
- Existing result-correction future-conflict protection remains in place.

### Changed Files

- Added `docs/phase-2-future-draw-correctness-plan-2026-07-03.md`.
- Added `supabase/migrations/20260703020000_future_draw_selected_song_guards.sql`.
- Updated selected-song block helpers in `src/lib/results/selected-song-blocks.ts`.
- Updated round readiness and voting snapshot guards in `src/lib/draw/round-readiness.ts` and
  `src/lib/server/voting-round.ts`.
- Updated memory admin draw/open/compute paths in `src/app/coolguy69/actions.ts`.
- Updated result computation contracts in `src/lib/results/result-engine.ts` and
  `src/lib/results/result-store.ts`.
- Added focused unit, integration, and SQL source assertions.

### Checks Run

- `rtk npm run test -- src/lib/draw/draw-state.test.ts src/lib/draw/round-readiness.test.ts src/lib/results/selected-song-blocks.test.ts src/lib/results/result-engine.test.ts src/lib/integration/tournament-flow.test.ts src/lib/server/transactions/normalized-runtime.test.ts src/lib/db/schema.test.ts`
  - passed, 7 files / 57 tests.
- `rtk npm run lint` - passed after removing an unused import.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 50 files / 270 tests.
- `rtk npm run build` - passed.
- `rtk git diff --check` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- `rtk npm run test:phase9` - passed, one-round memory smoke.
- `rtk npm run test:phase9:supabase-dev` - not run; environment validation failed before browser
  execution because `E2E_TOURNAMENT_EVENT_ID` was unset and
  `E2E_ALLOW_DESTRUCTIVE_RESET=true` was not configured. No Supabase data was touched.

### Manual Review

- Product rules were not changed: the app still has four rounds, two chart sets per round, seven
  charts per set, least-ban winners, backend tiebreak decisions, and final two-chart reveal.
- Future selected-song blocking now follows `docs/product-spec.md`: selected songs, not all drawn
  songs, are blocked from later rounds.
- Same-round duplicate-song blocking and exact chart duplicate prevention remain covered.
- Browser code still receives no service-role keys, admin hashes, session secrets, or tournament
  decision authority.
- No `.github/workflows/*` files were added or changed.

### Risks And Assumptions

- Existing live event namespaces with stale future draws will fail open/compute until the operator
  rerolls or resets the affected future draw. This is intentional fail-closed behavior.
- SQL coverage in this phase is source-level plus local build/test coverage. A disposable
  Supabase-dev run is still required once environment variables are available.
- The new SQL migration must be applied before relying on Supabase backend parity for PRC-001.

## Production Readiness Remediation Phase 7 - Low-Cost Public And UI State Fixes - 2026-07-03

Status: complete for local memory, load, browser-smoke, and Supabase production-flow validation.

### Scope

- PRC-019: closed by documenting the accepted all-at-once sorted count phase. Phase 0 did not choose
  timed row-by-row reveal, so count phases continue to show all seven least-to-most rows while
  selected labels remain hidden until the resolved phase.
- PRC-021: closed. `/coolguy69` no longer server-renders chart-by-chart live count names or values;
  the counts are fetched only after the admin clicks `Show live counts`.
- PRC-023: closed. `/vote` now has an explicit closed/revealed/round-complete holding branch when
  final result data is missing.
- PRC-024: closed. Mobile browser coverage now asserts that `/vote` exposes no vague `/skip/i`
  action while retaining the explicit `No bans for this set` path.

### Changed Files

- Added `docs/phase-7-low-cost-public-ui-state-fixes-plan-2026-07-03.md`.
- Updated `docs/decision-log.md` and
  `docs/production-readiness-review-checklist-2026-07-03.md`.
- Added server-only admin live-count row building in `src/lib/admin/live-counts.ts`.
- Added `AdminLiveCountsDisclosure` and `getAdminLiveCountsAction` for deliberate admin count
  disclosure.
- Updated `/vote` phone result-state branching and `src/lib/vote/phone-view.ts` tests.
- Added result-row test markers and browser assertions for count-phase ordering and behavior.
- Updated Phase 9 admin page helpers for the new live-count disclosure.

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 52 files / 305 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.
- `rtk npm run test:phase9` - passed, one-round memory smoke.
- `$env:E2E_TOURNAMENT_EVENT_ID='load-memory-dev-smoke'; rtk npm run test:load` - passed,
  100-player memory load smoke.
- `rtk npm run test:e2e:production-flow:validate` - passed.
- `rtk npm run test:e2e:production-flow` - passed, hosted Supabase host-lock evidence plus
  four-round production-flow rehearsal.

### Manual Review

- Product rules were unchanged: no draw, ballot, result computation, tiebreak selection, roster, or
  dangerous-action password behavior was changed.
- Admin live counts remain admin-session gated, deliberately disclosed, and passwordless as required
  for sensitive but non-destructive disclosure.
- Public/phone routes still withhold final selected charts and full counts until final stage reveal.
- The vague skip rule remains intact: zero bans require the explicit `No bans for this set` control.
- No `.github/workflows/*` files were added or changed.
- The production-flow run intentionally used the Supabase backend because it is the only check that
  exercises the hosted host-lock and four-round release path.

### Risks And Assumptions

- Timed row-by-row result reveal remains out of scope unless a future product decision explicitly
  chooses it. The accepted Phase 7 behavior is all seven sorted count rows at once during the
  host-advanced count phase.
- The Supabase egress root cause is still the broad route/state hydration and refresh model. Phase 7
  removes the live-count HTML leak, but it does not replace the public/admin read model.
- No Supabase migration is applicable for this phase; changes are UI, server action, docs, and test
  coverage only.

## UX/UI Tournament Readiness Remediation - Host Reset, Stage Reveal, Admin Flow - 2026-07-05

Status: complete for local memory-dev validation and Playwright evidence.

### Scope

- Added a production-use full website reset action on `/coolguy69` for a clean Round 1 event state
  without starting rehearsal mode. It is password re-entry, audit-reason, active-host, and dangerous
  action-policy gated, and it preserves the current admin session and host lock.
- Reworked the host console layout around the event-day workflow: host control, readiness, draw
  controls, stage reveal check, voting controls, roster, manual correction, results, then dangerous
  reset/repair controls. The admin shell now uses more width for 1080p operation.
- Enlarged the stage timer so the compact timer display better fills its panel beside the QR code.
- Fixed deployed chart-art fallback behavior by trusting generated public chart image paths instead
  of requiring serverless filesystem visibility before serializing them.
- Smoothed stage draw/result transitions: drawn chart rows now advance from a local monotonic visual
  clock seeded from server time, stage refresh defers only during short card entrance animations, and
  tiebreak refresh deferral still protects the five-second rune-wheel reveal.

### Changed Files

- Updated `/coolguy69` page ordering, width, and reset controls in `src/app/coolguy69/page.tsx`.
- Added reset action handling and action-policy/mutation-contract coverage in
  `src/app/coolguy69/actions.ts`, `src/lib/admin/action-policy.ts`, and
  `src/lib/server/mutation-contracts.ts`.
- Added full-state replacement persistence support in `src/lib/server/persistence.ts`.
- Updated admin/action/mutation tests in `src/lib/server/admin-actions.test.ts`,
  `src/lib/server/mutation-contracts.test.ts`, and `src/lib/admin/action-policy.test.ts`.
- Updated stage refresh, reveal, timer, and chart card rendering in `src/app/stage/page.tsx`,
  `src/app/stage/StageAutoRefresh.tsx`, `src/components/StageSetPanel.tsx`,
  `src/components/StageDrawCard.tsx`, `src/components/CountdownTimer.tsx`,
  `src/app/globals.css`, and `src/lib/vote/phone-view.ts`.
- Updated chart image resolution and coverage in `src/lib/charts/runtime-catalog.ts` and
  `src/lib/charts/runtime-catalog.test.ts`.

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 57 files / 333 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e -- tests/e2e/full-flow.spec.ts --grep "stage tiebreak"` - passed during
  targeted regression validation.
- `rtk npm run test:e2e` - passed, 6 Playwright tests.

### Manual Review

- Voting deadlines remain server/database-authoritative per `docs/product-spec.md`; local computer
  time is used only for visual reveal interpolation after a server timestamp seed.
- The full reset clears roster, draws, ballots, voting windows, result snapshots, chart exclusions,
  current round, and rehearsal mode while retaining the active host session so a host can recover a
  live test run without losing control.
- Dangerous action password re-entry, audit reason, active host lock, and mutation-contract policy
  coverage remain in place for the new reset action.
- Deployed chart art should no longer require browser cache clearing after redeploy: the server now
  serializes deterministic public cache paths that the static asset server can answer.

### Risks And Assumptions

- The new full website reset intentionally clears live tournament operation data. It must only be
  used by the active host after confirming the password and audit summary.
- Existing deployed state must receive this code in a new deployment before the cached chart paths and
  full reset action are available on the live site.
- No Supabase migration is applicable for this remediation; changes are application code, UI, docs,
  and tests.

## Focused Reveal, Device Identity, And Admin Roster Remediation - 2026-07-13

Status: complete for local memory validation, production build, and full Playwright evidence.

### Scope

- Closed voting is now a stage result-mode boundary. `/stage` renders the result holding screen from
  `voting_closed` onward and cannot flash the voting timer/drawn-card view while the first result
  snapshot is being committed or hydrated.
- A successful player ballot now binds the app-issued device id to one player for the event. Memory
  state persists the binding, and the Supabase migration checks the binding during presence claims
  and commits it atomically with normalized ballot submission.
- The browser remembers when its identity is locked, disables the username selector after refresh,
  and blocks an ineligible remembered player from switching to another username.
- The player roster moved out of `Setup & Recovery` into the first right-sidebar panel. Usernames use
  a 15-character-wide desktop column, active names are green, inactive names are red, and the middle
  column now contains `Mark Inactive` / `Reactivate` instead of redundant status text.

### Changed Files

- Added `docs/focused-reveal-device-roster-remediation-plan-2026-07-13.md` and this completion entry.
- Updated stage result-mode selection and regression coverage in `src/lib/stage/stage-view.ts` and
  `src/lib/stage/stage-view.test.ts`.
- Updated player identity UX and ballot submission in `src/app/vote/BallotFlow.tsx`,
  `src/app/vote/actions.ts`, `src/lib/vote/ballot.ts`, and `src/lib/vote/ballot-store.ts`.
- Added device-binding contracts, normalized persistence, database types, repository ownership, and
  tests under `src/lib/server`, `src/lib/db`, and `src/lib/persistence`.
- Added `supabase/migrations/20260713010000_event_scoped_voter_device_binding.sql`.
- Added `src/app/coolguy69/_components/AdminRosterPanel.tsx` and updated
  `src/app/coolguy69/page.tsx`.
- Updated `tests/e2e/full-flow.spec.ts` with closed-stage, refreshed-device, server-bypass, roster
  position/color, and settled result-row geometry evidence.
- Updated the synthetic Supabase ballot helper in `src/app/api/e2e/load-ballot/route.ts`.

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- Focused stage, ballot, mutation, normalized RPC, schema, persistence, and merge tests - passed,
  85 tests across 8 files.
- `rtk npm run test` - passed, 60 files / 372 tests.
- `rtk npm run build` - passed.
- `rtk git diff --check` - passed before the final documentation entry and rerun in final review.
- `rtk npm run test:e2e:no-build -- tests/e2e/full-flow.spec.ts --grep "full round smoke"` -
  passed, including the exact reveal and same-device regression path.
- `rtk npm run test:e2e` - passed, all 6 Playwright tests in desktop Chromium, mobile Chromium,
  mobile WebKit, and visual-evidence Chromium.

### Manual Review

- The review compared the implementation against `docs/product-spec.md` player identity, voting
  window, final reveal, admin, and roster requirements.
- Voting duration, turnout extension, result selection, reveal cadence, tiebreak authority, active
  roster snapshots, and same-player second-device behavior were not changed.
- The stage change only removes the invalid closed-to-draw fallback; explicit newer reopen, reset,
  and round-advance transitions remain accepted by the existing freshness guard.
- Device bindings contain only an opaque app-issued device id, event id, player id, and timestamps.
  They stay in server/database state and expose no service keys, edit-token hashes, or browser
  secrets.
- The Supabase wrapper inserts/checks the binding and invokes the existing normalized ballot function
  in one database transaction, so failed ballots roll back new bindings and concurrent conflicting
  identities cannot both commit.
- Roster mutations still use the existing server actions and active-host gating; current-round
  emergency eligibility remains separately password/reason gated.

### Risks And Assumptions

- A web app cannot prove physical hardware identity. Enforcement applies to the stable app-issued
  device id in browser storage; clearing or forging that id creates a logically new device. The
  server remains authoritative for every stable device id it has seen.
- Existing ballots submitted before this migration cannot be retroactively associated with a device
  id. Event-day enforcement is complete for ballots submitted after deployment.
- The new Supabase migration must be applied before relying on device binding in a hosted Supabase
  event namespace. Local automated coverage validates the SQL contract and memory behavior; no
  destructive Supabase-dev run was authorized or required for this focused remediation.
