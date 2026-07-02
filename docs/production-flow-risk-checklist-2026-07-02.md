# Production Flow Risk Checklist - 2026-07-02

This checklist captures the full-app production-readiness review requested on 2026-07-02 for the
Pump It Up Open Stage tournament app. It is an issue catalog for brittle or potentially breaking
logic, admin workflows, public UX, data exports, and rehearsal automation design.

Primary sources of truth:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/codex-execution-plan.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

Review method:

- First pass: core tournament logic, admin/security, public UX, data/export, and rehearsal/load
  architecture review.
- Second pass: independent gap review against the first-pass list and direct comparison against the
  product spec and repo validation checklist.
- Scope: potential breaking points and brittle UX/test paths. Items remain unchecked until fixed,
  verified, or explicitly accepted as event-day risk.

Explicit validation note:

- No automated checks were run for this documentation-only update.
- Playwright was intentionally not run as part of this work.
- This checklist intentionally does not require running Playwright in any checklist item. Where the
  app needs future evidence, the item describes the product behavior to prove and allows manual,
  unit, integration, SQL, or future automation evidence outside this doc update.

## Blocking / Must Fix Before Production

- [ ] **Blocking: Production persistence uses incompatible locking paths for ballots, results, and
  snapshot-style admin mutations.**
  - Area: Supabase persistence, voting, result computation.
  - References: `src/app/vote/actions.ts:145`, `src/app/coolguy69/actions.ts:886`,
    `src/lib/server/normalized-operational-state.ts:271`,
    `src/lib/server/normalized-operational-state.ts:293`,
    `supabase/migrations/20260701010000_production_readiness_transactions.sql:236`,
    `supabase/migrations/20260701010000_production_readiness_transactions.sql:592`.
  - Current risk: player ballot submission and result computation use normalized SQL RPCs, while
    many admin mutations still hydrate, mutate memory stores, and persist snapshots. The SQL ballot
    RPC is not coordinated with the same event persistence lock as snapshot saves. A valid ballot can
    be accepted but omitted from result computation, or snapshot persistence can overwrite newer
    normalized state.
  - Expected behavior: one authoritative server/database path should deterministically include or
    reject every ballot at close/compute time, with no stale snapshot overwrites.
  - Evidence needed: concurrent Supabase integration evidence where a player submits while an admin
    computes results and while a separate admin snapshot mutation persists; final ballot table,
    result snapshot, public result, and private CSV must agree.

- [ ] **Blocking: Supabase host-lock persistence is not compare-and-swap protected.**
  - Area: admin host lock, multi-instance production safety.
  - References: `src/lib/server/normalized-operational-state.ts:289`,
    `src/lib/server/normalized-operational-state.ts:548`, `src/app/coolguy69/actions.ts:264`,
    `src/lib/admin/host-lock.ts:64`.
  - Current risk: stale heartbeat or release writes can upsert an older host-lock snapshot after a
    newer takeover. In a multi-instance deployment, two hosts can believe they control the event or a
    current host can be overwritten by a stale tab.
  - Expected behavior: refresh, takeover, and release should update only when the current database
    lock still matches the caller session/token and should fail loudly otherwise.
  - Evidence needed: two-session Supabase evidence where session B takes over after expiry and a
    delayed session A heartbeat/release cannot reclaim or clear host control.

- [ ] **Blocking: Hosted rehearsal design is not production-like enough to prove event safety.**
  - Area: rehearsal orchestration, hosted Phase 9 coverage.
  - References: `scripts/run-playwright.mjs:83`, `playwright.env.ts:95`,
    `playwright.env.ts:96`, `playwright.env.ts:97`,
    `tests/phase9/pages/admin.page.ts:191`, `tests/phase9/pages/admin.page.ts:237`,
    `tests/phase9/pages/admin.page.ts:441`.
  - Current risk: phase/load configs default to `next dev` and skip build, e2e disables admin
    session heartbeat, host heartbeat, and vote live polling, and hosted helpers directly seed or
    mutate Supabase state for rehearsal steps. A rehearsal can pass without exercising the production
    admin server actions and browser polling/heartbeat behavior that will run during the tournament.
  - Expected behavior: the main production rehearsal design should use a production build,
    production-like env flags, real admin actions, real host lock behavior, and real public route
    refresh behavior.
  - Evidence needed: documented rehearsal evidence from a production-build, Supabase-backed flow
    without disabled heartbeats/polling and without direct fixture writes except disposable event
    setup/teardown. Playwright execution is explicitly not part of this checklist update.

- [ ] **Blocking: The default e2e gate command appears misaligned with production backend
  requirements.**
  - Area: release gates, command ergonomics.
  - References: `package.json`, `scripts/run-playwright.mjs:75`,
    `scripts/run-playwright.mjs:83`, `playwright.env.ts:94`.
  - Current risk: `npm run test:e2e` defaults to `serverMode=start` and `backend=memory`. The
    production app rejects that combination with `TOURNAMENT_STATE_BACKEND=supabase is required in
    production`, so release operators can encounter route rendering failures before the flow begins.
  - Expected behavior: release commands should have explicit names for supported memory/dev and
    production/Supabase modes, with no hidden env combinations required for meaningful evidence.
  - Evidence needed: command/runbook review proving each release gate has the expected backend,
    server mode, env vars, and acceptance evidence. Do not run Playwright for this doc-only item.

