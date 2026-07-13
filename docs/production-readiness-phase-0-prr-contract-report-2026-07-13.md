# Production Readiness Phase 0 - PRR Reproduction And Later-Test Contracts - 2026-07-13

Parent plan: `docs/production-readiness-remediation-plan-2026-07-13.md`
Phase plan: `docs/phase-plans/production-readiness-phase-0-reproduction-contracts-diagnostics-2026-07-13.md`
Checklist: `docs/production-readiness-remediation-checklist-2026-07-13.md`

## Purpose And Evidence Vocabulary

This report turns PRR-001 through PRR-013 into reproducible or deterministic source-trace
contracts. It does not claim that any later remediation is complete.

Evidence status is one of:

- **Measured**: produced by a named Phase 0 run and artifact. A value must not be described as
  measured until the artifact field below is filled in.
- **Deterministic source trace**: directly established by current code or an existing test. It
  describes what the implementation does, but is not a browser measurement.
- **Reported observation**: taken from the July 13 manual smoke report represented by the active
  remediation plan. It still requires a Phase 0 measurement where geometry, timing, or a hosted
  race is involved.
- **Inference**: a risk logically implied by the source trace. Inferences are not presented as
  reproduced browser failures.
- **Planned**: a later test or Phase 0 artifact that does not exist yet.

Authoritative tournament contracts are in `docs/product-spec.md`, especially Player identity,
Voting window, Results reveal, Host lock, Roster behavior, and Technical constraints. Final
release evidence is governed by `docs/pump_open_stage_repo_validation_checklist.md`, including the
48 -> 36 -> 24 -> 12 rehearsal. Security and disposable-data rules come from
`docs/security-notes.md`.

## Hosted Safety And Sanitization Gate

No hosted measurement in this report is valid unless all of the following are true:

1. `E2E_TOURNAMENT_STATE_BACKEND=supabase` and an explicit `E2E_TOURNAMENT_EVENT_ID` beginning
   with `phase0-` are supplied.
2. The Phase 0 event id differs from the normally configured `TOURNAMENT_EVENT_ID`.
3. `E2E_ALLOW_DESTRUCTIVE_RESET=true` is an explicit operator choice.
4. The evidence serializer accepts only round, draw id/version, voting status/deadline, result
   id/phase, freshness generation, sanitized HTTP method/path/status/sequence, anonymous timing
   samples, aggregate counts, and geometry.
5. The serializer rejects usernames, cookies, passwords, session or host tokens, service keys,
   hashes, authorization data, headers, request/response bodies, full HTML, and unredacted console
   arguments or stack-local data.

Implementation/source paths:

- `playwright.env.ts:104-224` - hosted credentials, explicit event-id guard, disposable prefixes,
  Phase 0 namespace separation, and destructive-reset opt-in.
- `tests/phase0/diagnostic-evidence.ts` - Phase 0 evidence allowlist/denylist and safe artifact
  writer.
- `tests/phase0/diagnostic-evidence.test.ts` - positive and negative sanitization contracts.
- `playwright.phase0.config.ts` and `tests/phase0/*.spec.ts` - opt-in serial Phase 0 browser
  diagnostics.

Hosted safety evidence status: **Measured and passing.** Each hosted run generated a new
`phase0-` event id, asserted that it differed from the configured event, and required explicit
destructive-reset opt-in.
Disposable event-id prefix artifacts: `phase0-test-results/transition/phase0-hosted-transitions.json`
and `phase0-test-results/roster-floor/phase0-hosted-roster-floor.json`.
Sanitization result: `tests/phase0/diagnostic-evidence.test.ts`, 32 passing tests.
Secret scan result: pending the final changed-file/artifact scan in the Run Ledger.

## PRR Contract Index

| ID      | Evidence status before Phase 0 runs               | Reproduction/source trace                                                                                                   | Owning remediation phase |
| ------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -----------------------: |
| PRR-001 | Deterministic source trace                        | Roster renders Username, Active, and Edit columns with a permanent username input and Save Name button.                     |                        4 |
| PRR-002 | Source trace plus hosted timing baselines         | The 30-action admin path timed out 5 actions; the direct database floor confirmed all 30 in 203ms total.                    |                        4 |
| PRR-003 | Reported observation plus measured geometry       | Shared `fill` logo was stable in the measured Chromium/WebKit route samples; broader consumer coverage remains for Phase 5. |                        5 |
| PRR-004 | Deterministic source trace                        | Both reported redundant strings exist verbatim.                                                                             |                        5 |
| PRR-005 | Deterministic source trace                        | Mobile Previous/Next buttons exist below the required set tabs.                                                             |                        5 |
| PRR-006 | Source trace plus measured mobile geometry        | `/charts` uses the generic header/below-image cards; nine cross-browser samples had no horizontal overflow.                 |                        5 |
| PRR-007 | Source trace plus measured native-select geometry | The native select was 16px and at least 44px high, but no controlled custom-chevron inset exists.                           |                        5 |
| PRR-008 | Source trace plus hosted transition baseline      | Full-round reroll advanced both draw versions from 1 to 2; mounted-ballot generation freshness remains a later contract.    |                        1 |
| PRR-009 | Deterministic source trace                        | A late draw reveal with no session-storage value is deliberately restarted at `serverNowMs`.                                |                        2 |
| PRR-010 | Source trace plus incomplete hosted timer sample  | Stage reported 600 seconds while the phone sample was unavailable, so cross-display skew remains unestablished.             |                        2 |
| PRR-011 | Source trace plus failed aged-control observation | The aged hosted admin observation lost control and did not recover, matching the automatic-expiry risk.                     |                        3 |
| PRR-012 | Source trace plus hosted reveal ordering          | Hosted Set 1/Set 2 phases and final confirmation completed in order with 32 successful public reads and no captured errors. |                        1 |
| PRR-013 | Source trace plus measured mobile geometry        | Both winner cards stack below the fold; no horizontal overflow occurred in the measured cross-browser samples.              |                        6 |

