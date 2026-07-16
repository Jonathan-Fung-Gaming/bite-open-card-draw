# Mobile Results Readability And Charts Parity Plan - 2026-07-16

## Scope

Increase the readable type size in the compact phone result presentation and reuse that same
presentation when `/charts` shows final results. This is a focused presentation follow-up to the
completed mobile charts/results work; it does not change tournament state, result selection,
release timing, or the stage presentation.

## Sources Reviewed

- `docs/codex-current-brief.md`
- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- Production-readiness Phase 5 and Phase 6 plan/checklist sections
- `docs/phase-plans/mobile-charts-results-follow-up-2026-07-15.md`
- Current `/results`, `/charts`, and shared result components/tests

## Implementation Plan

1. Increase compact-phone result typography for winner metadata, the ban-table heading, song
   titles, artist names, and the collapsed instruction while preserving the two-column winner
   layout and numeric count alignment.
2. Let long winner and ban-row song names wrap naturally. Do not add ellipsis or a line clamp to
   the count rows; preserve page scrolling for unusually tall content.
3. Opt the final-results branch of `/charts` into the same compact result component and matching
   phone page spacing used by `/results`. Keep the pending/drawn-chart branch unchanged.
4. Add focused component and browser assertions for route parity, readable font sizes, wrapping,
   phone overflow, toggling, and desktop stability.
5. Run formatting, lint, typecheck, focused unit/browser tests, and build. Review the final diff and
   record evidence in `docs/phase-status.md`.
6. Send `/results` and `/charts` phone screenshots to the user for visual approval. Do not commit,
   push, or merge until that review is received.

## Checklist / Acceptance Criteria

- [x] Compact mobile winner title/artist and expanded ban-row title/artist text are visibly larger.
- [x] Full song names wrap without ellipsis or line clamping in the expanded ban-count list.
- [x] `/charts` final results use the same compact phone UI and interaction as `/results`.
- [x] `/charts` and `/results` retain the final-results release gate and selected-chart-first order.
- [x] Expanded rows retain only song, artist, and numeric ban count; no percentages are introduced.
- [x] The common phone widths have no horizontal overflow; normal content remains usable and rare
      long titles may increase vertical height through normal page scrolling.
- [x] Desktop result presentation remains stable.
- [x] `/stage`, voting, result authority, tiebreaks, backend state, and security boundaries are
      unchanged.
- [x] Focused tests, lint, typecheck, and build pass.
- [x] Complete diff review finds no unresolved logic, accessibility, or UX regression.
- [x] User receives screenshots of both routes before any commit/push/merge action.

## Self-Review And Risk Controls

- Reusing `compactMobileResults` on `/charts` is safer than duplicating markup and guarantees route
  parity. Its desktop branch already supplies the established public desktop presentation.
- Larger type can make seven-row panels taller on 320x568. The requirement prioritizes readability;
  normal document scrolling must remain enabled, and tests should guard horizontal rather than
  artificial vertical clipping.
- Long names must use `break-words` and natural wrapping. Removing winner-card clamps may enlarge a
  card for exceptional data, which is preferable to hiding the title.
- Buttons retain `aria-expanded`, `aria-controls`, and keyboard behavior. Both routes remain
  view-only and cannot mutate a ballot.
- No migration is needed. Rollback is limited to reverting the compact-result class changes and the
  `/charts` opt-in.