- [ ] **Blocking: Load rehearsal design is below expected scale and bypasses the real player UI.**
  - Area: load rehearsal, player flow.
  - References: `tests/load/load-rehearsal.spec.ts:25`,
    `tests/load/load-rehearsal.spec.ts:102`, `src/app/api/e2e/load-ballot/route.ts:192`.
  - Current risk: the load test uses 50 players and a synthetic `/api/e2e/load-ballot` route. It
    does not prove the app can handle the validation checklist's 100-plus eligible players, phones,
    spectators, route polling, roster selection, duplicate username behavior, or real form submits.
  - Expected behavior: load evidence should cover 100-plus eligible players and spectator traffic
    using production-like player routes, with the test-only route reserved for focused load
    injection.
  - Evidence needed: load-design update and future evidence plan that separates API injection from
    actual player-route behavior. Playwright execution is excluded from this checklist.

## High Priority App Logic

- [ ] **High: Current-round changes can move all public routes mid-round without dangerous-action
  confirmation or a state guard.**
  - Area: admin round control, public routes.
  - References: `src/app/coolguy69/page.tsx:273`, `src/app/coolguy69/actions.ts:1008`,
    `src/app/coolguy69/actions.ts:1028`, `src/app/stage/page.tsx:113`,
    `src/app/vote/page.tsx:19`.
  - Current risk: `Set Current Round` and `Advance Round` require host control only. Public
    `/stage`, `/vote`, `/charts`, and `/results` immediately follow the new current round even if
    voting or reveal is in progress.
  - Expected behavior: round changes during voting/reveal should be blocked until the round is
    complete or treated as a dangerous recovery action with password re-entry, a clear summary, and
    explicit public-state consequences.
  - Evidence needed: state-machine evidence that round changes are blocked or dangerous-confirmed
    and that public routes do not silently jump during an active round.

- [ ] **High: Mutable current-round routing can split public screens or hide just-finished results.**
  - Area: public route consistency.
  - References: `src/app/stage/page.tsx:113`, `src/app/vote/page.tsx:19`,
    `src/app/vote/page.tsx:107`, `src/app/charts/page.tsx:64`,
    `src/app/results/page.tsx:87`, `src/app/coolguy69/actions.ts:1008`.
  - Current risk: public routes all read global `currentRound`, while already-mounted active vote
    clients keep polling/submitting the `roundNumber` prop they loaded with. An accidental round
    change can put `/stage`, `/charts`, and new `/vote` visitors on one round while existing voters
    remain on another. After a normal advance, `/results` also stops being an addressable view of the
    just-revealed round.
  - Expected behavior: all public surfaces should either remain pinned to the active live round or
    provide explicit previous-round result access after advancement.
  - Evidence needed: route-state matrix showing what each public route displays before, during, and
    after round advancement.

- [ ] **High: Rehearsal reset controls are visible in the production admin UX and lack a deployment
  guard.**
  - Area: admin UX, event-day safety.
  - References: `src/app/coolguy69/page.tsx:303`, `src/app/coolguy69/actions.ts:1046`,
    `src/app/coolguy69/actions.ts:1077`, `src/app/coolguy69/actions.ts:1100`.
  - Current risk: `Start rehearsal mode` and reset/seed rehearsal actions are shown inside Event
    Mode to any active host. They require password/reason, but they reset operational tournament
    state and seed rehearsal data, making them dangerous to expose during a live tournament.
  - Expected behavior: rehearsal reset/seed controls should be hidden or disabled unless an explicit
    rehearsal/test environment or disposable event context is active.
  - Evidence needed: server-side deployment guard and admin UX evidence showing these actions are
    unavailable in production/event mode.

- [ ] **High: Current-round eligibility can change after results are computed or reveal has started.**
  - Area: emergency eligibility, results integrity.
  - References: `src/app/coolguy69/actions.ts:494`, `src/lib/vote/voting-window.ts:356`,
    `src/app/coolguy69/actions.ts:794`.
  - Current risk: emergency add can update the active voting snapshot until `results_revealed` or
    `round_complete`. It can add a player after `results_computed` or `results_revealing`, while
    manual ballot entry is blocked after reveal starts and existing results may not be invalidated.
  - Expected behavior: emergency eligibility changes after close/compute should either be blocked or
    force a clear recompute/reset workflow before any reveal continues.
  - Evidence needed: state-machine evidence that adding an inactive player after compute/reveal is
    blocked or invalidates computed results with a required recompute.

