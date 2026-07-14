# Production Readiness Phase 6 - Mobile Results Viewport - 2026-07-14

Parent plan: `docs/production-readiness-remediation-plan-2026-07-13.md`

Checklist: `docs/production-readiness-remediation-checklist-2026-07-13.md`

Issue: PRR-013.

## Goal

Make the current-round final `/results` view show both complete selected-chart cards followed by a
fully visible `Show Ban Counts` control at `scrollY = 0` on the contracted phone viewports, without
changing desktop results, `/vote`, `/charts`, tournament result authority, reveal privacy, or result
ordering.

This phase is UI and test only. It adds no database migration, server mutation, tournament decision,
browser randomness, new secret, or external dependency.

## Sources Of Truth Read

- `AGENTS.md` and `docs/codex-current-brief.md`
- Phase 6 of `docs/production-readiness-remediation-plan-2026-07-13.md`
- Phase 6 rows in `docs/production-readiness-remediation-checklist-2026-07-13.md`
- `docs/product-spec.md`, especially Routes, Results behavior, Final reveal, and Technical
  architecture
- `docs/pump_open_stage_repo_validation_checklist.md`, especially phone layout, result-computation,
  route separation, and browser-support decisions
- `docs/production-readiness-phase-0-prr-contract-report-2026-07-13.md`, especially the PRR-013
  baseline and later-test contract
- `docs/phase-gates.md`
- `docs/security-notes.md`, especially public count privacy, server-only mutation boundaries,
  production-test isolation, and secret handling
- Current `/results`, shared result-summary/header, auto-refresh, result model, Playwright profiles,
  full-flow compatibility tests, and Phase 9 results page object
- Three independent read-only Phase 6 audits covering requirements, implementation surfaces, and
  targeted browser evidence

No document under `docs/archive/` is used as current authority. RTK is not used.

## Baseline Findings

1. `/results` uses the standard mobile header and `px-5 py-5` route container.
2. `PublicResultSummary` is shared by `/results`, `/charts`, and `/vote`; it has no route-only
   variant. Any default behavior change would regress routes outside Phase 6.
3. Winner cards stack until the `md` breakpoint. Each card combines 16:9 artwork with `min-h-48`,
   `p-5`, and large type. Phase 0 measured the first or second complete card below the fold at every
   contracted width.
4. Phase 0 measured 0px horizontal overflow. This passing behavior must remain.
5. The result model already supplies two selected charts and two complete seven-row lists ordered
   least banned to most banned. No client sort, winner selection, data fetch, or persistence change
   is needed.
6. The shared count presentation has a visible `Ban counts` panel and two per-set native details.
   Phase 6 requires one mobile native details labelled `Show Ban Counts` immediately after the
   winner grid, containing both lists. Desktop keeps the existing panel and two disclosures.
7. `ResultsAutoRefresh` performs a router refresh every 1,000ms with no jitter. The disclosure is
   uncontrolled today and has no Phase 6 state contract.
8. `RoundHeader` already has an opt-in `mobileCompact` mode that restores the existing sizes and
   layout at `sm` and above. It is suitable for a `/results`-only mobile header without desktop
   drift.
9. `tests/e2e/full-flow.spec.ts` assumes every final-results consumer has exactly two details. That
   becomes stale for `/results` and must be adjusted even though the comprehensive suite is deferred
   to Phase 7.
10. `tests/phase9/pages/results.page.ts` assumes the `Ban counts` heading is visible. It must accept
    the route's visible mobile `Show Ban Counts` control while preserving the two-card/final-heading
    checks.

Phase 0 evidence records mobile winner-card document heights of 1,405-1,445px, a second winner below
the 844px fold, and no horizontal overflow. The exact Phase 6 viewport matrix is 320x568, 360x640,
and 390x844 in Chromium and WebKit.

## Locked Invariants

- The tournament remains four rounds with two seven-chart sets per round and the existing set map.
- Results continue to use ban counts only. Zero-ban rows remain present and detail rows remain in the
  server-provided least-to-most order.
- The server remains authoritative for selected charts and tiebreak winners. Browser code cannot
  sort, choose, replace, or mutate results.
- Phones and `/results` reveal no selected chart or chart-by-chart count before the final stage
  release. The existing pending/holding branch and `shouldShowFinalPhoneResults` boundary remain.
