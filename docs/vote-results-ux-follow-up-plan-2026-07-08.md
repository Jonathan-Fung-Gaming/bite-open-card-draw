# Vote, Results, And Chart Filtering Follow-Up Plan - 2026-07-08

This plan captures the requested follow-up work for the player voting flow, result reveal
presentation, rune-wheel orientation, public route transition stability, and chart eligibility
filtering.

Source-of-truth order remains:

1. `docs/product-spec.md`
2. `docs/pump_open_stage_repo_validation_checklist.md`
3. `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`
4. `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`

Do not change tournament rules while implementing this plan. The ban-count concern was clarified as
expected behavior: each ballot can cast up to 4 bans total, because a player may ban up to 2 charts
in each of the 2 sets.

## Scope

Requested changes:

- Require an explicit identity checkbox after username selection:
  `I confirm that I am <username>`.
- Show a non-skippable 2-second pop-in after identity confirmation:
  `Please ban up to two charts`.
- Make selected ban cards read visually as a negative action by turning selected outlines red.
- Reduce stale-state flicker between stage/result/public route transitions.
- Rotate rune-wheel chart images so the bottom of each image faces the wheel center.
- Filter Short Cuts and Full Songs out of the eligible chart catalog while keeping Remixes.
- Show chart art in unique least-ban and fallback reveal states.
- Highlight every least-ban chart in full ban-count result lists.
- Keep least-banned winning chart rows at the top while preserving the reveal drama.

## Findings

- The committed chart CSV has no category column. The available columns are
  `name,name_kr,artist,label,type,level,bg_img`.
- Short Cut and Full Song filtering must therefore be regex/name based unless a richer source file
  is provided.
- A current generated-catalog spot check showed that excluding Short Cuts and Full Songs still
  leaves all required pools safely above the 7-chart minimum.
- Remixes should remain eligible unless a later explicit rule says otherwise.
- Current result data already marks every least-ban row with `tiedForFewest`; UI highlight work
  should use that field.
- Current stage count rows are intentionally sorted most-banned to least-banned in
  `ResultSetPanel`; this plan changes the final visual ordering so least-banned rows remain at the
  top.

## Phase 1 - Player Identity And Ban Instruction UX

Goal: make the voting identity confirmation and ban action clearer before chart selection starts.

Implementation targets:

- `src/app/vote/BallotFlow.tsx`
- existing mobile vote e2e coverage in `tests/e2e/full-flow.spec.ts` and
  `tests/e2e/mobile-routes.spec.ts`

Tasks:

1. Add a required checkbox under the username confirmation copy:
   `I confirm that I am <username>`.
2. Disable the `Confirm` button until the checkbox is checked.
3. Reset the checkbox whenever the selected username changes.
4. Do not let remembered identity bypass this explicit checkbox. Remembered identity may preselect
   a username, but the player must still confirm it for the current voting flow.
5. After successful confirmation and presence checks, show a centered pop-in that says
   `Please ban up to two charts`.
6. Pause ballot controls for 2 seconds while the pop-in is shown.
7. Fade the pop-in out automatically. Do not add a skip button.
8. Key the completed intro state by round, player, and active draw ids so route refreshes do not
   replay it unnecessarily, while changed draws do replay it.
9. Change selected ban-card styling from ember/orange to red border, red outline, and red selected
   badge treatment.

Acceptance criteria:

- A player cannot proceed from username selection without checking the identity checkbox.
- Chart controls are disabled during the 2-second ban-instruction pop-in.
- The instruction disappears on its own.
- Selected ban cards are visibly red and still accessible through `aria-pressed`.
- Existing duplicate-device and saved-ballot warnings still appear before chart selection.

## Phase 2 - Ban Count Clarification And Invariants

Goal: preserve correct counting while avoiding operator confusion.

Implementation targets:

- `src/lib/vote/ballot.ts`
- `src/lib/results/result-engine.ts`
- `src/lib/admin/live-counts.ts`
- Supabase normalized transaction tests, if the implementation touches normalized persistence
- public/admin copy where `Ban selections cast` appears

Tasks:

1. Treat the reported `4 ballots / 11 bans` and `4 ballots / 15 bans` cases as valid, because the
   public total is across both sets.
2. Add or strengthen tests that prove:
   - total ban selections per round are at most `ballotCount * 4`;
   - per-set ban selections are at most `ballotCount * 2`;
   - an individual chart ban count cannot exceed the counted ballot count for that set;
   - duplicate chart ids in one ballot choice remain rejected.
3. Consider changing display copy from `Ban selections cast` to
   `Ban selections cast across both sets` where layout allows.
4. Do not change result computation unless an invariant test exposes an actual defect.

Acceptance criteria:

- Existing valid totals such as 15 bans from 4 ballots are not treated as errors.
- Tests document the expected 4-bans-per-ballot maximum.
- Public copy is less likely to be read as a per-set ban total.

## Phase 3 - Result Reveal And Least-Ban Presentation

