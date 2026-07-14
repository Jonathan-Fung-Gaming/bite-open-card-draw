# Mobile Charts And Results Follow-Up Checklist - 2026-07-15

Do not check items by intent alone. Closure requires code, dedicated test evidence, screenshot or
geometry evidence, or an explicit user decision.

## Planning

- [x] Current brief read.
- [x] Product spec public-route and result behavior reviewed.
- [x] Active Phase 5/6 remediation context reviewed.
- [x] Current `/charts` and `/results` implementation inspected.
- [x] Follow-up plan created under `docs/phase-plans/`.

## `/charts`

- [x] Mobile informational `view-only-status` box removed above set controls.
- [x] Final `/charts` redundant view-only status box removed.
- [x] Mobile set controls are one-line tab buttons: `VIEW SET 1 (S16)` / `VIEW SET 2 (S17)`.
- [x] Mobile set controls do not navigate to hash anchors or change scroll position.
- [x] Active mobile set grid fits within 320x568, 360x640, and 390x844 without page scrolling.
- [x] Two-column grid and centered seventh card preserved.
- [x] `/charts` reveal timing follows stage reveal timing before voting opens.
- [x] Voting-era `/charts` still shows all drawn cards immediately.
- [x] Unrevealed chart names/artists do not leak during canonical reveal.

## `/results`

- [x] `/results` mobile metadata overlaps selected chart images.
- [x] Selected chart images are clickable and keyboard-operable.
- [x] Clicking a selected image expands that set's ban counts.
- [x] Clicking the same selected image collapses the panel.
- [x] Opening one set collapses the other set on mobile.
- [x] Shared bottom mobile `Show Ban Counts` disclosure/buttons removed.
- [x] Collapsed mobile state shows a one-line `CLICK A CHART TO VIEW BAN COUNTS` prompt.
- [x] Mobile prompt disappears while a chart's ban counts are expanded.
- [x] Expanded mobile panel has visible `Song` and `Bans` headers.
- [x] Expanded mobile rows show song title, artist subtitle, and numeric ban count only.
- [x] Expanded mobile rows do not repeat chart difficulty.
- [x] Mobile winner cards do not show right-side chart number labels such as `01` or `02`.
- [x] Expanded mobile rows do not show selected/least-ban badges, bars, or percentages.
- [x] Clicked image plus all seven rows fit in the tested phone viewports.
- [x] Desktop `/results` presentation remains unchanged.
- [x] `/stage` result presentation remains unchanged.

## Dedicated Verification Only

- [x] New special unit test file added for this follow-up.
- [x] New special Playwright config added for this follow-up.
- [x] New special Playwright spec added for this follow-up.
- [x] Dedicated unit command run and passed.
- [x] Dedicated Playwright command run and passed.
- [x] `npm run lint` run and passed.
- [x] `npm run typecheck` run and passed.
- [x] `npm run build` run and passed.
- [x] Existing/default unit suites not run for this book of work.
- [x] Existing/default e2e suites not run for this book of work.

## Review And Closeout

- [x] Diff reviewed for tournament-rule regressions.
- [x] Diff reviewed for `/stage` result regressions.
- [x] Diff reviewed for mobile overflow, text clipping, and accessibility regressions.
- [x] `docs/phase-status.md` updated with changed files, commands, evidence, risks, and assumptions.
- [ ] Intentional changes committed.
- [ ] PR opened or updated.
- [ ] PR merged after required checks/review.
- [ ] Local default branch synchronized after merge.
- [x] Supabase migration step marked not applicable or completed if the implementation unexpectedly
      adds migrations.
