# Production Readiness Review Checklist - 2026-07-03

Status: not production-ready today.

This checklist consolidates the 2026-07-03 manual review, local source inspection, and 8 parallel
subagent review tracks. It is intended to feed the next remediation plan. Product behavior should be
checked against `docs/product-spec.md` and `docs/pump_open_stage_repo_validation_checklist.md`.

Review tracks used:

- Tournament logic.
- Admin/security.
- Player identity and phone UX.
- Stage/results/UI.
- Playwright and e2e.
- Unit/integration testing.
- Chart data/import/images.
- Deployment and operations.

Checks run during this review:

- `rtk npm run verify:real-chart-images` - passed in the chart-data review; verified 4,426 runtime
  charts against 639 local cache files with no runtime remote image paths or fallback assignments.
- `rtk git diff --check` - passed after documentation updates.
- Full lint/typecheck/test/build/e2e were not run as part of this review checklist generation.

## First Pass - Blocking And High-Risk Issues

- [ ] **PRC-001 - Critical - Future-round draws can bypass prior selected-song exclusion.**
  - Files: `src/app/coolguy69/page.tsx`, `src/app/coolguy69/actions.ts`,
    `src/lib/round/round-state.ts`, `src/lib/draw/round-readiness.ts`,
    `supabase/migrations/20260630010000_phase1_rpc_lockdown_and_draw_guards.sql`.
  - Current risk: admin controls can draw later rounds before earlier selected songs are final.
    If Round 2 is drawn before Round 1 final reveal, Round 2 may contain a song later selected in
    Round 1.
  - Expected: Round N+1 draws are blocked until Round N selected songs are known, or stale future
    draws are invalidated/rejected before opening voting or computing results.
  - Suggested tests: draw Round 2 early with a shared song, select that song in Round 1, then assert
    Round 2 open/compute is blocked or future draws are invalidated.

- [x] **PRC-002 - Critical - Production-flow Playwright does not implement 48 -> 36 -> 24 -> 12.**
  - Files: `tests/phase9/fixtures/supabase-state.ts`, `src/app/coolguy69/actions.ts`,
    `tests/phase9/assertions/public-ui.assert.ts`, `tests/phase9/flows/results-reveal.flow.ts`.
  - Current risk: the full rehearsal seeds/expects 12 players, not 48, and does not remove 12
    voting players before Rounds 2, 3, and 4.
  - Expected: release Playwright starts with 48 active voting players, then verifies 36, 24, and 12
    after exactly 12 voting players are removed before each later round.
  - Suggested tests: assert admin active count, `/vote` eligibility, turnout denominator,
    eligibility snapshot, submitted ballot count, and CSV row count for every round.
  - Closure evidence: Phase 10 added the 48 -> 36 -> 24 -> 12 production-flow planner and Phase 11
    tightened active/inactive transition assertions. `rtk npm run test:e2e:production-flow` passed
    on 2026-07-04 against linked Supabase event `rehearsal-2026-07-03-prod-db-01`.

- [x] **PRC-003 - Critical - Full rehearsal submits only 2 UI ballots per round.**
  - Files: `tests/phase9/flows/ballot-submission.flow.ts`,
    `tests/phase9/fixtures/supabase-state.ts`.
  - Current risk: the "voting players" requirement is not represented by active players voting.
  - Expected: the release rehearsal submits valid ballots for all active voting players, or clearly
    separates a small UI smoke from the required full voting-player evidence.
  - Suggested tests: deterministic ballots for 48, 36, 24, and 12 players with representative real
    `/room -> /vote` submissions.
  - Closure evidence: Phase 11 production-flow submitted 48, 36, 24, and 12 valid UI ballots through
    `/room -> /vote` in the four production rounds. The full gate passed in 21.8 minutes on
    2026-07-04.

