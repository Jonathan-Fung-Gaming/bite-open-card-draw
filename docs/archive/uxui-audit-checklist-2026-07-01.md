# UX/UI Audit Checklist - 2026-07-01

Use this checklist to triage, validate, and close the issues from
`docs/uxui-audit-remediation-plan-2026-07-01.md`.

Leave an item unchecked until it is fixed or intentionally accepted as-is. If accepted as-is, add a
short note with the reason and date. Issue IDs are stable so the team can pick only relevant work.

## Review Sources

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `AGENTS.md`
- UX/UI audit performed on 2026-07-01 with separate admin, stage, player, and spectator/result passes.

## Checks To Run After Selected Fixes

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run build`
- [x] `npm run test:e2e`
- [x] `git diff --check`
- [ ] If visual changes are included, capture mobile and projector screenshots.

## Positive Behaviors To Preserve

- [ ] Required routes remain present: `/stage`, `/room`, `/vote`, `/charts`, `/results`, `/coolguy69`.
- [ ] `/room` still shows `I am a player voting`.
- [ ] `/room` still shows `View charts only`.
- [ ] `/coolguy69` remains password protected and unlinked from public flows.
- [ ] Stage draw preview remains two horizontal rows of 7 charts.
- [ ] QR still points to `/room`.
- [ ] Player identity label remains exactly `Select your start.gg username`.
- [ ] Player confirmation still asks `Are you sure you are voting as [start.gg username]?`.
- [ ] A set can still be completed only by 1-2 bans or explicit `No bans for this set`.
- [ ] Public screens still avoid live chart-by-chart counts before reveal.
- [ ] Public results use ban counts only, not percentages.
- [ ] Tiebreak animation reveals a backend-committed winner and does not decide results.
- [ ] Final stage reveal still shows exactly 2 selected charts together.
- [ ] No reduced-motion toggle is added.

## Admin And Host Console

### ADM-001 - Stale Admin Timer/Status

- Severity: High.
- References: `src/app/coolguy69/page.tsx:173`, `src/app/coolguy69/page.tsx:547`.
- Current risk: voting timer, turnout, ban selections, extension state, and live counts can become
  stale after page load.
- Implementation note 2026-07-01: Added an admin-only live refresh loop that refreshes the server
  rendered console every 5 seconds while the operator is not editing a form field. This avoids player
  phone realtime usage; live two-browser validation is still pending.
- Validation:
  - [ ] Admin timer updates during an open 10-minute voting window without manual reload.
  - [ ] Ballots submitted updates after a player submits.
  - [ ] Ban selections cast updates after a player submits or edits.
  - [ ] Low-turnout extension and final-30-second state update on admin without manual reload.
  - [x] Admin refresh strategy does not create unnecessary player-phone realtime usage.

### ADM-002 - Inactivity Timer Misleads After Activity

- Severity: Medium.
- References: `src/app/coolguy69/_components/AdminSessionHeartbeat.tsx:13`,
  `src/app/coolguy69/_components/AdminInactivityTimer.tsx:9`,
  `src/lib/server/admin-auth.ts:128`.
- Current risk: activity refreshes the session cookie, but the visible countdown can still show the
  original expiry.
- Implementation note 2026-07-01: Admin live refresh will pick up the refreshed session expiry after
  activity. Dedicated expiry-extension validation is still pending.
- Validation:
  - [ ] Visible inactivity timer extends after qualifying admin activity.
  - [ ] Active admin is not reloaded solely because the old visible countdown reached zero.
  - [ ] Inactive admin still expires after the configured inactivity period.

### ADM-003 - Lost Host Control Can Leave Stale Enabled UI

- Severity: High.
- References: `src/app/coolguy69/page.tsx:165`,
  `src/app/coolguy69/_components/HostHeartbeat.tsx:16`,
  `src/app/coolguy69/actions.ts:246`.
- Current risk: after forced takeover, the previous host can still appear active until refresh or
  action failure.
- Implementation note 2026-07-01: Host heartbeat now returns whether the lock refresh succeeded and
  refreshes the old host page when control is lost. Two-browser validation is still pending.
- Validation:
  - [ ] In a two-browser test, forced takeover disables controls in the old host browser.
  - [ ] Old host browser shows a visible "host control lost" or read-only banner.
  - [ ] Old host browser cannot trigger tournament-changing actions after takeover.
  - [ ] New host browser can operate controls after takeover.

### ADM-004 - Read-Only Affordance Is Not Local To Most Controls

- Severity: Medium.
- References: `src/components/AdminLayout.tsx:24`, `src/app/coolguy69/page.tsx:577`,
  `src/app/coolguy69/page.tsx:833`.
- Current risk: standby admins may not know why controls are disabled or how takeover works.
- Validation:
  - [x] Read-only admin sees persistent host-lock guidance near the top of the page.
  - [ ] Major disabled sections explain that host control is required.
  - [x] Takeover guidance is easy to find without scrolling through the full console.

### ADM-005 - Reroll Prompts Omit Ballot/Result Invalidation

- Severity: High.
- References: `src/app/coolguy69/page.tsx:845`, `src/app/coolguy69/page.tsx:925`,
  `src/app/coolguy69/actions.ts:155`.
- Current risk: host can unintentionally invalidate live voting state because prompts mention chart
  replacement but not all consequences.
- Validation:
  - [x] Full-round reroll prompt lists affected round and both sets.
  - [x] Set reroll prompt lists affected round/set.
  - [x] One-chart reroll prompt lists affected chart and replacement consequence.
  - [x] Reroll prompts mention ballot invalidation, result invalidation, and voting-window reset when
        applicable.
  - [x] Full-round reroll defaults to the current round.
  - [x] Reroll actions still require password re-entry and audit reason.

### ADM-006 - Emergency Reopen Enabled Outside Valid States

- Severity: Medium.
- References: `src/app/coolguy69/page.tsx:672`, `src/lib/vote/voting-window.ts:307`.
- Current risk: operator can fill a password/reason for an impossible action and get a server error.
- Validation:
  - [x] Reopen voting UI is enabled only when the current state can be reopened.
  - [x] Disabled reopen UI explains the current state-specific reason.
  - [x] Reopen still requires password re-entry, duration, and audit reason.

### ADM-007 - Reveal Control Is Too Generic

- Severity: High.
- References: `src/app/coolguy69/page.tsx:622`, `src/lib/results/result-engine.ts:45`.
- Current risk: host can advance stage reveal too early because `Next Reveal Step` does not name the
  next consequence.
- Validation:
  - [x] Reveal button label names the exact next reveal action.
  - [x] Current reveal phase remains visible.
  - [x] Next reveal phase remains visible before clicking.
  - [x] E2E checks cover the sequence from computed through final.

### ADM-008 - Live-Count Warning Appears After Reveal Click

- Severity: Medium.
- Reference: `src/app/coolguy69/page.tsx:502`.
- Current risk: accidental disclosure on a projected or shared admin screen.
- Validation:
  - [ ] Warning is visible before chart-by-chart live counts become visible.
  - [ ] Counts are hidden until an explicit confirm/show action.
  - [ ] No extra password is required for live counts unless product rules change.
  - [ ] Public/stage/player routes still do not show live chart-by-chart counts.

### ADM-009 - Manual Ballot Can Submit Incomplete Choices

- Severity: Medium.
- References: `src/app/coolguy69/_components/ManualBallotForm.tsx:143`,
  `src/app/coolguy69/_components/ManualBallotForm.tsx:238`,
  `src/lib/vote/ballot.ts:75`.
- Current risk: host gets a server error after entering password instead of immediate completion
  guidance.
- Validation:
  - [x] Save manual ballot button is disabled until both sets are complete.
  - [x] Each set shows incomplete/complete state.
  - [x] Completion allows 1-2 bans or `No bans for this set`.
  - [x] Existing-ballot replacement warning still appears when applicable.
  - [x] Password remains required.

### ADM-010 - Roster Typo-Edit Workflow Missing

- Severity: Medium.
- References: `src/app/coolguy69/page.tsx:1017`, `src/lib/admin/roster.ts:67`.
- Current risk: typo correction may require duplicate/inactive workarounds.
- Validation:
  - [ ] Admin can edit a start.gg username before player history exists.
  - [ ] Admin cannot edit a player with tournament history through the routine typo workflow.
  - [ ] Duplicate active usernames remain blocked.
  - [ ] Audit trail records roster edits.

### ADM-011 - Current-Round Eligibility Rules Not Explained Near Roster

- Severity: Medium.
- References: `src/app/coolguy69/page.tsx:1000`, `src/app/coolguy69/page.tsx:1179`.
- Current risk: host may expect routine roster changes to affect an already-open round snapshot.
- Validation:
  - [ ] Roster section explains when changes affect future rounds only.
  - [ ] During open voting, current-round snapshot behavior is visible.
  - [ ] Emergency current-round add workflow is linked or placed near roster guidance.
  - [ ] Emergency current-round add still requires password and audit reason.

### ADM-012 - Private CSV Disabled/Failure States Are Weak

- Severity: Low.
- References: `src/app/coolguy69/page.tsx:650`,
  `src/app/coolguy69/_components/PrivateCsvDownload.tsx:49`.
- Current risk: failed auto-download may not retry automatically and host may not know when export is
  available.
- Validation:
  - [x] Disabled CSV button explains it becomes available after final reveal.
  - [x] Auto-download success is recorded only after a successful download attempt.
  - [x] Failed auto-download can retry after refresh.
  - [x] Manual download button remains available after final reveal.

## Stage And Projector

### STG-001 - Stage Timer/Reveal Uses Projector Date.now

- Severity: Medium.
- References: `src/components/CountdownTimer.tsx:24`, `src/components/CountdownTimer.tsx:36`,
  `src/components/StageSetPanel.tsx:43`, `src/components/StageSetPanel.tsx:61`.
- Current risk: skewed projector clock can show wrong timer or reveal progress.
- Validation:
  - [x] Stage countdown is based on server time plus monotonic client elapsed time.
  - [x] Stage chart reveal progress is based on server reveal start plus monotonic elapsed time.
  - [ ] Test stubs skewed `Date.now()` and verifies countdown/reveal remain correct.

### STG-002 - Stage Lacks Branded Error/Loading/Reconnect Fallback

- Severity: Medium.
- References: `src/app/stage/page.tsx:110`, `src/app/stage/StageAutoRefresh.tsx:8`.
- Current risk: projector can show a generic/blank failure state during event issues.
- Validation:
  - [x] `/stage` has branded loading UI.
  - [x] `/stage` has branded error/retry UI.
  - [x] Failure state avoids exposing sensitive details.
  - [x] Auto-retry or reload guidance is clear.

### STG-003 - Stage QR May Be Too Small

- Severity: Low.
- References: `src/components/QRPanel.tsx:59`, `src/app/stage/page.tsx:225`.
- Current risk: audience phones may struggle to scan the projector QR.
- Validation:
  - [x] QR remains clearly larger than the current compact cap on stage.
  - [x] Short `/room` URL remains visible under the QR.
  - [ ] Screenshots verify scan-friendly sizing at 1280x720 and 1920x1080.

### STG-004 - Stage Chart Cards May Be Hard To Read At 720p

- Severity: Low.
- References: `src/components/StageDrawCard.tsx:18`, `src/components/StageDrawCard.tsx:49`,
  `src/components/StageSetPanel.tsx:83`.
- Current risk: two 7-card rows are correct, but labels may be too small on projector.
- Validation:
  - [ ] Two horizontal 7-card rows are preserved.
  - [ ] 1280x720 screenshot has readable set labels, chart titles, and artist text.
  - [ ] 1920x1080 screenshot has readable set labels, chart titles, and artist text.
  - [ ] Page does not require vertical scrolling on normal stage dimensions.

### STG-005 - Rune Wheel Can Look Stepped Under Load

- Severity: Low.
- References: `src/components/RuneWheel.tsx:43`, `src/components/RuneWheel.tsx:45`,
  `src/app/globals.css:88`, `src/app/globals.css:93`.
- Current risk: animation timing is valid but visual motion may look choppy.
- Validation:
  - [ ] Tiebreak reveal lasts 5 seconds.
  - [ ] Wheel motion appears continuous enough in Playwright/manual visual checks.
  - [ ] Final pointer alignment highlights the backend-committed winner.
  - [ ] Wheel animation still does not decide the winner.

## Player Phone Flow

### PLY-001 - Save-Failure Copy Can Omit Prior-Ballot Reassurance

- Severity: Medium.
- Reference: `src/app/vote/BallotFlow.tsx:464`.
- Current risk: player may think a failed edit erased their prior valid ballot.
- Validation:
  - [x] Every submit failure message includes `Previous server-confirmed ballot remains valid.`
        or equivalent copy.
  - [x] Error rejection path and non-Error rejection path both show the reassurance.
  - [x] Existing saved ballot remains visible/valid after failed edit.

### PLY-002 - Browser Back/Forward Can Discard Unsubmitted Draft

- Severity: Low/Medium.
- References: `src/app/vote/BallotFlow.tsx:183`, `src/app/vote/BallotFlow.tsx:799`.
- Current risk: players using browser navigation can lose pre-submit choices.
- Validation:
  - [ ] Team decision recorded: persist draft, use URL step state, or accept current behavior.
  - [ ] If fixed, browser back/forward from Set 2 and Review does not lose choices.
  - [ ] If accepted, in-app navigation remains clear and no copy implies browser navigation is safe.

### PLY-003 - Dynamic Warnings And Failures Are Not Live Regions

- Severity: Low.
- References: `src/app/vote/BallotFlow.tsx:475`, `src/app/vote/BallotFlow.tsx:617`,
  `src/app/vote/BallotFlow.tsx:709`.
- Current risk: assistive tech users may miss critical feedback.
- Validation:
  - [x] Save success/status messages use `role="status"` or polite live region.
  - [x] Save failures use `role="alert"` or assertive live region.
  - [x] Duplicate-device warning is announced.
  - [x] Max-2-ban feedback is announced.

### PLY-004 - Seventh Phone Card Can Be Wider Than First Six

- Severity: Low.
- References: `src/app/vote/BallotFlow.tsx:722`, `src/app/vote/BallotFlow.tsx:735`.
- Current risk: required phone layout can look uneven on narrow phones.
- Validation:
  - [x] Seventh card remains centered.
  - [ ] Seventh card width closely matches cards 1-6 at 320px and 390px widths.
  - [x] Tap target remains usable.
  - [x] Layout still reads as `[1][2] [3][4] [5][6] [7]`.

## Spectator, View-Only, And Results

### UX-001 - Misleading `/results` Pre-Final State

- Severity: Medium.
- Reference: `src/app/results/page.tsx:14`.
- Current risk: `/results` can say voting is closed even when no draw or active voting is happening.
- Validation:
  - [x] `/results` awaiting draw state uses accurate copy.
  - [x] `/results` voting-open state uses accurate copy.
  - [x] `/results` voting-closed/revealing state uses `Voting is closed. Results are being revealed on stage.`
  - [x] `/results` final state shows final charts.

### UX-002 - `/charts` Final Reveal Gate Is Weaker Than `/vote`

- Severity: Medium.
- References: `src/app/charts/page.tsx:68`, `src/lib/vote/phone-view.ts:4`.
- Current risk: view-only phones can spoil final charts if result phase and public round status desync.
- Validation:
  - [x] `/charts` uses the same public final-reveal guard as `/vote` or an equivalent guard.
  - [ ] Desync test where result phase is final but round status is not revealed does not show final
        charts on `/charts`.
  - [x] Normal final reveal still shows selected charts first on `/charts`.

### UX-003 - Final `/results` Does Not Auto-Refresh After Corrections

- Severity: Low.
- References: `src/app/results/page.tsx:29`, `src/app/charts/page.tsx:71`.
- Current risk: dangerous post-reveal correction can leave `/results` stale.
- Decision 2026-07-01: Final public pages should continue auto-refreshing after final reveal so
  `/charts`, `/vote`, and `/results` stay consistent after an authorized correction. `/results`
  now renders `ResultsAutoRefresh` in the final state.
- Validation:
  - [x] Team decision recorded: final pages refresh after corrections or all final public pages stop
        refreshing consistently.
  - [ ] If refreshing, `/results` updates after a correction.
  - [ ] If not refreshing, runbook tells operator to reload public displays after correction.

### UX-004 - View-Only Mobile Navigation Can Resemble Voting Flow

- Severity: Low.
- Reference: `src/app/charts/ChartsSetNavigator.tsx:103`.
- Current risk: spectators may confuse chart browsing with ballot navigation.
- Validation:
  - [x] Mobile chart navigation uses non-voting copy such as `Previous chart set` and `Next chart set`.
  - [x] View-only label remains persistent.
  - [x] No username selector or submit controls appear in view-only mode.

### UX-005 - Expanded Ban Counts Truncate Chart Names

- Severity: Low.
- Reference: `src/components/PublicResultSummary.tsx:103`.
- Current risk: full ban counts may not identify long chart names clearly.
- Validation:
  - [x] Expanded full ban counts wrap or clamp names without hiding essential identification.
  - [ ] Long title/artist mobile test has no horizontal overflow.
  - [x] Selected chart marking remains visible.

### UX-006 - Public Chart View Exposes Internal Pool/Version Counts

- Severity: Low.
- Reference: `src/components/PublicDrawSetPanel.tsx:26`.
- Current risk: public chart view shows internal draw metadata that is not needed by spectators.
- Validation:
  - [x] `/charts` no longer shows internal `Version N / Pool N` text unless intentionally accepted.
  - [x] Replacement copy is public-facing, such as `Draw complete`.
  - [x] Admin-only metadata remains available where useful in `/coolguy69`.

## Final Closure

- [ ] Every selected issue is fixed or explicitly accepted as-is with date and reason.
- [ ] Positive behaviors to preserve were rechecked.
- [x] Required checks were run or skipped with reason.
- [ ] Screenshots were captured for visual changes where relevant.
- [ ] Summary of changes and remaining risks was added to the relevant phase/status or release notes.
