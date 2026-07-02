# Production Readiness Remediation Plan - 2026-07-03

Status: planning document.

Source checklist: `docs/production-readiness-review-checklist-2026-07-03.md`.

Authoritative behavior sources:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

This plan splits the production-readiness checklist into smaller phases so each
implementation pass can be reviewed and verified accurately. The ordering is
intentional: correctness and security fixes come first, deterministic unit and
integration coverage comes before browser-heavy work, and the full Playwright
production-flow rehearsal is kept near the end because it is the most expensive
and slowest evidence window.

## Planning Inputs

The plan was assembled from five focused review tracks:

- Tournament state and result correctness.
- Admin, security, and Supabase safety.
- Chart data, image assets, deployment, and release operations.
- Phone, stage, admin UI, and UX behavior.
- Test strategy, Playwright, and load coverage.

No tournament rule changes are proposed here. If an item conflicts with older
execution-plan text, follow `docs/product-spec.md` and
`docs/pump_open_stage_repo_validation_checklist.md`.

## Sequencing Principles

1. Close result-changing risks before evidence or polish work.
2. Fail closed before adding convenience workflows.
3. Prove behavior with focused tests before broad Playwright flows.
4. Keep release evidence tied to the exact source commit and deployed commit.
5. Do not treat a green smoke test as production-flow evidence.
6. Run the full 48 -> 36 -> 24 -> 12 Playwright rehearsal only after helpers,
   deterministic test data, and smaller browser regressions are stable.

## Phase Overview

| Phase | Focus | Primary issues |
| --- | --- | --- |
| 0 | Policy and decision lock | PRC-018, PRC-022 |
| 1 | Fail-closed security primitives | PRC-006, PRC-030, PRC-031, PRC-032, PRC-034 |
| 2 | Future draw correctness | PRC-001 |
| 3 | Durable timer transitions | PRC-010 |
| 4 | Supabase emergency workflows | PRC-004 |
| 5 | Audit, exclusion, and host-lock persistence | PRC-005, PRC-029, PRC-033 |
| 6 | Chart import and release data gates | PRC-025, PRC-026, PRC-027, PRC-028 |
| 7 | Low-cost public/UI state fixes | PRC-019, PRC-021, PRC-023, PRC-024 |
| 8 | Focused phone and roster browser regressions | PRC-013, PRC-015, PRC-016, PRC-017 |
| 9 | Real Supabase and load confidence | PRC-009, PRC-014, PRC-030 |
| 10 | Playwright helper upgrades | PRC-002, PRC-003, PRC-011, PRC-012, PRC-013 |
| 11 | Production-flow Playwright and deployed visual evidence | PRC-002, PRC-003, PRC-007, PRC-011, PRC-012, PRC-020, PRC-035 |
| 12 | Release metadata closure | PRC-008, PRC-036 |

## Phase 0 - Policy And Decision Lock

Primary issues:

- PRC-018: zero-ballot / 7-way tiebreak behavior conflicts between docs.
- PRC-022: dangerous-action password policy is ambiguous for host controls.

Goal:

Lock the product decisions that affect later implementation so later phases do
not oscillate between conflicting interpretations.

Implementation parts:

- Add or update an admin action policy matrix that classifies every admin action
  as one of:
  - password-required dangerous action
  - active-host-only tournament action
  - read-only or sensitive disclosure action
- Follow the narrow policy from `docs/product-spec.md`: the explicitly listed
  dangerous actions require password re-entry; routine host controls such as
  open, pause, resume, close, compute, reveal, and advance remain active-host
  plus audit unless the product spec is intentionally changed.
- Resolve PRC-018 by following `docs/product-spec.md`: 5+ least-ban ties use a
  simple fallback reveal, including zero-ballot 7-way ties, while the backend
  still commits the selected winner before reveal.
- If operators want the validation-checklist zero-ballot spinner behavior
  instead, stop and record that as an explicit product decision before code
  changes.

Acceptance criteria:

- Every admin action is classified exactly once.
- Tests prove password-required actions cannot run without password re-entry.
- Tests prove host-only actions still require active host control and audit.
- Result engine tests define 5+ tie behavior unambiguously.

Suggested focused checks:

```text
rtk npm run test -- src/lib/server/admin-actions.test.ts src/lib/results/result-engine.test.ts
```

Risks:

- Expanding password re-entry to every tournament-changing action would change
  operator workflow and should not be done unless explicitly requested.
