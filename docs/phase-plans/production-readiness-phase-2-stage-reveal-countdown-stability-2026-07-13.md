# Production Readiness Phase 2 - Stage Reveal Recovery And Countdown Stability - 2026-07-13

Parent plan: `docs/production-readiness-remediation-plan-2026-07-13.md`

Checklist: `docs/production-readiness-remediation-checklist-2026-07-13.md`

Issues: PRR-009 and PRR-010.

## Goal

Reconstruct the stage card reveal from authoritative draw and voting lifecycle state, and give the
stage and player phone one shared monotonic countdown model. Voting-era reloads must show all 14
charts immediately, pre-vote reloads must resume the canonical Set 1 then Set 2 schedule, and
repeated route or phone polling must not re-anchor, increase, or distort an unchanged official
countdown.

This phase does not change tournament structure, voting duration, turnout thresholds, the
one-minute extension rule, the 30-second final-warning rule, pause semantics, result ordering,
tiebreak authority, the 10-second tiebreak duration, host ownership, persistence schema, or any
server-side tournament decision.

## Sources Of Truth Read

- `docs/codex-current-brief.md`
- Phase 2 of `docs/production-readiness-remediation-plan-2026-07-13.md`
- Phase 2 rows in `docs/production-readiness-remediation-checklist-2026-07-13.md`
- `docs/product-spec.md` sections for voting windows, turnout/timer rules, stage display, results,
  tiebreaks, and technical principles
- `docs/pump_open_stage_repo_validation_checklist.md` sections 2, 8, 9, 10, 11, 12, 21, and 23
- `docs/production-readiness-phase-0-prr-contract-report-2026-07-13.md` PRR-009 and PRR-010
  contracts
- `docs/phase-gates.md`
- `docs/security-notes.md`
- `docs/admin-action-policy.md`
- The current stage, vote-live, voting-window, public-generation, freshness, reveal-timing, and
  Phase 1 transition implementations and tests

No archived planning document is used as current authority.

## Baseline Findings

Three delegated read-only audits independently inspected stage reveal behavior, countdown state,
and test/gate coverage. They found:

1. `StageDrawRows` replaces any canonical reveal timestamp more than 250 ms old with the newest
   `serverNowMs` when session storage is absent. A cleared store or new tab therefore restarts the
   full Set 1 then Set 2 sequence even after voting begins.
2. Stage voting lifecycle and revision are not passed into `StageDrawRows`; its initial render also
   uses blocked/null starts before an effect reconstructs them.
3. Stage route refresh runs every 500 ms. Reveal starts are rebuilt for every new server sample,
   and all mounted chart cards carry the entrance animation class even when they were already
   revealed.
4. Result/holding isolation is already authoritative and sticky. Tiebreak progress already derives
   from stored server timestamps and Phase 1 tests forbid countdown/chart DOM throughout result
   mode. Those guards must remain dominant.
5. Stage `CountdownTimer` and phone `VoteLiveShell` independently rebuild `performance.now()`
   anchors on every server refresh/poll. Same-window network samples can therefore stutter,
   re-anchor, or round upward.
6. The Phase 1 public-state generation is already a coherent monotonic round revision. It advances
   atomically for open, pause, resume, automatic final warning, automatic extension, reopen, and
   other official lifecycle transitions. A separate database revision or migration is unnecessary.
7. There is no dedicated Phase 2 Playwright suite. Existing Phase 1 and Phase 9 evidence covers
   authoritative transitions, tiebreak reload, basic pause/resume, and reopen, but not reveal
   recovery, repeated same-revision countdown sampling, device-clock skew, background catch-up, or
   repeated stage/phone skew.

## Locked Invariants

- Four rounds, two sets per round, seven charts per set, and one shared 10-minute voting window stay
  unchanged.
- Pre-vote animation remains dramatic and ordered: all Set 1 charts, then all Set 2 charts.
- Once status is `voting_open`, `voting_paused`, `final_30_seconds`, or
  `extension_1_minute`, every drawn chart is immediately visible.
- `voting_closed` and every result status remain in result/holding UI; client reveal logic cannot
  override the server result-mode branch.
- Server/database time and server lifecycle transitions remain authoritative. The client never
  closes, pauses, resumes, extends, reopens, or writes voting state because a visual timer reaches
  zero.
- A same-revision sample cannot change lifecycle tuple, replace a monotonic anchor, or increase the
  displayed remaining time. An official increase is allowed only on a newer generation.
- Paused time freezes at the exact authoritative remaining milliseconds. Resume, reopen, final
  warning, and extension calibrate exactly once from their newer generation.
- Player phones remain on light polling; no Realtime connection or per-second server request is
  added.
- No secret, password, host credential, service-role key, ballot data, or private audit data enters
  browser-visible countdown or reveal props.

## Detailed Implementation Plan

### 1. Pure stage reveal recovery policy

1. Add pure stage-view helpers that classify voting-era statuses and derive whether a draw row uses
   canonical progressive reveal or immediate completed visibility.
2. Keep result statuses in the existing result-mode helper; do not render draw rows for result or
   holding states.