- `/results` shows exactly two selected charts first, then expandable full counts.
- `/charts`, `/vote`, and the default `PublicResultSummary` presentation remain unchanged.
- Desktop `/results` at 1280 and 1440 retains the current two-column winner layout, typography,
  spacing, visible `Ban counts` panel, and two per-set details.
- Full chart titles and artists wrap. No ellipsis, line clamp, truncation, or clipping is introduced.
  Mobile title, artist, and difficulty text stays at or above the accepted 12px minimum.
- Artwork remains visible and keeps the existing fallback behavior.
- The previous-round notice and replacement explanation remain exact. The parent plan explicitly
  permits that safety notice to add height, so the initial-fold fit applies to a normal current-round
  final result.
- Scrolling remains available when counts are expanded. No page clipping, fixed-height trap, or
  zoom requirement is introduced.
- No service key, password hash, session secret, host credential, or new mutation capability enters
  browser code.

## Detailed Implementation Plan

### 1. Route-only compact result variant

1. Add an opt-in `compactMobileResults` contract to `PublicResultSummary`; keep its default false so
   `/vote` and `/charts` render unchanged.
2. Pass the option only from the final-result branch of `/results`.
3. Pass `mobileCompact` to the final `/results` `RoundHeader`. Its `sm`-and-up classes must remain
   identical to the current standard desktop header.
4. Reduce only base/mobile `/results` section padding and gaps, restoring the current values at
   `md`.
5. Preserve the pending `/results` branch, previous-round route selection, notice copy/test id,
   public freshness guard, and auto-refresh behavior.

### 2. Two-column mobile winner cards

1. For the opt-in variant below `md`, use two equal columns with a compact gap. Restore the existing
   two-column grid and gap at `md`.
2. Keep both 16:9 artwork regions and `ChartArtImage` fallback behavior.
3. Remove the large mobile minimum metadata height and reduce mobile padding/gaps/type. Restore the
   exact existing `min-h-48`, `p-5`, and desktop text sizes at `md`.
4. Keep the difficulty, full title, artist, and card index in each card. Use `break-words`, at least
   12px text, and no clamp/ellipsis/truncate utilities.
5. Add stable route-specific test hooks for the winner grid, cards, and immediate disclosure without
   changing existing selected-card test ids.

### 3. One persistent native mobile disclosure

1. Factor shared seven-row result-list markup so the desktop and mobile disclosures cannot drift in
   ordering, count labels, selected markers, least-ban markers, or row semantics.
2. Add a small client component for the `/results` mobile disclosure. It renders one native
   `<details>` with a direct `<summary>` labelled exactly `Show Ban Counts` and a minimum 44px target.
3. Expanded content renders two labelled ordered lists, one per result set, with exactly seven rows
   each. Keep a `Ban counts` heading in the expanded content for semantic continuity.
4. Leave the native `open` property uncontrolled, persist it in same-tab storage using a key scoped
   to `result.id`, restore it imperatively after client mount, and update storage from the native
   toggle event. This preserves native summary activation while keeping a display preference that
   contains no result authority or sensitive data.
5. Keep the current desktop `Ban counts` panel and two per-set details unchanged and visible from
   `md` upward. Hide the compact disclosure at `md` and hide the desktop count panel below `md`.
6. Do not lock body height or overflow. Expanded rows remain reachable by normal page scrolling.

### 4. Compatibility contracts

1. Update the full-flow ban-count helper to count visible disclosures and support the single
   `/results` disclosure containing 14 rows/two selected markers while retaining two seven-row
   disclosures for `/charts` and `/vote`.
2. Update the Phase 9 results page object to recognize either the visible desktop `Ban counts`
   heading or visible mobile `Show Ban Counts` summary, while still requiring the final heading and
   exactly two selected cards.
3. Add focused Vitest/static render coverage for the opt-in route variant, native summary label,
   two complete lists, no-clamp classes, 44px target, scoped storage key, unchanged default
   presentation, and protected previous-round/pending copy.

### 5. Targeted Chromium/WebKit, visual, and accessibility evidence

1. Add a guarded `phase6-memory` Playwright profile, config, scripts, and independently seeded
   desktop Chromium, mobile Chromium, and mobile WebKit projects. Public auto-refresh must remain
   enabled for this profile.
2. Seed and release one normal Round 1 final state through existing authenticated admin/rehearsal
   controls; do not use browser result authority or change tournament rules.
3. Before responsive source changes, capture the current final `/results` desktop geometry and
   typography at 1280 and 1440 for explicit comparison. After changes, assert the same structural
   values and save screenshots/geometry evidence.