- [ ] **PRC-004 - Critical - Supabase production blocks required emergency admin workflows.**
  - Files: `src/lib/server/transactions/normalized-runtime.ts`,
    `src/app/coolguy69/actions.ts`.
  - Current risk: `manualBallotOverride`, `reopenVotingWindow`, and `resetRound` are listed as
    blocked transactional mutations, while product requirements expect them to work server-side.
  - Expected: manual ballot/overwrite, reopen voting, and reset/correction workflows work in
    Supabase with password re-entry, reason, audit rows, and transactional state changes.
  - Suggested tests: Supabase e2e for post-close manual ballot, reopen after close/computed, and
    reset/correction workflow.

- [ ] **PRC-005 - High - Audit rows may be lost under concurrent admin writes.**
  - Files: `src/lib/server/normalized-operational-state.ts`, `src/lib/server/persistence.ts`.
  - Current risk: partial save paths can delete/rewrite `admin_actions` from a snapshot loaded
    before the DB event lock.
  - Expected: audit history is append-only or merged inside the authoritative lock.
  - Suggested tests: concurrent Supabase admin actions from two sessions; assert both audit action
    IDs remain.

- [ ] **PRC-006 - High - Test-only service-role routes do not fail closed on all production envs.**
  - Files: `src/app/api/e2e/load-ballot/route.ts`, `src/app/api/e2e/private-csv/route.ts`,
    `src/lib/server/env.ts`.
  - Current risk: e2e routes check `NODE_ENV === "production"` but not explicitly
    `VERCEL_ENV === "production"`.
  - Expected: test-only routes are unavailable in any production deployment semantics, even with
    accidental test token/flag configuration.
  - Suggested tests: set `VERCEL_ENV=production`, `NODE_ENV=development`, test token present; assert
    both e2e routes return 404 and mutate nothing.

- [x] **PRC-007 - High - Default CI/e2e gates are not production readiness gates.**
  - Files: `package.json`, `.github/workflows/ci.yml`, `scripts/run-playwright.mjs`.
  - Current risk: green CI and default e2e can still be memory-backed smoke coverage.
  - Expected: release readiness has a named production-flow Supabase gate with fresh build, real
    admin actions, heartbeats, polling, public refresh, test routes disabled, and the 48/36/24/12
    attrition flow.
  - Suggested tests: require `rtk npm run test:e2e:production-flow` plus release artifacts before
    event signoff.
  - Closure evidence: `rtk npm run test:e2e:production-flow` now runs a fresh build in Supabase
    start mode with admin actions, heartbeats, polling, public refresh, test routes disabled, and
    the required attrition flow. Phase 11 also removes the premature `.github/workflows/ci.yml`
    because workflow automation remains deferred until Phase 12.

- [ ] **PRC-008 - High - Release checklist remains open and cannot certify the current build.**
  - Files: `docs/release-checklist.md`.
  - Current risk: release/deployed commit, operator, env, data, admin, public screen, CSV, and final
    checks remain unchecked/TODO.
  - Expected: current release evidence is tied to a commit, branch, deployed commit, backend, date,
    operator, and artifacts.
  - Suggested gate: block event use until the release checklist is complete for the exact deployed
    commit.

- [ ] **PRC-009 - High - Some production-critical SQL/RPC behavior is tested mostly by fake clients
  or source assertions.**
  - Files: `src/lib/server/normalized-operational-state.test.ts`, `src/lib/db/schema.test.ts`,
    `src/lib/server/transactions/normalized-runtime.test.ts`.
  - Current risk: fake-client and regex tests can miss real Postgres/RLS/locking behavior.
  - Expected: critical Supabase invariants are also proven against a real local or disposable
    Supabase database.
  - Suggested tests: migrations apply, concurrent ballot submit/result compute, host heartbeat, and
    event scoping in real tables.

- [ ] **PRC-010 - Medium - Deadline transitions may be derived on read but not durably persisted.**
  - Files: `src/lib/vote/voting-window.ts`, `src/app/coolguy69/actions.ts`,
    `supabase/migrations/20260701010000_production_readiness_transactions.sql`.
  - Current risk: rendered state may advance to extension/closed while stored state lags until a
    later mutation.
  - Expected: low-turnout extension and closed state become durable server/database state at
    deadline even if no one submits after expiration.
  - Suggested tests: fake-clock and Supabase persistence tests for expiration with no post-deadline
    submissions.