3. Preserve canonical draw-created timestamps and Set 1-before-Set 2 scheduling. Never replace an
   old canonical timestamp with client mount/server response time.
4. If session storage remains as an optional continuity hint, clamp it so it can never choose a
   later start than canonical state. Corrupt, missing, or cleared storage must be harmless.

### 2. Stage client integration and animation stability

1. Pass voting status and the existing public-state generation into `StageDrawRows`.
2. Render voting-era rows complete on the first client render, with 14 populated cards and no
   reveal-in-progress state.
3. Key canonical state only by round, draw id/version, canonical reveal timestamp, lifecycle mode,
   and authoritative generation; do not rebuild reveal starts merely because a same-generation
   `serverNowMs` sample arrived.
4. Mark only the genuinely entering card for the short entrance animation. Completed cards and
   voting-era immediate cards render statically after a remount; final featured-card behavior stays
   explicit.
5. Defer route refresh only during a short active card or tiebreak transition, not throughout the
   entire incomplete two-set reveal. Polling must continue between transitions so voting opening
   promptly collapses any remaining animation to all 14 cards.

### 3. Shared authoritative countdown model

1. Add a pure countdown module with an authoritative sample containing round, public-state
   generation, status, deadline, server-now milliseconds, and remaining milliseconds.
2. Accept the first valid sample, a new round, or a strictly newer generation. Ignore older
   generations and ignore/reject same-generation lifecycle/deadline changes.
3. Calibrate once per official generation. Between revisions, subtract only elapsed
   `performance.now()` time for running statuses; do not use device `Date.now()`.
4. Clamp same-generation output to the prior displayed remaining time. Repeated or out-of-order
   samples cannot reset the anchor or make the display increase.
5. Freeze paused/non-running statuses exactly. Display zero while awaiting the server's next
   official transition instead of inferring a close or extension in the browser.
6. Allow a newer generation to increase time only when the authoritative server transition says
   so, including resume, reopen, or the one-minute extension.

### 4. Shared client hook and stage/phone adoption

1. Add one client hook around the pure model. It ticks locally, updates immediately on focus and
   visibility changes, and retains the accepted round/generation anchor across same-route RSC
   refreshes.
2. Convert `CountdownTimer` and `VoteLiveShell` to this hook. Provide a dedicated phone countdown
   test id and expose accepted revision/status metadata for evidence without exposing private data.
3. Pass the public-state generation from `/stage`, `/vote`, and `getVoteLiveStateAction` as the
   countdown revision. Preserve Phase 1 lower-generation and request-sequence rejection before the
   phone publishes live state.
4. Keep route-state polling and server-side deadline advancement separate from visual ticks. No
   per-second router refresh, server action, or database write is added.
5. Label `extension_1_minute` as an official one-minute extension on both stage and phone while
   retaining the explanatory turnout rule.

### 5. Unit, integration, and browser evidence

1. Add pure reveal-policy tests for open, paused, final-warning, extension, pre-vote canonical
   progress, old completed schedules, absent/corrupt storage inputs, Set 1-before-Set 2 order, draw
   version changes, and result-mode isolation.
2. Add pure countdown tests with injected monotonic time for:
   - same-generation no re-anchor and no increase;
   - lower/out-of-order generation rejection;
   - same-generation lifecycle/deadline mismatch rejection;
   - exact pause freeze;
   - newer resume, reopen, final-warning, and extension calibration;
   - background monotonic jumps and normal post-resume cadence;
   - device wall-clock independence;
   - stage/phone equality from one sample and elapsed decrease within about one second.
3. Add a focused memory Phase 2 Playwright profile with live vote polling and public refresh
   enabled. Browser evidence will cover immediate real-card visibility after voting-era reload,
   cleared storage, and a brand-new stage tab; pre-vote non-regression; open/pause/resume timer
   behavior; dedicated simultaneous stage/phone sampling; route refresh stability; wall-clock skew;
   and background/foreground catch-up where browser automation can observe it reliably.
4. Use pure lifecycle/model tests for deterministic transition math and a narrowly token-gated
   memory-only E2E route to put the already-open local test round into final-warning or extension
   state without sleeping ten real minutes. The route must return not found in production and for
   every Supabase-backed profile, require the runner-issued token, and call only the in-memory test
   store. Existing voting-window/transaction tests remain the proof that official server
   transitions advance the generation.
5. Rerun all Phase 1 memory transition/tiebreak browser tests, including both-tiebreak recovery,
   pause/resume preservation, mounted reroll, all reroll forms, and coherent readers.
6. Run the default E2E suite after unit, build, and focused profiles pass.

## Required Checks

1. Prettier on all changed supported files.
2. `npm run lint`.
3. `npm run typecheck`.
4. `npm run test`.
5. `npm run build`.
6. The new focused Phase 2 memory Playwright suite.
7. `npm run test:phase1:memory` for every Phase 1 transition/tiebreak scenario.
8. `npm run test:e2e`.
9. `npx supabase db lint --local` as a schema-regression check when the local stack is available.
10. Negative runner-safety validation proving the Phase 2 profile rejects non-loopback or
    non-memory targets.