- [ ] **High: Emergency current-round eligibility does not recalculate all-submitted final-warning
  timing.**
  - Area: voting timer, emergency add.
  - References: `src/lib/vote/voting-window.ts:356`.
  - Current risk: adding a newly eligible player after the all-submitted final 30-second state has
    been triggered updates the eligible pool but does not obviously recalculate deadline/status
    semantics for the new turnout state.
  - Expected behavior: adding a player to an open voting window should recompute timer state and
    turnout-derived final-warning behavior consistently.
  - Evidence needed: focused timer/state evidence for "all submitted, final warning active,
    emergency add" behavior.

- [ ] **High: Voting-admin partial hydration can advance deadlines with an empty ballot store.**
  - Area: Supabase voting admin state.
  - References: `src/lib/server/normalized-operational-state.ts:263`,
    `src/app/coolguy69/actions.ts:718`, `src/lib/server/voting-round.ts:38`.
  - Current risk: `loadVotingAdminState()` excludes ballot tables, but pause/close paths still call
    ballot-derived deadline logic. In Supabase mode, deadline or turnout logic can be calculated
    from an incomplete in-memory view of current ballots.
  - Expected behavior: admin timer transitions should use authoritative Supabase ballot/eligibility
    state or a transaction-safe summary, not a partially hydrated local store.
  - Evidence needed: partial-load integration evidence with existing DB ballots and admin
    pause/close actions.

- [ ] **High: Post-close manual ballots and emergency reopens after computed results are snapshot
  rewrites, not one database transaction.**
  - Area: manual ballots, reopen, result invalidation.
  - References: `src/app/coolguy69/actions.ts:777`, `src/app/coolguy69/actions.ts:848`,
    `src/app/coolguy69/actions.ts:875`, `src/app/coolguy69/actions.ts:1190`,
    `src/app/coolguy69/actions.ts:1207`, `src/app/coolguy69/actions.ts:1234`.
  - Current risk: manual override clears computed results and persists a full snapshot; emergency
    reopen does the same. Because Supabase result computation is RPC-backed, these actions can race
    with compute/reveal and rewrite ballots/results outside the same row lock.
  - Expected behavior: post-close manual corrections and reopens should run through one
    server/database transaction that invalidates/recomputes results atomically.
  - Evidence needed: integration evidence for manual-ballot-after-compute and reopen-after-compute
    interleavings.

- [ ] **High: Result counting trusts stored ballots instead of filtering by the authoritative
  eligibility snapshot.**
  - Area: result engine, SQL result computation.
  - References: `src/lib/results/result-engine.ts:87`,
    `supabase/migrations/20260701010000_production_readiness_transactions.sql:695`,
    `supabase/migrations/20260701010000_production_readiness_transactions.sql:707`.
  - Current risk: memory and SQL result paths count submitted ballots passed to the engine/table
    without rejoining every counted ballot to the round eligibility snapshot. Stale, corrupt,
    manually inserted, or formerly eligible ballots could influence selected charts.
  - Expected behavior: only ballots from the round's authoritative eligible-player snapshot should
    count toward ban totals.
  - Evidence needed: compute evidence with an injected non-eligible submitted ballot showing it is
    excluded from counts and CSV context.

- [ ] **High: Player history lock is not clearly set after ballot submission.**
  - Area: roster identity, audit safety.
  - References: `src/lib/admin/roster.ts:91`, `src/app/vote/actions.ts:145`,
    `supabase/migrations/20260701010000_production_readiness_transactions.sql:391`.
  - Current risk: username edits are blocked only when `hasTournamentHistory` is true, but player
    ballot submission and manual ballot submission do not appear to set that flag. An admin may be
    able to rename a player after voting history exists.
  - Expected behavior: once a player has a ballot/manual ballot/tournament history, start.gg
    username edits should be blocked except through an explicit correction workflow.
  - Evidence needed: submit player and manual ballots, then prove username edits fail and Supabase
    `players.has_tournament_history` is true.

- [ ] **High: Earlier-round result overrides can invalidate future selected-song constraints.**
  - Area: result override, draw constraints.
  - References: `src/app/coolguy69/actions.ts:1262`,
    `src/lib/results/selected-song-blocks.ts:5`, `src/lib/draw/draw-state.ts:331`.
  - Current risk: overriding a selected chart in an earlier round refreshes selected-song blocks but
    does not check later active draws/results for the newly selected song or invalidate affected
    future state.
  - Expected behavior: correcting an earlier result after later rounds exist should either be blocked
    or require a workflow that resets/invalidates affected later draws/results so selected songs do
    not repeat across rounds.
  - Evidence needed: cross-round override evidence where a newly selected earlier song already
    appears in later round state.

- [ ] **High: The normalized transaction facade lists core RPCs that migrations still disable.**
  - Area: Supabase transaction coverage.
  - References: `src/lib/server/transactions/normalized-runtime.ts:83`,
    `supabase/migrations/20260630010000_phase1_rpc_lockdown_and_draw_guards.sql:55`.
  - Current risk: the runtime schema names host-lock, voting-window, reveal, reset, and manual-ballot
    mutations, while migrations disable many of those functions. Later migrations implement
    submit/compute and draw replacement, not the full listed surface. This creates a false
    production-readiness signal and leaves several tournament-changing paths on snapshot
    persistence.
  - Expected behavior: transaction facade, migrations, and admin actions should agree on which
    tournament-changing paths are database-transactional.
  - Evidence needed: schema/migration audit confirming every production mutation has an implemented,
    deployed transaction or is explicitly documented as snapshot-only risk.

