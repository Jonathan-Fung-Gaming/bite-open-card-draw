# Comprehensive Code and UX Review Checklist - 2026-06-30

This checklist consolidates a main-agent review plus six parallel subagent reviews.
Use this file as an issue catalog: leave an item checked off only after it is fixed
or intentionally accepted as-is. Each issue has a stable `CR-###` label so items can
be omitted or disputed individually.

Source of truth for design decisions: `docs/pump_open_stage_repo_validation_checklist.md`.
`docs/product-spec.md` was used only as supporting behavior context where it agrees
with the validation checklist.

Companion remediation plan: `docs/comprehensive-review-remediation-plan-2026-06-30.md`.

## Review Coverage

- Main agent: repository-wide source review, validation-checklist grep targets, local gates.
- Subagent 1: tournament rules, voting, results, tiebreaks, route/state behavior.
- Subagent 2: security, admin auth, host lock, secrets, live counts, dangerous actions.
- Subagent 3: chart data, draw eligibility, schema, Supabase persistence, reroll audit.
- Subagent 4: mobile player UX for `/room`, `/vote`, `/charts`, `/results`.
- Subagent 5: stage/admin/results visual UX.
- Subagent 6: tests, build, phase gates, deployment/readiness process.

## Checks Run

- [x] `rtk npm run lint` - passed.
- [x] `rtk npm run typecheck` - passed.
- [x] `rtk npm run test` - passed, 33 files / 108 tests.
- [x] `rtk npm run build` - passed.
- [x] `rtk npm run test:e2e` - initially failed once because port `127.0.0.1:3100`
  was still in use/TIME_WAIT; retry passed, 2 Playwright tests.
- [x] Validation checklist grep targets were reviewed.
- [x] In-app Browser plugin was attempted, but no browser targets were registered
  in this session, so visual review used source and Playwright coverage.

## Positive Confirmations

- [x] Required routes exist: `/stage`, `/room`, `/vote`, `/charts`, `/results`, `/coolguy69`.
- [x] `/room` has the required options: `I am a player voting` and `View charts only`.
- [x] The stage draw preview uses two horizontal 7-card rows via `StageSetPanel`.
- [x] QR generation defaults to `/room`.
- [x] Voting identity label uses `Select your start.gg username`.
- [x] Voter confirmation includes the selected start.gg username.
- [x] The phone ballot flow requires each set to be complete and includes explicit
  `No bans for this set`.
- [x] Public result pages do not show final results before the final stage reveal.
- [x] No reduced-motion UI toggle was found.
- [x] No obvious official DOOM assets were found in the inspected source.
- [x] No tracked real secrets were found; `.env.local` exists but is gitignored and
  was not read.

## Critical

- [ ] CR-001 - Non-transactional whole-state persistence can lose ballots or state.
  - Severity: Critical.
  - Files: `src/app/vote/actions.ts:70`, `src/lib/server/persistence.ts:66`,
    `src/lib/server/normalized-operational-state.ts:382`,
    `supabase/migrations/20260629093000_transactional_runtime_rpc.sql:27`.
  - Current behavior: tournament-changing server actions hydrate a whole operational
    snapshot, mutate in memory, then save by deleting and reinserting event-scoped
    rows. Host heartbeat, admin actions, and player submissions can race.
  - Expected behavior: server/database state is authoritative; latest valid ballot
    wins and 100-player concurrent use must not lose ballots.
  - Suggested fix: replace whole-snapshot writes for live mutations with real
    transactional Supabase RPCs or row-scoped upserts with advisory locking or
    optimistic event revisions. Host heartbeat should update only host-lock rows.
  - Suggested tests: concurrent different-player submissions both persist; concurrent
    same-player edits preserve latest valid ballot; host heartbeat racing with
    manual ballot or draw does not roll state back; 100 concurrent submissions
    preserve 100 latest ballots.
  - Phase 1 progress: added baseline/current/latest snapshot merge plus an in-process
    persistence write queue, with regression tests for concurrent different-player
    submissions, same-player latest-ballot wins, and host heartbeat vs ballot saves.
    Deferred to remediation Phase 9 for hosted Supabase closure; this remains unchecked until the
    Supabase save path is a database-transactional row-scoped mutation or equivalent cross-instance
    event revision.