11. `git diff --check` and targeted secret/test-route hygiene searches.

Hosted Supabase mutation or cache-TTL profiles are not a Phase 2 gate because this phase does not
change persistence, coherent-read/cache behavior, SQL, or migrations. If implementation expands
into any of those areas, stop, amend this plan, and add disposable hosted coverage before closure.

## Migration, Rollout, Rollback, And Compatibility

- No Supabase migration is planned. The existing Phase 1 public-state generation is reused as the
  countdown revision.
- Server-action response changes are additive. Stage and vote server renders supply the new
  revision with every countdown sample; older persisted rows already hydrate the existing
  generation default.
- The app remains deployable without a database ordering window because no schema or RPC changes
  are introduced.
- Rollback is an application revert of the shared countdown/reveal policy and its props. No data
  rollback, migration down, or production database mutation is required.
- If any implementation unexpectedly requires schema changes, do not add them opportunistically;
  amend and re-review the plan with migration-first rollout, previous-application compatibility,
  forward rollback, disposable hosted evidence, and post-merge migration verification.

## Security, Accessibility, UX, And Performance Review

- Countdown/reveal props contain only public round lifecycle data already rendered on public
  routes.
- The hook imports no server action, persistence module, Supabase client, secret-bearing module, or
  write API.
- Official server transitions remain the only way status/deadline/generation changes.
- Timer text stays tabular and readable; the phone timer gets a dedicated semantic/testable span.
- Pause and official extension labels remain text-visible and are not color-only.
- No reduced-motion control is added. Animation remains the original short non-strobing reveal.
- Local visual ticks avoid database traffic and avoid 500 ms anchor resets; phone polling remains
  five seconds.
- Result/holding and tiebreak guards remain server/freshness controlled, preventing spoiler or
  draw/timer fallback.

## Self-Review Findings And Amendments

The initial plan was reviewed before implementation for missing acceptance criteria, tournament
conflicts, stale-state races, migration ordering, rollback, security, animation remounts, test
coverage, and operator/player UX. The following findings were incorporated:

1. **Avoid a new database revision.** A proposed `voting_windows.revision` would add migration and
   compatibility risk. The existing atomic public-state generation already covers every official
   countdown-changing transition and is the authoritative revision for this phase.
2. **Do not defer refresh for the full reveal.** The existing incomplete-row predicate could hide a
   newly opened voting state for roughly 25 seconds. Deferral is limited to the short active card
   transition so polling can observe voting lifecycle changes between cards.
3. **Do not treat `ready_to_vote` as voting-era completion.** That would erase the intended
   pre-vote reveal. Only the four explicit voting-era statuses force immediate visibility.
4. **Do not let same-generation server samples correct upward.** Network samples are ignored for
   calibration after the first accepted generation, and local output is clamped monotonically.
   Official increases remain possible only after a newer generation.
5. **Do not infer lifecycle at zero.** The client displays zero and waits for authoritative route
   state, preventing browser-side close/extension decisions or visual-tick writes.
6. **Preserve result/tiebreak isolation.** Existing result-mode branches, sticky freshness guard,
   and timestamp-based tiebreak recovery remain intact and are rerun as Phase 1 regressions.
7. **Keep timer-state browser evidence both real and contained.** Pure tests alone did not prove
   final-warning and extension labels/reload behavior in a browser. A runner-issued token now gates
   a local memory-only route that can update only those two statuses; the route is unavailable in
   production, unavailable to Supabase profiles, and covered by negative route tests.
8. **Make real-card evidence strict.** Browser assertions count `data-has-chart="true"`, not the 14
   permanent placeholder slots that allowed prior false positives.
9. **Isolate Playwright build state.** The Phase 2 profile uses `.next-phase2` so concurrent or
   interrupted focused runs cannot corrupt the default suite's `.next` output. Runner validation
   rejects conflicting dist-directory overrides and also locks the profile to loopback, memory
   persistence, and the local public-site URL.
10. **Prove visual ticks cannot write.** A boundary test forbids the countdown hook from importing
    server actions, persistence, routing, fetch, or Supabase modules; browser evidence separately
    verifies stable public generation during local timer ticks.
11. **Handle image failure before hydration.** Rendering every voting-era card immediately exposed
    a pre-hydration image-error race in the default visual gate. `ChartArtImage` now checks the
    mounted image synchronously through its ref and retains event/decode failure handling, so a
    failed cached chart image reliably switches to the existing fallback asset.

## Completion Evidence To Record

- Changed files and concise behavior summary.
- Commands, results, test counts, and focused browser scenario counts.
- Real-card timing and simultaneous stage/phone skew samples.
- Confirmation that same-generation samples never re-anchor or increase and visual ticks have no
  write dependency.
- Confirmation that all Phase 1 transition/tiebreak browser tests pass.
- Final complete-diff review findings and fixes.
- Risks, assumptions, no-migration decision, PR/merge evidence, synchronized default branch, and
  explicit post-merge migration non-applicability.
