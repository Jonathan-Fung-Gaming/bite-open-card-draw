# UX/UI Audit Remediation Plan - 2026-07-01

This plan was generated from a focused UX/UI audit of the admin console, host stage runner,
player phone flow, and spectator/result views.

Companion checklist: `docs/uxui-audit-checklist-2026-07-01.md`.

## Source Of Truth

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `AGENTS.md`

If this plan conflicts with tournament behavior in the product spec or repo validation checklist,
follow the product spec and validation checklist. Do not change tournament rules as part of UX/UI
remediation unless explicitly requested.

## Audit Scope

- Admin and host console: `/coolguy69`
- Stage/projector runner: `/stage`
- Player phone flow: `/room`, `/vote`
- Spectator and public result flow: `/charts`, `/results`
- Shared UI components used by those routes

This audit did not request or apply code changes. It produced a list of potential UX/UI issues for
triage.

## Goals

- Reduce event-operator mistakes during live host/admin operation.
- Keep public and phone screens aligned with the stage reveal rules.
- Make critical player feedback clear, especially around failed saves and duplicate identity use.
- Improve projector readability and resilience without changing tournament logic.
- Preserve the required route structure, voting rules, reveal order, and security boundaries.

## Priority Order

### P0 - Live Event Control Risks

Address these first because they can cause incorrect operator decisions or accidental public reveal:

- `ADM-001` - Stale admin timer/status.
- `ADM-003` - Lost host control can leave stale enabled UI.
- `ADM-005` - Reroll prompts omit ballot/result invalidation.
- `ADM-007` - Reveal control is too generic.
- `UX-002` - `/charts` final reveal gate is weaker than `/vote`.

### P1 - Player Trust And Stage Reliability

Address these next because they affect player confidence or projector correctness:

- `ADM-002` - Inactivity timer misleads after activity.
- `ADM-006` - Emergency reopen is enabled outside valid states.
- `ADM-008` - Live-count warning appears after the reveal click.
- `ADM-009` - Manual ballot can submit incomplete choices.
- `STG-001` - Stage timer/reveal uses projector `Date.now()`.
- `STG-002` - Stage lacks branded error/loading/reconnect fallback.
- `PLY-001` - Save-failure copy can omit prior-ballot reassurance.
- `UX-001` - `/results` pre-final state copy can be misleading.

### P2 - Clarity, Polish, And Recovery

Address these after P0/P1 or accept explicitly if the current UX is good enough:

- `ADM-004` - Read-only affordance is not local to most controls.
- `ADM-010` - Roster typo-edit workflow missing.
- `ADM-011` - Current-round eligibility rules are not explained near roster.
- `ADM-012` - Private CSV disabled/failure states are weak.
- `STG-003` - Stage QR may be too small for venue scanning.
- `STG-004` - Stage chart cards may be hard to read at 720p.
- `STG-005` - Rune wheel can look stepped under load.
- `PLY-002` - Browser back/forward can discard an unsubmitted ballot draft.
- `PLY-003` - Dynamic warnings and failures are not live regions.
- `PLY-004` - Seventh phone card can be wider than the first six on narrow screens.
- `UX-003` - Final `/results` does not auto-refresh after corrections.
- `UX-004` - View-only mobile navigation can resemble voting flow.
- `UX-005` - Expanded ban counts truncate chart names.
- `UX-006` - Public chart view exposes internal pool/version counts.

## Workstream A - Admin And Host Console

### Target Routes And Files

- `src/app/coolguy69/page.tsx`
- `src/app/coolguy69/actions.ts`
- `src/app/coolguy69/_components/AdminInactivityTimer.tsx`
- `src/app/coolguy69/_components/AdminSessionHeartbeat.tsx`
- `src/app/coolguy69/_components/HostHeartbeat.tsx`
- `src/app/coolguy69/_components/ManualBallotForm.tsx`
- `src/app/coolguy69/_components/PrivateCsvDownload.tsx`
- `src/components/DangerousActionDialog.tsx`
- `src/components/HostLockBadge.tsx`

### Planned Remediation

1. Add live admin status refresh.
   - Keep timer, turnout, ban selection count, extension state, live-count rows, and control enabled
     states current without requiring manual refresh.
   - Use server/database time as the authority. Client countdowns are display-only.
   - Ensure refresh does not create unnecessary load for player phones.