## PRR-001 - Inline Two-Column Roster

- **Reproduction/source trace:** Render `/coolguy69` with a controlling host and at least one
  player. `src/app/coolguy69/_components/AdminRosterPanel.tsx:70-75` declares three headers:
  Username, Active, and Edit. Each row uses the same three-column grid at lines 76-80 and always
  renders an edit form, username input, and Save Name button at lines 127-145.
- **Current behavior:** **Deterministic source trace.** Editing is a permanent third-column form;
  there is no double-click, Enter/F2, touch edit-mode, or Escape cancel state in this component.
  Active/inactive usernames are also communicated primarily with green/red text at lines 89-95,
  although the status button supplies text.
- **Inference:** Long names and simultaneous permanent controls consume width that the requested
  two-column interaction would reserve for readable username display.
- **Measurable closure criteria:** Exactly two visible columns; no separate Edit column or
  permanent username input; double-click plus touch and Enter/F2 begins in-cell edit; Enter saves;
  Escape cancels; focus remains predictable after save/cancel/error; empty/duplicate active names
  are rejected; history-locked names are explained and not editable; status control uses neutral
  Save Name styling; text, not color alone, communicates active state; long/narrow rows contain
  their content.
- **Later unit/integration evidence:** Roster validation tests for empty, normalized duplicate, and
  history lock; component interaction tests for edit entry, save/cancel, focus, and typed failure;
  server-action tests for one exact audit mutation.
- **Later hosted/Playwright evidence:** Two-admin hosted rename/status propagation; keyboard,
  touch, screen-reader-name, long-name, and narrow-layout Playwright coverage.
- **Owner/source paths:** Phase 4; `src/app/coolguy69/_components/AdminRosterPanel.tsx:70-148`,
  `src/app/coolguy69/actions.ts:595-635`, `src/lib/admin/roster.ts`,
  `src/lib/admin/roster.test.ts`, `tests/phase9/pages/admin.page.ts`.
- **Phase 0 artifact:** source trace in this report plus the PRR-002 hosted roster artifacts.

## PRR-002 - Fast And Propagated Roster Changes

- **Reproduction/source trace:** Submit status and rename forms repeatedly. The status action
  mutates the roster/audit stores and then calls `persistTournamentState()` and
  `revalidatePath("/coolguy69")` (`src/app/coolguy69/actions.ts:595-615`). Rename uses the same
  full-state persistence and route revalidation (`src/app/coolguy69/actions.ts:617-635`). The
  roster UI has server forms with no optimistic row state (`AdminRosterPanel.tsx:107-145`).
- **Current behavior:** **Measured and deterministic source trace.** Every routine row action enters
  the general tournament persistence path and waits on server-form completion. The hosted
  30-action admin workflow confirmed 25 changes, timed out 5, measured p50 14.46s, p95 28.18s,
  120.57s total, and 0.86s second-admin propagation. A separate direct-database floor confirmed
  30/30 with p50 165.03ms, p95 205.20ms, 208.47ms total, and 51.09ms second-client observation.
- **Inference:** Full-state writes plus route-level revalidation serialize more work than a
  row-scoped transaction and provide no one-frame feedback, so rapid clicks can feel blocked.
- **Measurable closure criteria:** Optimistic row/count feedback within one animation frame;
  hosted p95 confirmation <= 1 second; second-admin propagation <= 2 seconds; 30 status changes
  finish in seconds, not minutes; targeted transactions touch only player/audit/version data;
  exact canonical counts/audits; no lost update under concurrent/out-of-order responses; failed
  row rolls back accessibly; dirty edit survives refresh; invalidation exposes no roster payload;
  current-round eligibility is unchanged and next-round eligibility reflects the update; the
  48 -> 36 -> 24 -> 12 helper still removes exactly 12 per transition.