Goal: keep winning charts visually first while preserving the current reveal tension.

Implementation targets:

- `src/components/ResultSetPanel.tsx`
- `src/components/PublicResultSummary.tsx`
- `src/app/stage/page.tsx`

Tasks:

1. Keep result rows physically ordered least-banned to most-banned so winner candidates sit at the
   top.
2. Preserve the reveal drama by revealing rows in most-banned-to-least-banned order while rows stay
   in their final least-first positions.
3. Highlight every row where `row.tiedForFewest` is true.
4. Keep the actual selected winner visually strongest once the selected chart is revealed.
5. Show selected chart artwork in the unique least-ban reveal panel.
6. Show selected chart artwork in the 5-or-more fallback tiebreak reveal once the sealed winner is
   revealed.
7. Keep phone and public final results ordered as selected charts first, then expandable full ban
   counts.

Acceptance criteria:

- Least-ban rows appear at the top of count lists.
- All least-ban ties are highlighted before and after final selected state is known.
- Unique least-ban and fallback reveal states include chart art.
- Stage screenshots show the winning chart candidates at the top.

## Phase 4 - Rune Wheel Radial Image Orientation

Goal: make each wheel image face the wheel center.

Implementation targets:

- `src/components/RuneWheel.tsx`
- `src/app/globals.css`
- `src/components/rune-wheel-rotation.test.ts`
- stage tiebreak e2e coverage

Tasks:

1. Keep the existing backend-decided winner and final wheel landing math.
2. Replace the current viewport-upright slot counter-rotation with radial image orientation.
3. Ensure each image bottom edge points toward the center of the wheel.
4. Add DOM or visual assertions for slot transform orientation.
5. Capture a stage tiebreak screenshot after the wheel renders.

Acceptance criteria:

- The wheel still lands on the committed winner.
- All slot images are radially oriented toward the center.
- The tiebreak animation remains non-skippable and does not expose the winner early.

## Phase 5 - Route Transition Flicker Guard

Goal: stop stale route refreshes from briefly rendering older stage/result states.

Implementation targets:

- `src/app/stage/StageResultPhaseGuard.tsx`
- `src/app/stage/StageAutoRefresh.tsx`
- `src/app/results/ResultsAutoRefresh.tsx`
- `src/app/vote/VoteAutoRefresh.tsx`
- public route state helpers if a shared guard is extracted

Tasks:

1. Extend the current stage result phase guard into a broader stale-payload guard.
2. Use state freshness, not only reveal phase rank. A good guard key should include round number,
   voting status, result snapshot id, result reveal phase, result phase timestamp, active draw
   versions, and a voting-window transition timestamp or equivalent epoch.
3. Reject older refresh payloads that arrive after a newer state is already accepted.
4. Still accept legitimate newer backward transitions, such as admin reset, emergency reopen, or
   round advance.
5. Keep refresh deferral during rune wheel and stage draw reveal animations.
6. Add Playwright coverage that rapidly advances stage/result state while pages are already open.

Acceptance criteria:

- `/stage` does not flash an older reveal state after a phase advance.
- `/vote`, `/charts`, and `/results` do not briefly show stale previous screens during result
  release, correction, reset, or round advance.
- Legitimate admin reset and reopen states still update public routes.

## Phase 6 - Short Cut And Full Song Filtering

Goal: remove Short Cuts and Full Songs from chart eligibility while preserving Remixes.

Implementation targets:

- `src/lib/charts/normalize.ts`
- `src/lib/charts/importer.ts`
- `src/lib/charts/importer.test.ts`
- `data/generated/*`

Tasks:

1. Add a helper such as `isDisallowedSpecialChartName`.
2. Filter by normalized `name` and `nameKr`.
3. Exclude names matching:
   - `short cut`
   - `shortcut`
   - `full song`
4. Keep names matching `remix`.
5. Report filtered rows in the chart import report with clear reasons.
6. Regenerate chart data with `rtk npm run import:charts`.
7. Verify required pool counts after filtering.

Acceptance criteria:

- Short Cuts and Full Songs are not eligible for tournament draws.
- Remixes remain eligible.
- Import report documents filtered rows.
- Every required pool still has at least 7 eligible charts.

## Validation

For implementation work, run the available checks after each phase:

```bash
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run build
rtk npm run test:e2e
```

If a check is intentionally skipped for a docs-only change or by explicit user direction, record that
in the final summary and PR notes.

Final route evidence should include:

- mobile `/vote` identity checkbox and ban-instruction pop-in;
- mobile `/vote` red selected-ban cards;
- projector `/stage` least-ban-at-top result counts;
- projector `/stage` unique least-ban chart-art reveal;
- projector `/stage` fallback tiebreak chart-art reveal;
- projector `/stage` rune wheel with radial image orientation;
- mobile `/results` highlighted least-ban rows in full ban counts;
- stale-transition regression evidence for already-open `/stage`, `/vote`, `/charts`, and
  `/results`.