- [x] CR-002 - Public voter actions expose existing live ballot choices.
  - Severity: Critical.
  - Files: `src/app/vote/actions.ts:19`, `src/app/vote/actions.ts:25`,
    `src/app/vote/actions.ts:40`, `src/app/vote/BallotFlow.tsx:169`,
    `src/app/vote/BallotFlow.tsx:295`.
  - Current behavior: unauthenticated voter actions return a full existing ballot for
    any eligible `playerId`, including current ban choices. Selecting another
    username can reveal that player's ballot before reveal.
  - Expected behavior: public/player screens may show turnout summaries and duplicate
    identity warnings, but not private choices before reveal.
  - Suggested fix: return only existence/revision metadata for duplicate warnings.
    Use a device-scoped edit token or cookie to reload saved choices on the original
    device; allow second devices to submit a replacement without seeing prior choices.
  - Suggested tests: public action cannot retrieve another player's `choices`;
    duplicate-name warning still appears; original device can edit via token; phones
    do not expose chart-by-chart choices before reveal.
  - Fixed in Phase 2 remediation: public ballot lookup and polling now return
    existence/revision/warning metadata unless the caller presents the device-scoped
    edit token whose hash is stored server-side. Same-device reloads hydrate choices
    through that token, while second devices can submit a replacement ballot without
    viewing prior choices.

## High

- [ ] CR-003 - Official voting timer transitions use app-server/request time instead
  of database time.
  - Severity: High.
  - Files: `src/lib/vote/voting-window.ts:170`,
    `src/lib/vote/voting-window.ts:367`, `src/lib/server/voting-round.ts:18`.
  - Current behavior: `Date.now()` drives open/close/extension/final-warning logic,
    and reads via `getSnapshot()` advance state.
  - Expected behavior: server/database time is authoritative; deadline transitions
    should not depend on public/admin polling cadence or app-server clock skew.
  - Suggested fix: move deadline decisions into database-backed transactional
    mutations using database time, or persist explicit timer advancement through a
    server mutation with concurrency control.
  - Suggested tests: app-server clock skew; no polling at deadline; pause/resume
    across process restart; deadline enforcement from DB timestamps.
  - Phase 3 progress: `VotingWindowStore.getSnapshot()` no longer mutates official
    state, deadline derivation is anchored to persisted `closesAt` values, and
    mutation paths explicitly advance/persist timer state where needed. The hosted
    database-time transactional closure remains deferred to remediation Phase 9, so
    this item stays unchecked until Supabase RPC/row-scoped timer mutations use
    database time rather than app-server time.

- [ ] CR-004 - Future-round selected-song blocking can be bypassed by drawing ahead.
  - Severity: High.
  - Files: `src/app/coolguy69/actions.ts:728`,
    `src/app/coolguy69/actions.ts:742`, `src/app/coolguy69/actions.ts:802`,
    `src/lib/persistence/operational-state.ts:82`,
    `src/app/coolguy69/page.tsx:172`, `src/app/coolguy69/page.tsx:817`.
  - Current behavior: selected song keys are marked only when reveal reaches `final`,
    while admin draw controls are available for all rounds if that set is undrawn.
  - Expected behavior: selected songs from prior rounds must be excluded from future
    draws.
  - Suggested fix: block drawing/advancing later rounds until prior final charts are
    committed, or persist selected-song blocks as soon as each set result is resolved
    server-side while still hiding results from phones.
  - Suggested tests: compute Round 1 with a song also present in Round 2, attempt
    Round 2 draw before final reveal, and assert it is blocked or excludes selected
    songs.

- [ ] CR-005 - Stage QR/timer placement does not match the validation checklist.
  - Severity: High.
  - Files: `src/app/stage/page.tsx:196`, `src/app/stage/page.tsx:208`,
    `src/components/CountdownTimer.tsx:31`, `src/components/QRPanel.tsx:49`.
  - Current behavior: `/stage` puts chart rows in the left column and stacks timer
    above QR in a right sidebar.
  - Expected behavior: QR should be above the cards and to the right of the large
    timer, with the timer visually dominant during voting.
  - Suggested fix: create a top voting band above the two chart rows: large timer on
    the left, QR/short URL on the right, then the two horizontal 7-card rows below.
  - Suggested tests: Playwright screenshots at 1920x1080 and 1280x720 asserting QR
    target is `/room`, short URL is visible, QR is right of timer, and both are above
    chart rows.