2. Make host lock loss visible and immediate.
   - Detect failed host heartbeat or forced takeover.
   - Disable local controls as soon as host control is lost.
   - Show a persistent "Host control lost" or "Read-only admin" banner with takeover guidance.

3. Strengthen dangerous action summaries.
   - Reroll actions must summarize chart replacement, ballot invalidation, result invalidation,
     and voting-window reset where applicable.
   - Prefer `DangerousActionDialog` for reroll flows so the password prompt and action summary are
     consistent.
   - Default full-round reroll selectors to the current round.
   - Disable or clearly guard rerolls after reveal unless there is an explicit correction workflow.

4. Make reveal controls explicit.
   - Replace generic `Next Reveal Step` copy with the actual next step, such as
     `Advance to Set 1 counts`, `Reveal Set 1 selected chart`, or `Show final charts`.
   - Show current and next reveal phase near the button.
   - Keep chart-by-chart counts hidden until the host intentionally advances stage reveal.

5. Improve live-count disclosure.
   - Show the warning before counts become visible.
   - Consider a two-step reveal for live counts: warning state first, then `Confirm show live counts`.
   - Do not add another password for live counts unless product rules change.

6. Improve manual ballot UX.
   - Disable save until both sets are complete.
   - Show per-set completion state.
   - Keep existing replacement warning and password requirement.

7. Clarify roster and current-round eligibility behavior.
   - Explain that routine roster changes after voting opens affect future rounds.
   - Place or link emergency current-round eligibility controls near the roster section.
   - Add visible typo-edit support only where player history allows it.

8. Make CSV export recovery clearer.
   - Explain when the button becomes available.
   - Mark auto-download as completed only after the browser download attempt succeeds.
   - Show retry copy after failed auto-download.

### Acceptance Criteria

- Active host and read-only admin screens cannot look like they both have control.
- Admin timer and turnout display update during voting without manual reload.
- Dangerous action prompts summarize the actual consequence before password entry.
- Reveal controls identify the next reveal action.
- Manual ballot form cannot be submitted while incomplete.
- CSV export failures can be retried without clearing the auto-download state.

## Workstream B - Stage And Projector

### Target Routes And Files

- `src/app/stage/page.tsx`
- `src/app/stage/StageAutoRefresh.tsx`
- `src/components/CountdownTimer.tsx`
- `src/components/StageSetPanel.tsx`
- `src/components/StageDrawCard.tsx`
- `src/components/QRPanel.tsx`
- `src/components/RuneWheel.tsx`
- `src/app/globals.css`

### Planned Remediation

1. Anchor stage display timing to server time.
   - Pass server time into stage countdown and reveal components.
   - Use monotonic elapsed time from hydration, not raw projector `Date.now()`.
   - Keep server/database time authoritative for deadlines and reveal sequencing.

2. Add branded stage failure states.
   - Add route-level loading/error/retry UI for `/stage`.
   - Avoid generic blank or framework error screens during the event.
   - Preserve auto-refresh/retry behavior where practical.

3. Improve QR scan reliability.
   - Increase stage QR size for common projector sizes while keeping the short `/room` URL visible.
   - Validate on 1280x720 and 1920x1080.

4. Validate projector readability.
   - Preserve two horizontal rows of 7 charts.
   - Check chart title, artist, timer, QR, and set labels at 720p and 1080p.
   - Tune card height/type only if screenshots show readability issues.

5. Smooth rune-wheel motion.
   - Make the 5-second tiebreak reveal look continuous.
   - Do not let animation determine the winner.
   - Keep 5+ tie fallback simple.

### Acceptance Criteria

- `/stage` still shows two horizontal 7-card rows for drawn sets.
- QR points to `/room` and is scan-friendly at projector sizes.
- Stage timers and reveal progress tolerate a skewed browser clock.
- Stage has branded recovery UI for load failures.
- Tiebreak reveal remains 5 seconds and reveals the backend-committed winner.

## Workstream C - Player Phone Flow

### Target Routes And Files

- `src/app/room/page.tsx`
- `src/app/vote/page.tsx`
- `src/app/vote/BallotFlow.tsx`
- `src/app/vote/actions.ts`
- `src/lib/vote/ballot.ts`
- `src/lib/vote/phone-view.ts`