## Second Pass - Expanded Logic, UX, And Test Gaps

- [x] **PRC-011 - High - Playwright expectations are hard-coded to 12 eligible, 2 submitted, and 8
  ban selections.**
  - Files: `tests/phase9/assertions/public-ui.assert.ts`,
    `tests/phase9/flows/results-reveal.flow.ts`.
  - Expected: round-aware expectations of 48, 36, 24, and 12.
  - Suggested tests: pass per-round expectations through `runHostedRehearsal`.
  - Closure evidence: Phase 10 introduced round-aware production-flow expectations and Phase 11
    asserts exact active-player counts in the production-flow plan. The full production-flow gate
    passed on 2026-07-04.

- [x] **PRC-012 - High - CSV/download assertions do not prove per-round attrition.**
  - Files: `tests/phase9/hosted-full-rehearsal.spec.ts`,
    `tests/phase9/flows/results-reveal.flow.ts`.
  - Expected: each round's downloaded private CSV reflects the active snapshot: 48, 36, 24, 12.
  - Suggested tests: save and assert all four CSVs, not only final-round download evidence.
  - Closure evidence: The Phase 11 production-flow run verified all four round CSVs, including
    submitted rows, active-at-round-start rows, required player rows, and revisions for the 48, 36,
    24, and 12 active-player snapshots.

- [x] **PRC-013 - Medium - Roster selectors/helpers are brittle for attrition tests.**
  - Files: `src/app/coolguy69/page.tsx`, `tests/phase9/pages/vote.page.ts`.
  - Expected: test helpers can deactivate named players and assert dropdown membership/count/order.
  - Suggested tests: `AdminPage.markPlayersInactive(names)`, `expectActiveCount(count)`,
    `VotePage.expectEligiblePlayers(names)`.
  - Closure evidence: Phase 8 added stable admin roster/count markers plus
    `AdminPage.markPlayersInactive(names)`, `AdminPage.expectActiveCount(count)`,
    `AdminPage.expectVotingEligibleCount(count)`, and `VotePage.expectEligiblePlayers(names)`.
    `rtk npm run test:phase9` passes with the focused Phase 8 smoke regression.

- [ ] **PRC-014 - Medium - 100-player load test is one-round and API-heavy.**
  - Files: `tests/load/load-rehearsal.spec.ts`.
  - Expected: event-scale route behavior is proven with normal `/room -> /vote` submissions or a
    clearly separated browser-route load gate.
  - Suggested tests: multi-round attrition load profile or higher route-player count against
    Supabase.

- [x] **PRC-015 - Medium - Same-username second-device replacement is not proven end-to-end.**
  - Files: `src/app/vote/BallotFlow.tsx`, `src/app/vote/actions.ts`,
    `src/lib/vote/ballot-store.ts`, `tests/e2e/full-flow.spec.ts`.
  - Expected: second device can submit after warning, latest valid ballot wins, and results/export
    count only the newer choices.
  - Suggested tests: two browser contexts submit different ballots for the same start.gg username,
    then verify admin/results/CSV.
  - Closure evidence: `tests/phase9/phase8-phone-roster-regressions.spec.ts` opens two browser
    contexts for `Rehearsal Player 01`, asserts the active-device warning on the second phone, and
    verifies the final private CSV contains the second device's chart IDs and revision 2.

- [x] **PRC-016 - Medium - Save-failure UX lacks browser-level proof.**
  - Files: `src/app/vote/BallotFlow.tsx`, `src/lib/vote/phone-view.ts`,
    `src/lib/vote/ballot.test.ts`.
  - Expected: failed edit preserves prior server-confirmed ballot and does not create a revision.
  - Suggested tests: force submit failure during edit; assert previous choices/timestamp remain.
  - Closure evidence: the Phase 8 smoke regression forces a failed edit submit after an existing
    saved ballot, asserts the reassurance copy, reloads the phone, and verifies the original
    timestamp/no-ban choices plus private CSV revision 1.