- [ ] CR-006 - Stage result reveal can overflow projector view.
  - Severity: High.
  - Files: `src/app/stage/page.tsx:154`, `src/app/stage/page.tsx:160`,
    `src/components/ResultSetPanel.tsx:47`, `src/components/ResultSetPanel.tsx:59`.
  - Current behavior: during Set 2 reveal phases, the stage renders full Set 1
    results plus full Set 2 results stacked vertically. Each set has seven rows.
  - Expected behavior: active reveal should be readable on a projector without
    scrolling.
  - Suggested fix: collapse previous set to a compact selected-chart summary when
    revealing Set 2, or redesign reveal into a projector-fit layout.
  - Suggested tests: screenshots at 1920x1080 and 1280x720; assert no vertical
    scrolling is needed and the active set's seven rows are visible.

- [ ] CR-007 - Rune wheel is not a visible selector aligned to the backend winner.
  - Severity: High.
  - Files: `src/components/RuneWheel.tsx:35`, `src/components/RuneWheel.tsx:38`,
    `src/components/RuneWheel.tsx:54`, `src/components/RuneWheel.tsx:72`.
  - Current behavior: the wheel rotates a fixed `720deg`; slots show `Sealed rune`
    until reveal completes; final rotation is not calculated to land a winner slot
    under the pointer.
  - Expected behavior: a 12-slot rune selector should be populated by tied charts
    and reveal the already committed backend winner.
  - Suggested fix: render repeated tied chart labels or abbreviations in the slots
    during animation, calculate ending rotation so the pointer lands on a winner
    slot, then highlight selected chart after 5 seconds.
  - Suggested tests: unit test 2/3/4-way slot sequences; e2e test that 12 visible
    slots exist and pointer-selected slot matches committed winner after 5 seconds.

- [ ] CR-008 - Hosted Supabase rehearsal remains an event-readiness blocker.
  - Severity: High.
  - Files: `docs/phase-status.md:5`, `docs/phase-status.md:15`,
    `docs/remaining-todo-2026-06-30.md:31`, `docs/deployment-readiness.md:50`.
  - Current behavior: docs still say event readiness is blocked until hosted Supabase
    rehearsal is completed.
  - Expected behavior: the checklist requires Supabase-backed event operation and
    rehearsal/load readiness before release.
  - Suggested fix: run an approved non-production `TOURNAMENT_EVENT_ID` rehearsal
    with `TOURNAMENT_STATE_BACKEND=supabase` after migrations are applied.
  - Suggested tests: four full rounds against hosted Supabase, including
    refresh/redeploy survival for draws, voting windows, ballots, results, admin
    sessions, host locks, CSV download, and QR.

## Medium

- [ ] CR-009 - Zero-ballot result path uses the 5+ tie fallback instead of the
  checklist's all-7-chart spinner.
  - Severity: Medium.
  - Files: `src/lib/results/result-engine.ts:68`,
    `src/lib/results/result-engine.ts:93`, `src/components/ResultSetPanel.tsx:115`.
  - Current behavior: zero ballots make all 7 charts tie for fewest bans; because
    5+ ties have no wheel slots, the UI uses fallback reveal.
  - Expected behavior: zero ballots should use a spinner among all 7 charts for each
    chart set separately.
  - Suggested fix: special-case zero-ballot sets with a 7-chart spinner/fallback
    selector that still uses a precommitted backend winner.
  - Suggested tests: zero ballots in both sets; verify each set has 7 tiebreak
    candidates and a backend-decided winner reveal.

- [ ] CR-010 - Failed rerolls can mutate draw history before replacement succeeds.
  - Severity: Medium.
  - Files: `src/lib/draw/draw-state.ts:178`,
    `src/lib/draw/draw-state.ts:264`, `src/lib/draw/draw-state.ts:276`.
  - Current behavior: `createDrawRecord` supersedes the active draw before
    `drawChartsForSet` succeeds. `rerollFullRound` can commit set 1 before set 2
    fails.
  - Expected behavior: failed rerolls preserve the active draw and prior history.
  - Suggested fix: compute and validate replacement charts before mutating history;
    make full-round reroll atomic or roll back both sets on failure.
  - Suggested tests: active draw remains active after a failed set reroll; full-round
    reroll leaves both previous active draws intact if the second set cannot be drawn.