4. In Chromium and WebKit, exercise 320x568, 360x640, and 390x844 at `scrollY = 0`. Wait for fonts,
   art, and two animation frames before measurements.
5. At each viewport assert exactly two visible complete winner cards in separate columns; both card
   bottoms and the entire visible summary bottom are within `visualViewport.height`; art has positive
   visible geometry and loaded/fallback content; title, artist, and difficulty are at least 12px;
   text wraps without clamp, ellipsis, or clipping; horizontal overflow is <=1px; and viewport scale
   remains 1.
6. Stress the mobile card CSS with the longest eligible chart-name/artist shapes, including an
   unbroken long title and CJK/long artist text, and rerun the fold/text assertions.
7. Assert the visible disclosure is a native details/summary pair, has accessible name
   `Show Ban Counts`, is at least 44px high, receives keyboard focus, toggles with Enter/Space and
   touch/click, and exposes two labelled seven-row ordered lists when open.
8. Open the disclosure, observe the next completed results-router refresh with the 1,000ms refresh
   enabled, and assert it remains open. Also confirm the persisted state is scoped to the current
   result id and restores after a hard reload.
9. Expanded, assert no percentages, 14 total rows, both selected markers, nondecreasing ban counts
   within each list, no horizontal overflow/zoom, normal vertical scrolling, and reachability of the
   final row.
10. Verify the previous-round safety notice remains exact and contained. Its added height is allowed
    and is not included in the normal-current-round fold-fit criterion.
11. Verify the pending `/results` branch still contains no selected cards, ban-count disclosure, or
    chart-by-chart counts before release.
12. Capture screenshots and JSON geometry for mobile Chromium/WebKit and desktop Chromium. Use
    semantic/keyboard/touch evidence; do not add an axe dependency solely for this phase.

## Required Checks Before Feature PR Merge

1. Prettier on every changed supported file and `git diff --check`.
2. Focused Phase 6 component/render tests.
3. `npm run lint`.
4. `npm run typecheck`.
5. `npm run test`.
6. `npm run build`.
7. Phase 6 profile/test listing and environment-guard validation.
8. Targeted Phase 6 desktop Chromium evidence.
9. Targeted Phase 6 mobile Chromium evidence.
10. Targeted Phase 6 mobile WebKit evidence.
11. Combined targeted Phase 6 suite when it adds evidence beyond the engine-specific runs.
12. Tracked environment/secret scan and confirmation that no migration, server mutation, or
    tournament-rule file entered the diff.
13. Do not run the comprehensive default/full-tournament Playwright suite; the parent plan defers it
    to the Phase 7 operator smoke. Keep its touched compatibility contracts current and type-safe.

## Complete Diff Review Checklist

- Compare the full diff against `docs/product-spec.md`, not memory.
- Confirm no draw, ballot, result selection, tiebreak authority, reveal privacy, voting deadline,
  round transition, or persistence behavior changed.
- Confirm the compact prop is opt-in from `/results` only and default consumers are unchanged.
- Confirm all base responsive changes restore current desktop classes by `md`, and 1280/1440
  evidence matches the captured baseline.
- Confirm both mobile cards keep all text and art, fit the contracted viewports, and have no
  horizontal overflow.
- Confirm the one visible mobile details immediately follows the winner grid, is native,
  keyboard/touch/AT operable, at least 44px high, and stays open across automatic refresh.
- Confirm each expanded set has seven rows in server order with ban counts only, zero-ban rows,
  selected markers, and least-ban markers intact.
- Confirm duplicate responsive markup is hidden from the opposite breakpoint and does not create
  duplicate accessible controls/headings or id collisions.
- Confirm the previous-round notice remains truthful and the pending branch still prevents spoilers.
- Confirm scrolling is not disabled and expanded content is reachable.
- Confirm test helpers and page objects reflect the route-specific disclosure without weakening
  `/charts`, `/vote`, or final-state assertions.
- Confirm no secret, server-only key, browser mutation, data loss, migration, or external asset was
  introduced.
- Fix every actionable finding and rerun every affected check before recording closure evidence.

## Migration, Rollout, And Rollback

- Migration order: not applicable. This phase must not add or modify `supabase/migrations`.
- Pre-merge compatibility: the opt-in presentation is compatible with the current database and
  server state and defaults to the existing shared presentation.
- Rollout: deploy the merged application normally after required GitHub checks pass.
- Rollback: revert the application commit with a forward PR if a responsive regression is found.
  No data or schema rollback is needed or permitted.
