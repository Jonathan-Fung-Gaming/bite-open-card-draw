# Mobile Charts And Results Follow-Up Plan - 2026-07-15

## Scope

Address the requested mobile UI issues on `/charts` and `/results` without changing `/stage`
results presentation or tournament rules.

This is a focused follow-up to completed production-readiness Phase 5 and Phase 6 work. It does not
reopen the full remediation phase gates and must not run existing unit, e2e, full-tournament, Phase
5, Phase 6, or default Playwright suites for this book of work.

## Source Documents Reviewed

- `docs/codex-current-brief.md`
- `docs/product-spec.md`
- `docs/production-readiness-remediation-plan-2026-07-13.md`
- `docs/production-readiness-remediation-checklist-2026-07-13.md`
- Current `/charts`, `/results`, public chart, public result, stage reveal, and compact result
  components.

## Current Implementation Notes

- `/charts` renders a `view-only-status` panel in both the drawn-chart and final-chart branches.
- `/charts` mobile set tabs are anchors targeting `#view-only-set-*`; clicking a tab can change the
  page position.
- `/charts` uses `buildStageRoundView`, but `toPublicChartsSetViews` drops `revealStartsAt`, and
  `PublicDrawSetPanel` renders all charts in a drawn set immediately.
- `/results` opts into `PublicResultSummary compactMobileResults`, which currently renders two
  compact winner cards and one shared mobile `Show Ban Counts` disclosure below both cards.
- Stage results are rendered by `/stage` with `StageDrawCard` and `ResultSetPanel`, not the mobile
  `/results` disclosure path.

## Assumptions

- For `/charts`, use the stage-like slow reveal option rather than waiting until the full reveal is
  complete, because it matches the existing stage timing helpers and avoids premature visibility.
- For `/results`, only one mobile winner card should be expanded at a time. Opening another winner
  card collapses the previous one so the clicked image plus that set's seven ban rows can fit within
  a phone viewport.
- Desktop `/results`, `/vote` final charts, `/charts` final charts, and `/stage` remain on the
  existing default result presentation unless explicitly opted into the new mobile result variant.

## Implementation Plan

### 1. `/charts` Mobile Cleanup

- Remove the top informational `view-only-status` panel from `ChartsSetNavigator`.
- Remove the same `View charts only - no votes recorded` informational panel from the `/charts`
  final-results branch.
- Keep useful pending copy only inside empty/queued set panels where it explains missing draw state.
- Change the mobile set controls from anchors to non-navigating tab buttons:
  - `VIEW SET 1 (S16)`
  - `VIEW SET 2 (S17)`
- Keep `role="tablist"`, `role="tab"`, `aria-selected`, and disabled semantics for unavailable
  partially drawn sets.
- Preserve server-rendered/pre-hydration panels so the page does not depend on client JavaScript to
  show drawn charts.

### 2. `/charts` Fit And Reveal Behavior

- Extend the public chart view model to keep `revealStartsAt` or an equivalent reveal clock derived
  from `buildStageRoundView`.
- Reuse `getStageVisibleCardCount` and the stage reveal interval so `/charts` does not show charts
  before the stage reveal has reached them.
- Preserve the existing "show all cards immediately after voting opens" behavior by using
  `stageShouldShowAllDrawCards(snapshot.status)` for voting-era states.
- Update `PublicDrawSetPanel` to render only the currently visible charts during canonical reveal
  and placeholders/empty slots for unrevealed cards without leaking song names or artists.
- Add a compact mobile chart-card sizing mode:
  - reduce mobile panel padding/gaps;
  - make the set heading mobile-small or visually redundant text minimal because the tabs already
    carry set/difficulty;
  - set chart card/image heights with stable responsive constraints so seven cards in the active set
    fit at 320x568, 360x640, and 390x844 without page scrolling;
  - keep the two-column grid and centered seventh card.
- Keep desktop `/charts` presentation stable except for removal of redundant informational copy.

### 3. `/results` Mobile Result Interaction

- Replace the shared mobile `Show Ban Counts` disclosure with a route-only compact mobile result
  component used by `/results`.
- Render the two selected winner images as clickable, keyboard-operable controls.
- On mobile, overlay metadata on the image like `/charts` and `/vote`:
  - visible difficulty badge on the winner image;
  - song title and artist over the image;
  - no separate metadata block below the image.
- On click/tap/keyboard activation:
  - expand that set's ban-count panel;
  - click the same image again to collapse;
  - opening one set collapses the other set.