- Changing tie behavior can affect already-written reveal expectations, so make
  the behavior explicit before updating UI tests.

## Phase 1 - Fail-Closed Security Primitives

Primary issues:

- PRC-006: test-only service-role routes do not fail closed on all production envs.
- PRC-030: `/api/e2e/private-csv` lacks behavioral security tests.
- PRC-031: authoritative database-time helper lacks direct boundary tests.
- PRC-032: secure cookie detection ignores production deployment env.
- PRC-034: test-only API routes ship in the production app tree.

Goal:

Make dangerous test and secret-adjacent surfaces fail closed before deeper
transactional work is added.

Implementation parts:

- Centralize production-deployment detection in one server-only helper that
  treats both `NODE_ENV=production` and `VERCEL_ENV=production` as production.
- Apply that helper to:
  - `src/app/api/e2e/load-ballot/route.ts`
  - `src/app/api/e2e/private-csv/route.ts`
  - `src/lib/server/admin-auth.ts`
  - any other cookie or test-route production checks
- Add behavioral tests for `/api/e2e/private-csv`:
  - production semantics return 404 with token
  - production semantics return 404 without token
  - missing token is denied outside production
  - non-final reveal is denied
  - safe rehearsal export is allowed only under explicit non-production test
    configuration
- Add direct tests for authoritative database time:
  - Supabase mode calls `normalized_database_time`
  - RPC error fails closed
  - invalid timestamp fails closed
  - memory/local fallback remains explicit and test-only where applicable
- Keep e2e routes in the app tree only if they cannot mutate or export in any
  production deployment semantics.

Acceptance criteria:

- Test-only routes return 404 when `VERCEL_ENV=production`, even if
  `NODE_ENV=development` and a test token is configured.
- Admin and host cookies are `Secure` in production deployment environments.
- Database-time helper fails closed on RPC error or invalid timestamp.
- No browser bundle imports service-role keys, password hashes, or session
  secrets.

Suggested focused checks:

```text
rtk npm run test -- src/app/api/e2e/load-ballot/route.test.ts src/app/api/e2e/private-csv/route.test.ts src/lib/server/authoritative-clock.test.ts src/lib/server/admin-auth.test.ts src/lib/server/security-boundary.test.ts
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run build
```

Risks:

- PRC-034 is not fully closed by route guards alone; deployed route probes are
  still required later because the route files still ship in the app tree.

## Phase 2 - Future Draw Correctness

Primary issue:

- PRC-001: future-round draws can bypass prior selected-song exclusion.

Goal:

Prevent a future round from opening, computing, or remaining valid with a song
selected in an earlier round.

Implementation parts:

- Treat "selected songs known" as result-computed-or-later, not only final
  stage reveal.
- Add pure validation helpers around prior selected-song blocks, likely near
  `src/lib/results/selected-song-blocks.ts`.
- Use the guard in admin draw/reroll, open voting, and compute-result paths.
- Update Supabase SQL/RPC draw/open/compute guards so they do not only check
  final reveal state.
- Choose the smallest safe remediation: reject stale future draws until an
  operator rerolls or resets them. Auto-invalidating future draws is more
  operator-friendly but larger and riskier.

Acceptance criteria:

- A test can draw Round 2 early with a shared song, compute Round 1 selecting
  that song, then prove Round 2 open/compute is blocked until corrected.
- Same-round duplicate-song blocking still works.
- Drawn-but-not-selected songs remain eligible for later rounds.
- Supabase and memory paths enforce the same rule.

Suggested focused checks:

```text
rtk npm run test -- src/lib/draw/draw-state.test.ts src/lib/draw/round-readiness.test.ts src/lib/results/selected-song-blocks.test.ts src/lib/integration/tournament-flow.test.ts src/lib/server/transactions/normalized-runtime.test.ts src/lib/db/schema.test.ts
```

Risks:

- Existing stale future draws in a live event namespace may need operator
  correction after this guard is deployed.
- SQL and TypeScript guards must agree, or Supabase production can diverge from
  local memory behavior.

## Phase 3 - Durable Timer Transitions

Primary issue:

- PRC-010: deadline transitions may be derived on read but not durably persisted.

Goal:

Make voting deadline transitions durable even when no one submits after a timer
expires.

Implementation parts:

- Implement the blocked `advanceVotingTimer` transactional path.
- Add or wire a `normalized_advance_voting_timer` RPC that applies deadline
  transitions inside the event lock.
