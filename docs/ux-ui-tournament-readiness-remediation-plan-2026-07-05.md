# UX/UI Tournament Readiness Remediation Plan - 2026-07-05

Companion checklist: `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`.

This plan addresses the validated July 5 UX/UI issues for the tournament app. It is intentionally
scoped to usability, operator confidence, route clarity, deployment image reliability, and reveal
coordination. It must not change tournament rules unless the user explicitly asks.

Source of truth:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

If this plan conflicts with those documents, follow the product spec and validation checklist.

## How To Use This Plan

Work one phase at a time. At the start of each implementation phase, copy that phase into the
active task context and keep the checklist open. At the end of each phase:

1. Check off only the `UXR-*` items actually closed with evidence.
2. Record changed files, checks run, screenshots/evidence, risks, and assumptions in
   `docs/phase-status.md`.
3. Run the available quality gates: lint, typecheck, unit tests, build, and e2e tests when relevant.
4. Stop if a phase gate fails.

No item is closed by intent alone. Each closure needs route evidence, test evidence, or an explicit
user decision to accept the issue as-is.

## Phase 0 - Production Image And Environment Triage

Goal: determine why the live site showed placeholder chart images while the local repo validates
real cached image assets.

Issues targeted:

- `UXR-001` - Live production chart placeholders.
- `UXR-006` - QR public URL/rehearsal target gate.

Tasks:

- Capture live route/network evidence for chart cards on `/stage`, `/charts`, `/vote`, and
  `/results` where possible.
- Determine whether production requests `/chart-images/cache/*`, `/chart-images/fallback-card.svg`,
  or broken cached URLs.
- Verify the deployed build includes `data/generated/charts-with-images.json`,
  `data/generated/image-assets.json`, and `public/chart-images/cache/*`.
- Verify production/rehearsal `NEXT_PUBLIC_SITE_URL` produces an absolute `/room` QR target.
- Add or update release/deployment notes only if needed to prevent recurrence.

Acceptance criteria:

- The live placeholder cause is classified as deployment artifact, stale runtime data, missing env,
  missing cache asset, or intentional fallback rows.
- The next implementation phase knows whether app code, deployment config, or data refresh work is
  required.
- `UXR-001` is checked only after live evidence shows real cached art or the production fix is
  documented and verified.

## Phase 1 - Event-Day Admin Flow And Reroll Confirmation Cleanup

Goal: make `/coolguy69` match the host's event-day order of operations.

Issues targeted:

- `UXR-005` - QR centering.
- `UXR-024` - Admin panel order.
- `UXR-025` - Draw/reveal/start voting not primary.
- `UXR-026` - Chart Eligibility open by default.
- `UXR-027` - Reroll warning text always visible/repeating/spilling.
- `UXR-028` - Manual ballot placement before result computation.
- `UXR-031` - Roster/config/readiness details are too low.

Tasks:

- Reorder `/coolguy69` around the event-day path: host control, current round status/readiness,
  draw current round, reveal drawn charts, open/pause/resume/close voting, manual corrections,
  compute/reveal results, CSV export, then secondary setup/configuration.
- Keep dangerous reroll actions password-protected, but move long warning copy into the explicit
  confirmation interaction rather than inline per-chart blocks.
- Collapse or move chart eligibility/configuration below day-of controls by default.
- Put post-close manual ballot correction before compute/reveal, or add a clear blocking reminder
  before compute results if manual ballots are still possible.
- Surface roster count, chart image/cache readiness, required pool readiness, and current round
  readiness near the top.
- Center the QR square in `QRPanel` and verify stage layout at 720p and desktop.

Acceptance criteria:

- Admin top-of-page evidence supports the runbook order: draw, reveal drawn charts, open voting,
  monitor voting, correct ballots if needed, compute, reveal, export.
- Reroll warnings do not appear before an explicit reroll action.
- QR centering is verified on stage screenshots.

## Phase 2 - Reveal Synchronization And Public Route Freshness

Goal: remove reveal/race risks that can spoil final charts or leave public pages stale.

Issues targeted:

- `UXR-007` - Reveal cadence stutter/inconsistent intervals.
- `UXR-008` - Phones can reveal final charts before projector completes.
- `UXR-009` - Final public routes can go stale after correction/reset/advance.

Tasks:

- Separate "server has final result" from "stage reveal is complete enough for phones" if current
  state does not already encode that boundary safely.
- Ensure phones show the required holding copy until stage completion is committed.
- Keep final public routes fresh enough to respond to corrections, resets, and round advances.
- Smooth reveal progression so stage polling does not fight with the 5-second tiebreak animation.
- Add browser coverage for already-open `/stage`, `/vote`, `/charts`, and `/results` through final
  reveal and post-final corrections.

Acceptance criteria:

- Phones cannot display final charts before the stage reveal completion event.
- Already-open public pages update after admin correction/reset/advance.
- Stage reveal cadence is verified by Playwright or recorded screenshot/video evidence.

## Phase 3 - Phone And Stage Chart Readability

Goal: make chart cards readable and inspectable on phones and projectors without changing voting
rules.

Issues targeted:

- `UXR-002` - Missing runtime image fallback for broken cache URLs.
- `UXR-003` - Mobile chart art crop/dim problem.
- `UXR-004` - Long result names truncate identity-critical text.
- `UXR-010` - 720p stage card readability.
- `UXR-013` - Thin `/vote` waiting guidance.
- `UXR-014` - `No bans for this set` easy to miss.
- `UXR-015` - Saved ballot vs unsaved edit ambiguity.
- `UXR-016` - Duplicate-device warning timing.
- `UXR-022` - Small mobile controls.

Tasks:

- Add render-time image fallback behavior where chart art is an actual `img` or CSS background
  dependency.
- Adjust mobile card image treatment so chart art remains visible without sacrificing title,
  artist, difficulty, and selected state readability.
- Improve stage card sizing and text hierarchy for 1280x720 projector use while preserving two
  horizontal rows of 7 charts.
- Make the explicit no-bans choice prominent without adding a vague skip path.
- Clarify saved ballot, editing draft, failed save, and previous server-confirmed ballot states.
- Move duplicate-device/duplicate-ballot warning earlier where possible without adding identity
  friction that conflicts with the spec.
- Increase small secondary phone controls where touch accuracy matters.

Acceptance criteria:

- Mobile `/vote`, `/charts`, `/results`, and 720p `/stage` screenshots show readable chart cards.
- Explicit no-bans remains the only zero-ban completion path.
- Tests cover image fallback and saved-ballot edit failure behavior.

## Phase 4 - Room, View-Only, And Results Clarity

Goal: reduce confusion for spectators and players entering through `/room`, `/charts`, and
`/results`.

Issues targeted:

- `UXR-011` - Stage error/recovery can strand projector.
- `UXR-012` - `/room` lacks current tournament state.
- `UXR-017` - `/charts` spectator copy contains reroll/ballot invalidation language.
- `UXR-018` - One-set-drawn `/charts` state has contradictory copy/display.
- `UXR-019` - `/results` previous-round fallback can be misread.
- `UXR-020` - Internal implementation language appears in phone/result copy.
- `UXR-021` - Mobile `/charts` navigation depends on hydration and can resemble voting.
- `UXR-023` - Missing route-specific browser titles.

Tasks:

- Add concise current-round/status context to `/room` while preserving the required two options:
  `I am a player voting` and `View charts only`.
- Rewrite `/charts`, `/vote`, and `/results` waiting/holding copy in event language, not
  implementation language.
- Make previous-round results unmistakably previous and current-round pending unmistakably pending.
- Make one-set-drawn behavior internally consistent.
- Make mobile view-only navigation work and read as view-only even if hydration is delayed.
- Add route-specific metadata/titles where useful.
- Decide whether stage error recovery needs automatic retry, clearer operator instruction, or
  runbook coverage.

Acceptance criteria:

- Mobile route screenshots show unambiguous current status and route purpose.
- Public copy does not expose internal result-computation/snapshot wording.
- `/results` cannot plausibly be mistaken for current-round final results when showing previous
  round data.

## Phase 5 - Admin Secondary Panels, Host Lock, Counts, And Data Exposure

Goal: harden lower-priority admin/operator UX after the main event flow is fixed.

Issues targeted:

- `UXR-029` - Host lock clarity.
- `UXR-030` - Live counts cannot collapse and long names can overflow.
- `UXR-032` - Admin tables/lists overflow with long names.
- `UXR-033` - Public `/charts` receives unnecessary draw metadata.

Tasks:

- Improve host lock presentation with active/read-only owner context, expiry/takeover clarity, and
  heartbeat confidence.
- Add a hide/collapse path for live counts after reveal.
- Contain long usernames and chart names across roster, draw controls, manual ballot, and live
  counts.
- Reduce public `/charts` client props to display-safe fields rather than full draw records where
  practical.
- Keep admin live chart counts hidden by default and still warning-gated.

Acceptance criteria:

- Admin screenshots show no overflow for long player/chart names at desktop and narrow widths.
- Live counts can be shown, refreshed, and hidden again.
- Public client data no longer includes non-display draw metadata unless explicitly justified.

## Phase 6 - Full UX Regression Evidence And Release Closure

Goal: prove the app is tournament-reliable after the UX/UI remediations.

Issues targeted:

- All remaining unchecked `UXR-*` items.
- Closure gate in `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`.

Tasks:

- Run desktop screenshots for `/stage` and `/coolguy69`.
- Run mobile screenshots for `/room`, `/vote`, `/charts`, and `/results`.
- Run route-freshness tests with pages already open.
- Run image-cache verification and any production/live image verification required by Phase 0.
- Run the full production-flow rehearsal evidence with 48, 36, 24, and 12 active voting players.
- Update `docs/phase-status.md`, `docs/release-checklist.md`, and the checklist closure gate.

Acceptance criteria:

- Every `UXR-*` item is checked or explicitly accepted as-is by the user.
- Screenshots/evidence cover the real routes and states used on tournament day.
- Required checks pass, including release-blocking full-tournament Playwright evidence when
  available.

## Suggested Execution Order

1. Phase 0 - unblock production image certainty before UI work hides a deployment problem.
2. Phase 1 - fix the host's critical day-of admin flow.
3. Phase 2 - fix reveal synchronization before polishing final route copy.
4. Phase 3 - improve chart readability and voting phone clarity.
5. Phase 4 - polish spectator/result route clarity.
6. Phase 5 - harden secondary admin and data-payload risks.
7. Phase 6 - collect final regression evidence and close the checklist.

The order above intentionally prioritizes tournament-day failure modes over cosmetic polish.