- **Later unit/integration evidence:** Optimistic reducer rollback/out-of-order tests; repository
  transaction tests proving row-scoped writes, audit cardinality, conflict behavior, snapshot
  isolation, and next-round eligibility.
- **Later hosted/Playwright evidence:** Serial 30-action benchmark with action latency samples,
  p50/p95/total; a second authenticated admin page observed simultaneously; exact database player
  and audit counts; full rehearsal attrition assertion.
- **Owner/source paths:** Phase 4; `src/app/coolguy69/actions.ts:595-635`,
  `src/lib/server/persistence.ts:42-60`, `src/app/coolguy69/_components/AdminRosterPanel.tsx`,
  `tests/phase9/phase8-phone-roster-regressions.spec.ts`,
  `tests/phase9/fixtures/rehearsal-plan.ts`.
- **Phase 0 measured fields/artifact:** admin workflow p50 14.46s, p95 28.18s, total 120.57s,
  second-admin propagation 0.86s, 25/30 confirmed and five timeouts; those sanitizer-approved
  aggregates are committed here because the failed-run artifact was ephemeral. Direct database
  floor p50 165.03ms, p95 205.20ms, total 208.47ms, propagation 51.09ms, 30/30 confirmed. Retained
  artifact: `phase0-test-results/roster-floor/phase0-hosted-roster-floor.json`.

## PRR-003 - Logo Loading Geometry

- **Reproduction/source trace:** Hard reload a route using `TournamentLogo` with cache disabled and
  capture the logo wrapper and image at the earliest script-observable frame, image load, and two
  settled animation frames. `src/components/TournamentLogo.tsx:12-25` gives a CSS-sized relative
  wrapper and a Next `Image` with `fill`; it does not place intrinsic width/height or an inline
  aspect ratio on the shared component.
- **Current behavior:** **Reported observation plus measured baseline.** The manual smoke reported
  a stretch. In the new Chromium/WebKit measurements for `/charts`, `/vote`, and `/results`, the
  earliest, loaded, and settled image/container boxes matched and every sample recorded zero
  logo-attributable layout shifts. Phase 5 still owns broader consumer and cache-state coverage.
- **Inference:** A frame before the relevant sizing styles are applied can use image/container
  geometry different from the settled box.
- **Measurable closure criteria:** Intrinsic aspect protection exists in initial HTML; hard reload
  records no intermediate stretched frame; logo-attributable layout-shift score is zero; all
  required route/admin/loading/error consumers pass; optimization, alt text, priority behavior,
  and intended size remain intact.
- **Later unit/integration evidence:** Static-render contract for intrinsic dimensions/aspect and
  alt text; consumer inventory test; optimized source/sizes/priority assertions.
- **Later hosted/Playwright evidence:** Chromium hard-reload filmstrip/geometry and
  `PerformanceObserver` layout-shift collection for shared consumers, with cached and uncached
  image paths.
- **Owner/source paths:** Phase 5; `src/components/TournamentLogo.tsx:10-27`,
  `src/components/RoundHeader.tsx:18-50`, `src/components/AdminLayout.tsx`,
  `src/app/stage/loading.tsx`, `src/app/stage/error.tsx`, `src/app/room/page.tsx`,
  `src/app/vote/page.tsx`.
- **Phase 0 measured fields/artifact:** 18 cross-browser route/width samples; earliest, loaded, and
  settled boxes matched; layout-shift count/value were 0/0 throughout. Artifacts:
  `phase0-test-results/memory-chromium/phase0-visual-chromium-visual-baseline.json` and
  `phase0-test-results/memory-webkit/phase0-visual-webkit-visual-baseline.json`, with screenshots in
  the same ignored Playwright output directories.

## PRR-004 - Redundant Copy

- **Reproduction/source trace:** Load `/stage` during voting and `/charts`. The stage caption
  returns `One window covers both sets.` at `src/app/stage/page.tsx:54-75`; `/charts` passes
  `status="Chart display"` at `src/app/charts/page.tsx:125-133`.
- **Current behavior:** **Deterministic source trace.** Both reported redundant strings are present
  verbatim. Other safety and state copy also exists and must not be removed by a broad text sweep.
- **Measurable closure criteria:** Both named strings are absent; a before/after copy inventory is
  reviewed; only confirmed duplicate result/chart-ready descriptions are removed; identity,
  no-bans, previous-round, reveal, view-only, host, dangerous-action, and error copy remains.
- **Later unit/integration evidence:** Render/source assertions for removed strings and retained
  safety phrases; explicit copy inventory reviewed in the Phase 5 evidence.
- **Later hosted/Playwright evidence:** Stage-voting and `/charts` screenshots/text assertions,
  plus result/identity/danger-dialog regression assertions.
- **Owner/source paths:** Phase 5; `src/app/stage/page.tsx:54-75`,
  `src/app/charts/page.tsx:125-133`, `src/app/vote/BallotFlow.tsx`,
  `src/components/DangerousActionDialog.tsx`, `src/app/results/page.tsx`.