- [ ] CR-011 - Reroll-one-chart can redraw the exact same chart.
  - Severity: Medium.
  - Files: `src/lib/draw/draw-state.ts:197`, `src/lib/draw/draw-state.ts:217`.
  - Current behavior: replacement eligibility excludes the other six current charts
    but not the target chart itself.
  - Expected behavior: reroll/replace should produce a different chart where possible.
  - Suggested fix: exclude the target chart key, and probably its song key, from the
    replacement pool; error if no replacement exists.
  - Suggested tests: deterministic RNG tries to pick the target chart; assert the
    replacement differs.

- [ ] CR-012 - Draws do not snapshot the full eligible pool.
  - Severity: Medium.
  - Files: `src/lib/draw/draw-state.ts:20`, `src/lib/draw/draw-state.ts:289`,
    `src/lib/server/normalized-operational-state.ts:535`,
    `supabase/migrations/20260628050200_initial_schema.sql:108`.
  - Current behavior: draw records store selected charts and `eligiblePoolCount`,
    but not the full eligible chart IDs or exclusion/prior-selected context.
  - Expected behavior: eligible pool should be snapshotted before each draw.
  - Suggested fix: store immutable eligible chart IDs plus exclusion and selected-song
    snapshot metadata with each draw.
  - Suggested tests: draw a set, change exclusions/source data, then verify audit can
    reconstruct the original eligible pool.

- [x] CR-013 - Transactional Supabase RPCs acknowledge success without mutating state.
  - Severity: Medium.
  - Files: `supabase/migrations/20260629093000_transactional_runtime_rpc.sql:27`,
    `supabase/migrations/20260629093000_transactional_runtime_rpc.sql:201`,
    `src/lib/server/transactions/normalized-runtime.ts:157`,
    `src/lib/server/transactions/normalized-runtime.test.ts:123`.
  - Current behavior: mutation-named RPCs return `{ committed: true }` through a
    shared ack function, but do not insert/update draw, ballot, result, or audit rows.
  - Expected behavior: callable mutation RPCs should be real authoritative
    transactions or not exposed as committed mutation paths.
  - Suggested fix: implement the RPCs fully, or remove/rename the abstraction so it
    cannot be mistaken for persistence.
  - Suggested tests: run each RPC against local Supabase/Postgres and assert actual
    rows change; invalid ballot completion is rejected.
  - Fixed in Phase 1 remediation: placeholder commit acknowledgements are rejected
    by the server-side RPC wrapper, and the migration overrides mutation-named RPCs
    so they raise until implemented as row-changing transactions.

- [x] CR-014 - Supabase draw schema does not enforce core eligibility invariants.
  - Severity: Medium.
  - Files: `supabase/migrations/20260628050200_initial_schema.sql:108`,
    `supabase/migrations/20260628050200_initial_schema.sql:120`,
    `supabase/migrations/20260629090000_event_scoped_runtime.sql:80`,
    `supabase/migrations/20260629100000_draw_aware_ballot_result_identity.sql:127`.
  - Current behavior: TypeScript enforces most draw rules, but the DB can allow
    invalid persisted rows if inserted directly.
  - Expected behavior: because server/database state is authoritative, core draw
    invariants should be guarded at the data boundary too.
  - Suggested fix: add partial unique active-draw constraints and triggers/checks for
    pool match, active exclusion, 7-chart completion, same-round song uniqueness, and
    selected-prior-song exclusion.
  - Suggested tests: migration tests attempting invalid inserts should fail for wrong
    level/type, excluded chart, duplicate active draw, incomplete draw, and cross-set
    duplicate song.
  - Fixed in Phase 1 remediation: added active-draw uniqueness, draw status checks,
    drawn-chart pool/exclusion/same-round/prior-selected-song trigger guards, and a
    voting-open draw-completion trigger, with schema tests for those guards.

- [x] CR-015 - Emergency reopen can unexpectedly receive another low-turnout extension.
  - Severity: Medium.
  - Files: `src/lib/vote/voting-window.ts:277`,
    `src/lib/vote/voting-window.ts:437`.
  - Current behavior: reopen sets status back to `voting_open` but does not mark the
    reopened window as extension-ineligible.
  - Expected behavior: emergency reopen uses a chosen duration and should close at
    that duration unless explicitly designed otherwise.
  - Suggested fix: add an `emergency_reopen` state or mark reopen windows as
    extension-ineligible.
  - Suggested tests: close early, reopen for 3 minutes with turnout below 75%, verify
    it closes at 3 minutes with no extra minute.
  - Fixed in Phase 3 remediation: emergency reopen now marks the voting window
    extension-used, and unit coverage verifies a 3-minute reopen closes at the chosen
    duration with no additional low-turnout extension.