- [ ] **High: One production test flag weakens admin/host cookie transport and public URL guards.**
  - Area: security configuration.
  - References: `src/lib/server/admin-auth.ts:23`, `src/lib/public-url.ts:42`.
  - Current risk: `TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL=true` makes admin cookies non-`Secure` in
    production and relaxes production localhost/public URL validation. A mistaken deployment env can
    silently degrade admin-session handling.
  - Expected behavior: test-only flags should fail closed or be impossible in production deployment
    contexts.
  - Evidence needed: environment validation evidence that this flag cannot be enabled for the real
    event deployment.

- [ ] **High: Private CSV download is admin-session gated but not host-lock gated.**
  - Area: admin permissions, data export.
  - References: `src/app/coolguy69/actions.ts:966`, `src/app/coolguy69/page.tsx:724`.
  - Current risk: any valid admin session can request the private CSV after final reveal, even if it
    is not the active host. This may conflict with the product requirement that the final CSV is
    saved to the host computer.
  - Expected behavior: decide explicitly whether read-only admins may export private player data. If
    the host is the only intended exporter, require active host lock.
  - Evidence needed: permission policy and two-admin-session evidence for allowed/denied export.

## High Priority Browser/Rehearsal Design Gaps

- [ ] **High: Timer rules are not fully covered by the current browser-rehearsal design.**
  - Area: voting window, rehearsal coverage.
  - References: `src/lib/vote/voting-window.ts`, `tests/phase9/flows/rehearsal.flow.ts`,
    `tests/phase9/flows/voting-window.flow.ts`.
  - Current risk: the 10-minute window, 75-percent one-minute extension, all-submitted final 30
    seconds, edit allowance during final warning, pause/resume, manual close, and emergency reopen
    are not all exercised through production-like browser flows.
  - Expected behavior: every deadline transition should have deterministic evidence in both memory
    and Supabase paths.
  - Evidence needed: coverage plan or non-Playwright evidence matrix for below-75-percent extension,
    at/above-75 close, all-submitted final warning with edit, pause/resume, manual close, and reopen.

- [ ] **High: Critical negative ballot cases are not fully rehearsed.**
  - Area: player vote validation.
  - References: `src/lib/vote/ballot.ts`, `src/app/vote/BallotFlow.tsx`,
    `tests/e2e/full-flow.spec.ts`.
  - Current risk: tests do not comprehensively prove the UI and server reject opening voting before
    both sets are drawn, incomplete ballots, vague skip states, third bans, wrong draw IDs, stale
    chart IDs, and invalid no-bans-plus-bans combinations.
  - Expected behavior: invalid player submissions should be blocked client-side where possible and
    rejected server-side authoritatively.
  - Evidence needed: validation matrix for each invalid ballot shape, with server-side coverage as
    the minimum evidence.

- [ ] **High: Same-username, latest-valid-ballot, and failed-edit preservation need full coverage.**
  - Area: player identity, duplicate device handling, ballot revisions.
  - References: `src/app/vote/BallotFlow.tsx`, `src/lib/vote/ballot-store.ts`.
  - Current risk: duplicate active username and already-submitted warning paths are partially tested,
    but the full two-device latest-wins behavior and failed-edit rollback behavior are not proven.
  - Expected behavior: duplicate active usernames should be blocked or warned clearly, the latest
    valid revision should win, and a failed edit must preserve the previous server-confirmed ballot.
  - Evidence needed: two-session identity evidence showing revision ordering and failed-edit
    preservation.

- [ ] **High: Anti-spoiler and live-count privacy are under-tested across public routes.**
  - Area: `/vote`, `/stage`, `/charts`, `/results`.
  - References: `src/app/stage/page.tsx`, `src/app/charts/page.tsx`,
    `src/app/results/page.tsx`, `src/components/PublicResultSummary.tsx`.
  - Current risk: public pages should not reveal chart-by-chart counts or selected charts before the
    appropriate reveal phases. Existing coverage focuses on happy-path visibility and does not
    exhaustively assert absence of spoilers.
  - Expected behavior: before final reveal, public routes should expose only allowed player/status
    information and no selected chart/count spoilers.
  - Evidence needed: state-by-state public route evidence for pre-draw, voting, closed,
    results-computed, each tiebreak phase, and final reveal.

- [ ] **High: Tiebreak edge cases are not fully rehearsed through browser-visible states.**
  - Area: result reveal, stage UX.
  - References: `src/lib/results/result-engine.ts`, `src/components/ResultSetPanel.tsx`,
    `src/components/StageSetPanel.tsx`.
  - Current risk: the 5-second rune-wheel behavior is not comprehensively covered for 2-, 3-, 4-,
    and 5-plus-way ties, zero-ballot ties, non-minimum ties, alphabetized reveal order, and
    minimum-only tied candidates.
  - Expected behavior: the wheel should show only least-banned tied candidates, hide the selected
    winner until the 5-second reveal completes, and handle all tie cardinalities deterministically in
    test mode.
  - Evidence needed: controlled ballot/result fixtures for each tie shape and a state log showing
    wheel candidates, hidden winner state, duration, final selected chart, and final two-chart
    reveal.