- Post-merge migration proof: inspect the merged feature diff and local/remote commit range for
  `supabase/migrations`; record the migration gate not applicable only when the range is empty.

## Phase Gate And Delivery Workflow

1. Complete the plan self-review and amendments before implementation.
2. Implement only this Phase 6 plan.
3. Run the full pre-merge gate, review the complete diff, fix findings, rerun affected checks, and
   record evidence in the active checklist and `docs/phase-status.md`.
4. Commit intentional Phase 6 files, push the focused branch, open a draft PR, and wait for required
   checks. Address actionable failures and unresolved blocking review feedback.
5. Mark the feature PR ready and merge only after every acceptance criterion and pre-merge gate
   passes.
6. Synchronize local `main`, rerun the complete Phase 6 gate on the merged tree, and verify no
   migration entered the merged range.
7. Use a focused closeout documentation PR to mark the `Phase PR merged` and post-merge migration
   rows `[X]`, record merged-commit/post-merge evidence, pass its checks, merge it, and synchronize
   local `main` again.

## Pre-Implementation Self-Review Findings And Amendments

The initial plan was reviewed against the active parent plan, Phase 0 contract, product spec,
validation checklist, security notes, current source/tests, and the three delegated audits. The
following gaps were found and resolved in this plan before implementation:

1. The parent checklist lists only widths. The stricter Phase 0 viewport heights are now locked to
   320x568, 360x640, and 390x844 for both engines.
2. The parent plan says "accepted minimum" without a number. The Phase 0/existing readability
   contract is now locked at 12px for title, artist, and difficulty evidence.
3. A Phase 5 profile would disable public refresh and create false disclosure-persistence evidence.
   The Phase 6 profile must explicitly keep automatic refresh enabled, observe a completed refresh
   before interaction, and observe the next completed refresh after opening the disclosure.
4. The previous-round notice is allowed to add height. The plan now separates its safety/containment
   test from normal current-round final fold-fit evidence.
5. Shared-component edits could regress `/vote`, `/charts`, or desktop results. The variant is now
   opt-in from `/results`, desktop values are restored at `md`, and default render/browser contracts
   are required.
6. Responsive duplicate markup could expose three disclosures to assistive technology. The plan now
   requires exactly one _visible/accessibility-relevant_ mobile control, hidden opposite-breakpoint
   markup, no duplicate ids, and visible-locator compatibility tests.
7. Automatic refresh can preserve a mounted client island but lose its native DOM open property.
   The plan now requires restoration from same-tab storage scoped to `result.id`, while leaving the
   disclosure native and uncontrolled; this preference carries no authoritative result data.
8. Existing full-flow and Phase 9 helpers encode the old two-disclosure assumption. They are now
   explicit compatibility work so Phase 7 is not left with knowingly stale tests.
9. Normal seeded winners may not exercise the eligible corpus's longest string shapes. The plan now
   requires a DOM-only typography stress sample on the authoritative rendered cards; it changes test
   presentation only and cannot choose or persist a result.
10. A UI-only phase still crosses public-result privacy and browser-code boundaries. The plan now
    explicitly protects the pre-release holding branch, forbids client sorting/selection/mutation,
    scans for secrets, and uses only disposable memory rehearsal state.
11. The feature merge cannot itself record that it has merged. The delivery workflow now uses the
    established feature-PR then closeout-docs-PR sequence, with a complete post-merge gate on synced
    `main` before the final two checklist rows are marked `[X]`.

No tournament-rule conflict, migration dependency, data-loss path, or justified reason to expand
Phase 6 beyond PRR-013 was found. Rollback remains a forward application revert with no database
action.

## Plan Self-Review Questions

- Are the exact 320x568, 360x640, and 390x844 contracts tested in both engines?
- Is the 12px accepted minimum explicit and compatible with worst-case wrapped names?
- Is automatic refresh enabled and observed for longer than its 1,000ms interval?
- Are current-round fold fit and previous-round safety-notice height treated distinctly?
- Are desktop geometry and default shared consumers protected by before/after evidence?
- Are all result rows, labels, ordering, and privacy boundaries preserved?
- Are native accessibility, focus, keyboard, touch, scrolling, overflow, and zoom covered?
- Are stale full-flow/page-object assumptions updated without broadening the phase?
- Is migration ordering correctly marked not applicable and proven after merge?
- Does the workflow include both pre-merge and post-merge phase gates plus closeout evidence?