- [ ] CR-016 - Admin inactivity timeout is effectively a 10-hour auto-refreshed session.
  - Severity: Medium.
  - Files: `src/lib/admin/session.ts:3`,
    `src/app/coolguy69/_components/AdminSessionHeartbeat.tsx:6`,
    `src/lib/server/admin-auth.ts:90`,
    `src/app/coolguy69/_components/AdminInactivityTimer.tsx:14`.
  - Current behavior: admin sessions use a sliding 10-hour TTL and a background
    heartbeat refreshes every minute while the tab is open.
  - Expected behavior: checklist recommends a 30-minute inactivity timeout.
  - Suggested fix: set default TTL to 30 minutes, refresh only on real admin
    interaction with debounce, and auto-logout/redirect when idle.
  - Suggested tests: idle tab for more than 30 minutes cannot mutate; real admin
    interaction extends expiry; passive heartbeat alone does not.

- [x] CR-017 - Sensitive actions lack basic rate limiting.
  - Severity: Medium.
  - Files: `src/app/coolguy69/actions.ts:128`,
    `src/lib/server/admin-auth.ts:154`, `src/app/vote/actions.ts:45`,
    `src/app/vote/actions.ts:70`.
  - Current behavior: no rate limiting is present for admin login, dangerous password
    re-entry, presence claims, or ballot submit/edit actions.
  - Expected behavior: checklist calls for basic rate limiting for sensitive actions
    where practical.
  - Suggested fix: add IP/session/player/device throttles, admin-password attempt
    backoff, and input size limits for reasons/usernames/device IDs.
  - Suggested tests: repeated wrong passwords are blocked; excessive ballot edits or
    presence claims are throttled without changing state; normal 100-player voting
    still passes.
  - Fixed in Phase 2 remediation: added process-local fixed-window throttles for
    admin login, dangerous password re-entry, voter presence claims, and public
    ballot submissions/edits. Added action-boundary string length caps for admin
    passwords, audit reasons, usernames, device ids, edit tokens, and bulk free-text
    form fields.

- [x] CR-018 - Public-schema `SECURITY DEFINER` RPCs need explicit execute lockdown.
  - Severity: Medium.
  - Files: `supabase/migrations/20260629093000_transactional_runtime_rpc.sql:58`,
    `supabase/migrations/20260629093000_transactional_runtime_rpc.sql:61`,
    `src/lib/server/transactions/normalized-runtime.ts:157`.
  - Current behavior: many mutation-named public `SECURITY DEFINER` RPCs exist and no
    visible `REVOKE EXECUTE` or service-role-only grant was found in the reviewed
    migrations.
  - Expected behavior: tournament-changing mutation boundaries should be callable only
    server-side/service-role.
  - Suggested fix: revoke execute from `public`, `anon`, and `authenticated`; grant
    only to `service_role`, or move functions to a private schema.
  - Suggested tests: anon Supabase client cannot call mutation RPCs; service-role
    executor still can.
  - Fixed in Phase 1 remediation: added explicit `REVOKE EXECUTE` from `public`,
    `anon`, and `authenticated` and `GRANT EXECUTE` to `service_role` for each
    normalized mutation RPC, with migration coverage in unit tests.

- [ ] CR-019 - Debug operational snapshot export exposes sensitive live data.
  - Severity: Medium.
  - Files: `src/app/coolguy69/page.tsx:1004`,
    `src/app/coolguy69/actions.ts:781`,
    `src/lib/persistence/debug-export.ts:15`,
    `src/lib/persistence/operational-state.ts:24`.
  - Current behavior: any authenticated admin can download a full debug operational
    snapshot, including live ballots, audit records, roster, host-lock hashes, and
    invalidated ballot payloads.
  - Expected behavior: sensitive live data should be deliberate and guarded; private
    ballot export is an admin/private artifact after reveal.
  - Suggested fix: remove debug export in production or require active host control
    plus password re-entry; redact host/session internals; block during voting unless
    explicitly needed for backup.
  - Suggested tests: debug export unavailable or password-gated in production; JSON
    redacts sensitive internals; live ballots are not exported during voting.