- **Phase 0 artifact:** deterministic source trace in this report; no hosted write required.

## PRR-005 - Chart Navigation Buttons

- **Reproduction/source trace:** Open `/charts` below 768px with both sets drawn. Required set tabs
  render at `src/app/charts/ChartsSetNavigator.tsx:79-117`. A second mobile-only navigation block
  renders `Previous chart set` and `Next chart set` at lines 135-152.
- **Current behavior:** **Deterministic source trace.** Both redundant buttons exist in addition to
  the tabs. The component initially server-renders the available panel and reconciles the stored
  tab after hydration at lines 19-58 and 119-132.
- **Measurable closure criteria:** Previous/Next buttons absent; both set tabs remain; tabs work
  before and after hydration; partially drawn unavailable/fallback behavior remains correct.
- **Later unit/integration evidence:** Navigator render tests for zero/one/two draws, server markup,
  stored active index, and unavailable-tab fallback.
- **Later hosted/Playwright evidence:** 320/360/390 mobile tab operation with JavaScript before and
  after hydration; partial-draw behavior; no button role/name matching Previous/Next.
- **Owner/source paths:** Phase 5; `src/app/charts/ChartsSetNavigator.tsx:19-152`,
  `src/app/charts/page.tsx:82-136`, `tests/phase9/pages/charts.page.ts`.
- **Phase 0 artifact:** deterministic source trace plus mobile geometry artifact listed under
  PRR-006.

## PRR-006 - Mobile `/charts`

- **Reproduction/source trace:** Open `/charts` at 320, 360, and 390px with both sets drawn. The
  route uses generic `RoundHeader` (`src/app/charts/page.tsx:125-133`); the header stacks a standard
  logo above text on mobile (`src/components/RoundHeader.tsx:18-48`). Chart cards use a 16:9 image
  followed by a separate minimum-height metadata area (`src/components/PublicDrawSetPanel.tsx:27-60`).
  The grid is two columns and centers the odd seventh card (`src/app/globals.css:245-275`).
- **Current behavior:** **Deterministic source trace.** The seventh-card centering and noninteractive
  articles already exist. The requested smaller upper-left logo/headings and vote-like over-image
  gradient/metadata treatment do not. **Measured baseline:** Chromium and WebKit both recorded
  zero horizontal overflow at 320, 360, and 390px; the chart panel width stayed within the viewport.
- **Measurable closure criteria:** Smaller mobile logo; `Pump It Up Open Stage` and `Drawn Charts`
  near upper-left; appropriate mobile heading size; cards match voting art/gradient/over-image
  metadata treatment; articles remain noninteractive and unfocusable; centered seventh preserved;
  pre-hydration panels preserved; desktop remains stable except intended copy changes; no
  horizontal overflow at 320/360/390.
- **Later unit/integration evidence:** Route-specific mobile variant render contract; semantic
  article/no-control assertions; server-visible panels; grid odd-card rule.
- **Later hosted/Playwright evidence:** Chromium and WebKit at all three widths, screenshots,
  boxes/scroll widths/font sizes, seventh-card center, no overlap/focusable chart card, and desktop
  1280/1440 comparison.
- **Owner/source paths:** Phase 5; `src/app/charts/page.tsx:82-136`,
  `src/app/charts/ChartsSetNavigator.tsx:60-153`,
  `src/components/PublicDrawSetPanel.tsx:9-70`, `src/components/RoundHeader.tsx:11-52`,
  `src/app/globals.css:245-275`.
- **Phase 0 measured fields/artifact:** six `/charts` cross-browser width samples recorded 0px
  horizontal overflow. Chromium panel widths were 280/320/350px; WebKit recorded the same widths.
  Artifacts are the two `phase0-visual-*-visual-baseline.json` files named under PRR-003.

## PRR-007 - Username Dropdown Arrow

- **Reproduction/source trace:** Open `/vote` at 320, 360, and 390px while voting is open. The exact
  label and native `<select>` are at `src/app/vote/BallotFlow.tsx:1093-1104`. The select uses normal
  browser appearance and symmetric `px-3`; there is no appearance reset, separately positioned
  chevron, right-side text reservation, `aria-hidden`, or pointer-events-free icon in that block.
- **Current behavior:** **Deterministic source trace.** Native semantics and the exact identity
  label are preserved. **Reported observation:** the arrow alignment was poor on mobile.
  **Measured baseline:** the native control used 16px text, was 44px high in Chromium and 56px in
  WebKit, and stayed within the viewport at all three widths. Native indicator inset remains
  engine-owned and is not directly measurable from the DOM.
- **Measurable closure criteria:** Native select and exact label remain; custom chevron remains
  inside with stable right inset; icon is aria-hidden/pointer-events-free; longest username cannot
  overlap it; Chromium/WebKit focus, disabled, keyboard, and >=44px target tests pass.
