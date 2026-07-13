# Remediation Plan

Date: 2026-06-28

This plan addresses the validation issues found during the five-agent repository review against:

- `docs/product-spec.md`
- `docs/security-notes.md`
- `docs/phase-gates.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/remediation-issue-checklist.md`

The product spec and validation checklist are authoritative. Do not change tournament rules unless explicitly asked.

## Completion Rule

This remediation plan is complete only when every item in `docs/remediation-issue-checklist.md` is closed with evidence and the final closure gate in that file passes.

## Phase 0 - Align Instructions And Docs

Goal: remove conflicting guidance before implementation resumes.

Tasks:

- Add `docs/pump_open_stage_repo_validation_checklist.md` to the required-read list for future Codex work.
- State clearly that `docs/product-spec.md` plus `docs/pump_open_stage_repo_validation_checklist.md` override stale execution-plan text when they conflict.
- Remove or update stale 4+3 stage-layout instructions in `docs/codex-execution-plan.md`.
- Remove or update stale 4+3 stage-layout checks in `docs/testing-checklist.md`.
- Update `docs/phase-status.md` so it does not describe known-failing areas as event-ready.
- Track or explicitly document the status of `docs/pump_open_stage_repo_validation_checklist.md`.
- Link this plan and `docs/remediation-issue-checklist.md` from the relevant runbook/release docs.

Acceptance checks:

- No repo doc instructs the stage projector preview to use 4+3 card panels.
- Future agents can determine the correct source-of-truth order from project docs.
- `docs/phase-status.md` states that the app is not event-ready until remediation is complete.

## Phase 1 - Visible Stage And Image Fixes

Goal: fix the two user-visible blockers first.

Tasks:

- Add automatic `/stage` refresh through lightweight polling, SSE, Supabase Realtime, or an equivalent client refresh mechanism.
- Ensure admin draw, reroll, reset, voting, and reveal actions revalidate all affected public tournament views.
- Replace render-only card animation with a slow automatic stage reveal sequence driven by committed server/admin state.
- Replace the stage 4+3 layout with two horizontal rows of 7 charts.
- Keep the phone two-column layout separate from the projector layout.
- Wire runtime draw data to cached image metadata.
- Generate or fetch real cached chart images into a deployable controlled location.
- Use fallback artwork only when cached artwork is missing or failed.

Acceptance checks:

- An already-open `/stage` tab updates after admin draw/reroll without manual refresh.
- Stage reveals all 7 Set 1 charts, then all 7 Set 2 charts.
- Stage preview is exactly two labeled 7-card rows.
- Drawn chart cards show non-fallback artwork when cache data exists.
- Lint, typecheck, unit tests, build, and e2e pass.

## Phase 2 - Stage, QR, And Result Reveal Polish

Goal: make projector behavior match the event checklist.

Tasks:

- Generate a real scannable QR code that encodes the general `/room` URL.
- Show the short event URL below the QR code.
- Keep timer and QR readable during voting.
- Ensure tiebreak wheel hides the winner until the 5-second reveal completes.
- Keep final stage screen stable with exactly the two selected charts.
- Add visual or e2e coverage for stage layout, QR, images, timer, tiebreak, and final reveal.

Acceptance checks:

- QR is scannable and points to `/room`, not `/vote` or a player-specific URL.
- Tiebreak animation reveals, rather than pre-displays, the backend winner.
- Final reveal remains clear and stable on the stage route.

## Phase 3 - Phone Live State And Ballot UX

Goal: remove stale phone behavior while keeping phones lightweight.

Tasks:

- Add light polling or equivalent server-backed status refresh for `/vote`.
- Auto-update phones for pause, resume, final-30-second warning, turnout extension, close, results revealing, and results revealed.
- Use existing ballot lookup to prefill saved choices and timestamp after refresh.
- Remember selected start.gg username on the device for the event.
- Improve same-username second-device warning before risky duplicate use.
- Ensure stale phone pages cannot appear submit-capable while paused or after close.
- Ensure emergency current-round eligibility changes update the active voting snapshot when intended.

Acceptance checks:

- Players can refresh after submission and still see saved choices and timestamp.
- Phones update status without manual refresh.
- Server still rejects invalid stale submissions.
- Latest valid submitted ballot continues to win.

## Phase 4 - Admin Safety And Missing Workflows

Goal: close admin, host-lock, and dangerous-action gaps.

Tasks:

- Prevent active host lock from being silently stolen while unexpired.
- Add an explicit warning/force path for host takeover.
- Add audit logging for dangerous and tournament-changing admin actions.
- Wrap reroll one chart, reroll set, reroll round, reset, manual ballot, and replacement flows in clear dangerous-action summaries.
- Implement admin live chart counts behind a warning button with no extra password.
- Implement emergency reopen voting with password confirmation, reason, and duration.
- Implement reset-round workflow.
- Implement result correction/override workflow as dangerous/emergency-only.
- Clarify and implement manual ballot timing around result computation and reveal.

Acceptance checks:

- Dangerous actions require password re-entry and action summaries.
- Dangerous actions write audit records.
- Live chart counts are hidden by default and public routes never show them before close.
- Host takeover behavior matches the host-lock rule.

## Phase 5 - Supabase Persistence

Goal: make server/database state authoritative before event use.

Tasks:

- Build Supabase-backed repository/service layers for operational state.
- Persist roster, active status, inactive/restored players, and active-round eligibility snapshots.
- Persist host lock and heartbeat state.
- Persist chart exclusions and reasons.
- Persist draws, drawn charts, draw order, versions, reroll history, and eligible pool snapshots or reconstructable criteria.
- Persist voting windows, pause/resume state, extension state, final-30 state, and deadlines.
- Persist ballots, ballot revisions, manual overrides, and replacement metadata.
- Persist result snapshots, result rows, tiebreaks, reveal phase, and final reveal timestamps.
- Derive selected prior songs from persisted final results.
- Keep in-memory stores only for tests, local fakes, or explicitly documented non-production mode.

Acceptance checks:

- State survives process restart or store recreation.
- Two app instances read the same tournament state.
- Draws, votes, results, and host lock are database-authoritative.
- No service-role keys or password hashes are exposed to browser code.

## Phase 6 - Data And Image Pipeline Hardening

Goal: make chart/image setup reproducible and event-safe.

Tasks:

- Make chart import upsert to Supabase or a runtime-consumed deployable artifact.
- Make image caching create deployable assets or upload to controlled storage.
- Store original `bg_img`, local image path, cache status, and failure reason.
- Add admin chart exclusion and re-inclusion UI.
- Validate required pools after exclusions.
- Add image natural-width or screenshot tests for stage/player/view-only surfaces.
- Document exact event setup commands and expected outputs.

Acceptance checks:

- Full event setup produces non-fallback chart artwork.
- Missing artwork does not break draw, stage, phone, or results.
- Excluded charts cannot be drawn.
- Re-included charts can return to eligibility.

## Phase 7 - Test And CI Repair

Goal: make quality gates trustworthy.

Tasks:

- Fix the ambiguous e2e selector around `getByText("final")`.
- Add two-tab admin/stage e2e coverage for live stage updates.
- Add phone status polling e2e coverage.
- Add DB-backed integration tests for roster, draws, ballots, voting windows, host lock, and results.
- Add cold-start persistence tests.
- Add multi-instance or equivalent persistence tests.
- Add 100-player load-sized tests against persistent services.
- Add stage visual checks for 7+7 rows, QR, timer, chart images, tiebreak, and final reveal.
- Keep CI free of production secrets and document any local-only checks.

Acceptance checks:

- Lint, typecheck, unit tests, build, and e2e pass reliably.
- CI gates match stable local gates.
- Any non-CI rehearsal checks are documented with owner/action.

## Phase 8 - Final Documentation And Release Reconciliation

Goal: make release docs match the final implemented behavior.

Tasks:

- Update event-day runbook with final stage, admin, phone, QR, result, CSV, and failure procedures.
- Update release checklist to link `docs/remediation-issue-checklist.md`.
- Update deployment readiness docs after Supabase persistence is complete.
- Update testing checklist with the final quality gates.
- Update phase status with completed remediation phases, changed files, checks run, risks, and assumptions.
- Remove any remaining stale claims that the app is event-ready while a remediation item remains open.

Acceptance checks:

- Every issue in `docs/remediation-issue-checklist.md` is checked with evidence.
- A full four-round rehearsal has been completed with persistent state.
- Private CSV export has been verified after final reveal.
- Final docs, tests, and runbooks agree with the product spec and validation checklist.

## Suggested Execution Order

1. Phase 0 - Align Instructions And Docs
2. Phase 1 - Visible Stage And Image Fixes
3. Phase 2 - Stage, QR, And Result Reveal Polish
4. Phase 3 - Phone Live State And Ballot UX
5. Phase 4 - Admin Safety And Missing Workflows
6. Phase 5 - Supabase Persistence
7. Phase 6 - Data And Image Pipeline Hardening
8. Phase 7 - Test And CI Repair
9. Phase 8 - Final Documentation And Release Reconciliation

If event pressure requires a narrower first pass, complete Phase 0 and Phase 1 before any other implementation work.