- Use existing deadline logic so behavior remains:
  - below 75 percent at normal expiration extends once by 1 minute
  - after the extension, close regardless of turnout
  - all submitted enters the 30-second final-change warning
  - pause freezes timer and submissions
- Add a server helper called by public/admin polling paths before snapshots.
  The helper should no-op unless a timed transition is actually due.

Acceptance criteria:

- Fake-clock tests prove expiration persists extension and closed states with no
  post-deadline submission.
- Supabase/source tests prove the timer RPC is implemented and calls the locked
  deadline helper.
- Polling `/stage`, `/vote`, or `/coolguy69` after expiration durably updates
  authoritative state.
- No write loop is introduced on every page render.

Suggested focused checks:

```text
rtk npm run test -- src/lib/vote/voting-window.test.ts src/lib/server/voting-round.test.ts src/lib/server/transactions/normalized-runtime.test.ts src/lib/server/normalized-operational-state.test.ts
```

Risks:

- Timer advancement from public routes must remain server-side and event-scoped.
- Poll-triggered writes must be idempotent to avoid noisy state churn.

## Phase 4 - Supabase Emergency Admin Workflows

Primary issue:

- PRC-004: Supabase production blocks required emergency admin workflows.

Goal:

Make required emergency workflows work transactionally in Supabase without
falling back to unsafe snapshot rewrites.

Implementation parts:

- Implement real SQL RPCs for:
  - `normalized_manual_ballot_override`
  - `normalized_reopen_voting_window`
  - `normalized_reset_round`
- Keep password verification in server-side application code; do not pass or
  persist plaintext passwords in RPC payloads, audit rows, revisions, or logs.
- Update `src/lib/server/transactions/normalized-runtime.ts` so only these
  operations move from blocked to implemented after the RPCs exist.
- Preserve existing memory-backend semantics for local tests.
- Manual ballot/overwrite requirements:
  - allowed while voting is open
  - allowed after close but before results reveal
  - requires password, reason, and replace-existing confirmation
  - creates audit rows
  - marks private CSV manual override fields
- Reopen requirements:
  - password re-entry
  - reason and duration
  - transactional state change
  - invalidates unrevealed computed state when required by product semantics
- Reset/correction requirements:
  - password re-entry
  - clear action summary
  - preserves audit history
  - resets only intended round-scoped state

Acceptance criteria:

- Supabase e2e proves post-close manual ballot before reveal.
- Supabase e2e proves overwrite requires explicit replace and increments or
  records the appropriate revision.
- Supabase e2e proves reopen after close/computed allows valid edits and does
  not leave stale public result state.
- Supabase e2e proves reset clears only the intended round state and preserves
  audit rows.
- SQL/source tests prove latest RPC definitions are not disabled stubs and are
  callable only through service-role server code.

Suggested focused checks:

```text
rtk npm run test -- src/lib/server/transactions/normalized-runtime.test.ts src/lib/server/normalized-operational-state.test.ts src/lib/results/private-csv.test.ts src/lib/server/admin-actions.test.ts
rtk npm run test:phase9:supabase-dev
```

Risks:

- This is one of the highest-risk implementation phases. SQL must preserve
  current memory semantics around computed-but-unrevealed results, manual
  override export flags, and reset scope.

## Phase 5 - Audit, Exclusion, And Host-Lock Persistence

Primary issues:

- PRC-005: audit rows may be lost under concurrent admin writes.
- PRC-029: exclusion state is latest-only without a DB uniqueness/versioning guard.
- PRC-033: host lock remains until TTL after admin inactivity redirect.

Goal:

Make operational persistence deliberate and resilient under admin concurrency.

Implementation parts:

- Stop deleting and rewriting `admin_actions` in partial normalized persistence
  paths.
- Insert or upsert audit rows append-only inside the authoritative event lock.
- Add a regression test that fails if `admin_actions` is reintroduced into
  partial delete/rewrite paths.
- Keep chart exclusion current state latest-only, but make it explicit:
  - unique current exclusion row per `(event_id, chart_id)`
  - upsert current state by event/chart
  - preserve historical changes through admin audit rows
- Add cleanup strategy for existing duplicate exclusion rows before adding a
  uniqueness constraint.
- Add best-effort host-lock release when admin inactivity redirects or logs out.
  TTL remains the hard fallback because client-side timers and network requests
  can fail.