- [ ] **High: Admin roster, manual ballot, dangerous action, and audit workflows lack full coverage.**
  - Area: admin UX, operations.
  - References: `src/app/coolguy69/page.tsx`, `src/app/coolguy69/actions.ts`.
  - Current risk: inactive/reactivate, active-round snapshot behavior, emergency current-round add,
    manual overwrite, reset, reroll, reopen, result override, password re-entry, clear action
    summaries, and audit rows are not all verified through real admin UI.
  - Expected behavior: every tournament-changing admin action should require the documented
    authority, password where dangerous, reason/summary where required, and should leave an audit
    trail.
  - Evidence needed: admin action matrix with allowed, rejected, and audited outcomes.

## Medium Priority App And UX Issues

- [ ] **Medium: First-time save failure message falsely says a previous server-confirmed ballot
  remains valid.**
  - Area: player vote UX.
  - References: `src/app/vote/BallotFlow.tsx:172`, `src/app/vote/BallotFlow.tsx:486`.
  - Current risk: `saveFailureMessage` always appends "Previous server-confirmed ballot remains
    valid." even when the player has no existing ballot. A first-submit failure can mislead a player
    into thinking their vote was saved.
  - Expected behavior: the reassurance should appear only when an existing server-confirmed ballot
    exists.
  - Evidence needed: first-submit failure and failed-edit evidence with distinct copy.

- [ ] **Medium: Player cannot clearly change selected username after confirmation but before first
  submit.**
  - Area: player identity UX.
  - References: `src/app/vote/BallotFlow.tsx`.
  - Current risk: after confirming "Are you sure you are voting as [start.gg username]?", there is no
    obvious in-flow "change username" path before the first submission. A player who picked the wrong
    name may need to reload or use indirect browser behavior.
  - Expected behavior: before a ballot is submitted, the player should have an explicit way to back
    out and choose the correct start.gg username.
  - Evidence needed: UI review showing a clear pre-submit identity correction path.

- [ ] **Medium: Pause can discard an in-progress first-time ballot instead of freezing it.**
  - Area: pause/resume player UX.
  - References: `docs/product-spec.md:187`, `src/app/vote/BallotFlow.tsx:197`,
    `src/app/vote/BallotFlow.tsx:380`, `src/app/vote/page.tsx:27`.
  - Current risk: active ballot choices live only in component state. When polling sees
    `canSubmit=false`, it refreshes into the separate pause page and unmounts the ballot flow. If the
    host pauses while a player is midway through an unsaved first ballot, resume can force them to
    restart instead of preserving the frozen edit state.
  - Expected behavior: pause/resume should preserve in-progress ballot choices where the product
    promises voting can resume after a pause.
  - Evidence needed: pause/resume UI evidence showing unsaved choices survive or a product decision
    accepting that unsaved choices are discarded with clear copy.

- [ ] **Medium: Active duplicate-device warning appears only after confirmation/presence claim and is
  not fully rehearsed.**
  - Area: duplicate active username UX.
  - References: `src/app/vote/BallotFlow.tsx`.
  - Current risk: the warning for another active device is delayed until the player confirms and
    claims presence. Coverage mainly covers already-submitted ballot warning, not the active
    duplicate warning timing and wording.
  - Expected behavior: duplicate active username risk should be surfaced clearly before a player
    invests time completing a ballot on the wrong device.
  - Evidence needed: two-device UX evidence for active duplicate warning timing and wording.

- [ ] **Medium: Post-vote reroll invalidation lacks player-facing recovery copy.**
  - Area: reroll recovery UX.
  - References: `docs/pump_open_stage_repo_validation_checklist.md:288`,
    `src/app/coolguy69/actions.ts:167`, `src/app/vote/page.tsx:88`,
    `src/app/charts/page.tsx:54`.
  - Current risk: a dangerous reroll after voting starts invalidates ballots and resets the voting
    window, but public pages fall back to generic "waiting/open" copy. Players with previously saved
    ballots may not be told clearly that their ballot was invalidated and they need to vote again.
  - Expected behavior: recovery/reroll paths should present clear player-facing copy when prior
    ballots are invalidated.
  - Evidence needed: copy review and reroll-state evidence across `/vote` and `/charts`.

- [ ] **Medium: Public polling cadence may exceed the light-polling production target.**
  - Area: route polling, Supabase load.
  - References: `docs/product-spec.md:348`, `docs/pump_open_stage_repo_validation_checklist.md:679`,
    `src/app/vote/BallotFlow.tsx:396`, `src/app/vote/actions.ts:79`,
    `src/app/stage/StageAutoRefresh.tsx:6`, `src/app/charts/ChartsAutoRefresh.tsx:6`,
    `src/app/results/ResultsAutoRefresh.tsx:6`.
  - Current risk: active voters call live state every 1.5 seconds, and public route refreshes run
    every 2 seconds. At 100 players plus spectators, that can become a high steady request rate
    against server hydration/Supabase state during the voting peak.
  - Expected behavior: polling cadence should match the product's light-polling target and be backed
    by request-rate/load evidence.
  - Evidence needed: request-rate estimate or load evidence for 100 players plus spectators.