### Planned Remediation

1. Make save failure reassurance unconditional.
   - Every failed submit/edit message should include that the previous server-confirmed ballot
     remains valid.
   - Preserve server validation for closed/paused states.

2. Decide whether to support browser back/forward for draft ballots.
   - Option A: Persist unsubmitted draft choices per round/player/device.
   - Option B: Put ballot step state in URL/history.
   - Option C: Accept current behavior, but document it and avoid misleading expectations.

3. Add live regions for critical feedback.
   - Use `role="status"` for saved/non-error messages.
   - Use `role="alert"` or assertive live regions for save failures, duplicate-device warnings, and
     max-ban feedback.

4. Tune seventh card sizing on narrow phones.
   - Keep the required `[1][2] [3][4] [5][6] [7]` phone layout.
   - Center the seventh card while keeping it visually consistent with the first six cards.

### Acceptance Criteria

- Required `/room` copy remains unchanged.
- Player identity label remains exactly `Select your start.gg username`.
- Confirmation copy still includes the selected start.gg username.
- Each set still requires 1-2 bans or explicit `No bans for this set`.
- Players can edit until voting closes, unless voting is paused.
- Save failures clearly state the previous server-confirmed ballot remains valid.

## Workstream D - Spectator, View-Only, And Results

### Target Routes And Files

- `src/app/charts/page.tsx`
- `src/app/charts/ChartsSetNavigator.tsx`
- `src/app/results/page.tsx`
- `src/components/PublicDrawSetPanel.tsx`
- `src/components/PublicResultSummary.tsx`
- `src/lib/vote/phone-view.ts`

### Planned Remediation

1. Fix `/results` pre-final copy.
   - Do not say voting is closed before voting is actually closed.
   - Show state-appropriate copy for awaiting draw, voting open, voting closed/revealing, and final.

2. Align `/charts` final reveal gating with `/vote`.
   - Reuse `shouldShowFinalPhoneResults` or an equivalent public-display guard.
   - Avoid showing final charts until stage reveal completion is authoritative.

3. Decide final auto-refresh behavior.
   - Either keep final public routes refreshing after corrections or intentionally stop all final
     public auto-refresh after stable final reveal.
   - Be consistent across `/charts`, `/vote`, and `/results`.

4. Make view-only navigation visibly non-voting.
   - Use `Previous chart set` and `Next chart set` copy.
   - Keep the `View only` state persistent.
   - Avoid primary submit-like styling for chart browsing.

5. Improve public result detail readability.
   - Let expanded ban counts identify charts without truncating important names.
   - Keep counts as raw ban counts, not percentages.

6. Hide internal public chart metadata.
   - Replace public `Version / Pool` text with neutral public copy such as `Draw complete`.

### Acceptance Criteria

- View-only users cannot vote, select a username, affect turnout, or affect ban counts.
- `/charts` and `/results` do not spoil final charts before stage reveal completion.
- Public results show selected charts first, then expandable full ban counts.
- Public results use ban counts only.
- Public chart views do not expose internal operational metadata unless intentionally accepted.

## Validation Strategy

Run the checklist in `docs/uxui-audit-checklist-2026-07-01.md` after each selected remediation batch.

Recommended automated checks after code changes:

- `rtk npm run lint`
- `rtk npm run typecheck`
- `rtk npm run test`
- `rtk npm run build`
- `rtk npm run test:e2e`
- `rtk git diff --check`

Recommended targeted UX checks:

- Admin two-browser host-lock takeover test.
- Admin voting-window live update test.
- Admin dangerous-action prompt copy tests.
- Player save-failure test with an `Error` rejection.
- Mobile 320px and 390px ballot layout screenshots.
- Stage 1280x720 and 1920x1080 screenshots.
- `/charts`, `/vote`, and `/results` no-spoiler desync tests.

## Risks And Assumptions

- Some issues are potential UX risks, not confirmed production defects.
- The plan intentionally separates UX/UI remediation from tournament rule changes.
- Some changes may require deeper state synchronization work, especially admin live refresh and host
  lock loss detection.
- Visual polish should be verified with screenshots, not only DOM assertions.
- If a listed issue is intentionally accepted as-is, record that decision in the checklist with the
  reason and date.