- **Later unit/integration evidence:** Static semantic/label/icon contract and longest-name layout
  class contract; no replacement combobox implementation.
- **Later hosted/Playwright evidence:** Chromium/WebKit at 320/360/390, bounding boxes/right inset,
  long option text, focus ring, disabled state, keyboard selection, pointer click-through, and
  target height.
- **Owner/source paths:** Phase 5; `src/app/vote/BallotFlow.tsx:1093-1125`,
  `tests/phase9/pages/vote.page.ts`, `docs/product-spec.md:114-130`.
- **Phase 0 measured fields/artifact:** select widths were 254/294/324px at 320/360/390px; font
  size 16px; heights 44px Chromium and 56px WebKit; no route overflow. Artifacts are the two
  `phase0-visual-*-visual-baseline.json` files named under PRR-003.

## PRR-008 - Reroll And Voting Restart Freshness

- **Reproduction/source trace:** In a disposable hosted event, draw both sets, open voting, keep
  desktop and phone `/vote` pages open, reroll one chart, then reopen/restart voting. Current reroll
  actions invalidate voting and change draw state in memory, then call full-state persistence later
  (`src/app/coolguy69/actions.ts:776-895`). The vote live-state response contains voting and result
  fields but no active draw ids/versions/generation (`src/app/vote/actions.ts:86-103`). Polling
  refreshes the route for eligibility-count, saved-ballot invalidation, or submission-state changes
  (`src/app/vote/BallotFlow.tsx:786-829`), not an explicit newer draw generation.
- **Current behavior:** **Deterministic source trace.** Public route freshness includes active draw
  id/version (`src/lib/server/public-route-freshness.ts:58-98`), but the already-mounted ballot's
  lightweight live response cannot directly compare draw generations. **Inference:** a page with
  no saved ballot may retain stale `draws` until another refresh trigger. **Measured baseline:** a
  disposable hosted full-round reroll advanced both active draws from version 1 to version 2 and
  the restart retained version 2. The collector observed successful public route responses and no
  page/RSC error in this run; it did not prove already-mounted ballot generation replacement.
- **Measurable closure criteria:** One-chart/set/full-round post-vote rerolls are atomic server-side
  transactions; history and two-set ballot invalidation rules preserved; open desktop and phone
  pages replace charts automatically; stale chart/choices disappear while identity remains;
  old-generation submission rejected; out-of-order polling cannot restore old charts; no RSC/page
  error, 5xx, overlay, or manual refresh.
- **Later unit/integration evidence:** Transaction rollback/duplicate/concurrent action tests;
  generation comparator and out-of-order reducer tests; stale ballot submit rejection; identity and
  choice reconciliation; normalized memory/Supabase parity.
- **Later hosted/Playwright evidence:** Serial hosted reroll/restart with two open clients; request
  method/path/status/sequence; draw ids/versions, voting deadline/status, result phase and freshness
  generation before/after; stale request injection; zero 5xx/error-overlay assertions.
- **Owner/source paths:** Phase 1; `src/app/coolguy69/actions.ts:776-895`,
  `src/app/vote/actions.ts:82-104`, `src/app/vote/BallotFlow.tsx:750-846`,
  `src/lib/server/public-route-freshness.ts:51-100`,
  `src/lib/client/PublicRouteFreshnessGuard.tsx`, `src/lib/server/persistence.ts`,
  `src/lib/draw/draw-state.test.ts:23-63`.
- **Phase 0 measured fields/artifact:** reroll draw versions 1 -> 2 for both sets; restart remained
  on version 2; 32 sanitized `/charts` and `/results` reads returned 200; no error class/digest was
  captured. Artifact: `phase0-test-results/transition/phase0-hosted-transitions.json`.

## PRR-009 - Stage Card Reveal Recovery

- **Reproduction/source trace:** Draw both sets, begin voting, open a new stage tab or clear the
  stage reveal session-storage entries, then reload `/stage`. In
  `src/app/stage/StageDrawRows.tsx:46-76`, a canonical start older than `serverNowMs - 250` is
  replaced with `serverNowMs` when there is no stored start. The newly effective start is passed to
  `StageSetPanel` (`StageDrawRows.tsx:99-112`), which reveals cards progressively from that time.
- **Current behavior:** **Deterministic source trace.** A late load without the session-storage
  optimization restarts the draw reveal instead of immediately showing the canonical completed
  state. `StageDrawRows.tsx:38-43` itself states session storage is not tournament state.
- **Measurable closure criteria:** Voting-open, paused, final-warning, and extension reloads show
  all 14 charts immediately; cleared storage and a brand-new tab do not replay; result states stay
  result/holding; only a genuinely pre-vote reload resumes canonical progress; Set 1 then Set 2
  order remains correct.
- **Later unit/integration evidence:** Pure reveal-recovery policy tests across voting statuses,
  canonical timestamps, and absent/corrupt storage; existing schedule-order tests retained.
