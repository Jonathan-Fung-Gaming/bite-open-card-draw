# Comprehensive Review Remediation Plan - 2026-06-30

This plan accompanies `docs/comprehensive-review-checklist-2026-06-30.md`.
Use the checklist as the issue catalog and this file as the recommended execution order.

Creating or updating this plan does not close any `CR-###` item. Leave checklist items unchecked
until the issue is fixed, verified, or intentionally accepted as-is.

## Source Of Truth

- Primary behavior reference: `docs/pump_open_stage_repo_validation_checklist.md`
- Supporting product behavior: `docs/product-spec.md`
- Phase gate requirements: `docs/phase-gates.md`
- Security requirements: `docs/security-notes.md`
- Older execution context: `docs/codex-execution-plan.md`

If older execution-plan text conflicts with the validation checklist, follow the validation
checklist and product spec. In particular, result reveal order is least banned to most banned.

## Execution Rules

Work one phase at a time. Do not start the next phase until the current phase has met its exit
criteria and the phase gates below have been run.

After each phase, run:

```bash
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run build
rtk npm run test:e2e
```

If a command does not exist or cannot run in the current environment, record the reason in the phase
handoff. If a required gate fails, stop and fix that phase before continuing.

Each phase handoff should include:

- Changed files
- Checklist items addressed
- Tests and checks run
- Manual review against `docs/product-spec.md`
- Risks, assumptions, and any deferred items

## Phase 1 - Authoritative State Guardrails

Addresses: `CR-013`, `CR-014`, `CR-018`.

Fix the immediately actionable persistence guardrails before application-level behavior changes.
Implement or remove mutation-named Supabase RPCs that currently acknowledge success without
mutating state. Lock down public `SECURITY DEFINER` function execution. Add database-level guards
for core draw invariants where practical.

`CR-001` cross-instance row-scoped persistence is intentionally deferred to Phase 9 so it can be
closed together with hosted Supabase rehearsal and release evidence. Phase 1 may still add local
merge/queue guardrails, but those guardrails do not close `CR-001`.

Primary work:

- Make mutation RPCs actually insert/update authoritative rows, or rename/remove them so they are
  not mistaken for committed mutation paths.
- Revoke public/anon/authenticated execute access from tournament-changing RPCs and grant only the
  server-side role that should call them.
- Add database constraints/triggers for active draw uniqueness, draw completion, excluded chart
  blocking, pool match, duplicate chart prevention, same-round song uniqueness, and selected-prior
  song exclusion where feasible.

Exit criteria:

- Mutation RPC tests prove actual rows change.
- An anon Supabase client cannot call tournament-changing RPCs.
- Invalid direct draw inserts fail at the database boundary.

## Phase 2 - Ballot Privacy And Public Mutation Safety

Addresses: `CR-002`, `CR-017`.

Prevent public voter flows from exposing another player's live ballot choices, then add basic abuse
limits around sensitive public and admin actions.

Primary work:

- Change unauthenticated duplicate-name checks to return only existence, revision, and warning
  metadata.
- Add a device-scoped edit token, cookie, or equivalent authorization so the original device can
  reload and edit its saved choices.
- Allow a second device to submit a replacement ballot without viewing prior choices.
- Add rate limits or backoff for admin login, dangerous password re-entry, presence claims, ballot
  submits/edits, and large free-text inputs.

Exit criteria:

- Public voter actions cannot retrieve another player's `choices`.
- Duplicate-name warning still appears.
- Original-device editing still works through its private token.
- Latest valid submitted ballot still wins.
- Repeated wrong passwords or excessive public mutations are throttled without changing state.

### Phase 2 Handoff Context

Status: complete.

Implementation notes:

- Public ballot lookup and live polling now return `PublicBallotLookup` metadata. The `choices`
  array is present only when the caller's device-scoped edit token matches the server-stored
  `editTokenHash`.
- Browser edit tokens are stored in local storage by round/player. The original device can reload
  and edit saved choices; a second device receives only duplicate metadata and can replace the
  latest ballot with its own token.
- Player submissions rotate the stored edit-token hash. Manual admin ballots intentionally clear
  the public edit token hash because they are privileged server-side corrections.
- `edit_token_hash` was added to normalized ballot persistence so same-device edit authorization
  survives normalized repository save/load.
- Added process-local fixed-window throttles for admin login, dangerous password re-entry, voter
  presence claims, and ballot submits/edits. This is deliberately basic abuse protection, not a
  distributed WAF; hosted multi-instance/global throttling can be revisited with the Phase 9 hosted
  rehearsal if needed.
- Added string length caps at server-action boundaries for admin passwords, audit reasons,
  usernames, device ids, edit tokens, and large free-text form fields.