Acceptance criteria:

- Concurrent Supabase admin actions from two sessions preserve both audit IDs.
- Exclude -> re-include -> exclude same chart leaves one current exclusion
  state with latest reason and audit history for all actions.
- Expired admin cannot mutate.
- Released or expired host lock becomes acquirable by another admin.

Suggested focused checks:

```text
rtk npm run test -- src/lib/server/normalized-operational-state.test.ts src/lib/server/persistence.test.ts src/lib/persistence/merge.test.ts src/lib/admin/host-lock.test.ts src/lib/charts/exclusions.test.ts
```

Risks:

- Adding a uniqueness constraint without cleaning duplicate rows can break
  migration on existing hosted data.

## Phase 6 - Chart Import And Release Data Gates

Primary issues:

- PRC-025: final chart import is not strict or review-signed.
- PRC-026: CSV header validation allows trailing schema drift.
- PRC-027: Unicode-only song/artist keys could collapse to `unknown`.
- PRC-028: image verification is not part of default quality gates.

Goal:

Make chart data and image readiness independently certifiable for release.

Implementation parts:

- Make CSV header validation exact:
  - same columns
  - same order
  - no extra headers
- Keep repair support only for known, intentional malformed row shapes.
- Reject unexpected trailing row columns after `bg_img`.
- Add Unicode-safe key behavior for rows where sanitized title/artist parts
  would become empty. Prefer a stable hash fallback scoped only to the current
  `unknown` fallback case unless a key migration is approved.
- Add a named release data validation script that fails unless:
  - import is strict-clean, or
  - repaired/skipped diagnostics are signed with reviewer/date/commit evidence
- Include in the release data gate:
  - source CSV SHA
  - import report SHA
  - no fixture mode
  - required pool counts
  - duplicate key checks
  - image cache manifest identity
  - runtime image verification

Acceptance criteria:

- Tests reject extra headers, misordered headers, and unexpected trailing
  columns.
- Tests cover Korean-only and mixed-Unicode title/artist keys.
- `rtk npm run import:charts -- --strict` passes or the signed-review path is
  explicit and documented.
- `rtk npm run verify:real-chart-images` passes against the final artifacts.
- Release data gate fails on unsigned repaired/skipped diagnostics.

Suggested focused checks:

```text
rtk npm run test -- src/lib/charts/importer.test.ts src/lib/charts/normalize.test.ts src/lib/charts/runtime-catalog.test.ts src/lib/charts/image-cache.test.ts
rtk npm run import:charts
rtk npm run verify:real-chart-images
```

Risks:

- Key algorithm changes can alter chart IDs. Keep the change narrowly scoped.
- `data/generated/*.json` may be ignored by git, so release artifacts must be
  archived or attached outside normal source tracking.

## Phase 7 - Low-Cost Public And UI State Fixes

Primary issues:

- PRC-019: results are sorted least-to-most but not progressively revealed
  chart-by-chart.
- PRC-021: admin live counts are hidden visually but present in initial admin DOM.
- PRC-023: post-complete missing-result phone state can fall through to generic
  pre-vote copy.
- PRC-024: no-vague-skip rule lacks a direct browser regression assertion.

Goal:

Close lower-cost UI and public-state issues before heavier browser rehearsals.

Implementation parts:

- Move chart-by-chart admin live count values out of the initial
  `/coolguy69` server render.
- Render only a warning button initially; fetch live counts through an
  authenticated server action after deliberate reveal.
- Do not require another password for live count reveal, because product spec
  treats it as sensitive but not destructive.
- Add a phone-view holding branch for closed/revealed/round-complete states
  where final result data is missing.
- Add a browser assertion that `/vote` has no button/link/text matching
  `/skip/i`; only `No bans for this set` can complete zero bans.
- Implement sequential chart-by-chart result reveal if chosen in Phase 0:
  - reveal rows least-to-most
  - drive visibility from server phase start time
  - keep winner reveal separate until resolved phase

Acceptance criteria:

- Authenticated initial admin HTML contains no chart-by-chart count rows or
  values.
- Clicking `Show live counts` reveals counts without a password field.
- `round_complete` with missing final result shows holding/result-loading copy,
  not pre-vote draw copy.
- `/vote` exposes no vague skip action.
- If sequential reveal is implemented, count phase initially shows fewer than
  all rows, then all rows before selected winner reveal.

