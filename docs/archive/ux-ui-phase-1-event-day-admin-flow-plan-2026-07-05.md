# UX/UI Phase 1 Event-Day Admin Flow Plan - 2026-07-05

Parent plan: `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`

## Goal

Make `/coolguy69` match the host's event-day order of operations while keeping tournament rules,
server-side authority, dangerous-action password checks, and public information boundaries unchanged.

## Source Documents

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`
- `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`
- `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`

## Issues In Scope

- `UXR-005`: center the stage QR square inside `QRPanel`.
- `UXR-024`: make the admin panel order event-day focused.
- `UXR-025`: make draw, reveal, and voting controls the primary admin focus.
- `UXR-026`: move or collapse chart eligibility so it does not push day-of controls down.
- `UXR-027`: hide long reroll warning copy until the explicit dangerous-action confirmation.
- `UXR-028`: place manual ballot correction before result computation/reveal.
- `UXR-031`: surface roster, chart image/cache, required pool, and current-round readiness near the top.

## Non-Goals

- Do not change draw, reroll, ballot, timer, result, tiebreak, roster, or host-lock rules.
- Do not add or remove Supabase tables, RPCs, migrations, or environment variables unless a code
  inspection finds an unavoidable schema dependency.
- Do not implement Phase 2 reveal synchronization, Phase 3 chart-card readability, or Phase 5 host
  lock/live-count hardening.
- Do not close `UXR-001`; production image deployment triage remains separate.

## Current-State Findings

- `/coolguy69` is implemented primarily in `src/app/coolguy69/page.tsx`.
- The page currently renders event mode, tournament config, chart eligibility, live counts, voting,
  result reveal, manual ballot, emergency actions, draw controls, roster, then sidebar session/host
  lock/audit controls.
- Draw controls are below result controls and roster/config blocks, so the first-screen flow does
  not match the event-day runbook.
- Chart eligibility renders near the top and its detailed chart list is open by default.
- Reroll warnings are inline in the full-round, per-set, and per-chart reroll forms.
- `ManualBallotForm` already enforces password re-entry, reason, complete choices, existing-ballot
  warnings, and pre-reveal timing, but it appears after result computation controls.
- `QRPanel` uses flex centering inside the QR square, but the QR square itself is not centered in
  the panel because it lacks horizontal auto margins.

## Implementation Steps

1. Add top readiness data in `src/app/coolguy69/page.tsx`.
   - Compute current-round draw readiness from the two current round sets.
   - Compute required-pool readiness from existing `chartPoolRows`.
   - Compute local chart image/cache metadata readiness from tournament-scope charts with
     non-fallback cached image paths. This is an admin setup signal only; Phase 0 production
     deployment image evidence remains authoritative for live cache-asset closure.
   - Reuse existing `activeCount`, `votingSnapshot`, `result`, and host-lock snapshot values.

2. Reorder the admin layout around the day-of flow.
   - Put host control and current round/readiness first.
   - Put current-round draw controls immediately after readiness.
   - Put a drawn-chart stage reveal check between draw controls and opening voting so the host
     verifies the projector has shown both drawn rows before starting the voting window.
   - Put voting controls and deliberate live-count disclosure after draw controls.
   - Put manual ballot correction before compute/reveal controls.
   - Put result computation, reveal advancement, and CSV export after manual correction.
   - Move reset, reopen, override, chart eligibility, all-round draw/reroll, roster, tournament
     config, rehearsal controls, audit, and debug/session details into secondary areas below or in
     the sidebar.

3. Keep draw controls focused on the current round.
   - Render the two current-round set controls as the primary draw panel.
   - Keep non-current round draw/reroll access available in a secondary details section for setup or
     emergency use.

4. Move reroll warnings into explicit confirmation UI.
   - Wrap full-round, set, and one-chart rerolls in closed `details` blocks.
   - Use the existing `DangerousActionDialog` action summary for password confirmation and
     consequence copy.
   - Keep the same server actions and form field names so dangerous-action protections stay intact.

5. Collapse chart eligibility by default.
   - Keep pool summary counts visible for readiness.
   - Move the editable chart list below day-of controls.
   - Remove the default `open` state from the detailed chart list.

6. Center the QR square.
   - Add horizontal centering to the QR square container in `src/components/QRPanel.tsx`.
   - Preserve the existing QR target, size, generated SVG, short URL, and test ids.

7. Update targeted tests/evidence.
   - Update e2e helpers where they interact with the reroll confirmation details.
   - Add or adjust assertions that the admin first screen contains the day-of order and that chart
     eligibility details are collapsed by default.
   - Use existing projector evidence to verify `room-qr-link` geometry at desktop and 720p.

8. Update documentation.
   - Record Phase 1 scope, changed files, checks, evidence, risks, and assumptions in
     `docs/phase-status.md`.
   - Check off only the Phase 1 `UXR-*` items with evidence in
     `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`.

## Acceptance Evidence

- Admin route evidence shows the runbook order near the top:
  host control, current round/readiness, draw current round, reveal drawn charts on stage, voting
  monitor/controls, manual correction, compute/reveal, export.
- Admin route evidence shows manual ballot correction before result computation/reveal controls.
- Reroll warning copy is absent from the page until a reroll confirmation details section is opened.
- Reroll confirmation evidence shows the action summary and consequence before the password field.
- Admin live counts remain warning-gated and hidden by default after the panel is moved.
- Chart eligibility/configuration details are below day-of controls and collapsed by default.
- QR geometry evidence verifies the QR square is centered at desktop and 1280x720 stage sizes.
- `lint`, `typecheck`, unit tests, build, and available e2e gates pass.

## Plan Review

- Product-rule review: the plan only changes presentation order, confirmation placement, and
  readiness summaries. It does not alter four-round structure, two sets per round, draw counts,
  ballot completion, timer rules, result selection, or tiebreak authority.
- Security review: dangerous reroll actions remain server actions with password and reason fields.
  The plan does not expose secrets or move tournament-changing behavior to browser randomness.
- UI review: the plan improves operator scan order and reduces repeated warning text while keeping
  existing controls reachable.
- Data review: no schema or migration work is expected. Image readiness is display-only and derived
  from already loaded chart metadata.
- Test review: existing e2e coverage already exercises draw, reroll, voting, result reveal, CSV, and
  stage QR geometry; targeted assertions will be updated for the new confirmation layout.