Verification:

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 35 files / 122 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.

## Phase 3 - Voting Timer Correctness

Addresses: `CR-003`, `CR-015`, `CR-026`.

Make voting deadlines authoritative and independent from app-server clock skew or polling cadence.
Fix emergency reopen and post-final phone display edge cases at the same time.

Primary work:

- Move open, close, extension, final-warning, pause, and resume deadline transitions to
  database-backed transactional mutations using database time.
- Ensure reads do not implicitly advance official state in a way that depends on polling.
- Make emergency reopen windows extension-ineligible unless explicitly redesigned otherwise.
- Render final phone results whenever the result reveal phase is final, including `round_complete`.

Exit criteria:

- App-server clock skew does not change voting transitions.
- Voting closes correctly even if no public/admin page polls at the deadline.
- Pause/resume survives process restart.
- Emergency reopen for a chosen duration closes at that duration without an extra low-turnout
  extension.
- `round_complete` plus final result shows the two selected charts first on phones.

## Phase 4 - Draw And Result Rule Hardening

Addresses: `CR-004`, `CR-009`, `CR-010`, `CR-011`, `CR-012`, `CR-032`.

Close rule gaps that can affect selected charts, draw auditability, or result reveal correctness.

Primary work:

- Prevent later-round drawing until prior selected songs are committed, or persist selected-song
  blocks as soon as each set result is resolved server-side while still hiding phone results.
- Special-case zero-ballot sets so each set uses a backend-decided selector across all seven charts.
- Compute and validate reroll replacements before mutating active draw history.
- Make full-round reroll atomic or roll back both sets on failure.
- Exclude the target chart, and preferably target song, from reroll-one-chart replacement pools
  where a replacement exists.
- Store immutable eligible chart IDs and exclusion/selected-song context with each draw.
- Update stale docs that still describe result reveal as most banned to least banned.

Exit criteria:

- Prior selected songs cannot appear in future draws, including draw-ahead attempts.
- Zero-ballot results have a committed winner for each set and do not crash the reveal.
- Failed set or full-round rerolls preserve the previous active draws.
- Reroll-one-chart returns a different chart where possible.
- Draw audit can reconstruct the eligible pool used at draw time.
- Docs consistently describe least-banned-to-most-banned reveal order.

## Phase 5 - Admin Security And Dangerous Actions

Addresses: `CR-016`, `CR-019`, `CR-020`, `CR-021`, `CR-022`.

Tighten admin session behavior and make dangerous actions explicit enough for event use.

Primary work:

- Change admin sessions to a true 30-minute inactivity timeout.
- Refresh sessions only on real admin interaction with debounce; do not let passive heartbeat alone
  keep a session alive indefinitely.
- Remove debug operational snapshot export in production or require active host control plus password
  re-entry and redaction.
- Rework dangerous action dialogs so target fields come first, then a computed action/consequence
  summary, then password entry.
- Strengthen manual ballot replacement copy to name the selected start.gg username.
- Make manual ballot controls cap bans at two and enforce no-bans mutual exclusion in the UI.

Exit criteria:

- Idle admin tabs cannot mutate after 30 minutes.
- Real admin interaction extends expiry; passive heartbeat alone does not.
- Debug export is unavailable or strongly gated and redacted in production.
- Reopen/reset/override/current-round-add prompts show exact target and consequence before password
  submission.
- Manual ballot replacement warnings name the player and require explicit confirmation.
- Manual ballot UI rejects invalid ban combinations before submit.

## Phase 6 - Stage And Results Visual UX

Addresses: `CR-005`, `CR-006`, `CR-007`, `CR-027`, `CR-028`.

Fix projector layout and reveal readability while preserving the required two horizontal rows of
seven charts for stage preview/voting display.

Primary work:

- Move `/stage` voting display to a top band with a large timer on the left and QR/short URL on the
  right, above the two chart rows.
- Remove the narrow sidebar layout during voting.
- Redesign result reveal so Set 2 reveal does not stack two full seven-row result panels offscreen.
- Populate the rune wheel with tied chart labels or abbreviations during animation.
- Calculate final wheel rotation so the pointer lands on a slot for the backend-committed winner.
- Improve readability at `1024x768`, `1280x720`, and `1920x1080`.
- Create a dedicated final reveal layout with two large selected-chart cards and de-emphasized QR.

Exit criteria:

- QR target remains `/room`, the short URL is visible, QR is right of the large timer, and both are
  above the chart rows.
- Two horizontal seven-card rows remain visible and readable on projector viewports.
- Result reveal needs no vertical scrolling on tested stage viewports.
- Rune wheel has 12 visible slots and lands on the committed winner after five seconds.
- Final stage screen shows exactly two large selected charts with set labels.