Suggested focused checks:

```text
rtk npm run test -- src/lib/vote/phone-view.test.ts src/lib/results/result-engine.test.ts src/components/rune-wheel-rotation.test.ts
rtk npm run test:e2e:memory-dev-smoke
```

Risks:

- Timed progressive reveal can make Playwright flaky. Keep the reveal helper
  deterministic and unit-tested before relying on browser timing assertions.

## Phase 8 - Focused Phone And Roster Browser Regressions

Primary issues:

- PRC-013: roster selectors/helpers are brittle for attrition tests.
- PRC-015: same-username second-device replacement is not proven end-to-end.
- PRC-016: save-failure UX lacks browser-level proof.
- PRC-017: inactive-player hiding needs phone e2e coverage.

Goal:

Build stable browser helpers and focused regressions before the 4-round
production-flow rehearsal.

Implementation parts:

- Add stable admin roster test IDs and count markers without changing behavior.
- Add Playwright page helpers:
  - `AdminPage.markPlayersInactive(names)`
  - `AdminPage.expectActiveCount(count)`
  - `VotePage.expectEligiblePlayers(names)`
  - dropdown count/order/membership assertions
- Add a reusable `/room -> /vote` ballot submitter that accepts player name and
  deterministic ban plan.
- Add focused browser specs for:
  - same username opened in two browser contexts
  - latest valid ballot wins in results and private CSV
  - forced edit save failure preserves prior server-confirmed ballot
  - inactive before open is hidden from dropdown
  - inactive after open does not silently change current-round snapshot
  - emergency current-round add works as a dangerous action
  - next-round dropdown reflects routine roster changes

Acceptance criteria:

- Page helpers typecheck and are used by at least one smoke test.
- Same-username replacement is proven through results or CSV.
- Save-failure test proves old choices and timestamp remain after reload.
- Roster snapshot behavior is proven before joining the production-flow test.

Suggested focused checks:

```text
rtk npm run test:e2e:memory-dev-smoke
rtk npm run test:phase9
```

Risks:

- Helper work should remain selector-only at first. Avoid coupling it to the
  later 48 -> 36 -> 24 -> 12 rehearsal until the small tests are stable.

## Phase 9 - Real Supabase And Load Confidence

Primary issues:

- PRC-009: production-critical SQL/RPC behavior is tested mostly by fake clients
  or source assertions.
- PRC-014: 100-player load test is one-round and API-heavy.
- PRC-030: private CSV test-only route needs behavioral coverage.

Goal:

Add real database and event-scale confidence without running the full
production-flow browser rehearsal yet.

Implementation parts:

- Add or document real local/disposable Supabase tests for:
  - migrations apply
  - event scoping
  - concurrent ballot submit
  - concurrent result compute
  - host heartbeat and lock behavior
  - critical RPC permissions
- Keep API-injection load as a useful load tool, but do not treat it as the
  same evidence as normal player route submission.
- Add a route-player load profile that proves normal `/room -> /vote`
  submissions with spectator/view-only traffic.
- Keep these profiles separate from the release-blocking production-flow gate.

Acceptance criteria:

- Critical Supabase invariants have real DB coverage or explicit hosted
  disposable evidence.
- Load evidence clearly labels API-injection versus route-player behavior.
- Private CSV route security is covered at route level and later by deployed
  probes.

Suggested focused checks:

```text
rtk npm run test:phase9:supabase-dev
rtk npm run test:load:api-injection
rtk npm run test:load:player-routes
```

Risks:

- Hosted Supabase tests need disposable `TOURNAMENT_EVENT_ID` values and must
  never run against the real tournament event namespace.

## Phase 10 - Playwright Helper Upgrades

Primary issues:

- PRC-002: production-flow Playwright does not implement 48 -> 36 -> 24 -> 12.
- PRC-003: full rehearsal submits only 2 UI ballots per round.
- PRC-011: Playwright expectations are hard-coded to 12 eligible, 2 submitted,
  and 8 ban selections.
- PRC-012: CSV/download assertions do not prove per-round attrition.
- PRC-013: roster helpers need to support attrition tests.

Goal:

Prepare the expensive full rehearsal without running it as the primary
debugging tool.

Implementation parts:

- Replace hard-coded counts with per-round expectation objects:
  - Round 1: 48 active, 48 submitted
  - Round 2: 36 active, 36 submitted
  - Round 3: 24 active, 24 submitted
  - Round 4: 12 active, 12 submitted