- [x] **PRC-017 - Medium - Inactive-player hiding needs phone e2e coverage.**
  - Files: `src/lib/admin/roster.ts`, `src/lib/vote/voting-window.ts`,
    `src/app/vote/page.tsx`, `src/app/vote/BallotFlow.tsx`.
  - Expected: inactive users are hidden before voting opens; current-round snapshots and emergency
    adds behave exactly as documented.
  - Suggested tests: inactive before open, inactive after open, emergency current-round add, then
    next-round dropdown verification.
  - Closure evidence: the Phase 8 smoke regression hides a player before open, proves an inactive
    after-open player remains in the current voting snapshot, exercises the dangerous emergency
    current-round add, and verifies the next-round dropdown excludes both inactive players.

- [x] **PRC-018 - Medium - Zero-ballot / 7-way tiebreak behavior conflicts between docs.**
  - Files: `src/lib/results/result-engine.ts`,
    `src/lib/server/normalized-operational-state.ts`,
    `src/lib/results/result-engine.test.ts`.
  - Closure: Phase 0 locks the product-spec behavior. Zero-ballot seven-way ties are 5+ ties and
    use the fallback reveal with the backend-committed winner; no seven-slot wheel is built.
  - Evidence: `docs/product-spec.md`, `docs/pump_open_stage_repo_validation_checklist.md`,
    `docs/admin-action-policy.md`, `src/lib/results/result-engine.test.ts`.

- [x] **PRC-019 - Medium - Results are sorted least-to-most but not progressively revealed
  chart-by-chart.**
  - Files: `src/app/stage/page.tsx`, `src/components/ResultSetPanel.tsx`.
  - Current risk: count phases render the full sorted list at once.
  - Expected: either document all-at-once sorted reveal as acceptable or implement sequential
    chart-by-chart reveal.
  - Suggested tests: Playwright assertion for the chosen behavior.
  - Closure: Phase 7 documents all-at-once sorted count reveal as the accepted behavior because
    Phase 0 did not choose timed row-by-row reveal. Browser smoke now asserts count phases show all
    seven least-to-most result rows and do not show the selected label until the resolved phase.
  - Evidence: `docs/decision-log.md`, `tests/e2e/full-flow.spec.ts`,
    `src/components/ResultSetPanel.tsx`.

- [ ] **PRC-020 - Medium - Projector readability and QR scan thresholds may be too low.**
  - Files: `src/components/StageDrawCard.tsx`, `src/components/QRPanel.tsx`,
    `tests/e2e/projector-mobile-evidence.spec.ts`.
  - Expected: card titles and QR are readable/scannable at 1280x720 and 1366x768 from venue
    distance.
  - Suggested tests: raise geometry thresholds and run manual phone scan at event distance.
  - Phase 11 progress: automated QR geometry was raised to a 176 px minimum, stage title
    readability/overflow assertions were added, and local production-flow visual evidence captured
    1280x720, 1366x768, and 1920x1080 stage screenshots. This remains open for the manual
    venue-distance phone scan recorded in `docs/release-checklist.md`.

- [x] **PRC-021 - Medium - Admin live counts are hidden visually but present in initial admin DOM.**
  - Files: `src/app/coolguy69/page.tsx`.
  - Expected: if "behind warning" means deliberate disclosure, chart-by-chart counts should be
    fetched/rendered only after opening the warning.
  - Suggested tests: authenticated admin HTML before opening contains no chart-by-chart live count
    values.
  - Closure: Phase 7 moves live count rows out of the `/coolguy69` server render and fetches them
    through an authenticated, passwordless disclosure action after `Show live counts`.
  - Evidence: `src/app/coolguy69/_components/AdminLiveCountsDisclosure.tsx`,
    `src/app/coolguy69/actions.ts`, `src/lib/server/admin-actions.test.ts`,
    `tests/phase9/pages/admin.page.ts` raw authenticated HTML check.

- [x] **PRC-022 - Medium - Dangerous-action password policy is ambiguous for host controls.**
  - Files: `src/app/coolguy69/page.tsx`, `src/app/coolguy69/actions.ts`.
  - Closure: Phase 0 documents the narrower product policy. Routine host controls remain
    active-host-only plus audit; password-required dangerous actions are classified separately.
  - Evidence: `docs/admin-action-policy.md` and `src/lib/admin/action-policy.test.ts`.