## Phase 7 - Phone And View-Only UX

Addresses: `CR-023`, `CR-024`, `CR-025`, `CR-033`, `CR-034`.

Improve mobile flow clarity and accessibility without changing tournament rules.

Primary work:

- Add mobile set tabs or next/back controls to `/charts`.
- Add compact view-only status for voting open, closed, revealing, and final states.
- Add `aria-pressed`, visible selected state, a `0/2 bans selected` counter, and limit feedback to
  vote cards.
- Clamp or truncate long chart names and artist text on narrow phones.
- Add direct saved-ballot edit actions for each set.
- Remove unused legacy `ChartSetPanel` or clearly isolate it so it is not reused for stage or phone
  layouts by accident.

Exit criteria:

- `/charts` mobile can navigate between Set 1 and Set 2 and has no voting controls.
- `/vote` mobile keeps the seventh chart centered and text contained at 360px and 390px widths.
- Ban selection is clear for mouse, touch, keyboard, and assistive tech.
- Third-ban attempts give feedback without silently changing prior selections.
- Submitted-ballot editing is direct enough to change either set without excessive backtracking.

## Phase 8 - Test Harness, Mobile Coverage, And Load

Addresses: `CR-029`, `CR-030`, `CR-031`.

Make the automated gates reliable enough to be trusted, then add event-like load coverage.

Primary work:

- Stabilize Playwright build/start behavior and port cleanup or port selection.
- Avoid `.next` cache conflicts between build and e2e.
- Wait for explicit backend/stage status before e2e visual assertions.
- Add mobile Chromium and WebKit/mobile Safari projects, or document any blocker clearly.
- Add an HTTP-level or Playwright/API hybrid load rehearsal script for 100 eligible players,
  spectators, stage, and admin.

Exit criteria:

- `rtk npm run test:e2e` passes retry-free from a clean shell with no prior dev server.
- Mobile coverage verifies `/vote`, `/room`, `/charts`, `/results`, and phone layout constraints.
- Load rehearsal submits and edits 100 player ballots while stage/admin/spectator routes are active.
- Final CSV verification passes under load.

## Phase 9 - Hosted Rehearsal And Release Evidence

Addresses: `CR-001`, `CR-008`, `CR-035`.

Use the hardened code against a hosted non-production Supabase event, then update release evidence.

Primary work:

- Apply migrations to an approved non-production hosted Supabase project.
- Replace remaining whole-snapshot live mutation saves with transactional row-scoped mutations,
  locked event revisions, or equivalent cross-instance database concurrency control.
- Ensure host heartbeat updates only host-lock state and cannot roll back unrelated event data in
  hosted Supabase operation.
- Run the app with `TOURNAMENT_STATE_BACKEND=supabase` and a non-production
  `TOURNAMENT_EVENT_ID`.
- Rehearse all four rounds, including forced tiebreaks, refresh/redeploy survival, host lock,
  admin sessions, manual ballot override, CSV download, QR, `/stage`, `/vote`, `/charts`, and
  `/results`.
- Update `docs/phase-status.md`, `docs/deployment-readiness.md`, `docs/release-checklist.md`, and
  related handoff docs with clean final gate evidence and any remaining risk.

Exit criteria:

- Hosted Supabase rehearsal is complete and documented.
- Concurrent different-player submissions both persist in hosted Supabase operation.
- Concurrent same-player edits preserve the latest valid ballot in hosted Supabase operation.
- Host heartbeat racing with ballot or admin mutations does not roll state back in hosted Supabase
  operation.
- Event readiness docs no longer list hosted rehearsal as an unresolved blocker.
- Final local gates are recorded from a clean shell.
- Remaining risks are explicit and acceptable for release.

## Issue Coverage Summary

| Phase | Issues |
|---|---|
| 1 | `CR-013`, `CR-014`, `CR-018` |
| 2 | `CR-002`, `CR-017` |
| 3 | `CR-003`, `CR-015`, `CR-026` |
| 4 | `CR-004`, `CR-009`, `CR-010`, `CR-011`, `CR-012`, `CR-032` |
| 5 | `CR-016`, `CR-019`, `CR-020`, `CR-021`, `CR-022` |
| 6 | `CR-005`, `CR-006`, `CR-007`, `CR-027`, `CR-028` |
| 7 | `CR-023`, `CR-024`, `CR-025`, `CR-033`, `CR-034` |
| 8 | `CR-029`, `CR-030`, `CR-031` |
| 9 | `CR-001`, `CR-008`, `CR-035` |