- Add deterministic ballot planner tests for:
  - submitted counts
  - ban-selection totals
  - revisions
  - CSV expectations
  - active snapshots
- Add helpers to mark exactly 12 voting players inactive before each later
  round.
- Add eligibility snapshot assertions.
- Save and assert private CSV downloads for all four rounds, not just final
  evidence.
- Make CSV verification accept:
  - expected row count
  - submitted count
  - required players
  - active snapshot
  - manual override/revision expectations where applicable
- Add production-flow validation that checks environment and test-route
  disabling before the long run starts.

Acceptance criteria:

- The full-rehearsal spec no longer contains hard-coded smoke counts.
- Validation can prove the production-flow environment is ready without running
  the full browser flow.
- A dry run or list check selects the expected production-flow specs.
- All helper-level and deterministic planner tests pass before the full run.

Suggested focused checks:

```text
rtk npm run test -- tests/phase9/fixtures tests/phase9/assertions
rtk npm run test:phase9
rtk npm run test:e2e:production-flow:validate
```

Risks:

- The command `rtk npm run test:e2e:production-flow` already exists, but the
  checklist says the body still behaves like a smaller smoke. Do not close
  PRC-002 or PRC-003 until behavior, not just command existence, is proven.

## Phase 11 - Production-Flow Playwright And Deployed Visual Evidence

Primary issues:

- PRC-002: production-flow Playwright must prove 48 -> 36 -> 24 -> 12.
- PRC-003: all active voting players must submit valid ballots or the test must
  clearly separate smoke from release evidence.
- PRC-007: default CI/e2e gates are not production readiness gates.
- PRC-011: round-aware expectations.
- PRC-012: per-round CSV attrition.
- PRC-020: projector readability and QR scan thresholds may be too low.
- PRC-035: image/cache footprint needs deployed artifact evidence.

Goal:

Run the expensive browser evidence only after the preceding phases make it
boring and deterministic.

Implementation parts:

- Use a disposable production-flow event namespace. Do not run against the real
  tournament event namespace.
- Use Supabase backend, fresh build/start mode, real admin actions, heartbeats,
  polling, public refresh, and test-only routes disabled.
- Seed 48 disposable players through real admin/rehearsal controls.
- Round plan:
  - Round 1 starts with 48 active voting players.
  - Before Round 2 opens, mark exactly 12 Round 1 voting players inactive,
    leaving 36.
  - Before Round 3 opens, mark exactly 12 more voting players inactive,
    leaving 24.
  - Before Round 4 opens, mark exactly 12 more voting players inactive,
    leaving 12.
- Submit valid ballots for every active voting player each round through normal
  `/room -> /vote` flows, likely in bounded batches.
- Use deterministic ban plans that produce valid ballots and predictable ban
  selection totals.
- Verify for every round:
  - admin active count
  - `/vote` eligibility dropdown
  - round eligibility snapshot
  - public turnout denominator
  - submitted ballot count
  - ban-selection total
  - final two-chart reveal
  - private CSV row count
  - private CSV submitted count
  - private CSV active snapshot
- Raise projector and QR geometry thresholds after stage markup stabilizes:
  - 1280x720
  - 1366x768
  - no overflow
  - QR points to `/room`
  - QR size meets event threshold
  - chart titles remain readable
  - real cached images render
- Collect deployed asset evidence:
  - route URL
  - deployed commit
  - viewport
  - image request list
  - transfer sizes
  - screenshots
  - proof no chart art uses live third-party `bg_img` URLs

Acceptance criteria:

- `rtk npm run test:e2e:production-flow` proves the full 48 -> 36 -> 24 -> 12
  release rehearsal.
- All four private CSVs are saved and checked.
- The release evidence is not conflated with smaller memory smoke tests.
- Deployed visual/image evidence is tied to the same deployed commit.
- Manual venue-distance QR scan is recorded in the release checklist.

Suggested final checks for this phase:

```text
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run build
rtk npm run test:e2e
rtk npm run test:phase9
rtk npm run test:load:player-routes
rtk npm run test:e2e:production-flow:validate
rtk npm run test:e2e:production-flow
```

Risks:

- This run is slow by design: 120 UI ballot submissions plus four result
  reveals can be flaky if waits are loose.
- Use Playwright for browser evidence, not for discovering basic logic bugs.
  The preceding phases should catch those first.