- [ ] **Medium: Stage card readability may be brittle on common projector sizes.**
  - Area: `/stage` projector UX.
  - References: `src/components/StageDrawCard.tsx`, `src/components/StageSetPanel.tsx`.
  - Current risk: two rows of seven cards are correct, but dense chart names, artists, jackets, and
    status labels may become cramped at 1280x720 or 1366x768.
  - Expected behavior: the stage must remain readable from a tournament venue projector at common
    resolutions.
  - Evidence needed: screenshot or manual projector review at 1280x720, 1366x768, 1920x1080, and a
    narrow fallback. This checklist does not require Playwright for that review.

- [ ] **Medium: The projector QR is a live link that can navigate the stage away from `/stage`.**
  - Area: projector safety.
  - References: `docs/pump_open_stage_repo_validation_checklist.md:308`,
    `src/app/stage/page.tsx:238`, `src/components/QRPanel.tsx:61`.
  - Current risk: the QR panel wraps the QR image in a `Link` to `/room`. Scanning does not require a
    clickable QR on the projector, and an accidental click/tap on the stage laptop can replace the
    live stage display with the room landing page mid-round.
  - Expected behavior: projector surfaces should avoid accidental navigation away from the live stage
    display.
  - Evidence needed: UI decision to remove the link, make it non-interactive on stage, or otherwise
    prevent accidental navigation.

- [ ] **Medium: Final/public auto-refresh can disturb expanded details, scroll, or focus.**
  - Area: `/vote`, `/charts`, `/results` UX.
  - References: `src/app/vote/_components/VoteAutoRefresh.tsx`,
    `src/app/charts/_components/ChartsAutoRefresh.tsx`,
    `src/app/results/_components/ResultsAutoRefresh.tsx`.
  - Current risk: pages keep refreshing after final states. This can collapse expanded `<details>`,
    reset scroll, or steal focus while admins or spectators inspect final counts.
  - Expected behavior: auto-refresh should stop or slow once state is final, or preserve user
    inspection state.
  - Evidence needed: final-state UX evidence showing details, scroll, and focus remain stable.

## Medium Priority Data, Export, And Asset Issues

- [ ] **Medium: Private CSV is spreadsheet-formula injectable.**
  - Area: private export security.
  - References: `src/lib/results/private-csv.ts:47`, `src/lib/results/private-csv.ts:96`,
    `src/lib/admin/roster.ts:25`.
  - Current risk: usernames and chart names are escaped for CSV syntax, but not neutralized for
    Excel/Sheets formula execution.
  - Expected behavior: exported user/chart-provided cells should be neutralized for spreadsheet
    formula execution or the export should document that it is not safe to open directly in
    spreadsheets.
  - Evidence needed: CSV fixture with leading `=`, `+`, `-`, and `@` values showing neutralized
    output.

- [ ] **Medium: Private CSV marks every row as active at round start.**
  - Area: private export accuracy.
  - References: `src/lib/results/private-csv.ts:97`,
    `src/lib/server/normalized-operational-state.ts`.
  - Current risk: `player_active_at_round_start` is always exported as `true`, even for emergency
    current-round additions that were not active at the original round snapshot.
  - Expected behavior: the CSV should distinguish original active players from emergency-added
    eligible players if the column exists.
  - Evidence needed: emergency-add export evidence showing correct active-at-round-start values.

- [ ] **Medium: Private CSV cannot distinguish original submission time from latest revision time.**
  - Area: audit export, ballot revisions.
  - References: `src/lib/vote/ballot.ts:17`, `src/lib/vote/ballot-store.ts:68`,
    `src/lib/results/private-csv.ts:99`, `src/lib/results/private-csv.ts:100`,
    `src/lib/server/normalized-operational-state.ts:1010`,
    `src/lib/server/normalized-operational-state.ts:1011`,
    `src/lib/server/normalized-operational-state.ts:1296`,
    `src/lib/results/private-csv.test.ts:139`.
  - Current risk: ballot edits increment `revision`, but `submittedAt` is overwritten on each edit.
    The CSV writes both `submitted_at` and `last_revision_at` from the same value, and normalized
    persistence hydrates only `submitted_at`.
  - Expected behavior: private export should preserve original submission time and latest
    revision/manual override time separately.
  - Evidence needed: submit-at-`t1`, edit-at-`t2` export evidence where `ballot_revision === 2`,
    `submitted_at === t1`, and `last_revision_at === t2`.