- **Later hosted/Playwright evidence:** Open/paused/final-warning/extension new-tab and cleared-store
  cases; assert 14 populated cards immediately and no reveal-in-progress DOM; pre-vote controlled
  progress and Set 1-before-Set 2 assertions.
- **Owner/source paths:** Phase 2; `src/app/stage/StageDrawRows.tsx:18-112`,
  `src/components/StageSetPanel.tsx:18-102`, `src/lib/stage/stage-view.ts`,
  `src/lib/stage/stage-view.test.ts:49-64`.
- **Phase 0 artifact:** deterministic trace in this report. The visual diagnostic exercised a
  complete Set 1 then Set 2 reveal before capturing `/results`; late-stage reload recovery remains
  a Phase 2 contract because Phase 0 did not add a separate storage-cleared sample.

## PRR-010 - Stable Authoritative Countdown

- **Reproduction/source trace:** Open stage and phone concurrently against one deadline and sample
  displayed seconds through normal polling/refresh. Stage `CountdownTimer` builds a performance-time
  anchor from each incoming `serverNowMs`, with the effect dependent on `serverNowMs`
  (`src/components/CountdownTimer.tsx:26-45`). Phone `VoteLiveShell` independently performs the same
  anchoring and resets on each live server sample (`src/app/vote/VoteLiveShell.tsx:42-80`). Phone
  live polling is 5 seconds while stage live refresh is 500ms (`src/lib/vote/phone-view.ts:4-13`).
- **Current behavior:** **Deterministic source trace.** Both displays use an authoritative deadline
  and monotonic `performance.now()` between samples, but they have separate anchor implementations
  and no revision field that distinguishes a timer-changing mutation from a same-window refresh.
  **Inference:** repeated samples can re-anchor at different network-delay points and visibly
  stutter or skew. **Measured baseline:** stage reported 600 seconds immediately after open, while
  the phone header yielded no parseable countdown sample. Cross-display skew therefore remains
  unestablished and the missing phone sample is itself a reproduction result.
- **Measurable closure criteria:** One shared authoritative countdown model; same-revision samples
  do not reset the anchor or increase display; no acceleration/deceleration/stutter/jump; pause
  freezes exactly; resume/reopen/final warning/extension require a newer authoritative revision;
  extension is labelled; wall-clock skew irrelevant; background/resume and out-of-order tests pass;
  stage/phone skew <= 1 second; visual ticks cause no database writes.
- **Later unit/integration evidence:** Shared clock reducer with fake monotonic time, wall-clock
  offsets, same/new revisions, pause/resume/reopen/extension, background jumps, and out-of-order
  samples; persistence-spy proof that ticks do not write.
- **Later hosted/Playwright evidence:** Simultaneous stage/phone sampling from one deadline,
  background/resume, artificial wall-clock skew, pause/resume/reopen/extension, response reordering,
  and database write-count check.
- **Owner/source paths:** Phase 2; `src/components/CountdownTimer.tsx:17-65`,
  `src/app/vote/VoteLiveShell.tsx:41-88`, `src/app/vote/BallotFlow.tsx:750-846`,
  `src/lib/vote/voting-window.ts`, `src/lib/vote/phone-view.ts:4-13`,
  `tests/phase9/pfr-timer-tiebreak-evidence.spec.ts:211-306`.
- **Phase 0 measured fields/artifact:** stage 600s; phone `null`; skew `null`. Artifact:
  `phase0-test-results/transition/phase0-hosted-transitions.json`. Phase 2 must make both displays
  observable from one revision and enforce <=1 second skew.

## PRR-011 - Non-Expiring Host And Recovery

- **Reproduction/source trace:** Acquire host, advance authoritative time beyond 30 minutes without
  heartbeat, and inspect ownership from original and second sessions. `HOST_LOCK_TTL_MS` is 30
  minutes (`src/lib/admin/host-lock.ts:3`). Snapshots report no active owner after `expiresAt`
  (`host-lock.ts:228-243`); acquisition writes `expiresAt = now + TTL` and refresh extends it
  (`host-lock.ts:246-288`); release also treats expiry as no active lock (`host-lock.ts:293-318`).
  The unit test explicitly allows takeover after expiry (`src/lib/admin/host-lock.test.ts:24-31`).
- **Current behavior:** **Deterministic source trace.** Host ownership automatically disappears
  after the heartbeat-derived TTL, conflicting with the locked product rule. Forced takeover is
  password/reason audited in `src/app/coolguy69/actions.ts:365-409`, but the expired path can be a
  normal acquire rather than an explicit forced takeover. The existing two-session browser test
  covers explicit takeover, not operation beyond 30 minutes
  (`tests/phase9/host-lock-two-session.spec.ts:13-52`).
  **Measured baseline:** after aging the disposable admin/host state beyond 30 minutes, the original
  admin no longer had enabled host control and the diagnostic did not recover it. This records the
  failure; it does not treat automatic expiry as acceptable.