- [x] **PRC-023 - Low - Post-complete missing-result phone state can fall through to generic
  pre-vote copy.**
  - Files: `src/app/vote/page.tsx`, `src/lib/vote/phone-view.ts`.
  - Expected: closed/revealing/complete states without final results show a holding/result-loading
    state, not pre-vote draw copy.
  - Suggested tests: route/component test for `round_complete` with missing final result.
  - Closure: Phase 7 adds an explicit phone result holding-state helper and uses it before generic
    pre-vote branches.
  - Evidence: `src/lib/vote/phone-view.ts`, `src/app/vote/page.tsx`,
    `src/lib/vote/phone-view.test.ts`.

- [x] **PRC-024 - Low - No-vague-skip rule lacks a direct browser regression assertion.**
  - Files: `src/app/vote/BallotFlow.tsx`, `tests/e2e/mobile-routes.spec.ts`.
  - Expected: `/vote` never exposes a button/link matching `/skip/i`; only explicit
    `No bans for this set` completes zero bans.
  - Suggested tests: mobile `/vote` assertion.
  - Closure: Phase 7 adds a mobile `/vote` browser assertion for no visible `/skip/i` button, link,
    or exact text while keeping `No bans for this set` visible and usable.
  - Evidence: `tests/e2e/mobile-routes.spec.ts`.

## Third Pass - Data, Security Hardening, And Operations

- [ ] **PRC-025 - Medium - Final chart import is not strict or review-signed.**
  - Files: `data/generated/chart-import-report.json`, `scripts/import-charts.ts`.
  - Current risk: strict mode is false, reviewer fields are null, with 9 repaired rows and 145
    skipped rows.
  - Expected: final event catalog has strict pass or signed review of every repaired/skipped row.
  - Suggested gate: fail release if strict failures or unreviewed diagnostics remain.

- [ ] **PRC-026 - Medium - CSV header validation allows trailing schema drift.**
  - Files: `src/lib/charts/importer.ts`, `data/source/charts.csv`.
  - Current risk: parser relaxes column counts and validates expected columns by index without
    rejecting extra header columns.
  - Expected: exact source schema unless extra columns are intentionally supported.
  - Suggested tests: reject extra/misordered headers and unexpected trailing row columns.

- [ ] **PRC-027 - Low - Unicode-only song/artist keys could collapse to `unknown`.**
  - Files: `src/lib/charts/normalize.ts`.
  - Current risk: real data currently has zero unknown keys, but non-ASCII-only metadata can strip
    to empty normalized parts.
  - Expected: Korean-only or non-Latin-only rows produce distinct non-unknown keys or fail safely.
  - Suggested tests: Korean-only and mixed-Unicode title/artist rows.

- [ ] **PRC-028 - Low - Image verification is not part of default quality gates.**
  - Files: `package.json`, `scripts/verify-real-chart-images.ts`.
  - Current status: `verify:real-chart-images` passed in this review, but `test`/`build` do not run
    it.
  - Expected: release gate includes import validation and image verification.
  - Suggested gate: add a release script that runs import/cache/verify with artifact capture.

- [ ] **PRC-029 - Low - Exclusion state is latest-only without a DB uniqueness/versioning guard.**
  - Files: `src/lib/charts/exclusions.ts`,
    `supabase/migrations/20260628050200_initial_schema.sql`,
    `supabase/migrations/20260629090000_event_scoped_runtime.sql`.
  - Expected: current exclusion state is unambiguous; versioned history is deliberate and audited.
  - Suggested tests: exclude, re-include, exclude same chart; persist/restore; assert latest state
    and audit history.

- [ ] **PRC-030 - Medium - `/api/e2e/private-csv` lacks behavioral security tests.**
  - Files: `src/app/api/e2e/private-csv/route.ts`,
    `src/lib/server/security-boundary.test.ts`.
  - Expected: test-only export route returns 404 in production, denies missing token, denies
    non-final reveal, and allows only safe rehearsal export.
  - Suggested tests: route-level test mirroring `/api/e2e/load-ballot` security coverage.