## Phase 12 - Release Metadata Closure

Primary issues:

- PRC-008: release checklist remains open and cannot certify current build.
- PRC-036: working tree and release metadata are not release-stable.

Goal:

Tie all final evidence to the exact source commit, deployed commit, backend,
operator, environment, and artifact paths.

Implementation parts:

- Regenerate final chart/import/cache artifacts after all data-related code
  changes are complete.
- Record:
  - current release commit
  - current release branch
  - deployed commit
  - backend
  - environment
  - date
  - operator/reviewer
  - source CSV SHA
  - import report SHA
  - runtime catalog SHA
  - image manifest SHA
  - cache file count
  - cache byte total
  - Playwright artifact paths
  - deployed visual evidence paths
- Ensure release checklist entries refer to current evidence, not historical
  Phase 8/9 evidence unless deliberately rerun and linked.
- Commit all intentional docs/code changes.
- Deploy the exact commit.
- Rerun final release gates after any code, data, environment, or deployment
  change.

Acceptance criteria:

- `rtk git status --short` is clean.
- `rtk git rev-parse HEAD` matches the release checklist source commit.
- Deployed commit matches the release checklist deployed commit.
- All final release checklist rows are checked with dated artifact evidence.
- Historical evidence is clearly marked as historical and not used as current
  release certification unless rerun.

Suggested final checks:

```text
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run test:e2e
rtk npm run test:e2e:production-flow
rtk npm run test:load
rtk npm run test:phase9
rtk npm run test:phase9:full
rtk npm run import:charts
rtk npm run cache:chart-images
rtk npm run verify:real-chart-images
rtk npm audit --omit=dev
rtk git diff --check
rtk npm run build
```

Risks:

- If any artifact is regenerated after metadata is recorded, release metadata
  becomes stale and must be redone from the relevant data/evidence phase.

## Issue Coverage Matrix

| Issue | Planned phase |
| --- | --- |
| PRC-001 | Phase 2 |
| PRC-002 | Phase 10, Phase 11 |
| PRC-003 | Phase 10, Phase 11 |
| PRC-004 | Phase 4 |
| PRC-005 | Phase 5 |
| PRC-006 | Phase 1 |
| PRC-007 | Phase 11 |
| PRC-008 | Phase 12 |
| PRC-009 | Phase 9 |
| PRC-010 | Phase 3 |
| PRC-011 | Phase 10, Phase 11 |
| PRC-012 | Phase 10, Phase 11 |
| PRC-013 | Phase 8, Phase 10 |
| PRC-014 | Phase 9 |
| PRC-015 | Phase 8 |
| PRC-016 | Phase 8 |
| PRC-017 | Phase 8 |
| PRC-018 | Phase 0 |
| PRC-019 | Phase 7 |
| PRC-020 | Phase 11 |
| PRC-021 | Phase 7 |
| PRC-022 | Phase 0 |
| PRC-023 | Phase 7 |
| PRC-024 | Phase 7 |
| PRC-025 | Phase 6 |
| PRC-026 | Phase 6 |
| PRC-027 | Phase 6 |
| PRC-028 | Phase 6 |
| PRC-029 | Phase 5 |
| PRC-030 | Phase 1, Phase 9 |
| PRC-031 | Phase 1 |
| PRC-032 | Phase 1 |
| PRC-033 | Phase 5 |
| PRC-034 | Phase 1, Phase 11 |
| PRC-035 | Phase 11 |
| PRC-036 | Phase 12 |

## Default Phase Gate

After each implementation phase, run focused tests first, then the available
project-wide checks:

```text
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run build
```

Run browser checks when the phase touches browser-visible behavior:

```text
rtk npm run test:e2e
rtk npm run test:phase9
```

Run Supabase checks when the phase touches normalized runtime, SQL, or hosted
persistence:

```text
rtk npm run test:phase9:supabase-dev
rtk npm run test:e2e:production-flow:validate
```

Run the full production-flow gate only near the end with an explicitly
configured disposable Supabase environment:

```text
rtk npm run test:e2e:production-flow
```

## Definition Of Done

A remediation phase is done only when:

- its issue-specific acceptance criteria pass
- focused tests pass
- applicable project-wide checks pass
- Playwright evidence is collected only for phases that need it
- risks and assumptions are documented
- changed files are summarized
- behavior is checked against `docs/product-spec.md`
- the repository is ready for the next phase