- [ ] **Medium: Private CSV chart identity can be ambiguous for duplicate/remix names.**
  - Area: private export accuracy.
  - References: `src/lib/results/private-csv.ts:83`.
  - Current risk: banned chart columns primarily contain chart names, which can be ambiguous if the
    chart catalog contains duplicate names, remixes, or same-song variants.
  - Expected behavior: export should include stable chart IDs and/or display difficulty alongside
    names for every selected and banned chart.
  - Evidence needed: duplicate-name fixture evidence showing exported rows remain unambiguous.

- [ ] **Medium: Private CSV export is not host-only, audited, or collision-resistant.**
  - Area: private export operations.
  - References: `docs/product-spec.md:315`, `src/app/coolguy69/actions.ts:966`,
    `src/app/coolguy69/actions.ts:976`.
  - Current risk: any admin session can export private player data, export itself is not audited,
    and `round-N-private-ballots.csv` can overwrite or confuse repeated rehearsal, correction, or
    event exports.
  - Expected behavior: export policy should state who can export, every export should be audited if
    private-data access must be tracked, and filenames should uniquely identify event/round/time.
  - Evidence needed: permission/audit/filename policy and implementation evidence.

- [ ] **Medium: Chart CSV normalization is too permissive for level values.**
  - Area: chart import, data validation.
  - References: `src/lib/charts/normalize.ts:19`, `src/lib/charts/importer.ts`.
  - Current risk: `Number.parseInt` accepts values such as `16x` as `16`, and importer repair logic
    is relaxed. Bad source data can silently enter a tournament pool.
  - Expected behavior: chart levels should be strict positive integers matching the required
    S16-S22/D23 pools.
  - Evidence needed: import fixtures for `16x`, ` 16 `, empty level, decimal level, and wrong
    type/level combinations.

- [ ] **Medium: CSV import can silently repair or skip malformed event data.**
  - Area: chart import, data integrity.
  - References: `docs/data-audit.md:50`, `src/lib/charts/importer.ts:16`,
    `src/lib/charts/importer.ts:159`, `scripts/import-charts.ts:91`.
  - Current risk: pool counts can pass while repaired/skipped rows change song keys, duplicate
    handling, exclusions, and draw eligibility.
  - Expected behavior: final event imports should fail loudly on malformed required rows unless the
    repair is explicitly reviewed and recorded.
  - Evidence needed: strict import mode or signed import report for the exact event CSV.

- [ ] **Medium: Release docs do not freeze the exact event chart/artifact set.**
  - Area: release process, chart assets.
  - References: `docs/release-checklist.md:50`, `.gitignore:28`, `scripts/import-charts.ts:72`,
    `docs/release-checklist.md:114`.
  - Current risk: final rehearsal could use one CSV/cache state, while event day uses another, with
    no recorded CSV checksum, row count, import report hash, or cache manifest identity.
  - Expected behavior: release evidence should freeze the exact chart CSV, import report, image
    cache manifest, and deployed commit.
  - Evidence needed: checksum/manifest section in the release checklist.

- [ ] **Medium: Runtime image evidence and runtime image source can diverge.**
  - Area: chart images, deployment assets.
  - References: `scripts/verify-real-chart-images.ts:25`, `src/lib/charts/runtime-catalog.ts:60`,
    `src/lib/charts/runtime-catalog.ts:67`.
  - Current risk: verification depends on ignored generated JSON, while production can fall back to
    raw CSV plus deterministic public cache paths. Evidence can pass without proving the exact
    deployed runtime behavior.
  - Expected behavior: image verification should validate the same source of truth and paths used by
    the deployed app.
  - Evidence needed: release check tied to the exact deployed runtime catalog and public cache files.

- [ ] **Medium: Tournament logo asset readiness is treated as visual-only.**
  - Area: asset performance.
  - References: `docs/asset-audit.md:7`, `docs/asset-audit.md:15`,
    `src/components/TournamentLogo.tsx:19`, `docs/release-checklist.md:57`.
  - Current risk: the source logo is large; "renders" does not prove phone/stage performance or image
    optimization safety for free-tier event use.
  - Expected behavior: logo asset readiness should include size/performance evidence for phone and
    projector routes.
  - Evidence needed: optimized asset size target and route performance evidence for the logo.

## Lower Priority / Operational Hardening

- [ ] **Low: Non-host release-host action can create misleading audit history.**
  - Area: admin host lock.
  - References: `src/app/coolguy69/actions.ts:279`, `src/lib/admin/host-lock.ts:105`.
  - Current risk: a non-host release attempt clears the caller cookie and can audit a release even if
    the store no-ops because the caller did not hold the active lock.
  - Expected behavior: release should require the active host or record a clearly failed/no-op audit
    event.
  - Evidence needed: two-admin-session host release evidence with unambiguous audit rows.

- [ ] **Low: Some admin actions still parse critical scalars by hand instead of shared mutation
  contracts.**
  - Area: admin action validation.
  - References: `src/app/coolguy69/actions.ts`.
  - Current risk: duplicated scalar parsing can drift between UI forms, server actions, and tests.
  - Expected behavior: dangerous or tournament-changing actions should use shared validation
    contracts where practical.
  - Evidence needed: mutation contract coverage for every admin server action input.