- [ ] **PRC-031 - Low - Authoritative database-time helper lacks direct boundary tests.**
  - Files: `src/lib/server/authoritative-clock.ts`,
    `src/lib/vote/voting-window.test.ts`.
  - Expected: Supabase mode always calls `normalized_database_time` and fails closed on RPC error or
    invalid timestamp.
  - Suggested tests: mock service-role client and cover error/invalid responses.

- [ ] **PRC-032 - Medium - Secure cookie detection ignores production deployment env.**
  - Files: `src/lib/server/admin-auth.ts`.
  - Current risk: secure cookies use `NODE_ENV === "production"` while `VERCEL_ENV === "production"`
    is also treated as production elsewhere.
  - Expected: admin and host cookies are `Secure` in production deployment environments.
  - Suggested tests: cookie option test with `VERCEL_ENV=production` and non-production
    `NODE_ENV`.

- [ ] **PRC-033 - Low - Host lock remains until TTL after admin inactivity redirect.**
  - Files: `src/app/coolguy69/_components/AdminInactivityTimer.tsx`,
    `src/lib/admin/host-lock.ts`.
  - Expected: either explicit release on inactivity or documented acceptance of TTL behavior.
  - Suggested tests: inactive admin session expires, no mutation succeeds, and lock becomes
    acquirable after TTL.

- [ ] **PRC-034 - Medium - Test-only API routes ship in the production app tree.**
  - Files: `src/app/api/e2e/load-ballot/route.ts`, `src/app/api/e2e/private-csv/route.ts`.
  - Expected: production deployment smoke proves both routes return 404 with and without token and
    no service-role mutation path is reachable.
  - Suggested gate: deployed route probe before release signoff.

- [ ] **PRC-035 - Medium - Image/cache footprint needs deployed artifact evidence.**
  - Files: `docs/asset-audit.md`, `scripts/verify-real-chart-images.ts`,
    `public/chart-images/cache`.
  - Current risk: roughly 200 MiB of cached PNGs is within current budget but should be tied to the
    deployed artifact and route transfer evidence.
  - Expected: deployed app uses the approved CSV/cache set and remains performant on target hosting.
  - Suggested gate: deployed `/stage` and `/vote` image-render/transfer evidence.
  - Phase 11 progress: production-flow now writes `phase11-deployed-visual-evidence.json` with
    stage/vote image responses, resource transfer metadata, local cached artwork paths, and proof
    that chart art does not use live third-party URLs. The local production-start run passed; this
    remains open until the same gate is run against the merged deployed URL and commit.

- [ ] **PRC-036 - Medium - Working tree and release metadata are not release-stable.**
  - Files: `AGENTS.md`, `docs/*`, `docs/release-checklist.md`.
  - Current risk: review/doc updates are uncommitted; release checklist still has TODO commit fields.
  - Expected: release evidence points at committed source and deployed commit.
  - Suggested gate: commit intentional docs/code changes, rerun release gates, record
    `git rev-parse HEAD`.

## Requirements Documentation Updates Made In This Review

- [x] Added the 48 -> 36 -> 24 -> 12 Playwright requirement to `docs/product-spec.md`.
- [x] Added validation checks for the same requirement to
  `docs/pump_open_stage_repo_validation_checklist.md`.
- [x] Added production-flow Playwright evidence requirements to `docs/codex-execution-plan.md`.
- [x] Added the release-blocking Playwright rule to `docs/phase-gates.md`.
- [x] Added disposable production-flow test data guidance to `docs/security-notes.md`.
- [x] Updated `docs/testing-checklist.md`, `docs/event-day-runbook.md`,
  `docs/release-checklist.md`, `docs/deployment-readiness.md`,
  `docs/rehearsal-runbook.md`, `docs/production-flow-risk-remediation-plan-2026-07-02.md`,
  `docs/production-flow-risk-checklist-2026-07-02.md`, and `AGENTS.md`.