- Expanded mobile ban-count panel:
  - visible header columns: `Song` and `Bans`;
  - each row shows song title, artist subtitle, and a numeric ban count aligned on the right;
  - do not repeat chart difficulty inside the expanded rows;
  - do not show `Selected`, `Least bans`, percentages, bars, or difficulty labels in this compact
    mobile dropdown;
  - use substantially smaller phone font sizes and tighter row spacing while keeping text readable
    and untruncated.
- Size the selected images and expanded panel so at scrollY 0 the clicked image and all seven rows
  for that set fit within the tested phone viewport.
- Keep the existing desktop result count details for `md` and above.
- Keep `/stage` result code and presentation untouched.

### 4. Dedicated Tests Only

Add new special tests for this work and run only these tests:

- Unit tests:
  - add a focused Vitest file such as
    `src/components/mobile-charts-results-follow-up.test.tsx`;
  - cover removal of `/charts` view-only status copy from the new component contracts;
  - cover one-line tab labels and absence of hash-anchor tab navigation;
  - cover public chart reveal filtering so unrevealed charts do not leak title/artist text;
  - cover compact `/results` mobile markup: clickable image controls, no `Show Ban Counts`, `Song`
    / `Bans` headers, numeric ban counts, no repeated difficulty rows, and default result summary
    unchanged for non-compact consumers.
- Playwright tests:
  - add `playwright.mobile-charts-results-follow-up.config.ts`;
  - add `tests/mobile-charts-results-follow-up/mobile-charts-results-ui.spec.ts`;
  - use a memory backend profile and new test directory only;
  - verify `/charts` at 320x568, 360x640, and 390x844:
    - no top informational status box;
    - tab labels are exactly one line;
    - tapping a tab preserves `scrollY`;
    - the active set's seven-card grid fits in the viewport without horizontal or vertical page
      overflow;
    - canonical reveal does not show unrevealed chart names before stage timing reaches them.
  - verify `/results` at 320x568, 360x640, and 390x844:
    - no shared `Show Ban Counts` control;
    - selected chart metadata overlaps the images;
    - tapping a winner image expands exactly that set's seven rows;
    - the clicked image plus all rows fit in the viewport;
    - tapping the same image collapses;
    - ban rows show only song title, artist subtitle, and numeric bans, with no difficulty repeats.
  - include a narrow assertion that `/stage` final results do not receive the mobile `/results`
    disclosure markup.

Commands planned for this book of work:

```bash
npx vitest run src/components/mobile-charts-results-follow-up.test.tsx
node scripts/run-playwright.mjs --profile=phase6-memory test --config=playwright.mobile-charts-results-follow-up.config.ts
npm run lint
npm run typecheck
npm run build
```

Do not run:

```bash
npm run test
npm run test:e2e
npm run test:phase5:memory
npm run test:phase6:memory
npm run test:e2e:production-flow
```

## Acceptance Criteria

- `/charts` mobile has no informational box above the set controls.
- `/charts` final-chart branch has no redundant `View charts only - no votes recorded` panel.
- `/charts` mobile set controls read `VIEW SET 1 (S16)` and `VIEW SET 2 (S17)` on one line.
- `/charts` mobile set controls do not change page scroll position.
- `/charts` active set fits in a phone viewport without scrolling at the tested widths/heights.
- `/charts` does not show chart title/artist before the stage reveal timing has reached that chart,
  except in voting-era states where the stage also shows all cards immediately.
- `/results` mobile winner metadata overlaps images.
- `/results` mobile images toggle their respective set's ban counts.
- `/results` mobile expanded rows contain only song title, artist subtitle, and numeric ban counts.
- `/results` mobile shared bottom ban-count disclosure/buttons are removed.
- `/results` mobile clicked image plus all seven count rows fit in the phone viewport.
- `/results` desktop and `/stage` result presentation are unchanged.
- No tournament rules, mutation paths, backend result decisions, or security boundaries change.

## Self-Review Notes

- Tournament rules are not changing: selected chart, ban counts, tiebreak authority, and phone result
  release gates remain server/database-authoritative.
- The `/charts` reveal change must not reintroduce slow reveal replay after voting opens; use the
  existing `stageShouldShowAllDrawCards` status boundary.
- The mobile `/results` panel must not use `PublicResultRows` unchanged because that component
  repeats difficulty and selected/least-ban labels.
- Accessibility must be preserved with real buttons or native disclosure semantics and
  `aria-expanded` / `aria-controls`.
- The no-existing-tests constraint conflicts with the broader repository phase-gate habit, so this
  follow-up deliberately records a scoped verification exception: only the new dedicated unit and
  Playwright tests are test gates for this book of work.