- [ ] CR-020 - Dangerous-action prompts ask for password before exact target details.
  - Severity: Medium.
  - Files: `src/components/DangerousActionDialog.tsx:24`,
    `src/components/DangerousActionDialog.tsx:28`,
    `src/app/coolguy69/page.tsx:624`, `src/app/coolguy69/page.tsx:666`,
    `src/app/coolguy69/page.tsx:709`.
  - Current behavior: shared dialog renders the password field before child fields
    such as reopen duration, reset round, override target, inactive player, and reason.
  - Expected behavior: dangerous-action prompt should summarize exactly what will
    happen before asking for the password.
  - Suggested fix: render action-specific selections first, then show a computed
    summary including selected round/player/chart/duration, then password entry.
  - Suggested tests: e2e for reopen/reset/override/current-round add verifying visible
    summary includes selected target and consequence before password submission.

- [ ] CR-021 - Manual ballot replacement confirmation is weak.
  - Severity: Medium.
  - Files: `src/app/coolguy69/_components/ManualBallotForm.tsx:37`,
    `src/app/coolguy69/_components/ManualBallotForm.tsx:72`,
    `src/app/coolguy69/_components/ManualBallotForm.tsx:109`,
    `src/app/coolguy69/actions.ts:621`.
  - Current behavior: server blocks replacement unless checked, but the UI uses
    `replace existing ballot? yes/no` and the top warning does not name the selected
    player.
  - Expected behavior: manual replacement copy should explicitly name the start.gg
    username and state the consequence.
  - Suggested fix: when an existing ballot is selected, change the header to
    `You are about to manually replace a ballot for [username]` and require an
    explicit checkbox like `Replace existing ballot for [username]`.
  - Suggested tests: select a player with an existing ballot; verify username-specific
    warning, submit rejected until explicit replacement confirmation, and CSV marks
    replacement.

- [ ] CR-022 - Manual ballot UI does not enforce max bans or no-bans exclusivity.
  - Severity: Medium.
  - Files: `src/app/coolguy69/_components/ManualBallotForm.tsx:88`,
    `src/app/coolguy69/_components/ManualBallotForm.tsx:101`,
    `src/app/coolguy69/actions.ts:632`.
  - Current behavior: the manual ballot form allows checking more than 2 bans and
    allows `No bans for this set` with chart bans selected. Server validation catches
    some cases, but if no-bans is checked the action discards selected bans.
  - Expected behavior: manual ballot UI should match player ballot rules: 1-2 bans
    or explicit no-bans per set, mutually exclusive.
  - Suggested fix: make the manual ballot set controls stateful: cap at 2 selected
    bans, disable/clear no-bans when bans are selected, and disable/clear bans when
    no-bans is checked.
  - Suggested tests: manual ballot e2e for >2 bans rejection before submit and no-bans
    mutual exclusion.

- [ ] CR-023 - `/charts` lacks explicit mobile set navigation and status.
  - Severity: Medium.
  - Files: `src/app/charts/page.tsx:29`, `src/app/charts/page.tsx:32`.
  - Current behavior: mobile view-only stacks both sets on one page with no set
    switcher/next-back flow and no clear voting/closed/revealing status before final.
  - Expected behavior: view-only users can move between both chart sets and see
    chart/voting status without affecting turnout.
  - Suggested fix: add mobile set tabs or Next/Back controls on `/charts`, plus a
    compact status banner for voting open/closed/revealing/final.
  - Suggested tests: mobile Playwright for `/charts`: verify Set 1/Set 2 navigation,
    no vote controls, no username selector, final state shows selected charts first.

- [ ] CR-024 - Ballot chart selection needs clearer ban affordance and accessibility.
  - Severity: Medium.
  - Files: `src/app/vote/BallotFlow.tsx:346`,
    `src/app/vote/BallotFlow.tsx:595`.
  - Current behavior: chart cards are plain buttons; selected state is mainly
    border/color. There is no `aria-pressed`, no visible `ban selected` text, and
    tapping a third chart silently keeps only two via `.slice(0, 2)`.
  - Expected behavior: players should clearly understand they are selecting bans,
    up to 2 per set, with explicit accessible state and feedback.
  - Suggested fix: add `aria-pressed`, visible selected/check state, a `0/2 bans
    selected` counter, and feedback when the limit is reached.
  - Suggested tests: keyboard/screen-reader pass; Playwright asserts `aria-pressed`
    toggles and third selection shows feedback without changing prior selections.

