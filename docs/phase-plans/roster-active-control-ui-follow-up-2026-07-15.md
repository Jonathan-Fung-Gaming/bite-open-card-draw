# Roster Active Control UI Follow-Up - 2026-07-15

Parent checklist: `docs/roster-active-control-ui-follow-up-checklist-2026-07-15.md`

## Goal

Align the admin roster panel with the requested event-day presentation:

- active usernames render green;
- deactivated usernames render red;
- the active-state text is not shown in the control column;
- the second roster column header is `Active Control`.

This is a presentation follow-up only. It does not change roster mutation contracts, active-host
authorization, current-round eligibility snapshots, duplicate username rules, voting behavior,
draws, tiebreaks, routes, or Supabase schema.

During validation, the default e2e suite also exposed an existing mobile `/charts` readability
blocker: the view-only chart artist metadata rendered at 10px while the committed browser contract
requires at least 12px. This follow-up includes the minimal view-only metadata font-size correction
needed to return the required suite to green. It does not change voting-card metadata or route logic.
A later full-smoke rerun exposed a second latent visual blocker: the synthetic long final-chart
title could measure as three lines at the 1080p projector breakpoint. This follow-up includes the
minimal featured-title adjustment that still satisfies the existing 44px projector minimum.

## Sources Read

- `docs/codex-current-brief.md`
- `docs/production-readiness-remediation-plan-2026-07-13.md`
- `docs/production-readiness-remediation-checklist-2026-07-13.md`
- `docs/phase-plans/production-readiness-phase-4-fast-two-column-roster-administration-2026-07-14.md`
- `docs/product-spec.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`
- `src/app/coolguy69/_components/AdminRosterPanel.tsx`
- `tests/e2e/full-flow.spec.ts`
- `tests/phase4/roster-ui-memory.spec.ts`
- `tests/phase4/roster-ui-hosted.spec.ts`

No archived document is used as current authority.

## Baseline

- The roster table already has exactly two visible columns.
- The second header still says `Active/inactive control`.
- Each control cell still renders a visible `Active` or `Inactive` paragraph before the action
  button.
- Username text currently renders white for both active and inactive rows.
- Existing browser assertions still expect the white username treatment and the visible status text.
- The existing default e2e mobile-route contract requires chart title and artist metadata to render
  at 12px or larger, while the view-only chart artist line is still 10px on mobile.
- The existing full-flow projector contract requires featured final-chart titles to remain at least
  44px and avoid unnecessary third-line wrapping for the synthetic long title.

## Acceptance Criteria

- The roster has exactly two visible headers: `Username` and `Active Control`.
- The control column contains the action button and any row-scoped error only; it does not render a
  separate visible `Active` or `Inactive` status label.
- Active username display text uses the existing green utility color.
- Inactive/deactivated username display text uses the existing red utility color.
- State is not color-only: the action button remains `Mark Inactive` for active rows and
  `Reactivate` for inactive rows, with the existing row `data-active` attribute preserved for tests.
- Inline edit, history-locked rows, touch/keyboard edit entry, long-name containment, and active-count
  behavior remain unchanged.
- No browser code receives secrets, password hashes, service-role keys, or additional roster payload.
- View-only `/charts` artist metadata satisfies the existing 12px minimum browser contract.
- Featured final-chart titles satisfy the existing 44px projector minimum and long-title wrapping
  contract.

## Implementation Plan

1. Add a small username color helper in `AdminRosterPanel` and apply it to every at-rest username
   rendering path: unlocked button, read-only text, and history-locked text.
2. Keep the edit input styling unchanged so editing remains legible and avoids implying canonical
   state while the value is dirty.
3. Rename the second column header from `Active/inactive control` to `Active Control`.
4. Remove the visible `Active`/`Inactive` paragraph from the control cell.
5. Update focused Playwright assertions to expect the new header, green/red username classes, and no
   visible status label in the control cell.
6. Promote only the view-only chart artist metadata base font size from 10px to 12px to clear the
   default e2e readability blocker.
7. Adjust the featured stage title size to the existing 44px projector minimum so long final-chart
   titles do not measure as three lines.
8. Run formatting, lint, typecheck, unit tests, build, and focused roster/browser coverage. If a
   hosted Supabase credential or destructive hosted profile is unavailable, record the blocker and
   rely on local presentation coverage because this change has no persistence or migration surface.
9. Review the final diff against `docs/product-spec.md` and `docs/security-notes.md`.
10. Update the follow-up checklist and `docs/phase-status.md`, then commit, push, open/update a PR,
    wait for checks, merge, and synchronize the local default branch.

## Migration, Rollout, And Rollback

- No Supabase migration is required.
- Rollout is a normal application deployment.
- Rollback is a normal application revert. No data transformation or cleanup is needed.

## Self-Review Findings

The initial plan was reviewed for missing requirements, unsafe assumptions, tournament-rule
conflicts, security gaps, UX/accessibility regressions, migration ordering, rollback, and test
coverage. The plan was amended before implementation with these constraints:

1. Do not remove all non-color state communication. The action button text remains visible and
   state-specific.
2. Do not move status text into another visible column or tooltip-only affordance. The request is to
   avoid active status in the control column while keeping username color state.
3. Do not change mutation behavior, batching, row attributes, or active-count logic.
4. Keep history-locked usernames color-coded too, because they are still roster state displays.
5. Limit browser test updates to the roster presentation contract affected by this request.
6. Treat the mobile `/charts` font-size failure as a validation-blocker repair only; do not adjust
   voting-card metadata, route state, draw state, or result presentation.
7. Treat the featured final-title adjustment as a projector-readability repair only; do not change
   final-chart selection, result ordering, or phone/public reveal timing.