- **Measurable closure criteria:** Ownership never expires from inactivity or heartbeat loss;
  missing heartbeat preserves owner and exposes explicit forced takeover; Release is the normal end;
  forced takeover requires password/warning/reason/audit; original secured host recovers after
  reauthentication, sleep/network loss, and missing/rotated credential; `canControl` requires
  verified session plus host credential; UI states are mutually consistent; every enabled action
  reports typed success/error; non-host inactivity remains; accelerated recovery and opt-in
  35-minute soak pass.
- **Later unit/integration evidence:** Non-expiring ownership state machine; heartbeat health-only;
  explicit release/forced-takeover concurrency; credential recovery; session/host distinction;
  persistence conflict tests and audit cardinality.
- **Later hosted/Playwright evidence:** Timestamp-aged disposable host row plus two sessions;
  original recovery and password-confirmed forced takeover; sleep/network and credential rotation;
  optional 35-minute soak; database owner/audit verification.
- **Owner/source paths:** Phase 3; `src/lib/admin/host-lock.ts:3-318`,
  `src/lib/admin/host-lock.test.ts:10-155`, `src/app/coolguy69/actions.ts:365-484`,
  `src/app/coolguy69/_components/HostHeartbeat.tsx`,
  `src/lib/server/admin-session-store.ts`, `tests/phase9/host-lock-two-session.spec.ts`,
  `docs/product-spec.md:283-299`.
- **Phase 0 measured fields/artifact:** timestamps aged by 31 minutes; original control after aging
  `false`; recovery succeeded `false`. The sanitizer-approved aggregate is committed in this report;
  its failed-run Playwright artifact was ephemeral. Password-confirmed forced-takeover and audit
  cardinality remain explicit Phase 3 closure evidence.

## PRR-012 - Tiebreak And Final State Transitions

- **Reproduction/source trace:** In disposable hosted state, drive Set 1 and Set 2 through
  count/resolved phases, reload mid-tiebreak, and click `Confirm Stage Reveal Complete` while stage
  and public readers poll. `advanceResultRevealAction` advances the result, then separately updates
  voting/phone state and audit before a later `persistTournamentState()`
  (`src/app/coolguy69/actions.ts:1223-1254`). Final release similarly updates voting, phone, selected
  song blocks, and audit before the later full-state write (`actions.ts:1257-1282`). Stage has a
  neutral result holding branch when a result-status window has no result
  (`src/app/stage/page.tsx:117-176`).
- **Current behavior:** **Deterministic source trace.** The neutral holding UI exists, and the
  tiebreak component reconstructs completion from the authoritative start for non-stage rendering
  (`src/components/ResultSetPanel.tsx:127-141,256-304`). However, the coupled authoritative changes
  are not represented as one phase-specific transactional operation at the server-action boundary.
  **Inference:** concurrent readers around persistence can receive combinations from different
  generations. **Measured baseline:** the hosted diagnostic observed `set_1_counts`,
  `set_1_resolved`, `set_2_counts`, `set_2_resolved`, and `final` in order, followed by
  `results_revealed`; 32 captured public reads returned 200 and no RSC/page error was captured.
  The collector does not prove transaction atomicity or exclude every intermediate stage DOM.
- **Measurable closure criteria:** Reveal/public release commit atomically; normalized RPCs are real,
  service-role-only, and verify the active host; rollout/rollback documented; no mixed public
  generation; stage never shows timer/card draw before either tiebreak or after final confirmation;
  no stuck/manual-refresh state; mid-spinner reload resumes remaining time; completed reload shows
  committed winner; browser randomness never decides winner; cache TTL zero/max and concurrent
  reader tests pass.
- **Later unit/integration evidence:** Transaction expected-phase/idempotency/concurrency tests;
  one audit per transition; projection generation coherence; holding-state monotonicity; tiebreak
  timestamp reload; winner provenance and no browser randomness.
- **Later hosted/Playwright evidence:** Two tiebreaks and final confirmation with concurrent stage,
  vote, charts, and results readers; sanitized response sequence/state generation; mid/post-duration
  reload; DOM exclusion for timer/card draw; cache TTL zero/max runs; no 5xx/RSC overlay.
- **Owner/source paths:** Phase 1; `src/app/coolguy69/actions.ts:1223-1282`,
  `src/app/stage/page.tsx:117-297`, `src/app/stage/StageResultPhaseGuard.tsx`,
  `src/components/ResultSetPanel.tsx:104-305`, `src/lib/results/reveal-timing.ts`,
  `src/lib/server/persistence.ts`, `tests/phase9/pfr-timer-tiebreak-evidence.spec.ts`.
- **Phase 0 measured fields/artifact:** five reveal phases in canonical order, final confirmation
  changed voting status to `results_revealed`, 32/32 public reads returned 200, and no sanitized
  error class/digest was captured. Artifact:
  `phase0-test-results/transition/phase0-hosted-transitions.json`; forbidden fallback DOM coverage
  remains a Phase 1 contract.