- [ ] CR-025 - Ballot card text can overflow on narrow phones.
  - Severity: Medium.
  - Files: `src/app/vote/BallotFlow.tsx:591`,
    `src/app/vote/BallotFlow.tsx:614`.
  - Current behavior: vote cards use two columns and center the 7th card, but chart
    name/artist text is not clamped.
  - Expected behavior: phone chart layout remains readable and long metadata does not
    break cards.
  - Suggested fix: use stable card dimensions and line-clamp/truncate treatment like
    `PublicDrawSetPanel`.
  - Suggested tests: screenshot test with long song/artist names at 360px and 390px;
    assert no text overlaps or escapes card bounds.

- [x] CR-026 - `round_complete` phone state can show pre-vote copy instead of final charts.
  - Severity: Medium.
  - Files: `src/lib/vote/voting-window.ts:20`, `src/app/vote/page.tsx:58`,
    `src/app/vote/page.tsx:83`.
  - Current behavior: `/vote` renders final phone results only for `results_revealed`.
    If status becomes `round_complete`, it falls into generic `!canSubmit` copy.
  - Expected behavior: after reveal, phones show the two selected charts first, then
    expandable full ban counts.
  - Suggested fix: render final results whenever `result?.revealPhase === "final"`
    and status is `results_revealed` or `round_complete`.
  - Suggested tests: route/state test for `round_complete + final result` asserting
    selected chart cards render before full counts.
  - Fixed in Phase 3 remediation: `/vote` uses a tested final-phone helper so
    `results_revealed` and `round_complete` both render selected final charts first
    when the committed result reveal phase is `final`.

- [ ] CR-027 - Stage rows risk poor readability at smaller projector widths.
  - Severity: Medium.
  - Files: `src/app/stage/page.tsx:196`,
    `src/components/StageSetPanel.tsx:83`,
    `src/components/StageDrawCard.tsx:14`,
    `src/components/StageDrawCard.tsx:37`.
  - Current behavior: stage always uses `grid-cols-7`; at `lg` widths the sidebar
    leaves narrow chart cards while text remains large.
  - Expected behavior: the stage uses two horizontal 7-card rows but stays readable
    on stage/projector viewports.
  - Suggested fix: move timer/QR out of the side column, raise the two-column
    breakpoint, and enforce minimum readable card widths in a projector-focused
    16:9 layout.
  - Suggested tests: screenshots at 1024x768, 1280x720, and 1920x1080; verify titles,
    set labels, QR, and timer remain readable.

- [ ] CR-028 - Final two-chart reveal is visually undersized.
  - Severity: Medium.
  - Files: `src/app/stage/page.tsx:103`, `src/app/stage/page.tsx:106`,
    `src/components/StageDrawCard.tsx:14`.
  - Current behavior: final reveal reuses normal `StageDrawCard` with `min-h-44` and
    keeps QR/sidebar beside it.
  - Expected behavior: final stage screen should make the two selected charts the
    stable, dominant final reveal.
  - Suggested fix: create a dedicated final reveal layout with two large set-labeled
    selected chart cards occupying most of the viewport; de-emphasize QR after final
    reveal.
  - Suggested tests: screenshot asserts exactly two final cards are large/readable
    and set labels/difficulties are visible.

- [ ] CR-029 - E2E harness has shown flakiness around build/start and port reuse.
  - Severity: Medium.
  - Files: `playwright.config.ts:29`, `tests/e2e/full-flow.spec.ts:271`,
    `tests/e2e/full-flow.spec.ts:292`.
  - Current behavior: one agent saw missing `.next/server/pages-manifest.json` and a
    tiebreak test failure; main-agent e2e first failed because port 3100 was in use,
    then passed on retry.
  - Expected behavior: e2e is a phase gate and should be reliable once present.
  - Suggested fix: isolate/clean `.next` for Playwright, avoid parallel build/e2e
    cache conflicts, handle port cleanup/reuse intentionally, and wait for explicit
    stage/draw status before image assertions.
  - Suggested tests: keep full-flow and tiebreak tests; add retry-free assertion that
    `/stage` receives both drawn sets after reset/draw.

