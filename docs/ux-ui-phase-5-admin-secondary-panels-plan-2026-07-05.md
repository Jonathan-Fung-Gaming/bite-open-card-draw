# UX/UI Phase 5 Admin Secondary Panels, Host Lock, Counts, And Data Exposure Plan - 2026-07-05

Parent plan: `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`.

## Goal

Close Phase 5 without changing tournament rules: make secondary admin/operator panels safer under
event pressure, contain long operator data, keep live chart counts deliberately hidden and
re-hideable, and reduce public `/charts` client data to display-safe fields.

## Source Documents Reviewed

- `docs/codex-current-brief.md`
- `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`
- `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`
- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Scope

### UXR-029 Host lock clarity

- Expand the `/coolguy69` Host Lock panel so it names the current browser state in event terms:
  active host, read-only admin, or no active host.
- Show owner context with only a short session prefix, matching the existing audit/session display
  pattern and avoiding full session/token exposure.
- Show takeover/expiry guidance:
  - active host: heartbeat keeps this browser in control; release before handing off,
  - read-only admin: forced takeover requires password and audit reason while the lock is live,
  - inactive lock: normal `Take Host Control` is available.
- Add visible heartbeat confidence for the active browser using the existing host-heartbeat server
  action. This must not add new mutation paths or client-side authority.
- Preserve host-lock enforcement: non-host controls remain disabled and force takeover remains
  password/audit gated.

### UXR-030 Live counts collapse and overflow

- Keep admin live chart counts hidden by default behind the existing warning button.
- After counts are shown, provide both `Refresh live counts` and `Hide live counts`.
- When hidden again, remove chart-by-chart rows from the rendered DOM.
- Contain long chart names in live count rows with wrapping/truncation-safe layout and fixed count
  alignment.
- Keep live counts passwordless because they are sensitive but non-destructive, per the product
  spec.

### UXR-032 Admin long-name containment

- Contain long usernames and chart names in:
  - roster rows,
  - draw controls and reroll summaries,
  - manual ballot correction choices,
  - chart eligibility rows,
  - live count rows,
  - audit/reason snippets where long user-entered values may appear.
- Prefer responsive grid/list layouts, `min-w-0`, and `break-words` over horizontal scroll or
  clipping.
- Preserve operator-readable labels and existing forms/actions.
- Add deterministic browser evidence at desktop and narrow admin widths using seeded or fixture
  long player/chart names before closing the checklist row.

### UXR-033 Public `/charts` data exposure

- Introduce a display-safe public chart/draw view shape for `/charts`.
- Pass only fields needed by the visible UI into `ChartsSetNavigator` and `PublicDrawSetPanel`:
  set metadata, draw presence/display label, chart id/name/artist/difficulty/local image path, and
  display order.
- Do not pass draw metadata such as version, eligible pool count, eligible chart ids, exclusion
  snapshots, selected-song snapshots, same-round blocked-song snapshots, created timestamps,
  superseded timestamps, or draw reasons into the public `/charts` client component.
- Leave `/stage` and `/vote` behavior alone unless the reduced type can be shared safely without
  broadening scope.
- Add a focused test that fails if public `/charts` props regain non-display draw metadata.

## Implementation Steps

1. Add a Phase 5 public view-model helper for `/charts` that maps stage draw records to display-safe
   draw data.
2. Update `ChartsSetNavigator` and `PublicDrawSetPanel` to consume the display-safe shape instead of
   full `DrawRecord` objects.
3. Add or update a focused unit/source test proving the public `/charts` client data excludes
   non-display draw metadata.
4. Enhance the Host Lock panel and heartbeat UI with owner prefix, status, expiry/takeover copy,
   and active heartbeat confidence while preserving the existing server action.
5. Add a hide path to `AdminLiveCountsDisclosure`, update live-count row layout, and ensure hidden
   rows are removed from the DOM.
6. Tighten admin long-name containment in roster, draw controls, manual ballot correction, chart
   eligibility, live counts, and nearby audit/readiness text.
7. Extend Playwright evidence with deterministic long-name setup for:
   - host-lock active/read-only context,
   - live counts show/refresh/hide,
   - no long-name horizontal overflow at desktop and narrow admin widths,
   - public `/charts` still renders both sets and remains view-only.
8. Update the Phase 5 checklist rows and `docs/phase-status.md` only after the relevant evidence and
   quality gates pass. The status entry must list changed files, checks run, evidence, risks and
   assumptions, and the manual review against `docs/product-spec.md`.

## Verification Plan

- `rtk npm run lint`
- `rtk npm run typecheck`
- Focused unit/source tests for public chart view models or client data contracts.
- Focused Playwright tests for changed admin and `/charts` evidence.
- `rtk npm run test`
- `rtk npm run build`
- `rtk git diff --check`
- `rtk npm run test:e2e`

If any required command is unavailable, record why. If a required gate fails, stop before closing
Phase 5 or merging.

## Non-Goals

- No tournament rule changes.
- No public chart-by-chart live counts.
- No extra password for live counts.
- No new admin roles or route changes.
- No database schema, Supabase RPC, or migration changes unless implementation proves the public
  data boundary requires persistence changes.
- No changes to draw randomness, tiebreak selection, voting eligibility, timer rules, or final
  reveal sequencing.

## Plan Review

- The plan targets only Phase 5 checklist rows: `UXR-029`, `UXR-030`, `UXR-032`, and `UXR-033`.
- Plan review tightened the evidence requirement so `UXR-032` depends on deterministic long-name
  fixture data, not on whatever rehearsal data happens to exist.
- Host-lock changes are presentation and confidence only; enforcement remains in existing server
  actions and store logic.
- Live counts remain admin-session gated, warning-gated, hidden by default, and passwordless.
- Reducing `/charts` props is scoped to public view-only display data and does not alter server
  draw records or tournament decisions.
- Long-name containment is layout-only and should not truncate identity-critical public result
  content.
- Supabase migrations are expected to be not applicable because the planned changes are UI, client
  data-shaping, docs, and tests.
