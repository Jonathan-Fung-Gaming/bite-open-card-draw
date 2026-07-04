# UX/UI Phase 4 Room, View-Only, And Results Clarity Plan - 2026-07-05

Parent plan: `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`.

## Goal

Close Phase 4 without changing tournament rules: make `/room`, `/charts`, `/vote`, `/results`, and
stage recovery copy unambiguous for event spectators, players, and the projector operator.

## Source Documents Reviewed

- `docs/codex-current-brief.md`
- `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`
- `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`
- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Scope

### UXR-011 Stage error recovery

- Update `src/app/stage/error.tsx` so the stage error boundary automatically retries after a short
  delay.
- Keep a manual retry button visible.
- Add operator-facing copy that says tournament state is still authoritative and gives a clear
  projector recovery path if retries do not recover.
- Add event-day runbook coverage for the same projector recovery path.
- Verify with a focused component/render test or equivalent route evidence.

### UXR-012 Room current tournament state

- Make `/room` dynamic and server-hydrated so it can show current round/status context.
- Add light auto-refresh so players and spectators who keep `/room` open see state changes.
- Preserve the exact required room choices:
  - `I am a player voting`
  - `View charts only`
- Keep the page lightweight and public-safe. Do not add identity selection, voting controls, or
  turnout-affecting behavior to `/room`.
- Add mobile screenshot/e2e evidence that status context and both choices fit without overflow.

### UXR-017 Charts spectator-safe copy

- Rewrite `/charts` waiting/ready copy to use event language.
- Remove spectator-facing reroll, ballot invalidation, result snapshot, and computation language.
- Preserve the public data boundary: no chart-by-chart live counts while voting is open.

### UXR-018 One-set-drawn charts state

- Change `/charts` status copy to distinguish:
  - no sets drawn,
  - one set drawn,
  - both sets drawn and waiting to open voting.
- Allow one drawn set to render without contradicting the page copy.
- Add evidence for a one-set-drawn route state.

### UXR-019 Results previous-round clarity

- When `/results` is showing a previous round because the current round is not final yet, add a
  prominent notice that names both the displayed round and the current pending round.
- Make current-round pending states equally explicit.
- Preserve the existing anti-spoiler boundary: phones/results show final charts only after stage
  completion is released.

### UXR-020 Event-language copy

- Replace public `/vote`, `/charts`, and `/results` copy that exposes internal terms such as result
  computation, stored result snapshots, or committed snapshots.
- Keep admin-only implementation language out of public phone/result routes.

### UXR-021 Mobile view-only navigation

- Make mobile `/charts` read as a view-only chart browser, not a voting flow.
- Ensure the route remains useful while hydration is delayed by showing the chart sets server-side
  before client tab behavior takes over.
- Avoid restoring a stale mobile tab that would hide the only drawn set during partial-draw states.
- Keep no ballot buttons, username selector, or submission controls on `/charts`.

### UXR-023 Route-specific browser titles

- Add route-specific metadata titles for at least `/stage`, `/vote`, `/charts`, `/results`, and
  `/coolguy69`; include `/room` as the QR landing route.
- Verify titles through browser tests for the public/mobile routes and admin/stage routes.

## Implementation Steps

1. Add route metadata exports to the Phase 4 routes.
2. Update `/room` to hydrate current state and render concise status context above the two required
   options.
3. Update `/charts` status derivation and `ChartsSetNavigator` so copy is spectator-safe, one-set
   states are consistent, and pre-hydration mobile content is usable.
4. Update `/results` pending/fallback copy and add a previous-round notice.
5. Update `/vote` result-holding fallback copy to remove implementation language.
6. Update the stage error boundary with automatic retry and clearer operator instruction.
7. Extend focused unit/browser tests for status copy, one-set `/charts`, previous-round `/results`,
   route titles, and stage error recovery copy.
8. Update the Phase 4 checklist and `docs/phase-status.md` only after evidence passes.

## Verification Plan

- `rtk npm run lint`
- `rtk npm run typecheck`
- Focused tests for changed helpers/components when practical.
- `rtk npm run test`
- `rtk npm run build`
- `rtk git diff --check`
- `rtk npm run test:e2e`

If available e2e covers the Phase 4 routes, use it for route screenshots/evidence. If a full e2e
run fails for an unrelated environmental issue, record the failure, stop, and do not close Phase 4.

## Non-Goals

- No tournament rule changes.
- No database schema or Supabase RPC changes unless implementation proves they are required.
- No public live chart-by-chart counts.
- No reduced-motion toggle.
- No new admin permissions or route changes.

## Plan Review

- The plan follows the Phase 4 scope and does not pull in Phase 5 admin data-payload work.
- The required `/room` option labels remain exact.
- The anti-spoiler rule remains intact: phones and results do not reveal final charts before stage
  completion is released.
- The changes are UI/copy/test/docs scoped, so Supabase migrations are expected to be not
  applicable unless later code review finds a schema or RPC dependency.
- Evidence requirements are explicit for every checklist item targeted by this phase.