## PRR-013 - Mobile Results Fit

- **Reproduction/source trace:** Open final `/results` at 320x568, 360x640, and 390x844 at
  `scrollY=0`. The route uses a standard header and `px-5 py-5` container
  (`src/app/results/page.tsx:148-176`). On mobile, two result cards stack because the two-column grid
  begins at `md`; each has 16:9 artwork, `min-h-48`, padding, and 3xl title text
  (`src/components/PublicResultSummary.tsx:27-80`). The full ban-count panel always follows and uses
  two separate details summaries (`PublicResultSummary.tsx:81-146`); there is no single
  `Show Ban Counts` disclosure.
- **Current behavior:** **Deterministic source trace.** The component is shared with `/vote` and
  `/charts` final-result uses and has no `/results`-only compact variant. The stacked minimum
  geometry prevents both complete winner cards from fitting within the measured 844px viewport:
  the second card begins below the fold in every cross-browser sample. Horizontal overflow was 0px.
- **Measurable closure criteria:** `/results`-only compact mobile variant; both complete winner
  cards and fully visible `Show Ban Counts` control at scrollY=0; readable accepted minimum text;
  title/artist wrap without clamp/ellipsis; artwork remains; disclosure >=44px and keyboard/touch/AT
  operable; both seven-row lists available expanded; disclosure survives auto-refresh; no overflow
  or zoom; previous-round notice intact; desktop 1280/1440 unchanged; Chromium/WebKit pass at
  320/360/390.
- **Later unit/integration evidence:** Route-only variant API and render contract; complete text/no
  clamp; disclosure state persistence across remount/refresh; two complete seven-row lists;
  previous-round copy regression.
- **Later hosted/Playwright evidence:** Chromium/WebKit geometry at 320x568, 360x640, 390x844;
  scrollY=0 card/control boxes; font/wrapping/art visibility; keyboard/touch/AT disclosure;
  refresh-state persistence; horizontal overflow; desktop visual comparison.
- **Owner/source paths:** Phase 6; `src/app/results/page.tsx:84-180`,
  `src/components/PublicResultSummary.tsx:16-149`, `src/components/RoundHeader.tsx:11-52`,
  `src/app/results/ResultsAutoRefresh.tsx`, `tests/phase9/pages/results.page.ts`.
- **Phase 0 measured fields/artifact:** six cross-browser samples at 320/360/390px and 844px height;
  document heights were 1405-1445px in Chromium and 1405-1445px in WebKit; second winner cards
  began below the 844px fold; horizontal overflow was 0px. Artifacts are the two
  `phase0-visual-*-visual-baseline.json` files named under PRR-003.

## Phase 0 Run Ledger

| Evidence group                        | Command/result                                                                         | Status          |
| ------------------------------------- | -------------------------------------------------------------------------------------- | --------------- |
| Evidence sanitization                 | `npm run test`; focused file contributed 32/32 passing tests                           | Pass            |
| Memory visual/geometry diagnostics    | Chromium 54.3s; WebKit 1.2m; 9 samples each                                            | Pass            |
| Hosted transition/timing diagnostics  | generated disposable event; 5 reveal phases; 32 public 200s; no captured errors; 2.2m  | Pass            |
| Hosted direct roster floor            | generated disposable event; 30/30; p50 165.03ms; p95 205.20ms; total 208.47ms          | Pass            |
| Hosted admin roster/aging observation | 25/30; 5 timeouts; p50 14.46s; p95 28.18s; aged control/recovery false                 | Measured defect |
| Relevant default e2e                  | `npm run test:e2e`; 6/6 passing in 7.1m                                                | Pass            |
| Formatting                            | Prettier check on changed supported files                                              | Pass            |
| Lint                                  | `npm run lint`; generated `.next-phase0` ignore added after first diagnostic finding   | Pass            |
| Typecheck                             | `npm run typecheck`                                                                    | Pass            |
| Unit suite                            | `npm run test`; 61 files / 404 tests                                                   | Pass            |
| Build                                 | `npm run build`; default and isolated Phase 0 production builds                        | Pass            |
| Diff whitespace                       | `git diff --check`                                                                     | Pass            |
| Secret-like source/artifact scan      | 21 changed/untracked files and 8 retained JSON artifacts; all defined pattern counts 0 | Pass            |

The project-required `rtk` wrapper crashed and was unavailable after the early diagnostic runs, so
the equivalent direct commands were used and are recorded above. No environment file was changed
or added.

## Phase 0 Closure Interpretation

This report supplies a reproduction or deterministic trace and an explicit later-test contract for
all 13 PRR items. It does **not** close PRR-001 through PRR-013 themselves. Phase 0 checklist rows
for hosted safety, sanitization, timing, geometry, default checks, and review are supported by the
dated evidence above. PR merge and post-merge migration-not-applicable rows remain open until their
workflow evidence exists.