- [ ] **Low: Private CSV auto-download may be blocked by browsers.**
  - Area: admin export UX.
  - References: `src/app/coolguy69/_components/PrivateCsvDownload.tsx`.
  - Current risk: auto-download triggered from `useEffect` may be blocked or ignored by some browser
    policies because it is not directly tied to the user's click. A manual fallback exists, but the
    event-day path should be verified.
  - Expected behavior: the CSV should reliably download in the browser that will be used by the host.
  - Evidence needed: manual target-browser evidence that the file appears with expected content.

- [ ] **Low: Chart exclusion audit can lose clarity if source CSV later removes or renames a chart.**
  - Area: chart exclusions, audit.
  - References: `src/app/coolguy69/actions.ts`, `src/lib/server/normalized-operational-state.ts`.
  - Current risk: exclusions are tied to chart keys and current chart metadata. If source data later
    changes, an old exclusion may become harder to interpret.
  - Expected behavior: audit records for exclusions should preserve enough display metadata to
    explain what was excluded even after data changes.
  - Evidence needed: exclusion audit evidence after fixture catalog rename/removal.

- [ ] **Low: Rehearsal reset UI copy understates persistence risk.**
  - Area: admin UX copy.
  - References: `src/app/coolguy69/page.tsx:268`, `src/app/coolguy69/page.tsx:303`,
    `src/app/coolguy69/actions.ts:1052`, `docs/deployment-readiness.md:116`.
  - Current risk: admin copy says disposable in-memory data, but deployed/event mode is
    Supabase-backed; a reset can affect persistent event-namespaced data.
  - Expected behavior: reset copy should accurately describe whether state is memory-only or
    persistent for the current deployment/backend.
  - Evidence needed: admin copy review across memory and Supabase modes.

- [ ] **Low: Release checklist mixes stale checked evidence with current unchecked gates.**
  - Area: release docs.
  - References: `docs/release-checklist.md:5`, `docs/release-checklist.md:99`,
    `docs/deployment-readiness.md:78`.
  - Current risk: historical Phase 8/9 evidence can look production-ready even when current final
    checks and remediation gates remain unchecked.
  - Expected behavior: release docs should separate historical evidence from current release-blocking
    gates and require dates/commit IDs for completed items.
  - Evidence needed: release checklist cleanup with dates, commit IDs, and current status.

## Production Readiness Evidence Checklist

This section converts the risks above into non-Playwright acceptance evidence. Playwright execution
is intentionally excluded from this checklist.

- [ ] Production-build, Supabase-backed full-flow evidence exists with production-like heartbeat,
  host-lock, polling, and admin action behavior.
- [ ] All four rounds have evidence for draw both sets, open voting, submit/edit ballots,
  close/compute, tiebreak reveal, and final two-chart reveal.
- [ ] `/stage`, `/room`, `/vote`, `/charts`, `/results`, and `/coolguy69` have state-transition
  evidence for every major round state.
- [ ] `/stage` evidence shows exactly two set rows of seven cards and QR target `/room`.
- [ ] Player dropdown label evidence shows exactly `Select your start.gg username`.
- [ ] Player confirmation evidence shows exactly
  `Are you sure you are voting as [start.gg username]?`.
- [ ] Duplicate active usernames cannot vote silently from multiple devices.
- [ ] Each set requires either 1-2 bans or explicit `No bans for this set`.
- [ ] A player can edit before close and the latest valid revision wins.
- [ ] First-submit failure does not imply a saved ballot.
- [ ] Admin live counts are hidden by default and public pages do not leak chart-by-chart counts
  before reveal.
- [ ] All dangerous admin actions require password re-entry, reason, and a clear action summary.
- [ ] Only one host can control the tournament across two sessions and stale sessions cannot
  overwrite host control.
- [ ] Private CSV content after final reveal matches expected ballots, revisions, timestamps,
  active-at-round-start values, selected charts, and unambiguous chart identities.
- [ ] Load evidence covers at least 100 eligible players and concurrent spectators without relying
  solely on synthetic ballot injection.
- [ ] Event-day target browser can download the private CSV.
- [ ] Projector-size `/stage` and mobile `/vote` evidence show readable, non-overlapping UI.

## Already Verified During Review

These were observed during manual code review and are not marked as completed remediation:

- Required routes exist: `/stage`, `/room`, `/vote`, `/charts`, `/results`, `/coolguy69`.
- `/room` includes player voting and chart-only paths.
- QR target defaults to `/room`.
- Player dropdown and confirmation copy match the product spec in the reviewed code path.
- `/stage` uses two rows of seven cards for the two round sets.
- Public result summary uses ban counts, not percentages.
- Server-side draw/result code uses server-side randomness rather than browser randomness for
  tournament decisions.
- E2E-only routes appear guarded by production/test tokens and rehearsal flags.

## Checks Run For This Documentation Update

- [x] No automated checks were run because this was a documentation-only update and the user asked
  to skip those checks.
- [x] Playwright was not run.
- [x] The checklist itself does not require running Playwright for any item.