- [ ] CR-030 - Browser/mobile UI coverage does not match the validation checklist.
  - Severity: Medium.
  - Files: `playwright.config.ts:23`.
  - Current behavior: Playwright only runs Desktop Chrome.
  - Expected behavior: checklist calls out recent iOS Safari, Android Chrome, and
    stage Chrome; phone layout must be verified on mobile.
  - Suggested fix: add mobile Chromium and WebKit/mobile Safari projects, or document
    manual blockers if CI cannot run them.
  - Suggested tests: `/vote` mobile layout, 7th-card centering, no text overlap,
    ballot flow, `/room`, `/charts`, `/results`, and 1920x1080 stage viewport.

- [ ] CR-031 - Load coverage is store-level, not event-like.
  - Severity: Medium.
  - Files: `src/lib/integration/tournament-flow.test.ts:198`,
    `src/lib/integration/persistent-tournament-flow.test.ts:214`.
  - Current behavior: 100-player automated coverage exists at in-process
    store/repository level.
  - Expected behavior: load readiness should include 100 eligible players plus
    spectators/view-only users with stage and admin connected.
  - Suggested fix: add an HTTP-level load/rehearsal script or Playwright/API hybrid
    that exercises actual routes/server actions.
  - Suggested tests: 100 players submit/edit, `/stage` polling, `/coolguy69` host
    open, `/charts` spectators, and final CSV verification under load.

- [ ] CR-032 - Source docs still conflict on result reveal order.
  - Severity: Medium.
  - Files: `docs/codex-execution-plan.md:146`,
    `docs/codex-execution-plan.md:154`,
    `docs/codex-execution-plan.md:1392`,
    `docs/phase-status.md:1080`.
  - Current behavior: implementation and validation checklist use least-banned to
    most-banned order, but older docs still say most-banned to least-banned.
  - Expected behavior: docs should agree with the validation checklist: least banned
    to most banned.
  - Suggested fix: update stale docs/phase notes to remove the old order.
  - Suggested tests: keep result-engine test asserting least-to-most order; add a doc
    consistency grep/test if desired.

## Low

- [ ] CR-033 - Saved ballot edit flow is functional but awkward on mobile.
  - Severity: Low.
  - Files: `src/app/vote/BallotFlow.tsx:491`,
    `src/app/vote/BallotFlow.tsx:520`, `src/app/vote/BallotFlow.tsx:561`.
  - Current behavior: after save, `Change vote` drops the user into review. Editing
    Set 1 requires Change vote -> review -> Back -> Set 2 -> Back -> Set 1.
  - Expected behavior: checklist requires saved choices/timestamp and `Change vote`;
    the flow should still be ergonomic.
  - Suggested fix: add `Edit S16` / `Edit S17` actions in saved and review screens,
    and keep live timer/status visible while editing.
  - Suggested tests: mobile QA for submitted ballot edit; change each set, resubmit,
    and verify timestamp/revision updates.

- [ ] CR-034 - Legacy `ChartSetPanel` still encodes a non-checklist 2/4-column layout.
  - Severity: Low.
  - Files: `src/components/ChartSetPanel.tsx:24`, `src/components/index.ts:3`.
  - Current behavior: `ChartSetPanel` is exported and uses `grid-cols-2` /
    `md:grid-cols-4`. It does not appear to be used by current stage or phone routes.
  - Expected behavior: stage uses two horizontal rows of 7 charts; phone uses two
    columns with the 7th centered.
  - Suggested fix: remove unused legacy component or rename/comment it so it is not
    reused for stage/phone layouts by accident.
  - Suggested tests: grep/test preventing `ChartSetPanel` from being imported into
    `/stage`, `/vote`, or `/charts` unless intentionally redesigned.

- [ ] CR-035 - Debug/release docs should record final e2e retry result.
  - Severity: Low.
  - Files: `docs/phase-status.md`, `docs/release-checklist.md`.
  - Current behavior: this review observed an initial e2e port conflict followed by
    a successful retry. Some subagent notes observed other e2e instability.
  - Expected behavior: release docs should preserve the exact final gate evidence
    and any remaining risk.
  - Suggested fix: after addressing e2e harness reliability, record the clean final
    gate run and note whether the transient failure has been eliminated.
  - Suggested tests: run final gates from a clean shell with no prior dev server.
