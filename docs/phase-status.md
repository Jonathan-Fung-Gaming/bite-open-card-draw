# Phase Status

## Current Remediation Status

Status: Production readiness remediation code is complete. Final tournament readiness still depends
on applying the latest Supabase migration, completing the release checklist evidence, selecting or
resetting the production event namespace, and any event-day data/operator checks.

The app is not event-ready until every item in `docs/remediation-issue-checklist.md` is closed
with evidence and the final closure gate in that checklist passes. The authoritative behavior
sources during remediation are `docs/product-spec.md` and
`docs/pump_open_stage_repo_validation_checklist.md`; they override stale execution-plan or phase
status text when there is a conflict.

As of Phase 9 completion on 2026-06-30, real cached chart artwork population and rendering
verification are closed (`RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028`), Phase 8 local e2e/load
gates are clean, and the hosted Supabase rehearsal has passed. Production Supabase was used by
explicit exception because no spare hosted project remained; the accepted risk is that global
migrations were applied to the existing production project before final event use.

`docs/pump_open_stage_repo_validation_checklist.md` is present in the workspace and is intentionally
called out as a required-read project document. As of this Phase 0 remediation note, `rtk git status
--short` reports it as untracked alongside the remediation plan and issue checklist, so these docs
must be added to version control before release if they are not already tracked by the user's
branch workflow.

## Production Readiness Remediation - 2026-07-01

Status: complete for code and local validation; not event-ready until the release checklist and
external deployment gates are complete.

### Acceptance Criteria

- Supabase ballot submission, voting-window advancement, and result computation now run through
  transactional RPCs with row locks, validation, duplicate-result protection, result snapshots,
  result rows, and server-side tiebreak records.
- Supabase result computation is wired into the admin action path instead of using in-memory
  computation followed by persistence.
- Durable Supabase-backed rate limiting covers admin password/session and voting mutation attempts.
- Public vote live state no longer exposes eligible or submitted player id lists to browsers.
- Duplicate start.gg username confirmation now claims presence before confirming the voter identity
  and keeps the warning visible across ballot states.
- `/api/e2e/load-ballot` is blocked in production and requires `TOURNAMENT_TEST_ROUTE_TOKEN` for
  non-production e2e use.
- Rehearsal tiebreak seeding is treated as a dangerous action with password re-entry and audit
  reason.
- Playwright load/phase9 harnesses send the test-route token and use the dev-server harness where
  synthetic e2e mutation helpers are required.

### Changed Files

- Supabase/runtime: `supabase/migrations/20260701010000_production_readiness_transactions.sql`,
  `src/lib/server/normalized-results.ts`, `src/lib/server/rate-limit.ts`,
  `src/lib/server/repositories/normalized-runtime.ts`, `src/lib/db/database.types.ts`,
  `src/lib/db/schema.ts`.
- Admin/voting surfaces: `src/app/coolguy69/actions.ts`, `src/app/coolguy69/page.tsx`,
  `src/app/vote/actions.ts`, `src/app/vote/BallotFlow.tsx`, `src/app/vote/page.tsx`,
  `src/app/api/e2e/load-ballot/route.ts`.
- Tests and harnesses: `playwright.env.ts`, `scripts/run-playwright.mjs`, `package.json`,
  `.github/workflows/ci.yml`, `src/app/api/e2e/load-ballot/route.test.ts`,
  `src/lib/server/security-boundary.test.ts`,
  `src/lib/server/transactions/normalized-runtime.test.ts`,
  `src/lib/server/rate-limit.test.ts`, `src/lib/vote/voting-window.test.ts`,
  `tests/e2e/full-flow.spec.ts`, `tests/e2e/mobile-routes.spec.ts`,
  `tests/load/load-rehearsal.spec.ts`, `tests/phase9/hosted-four-round.spec.ts`.
- Release docs: `docs/production-readiness-remediation-2026-07-01.md`,
  `docs/deployment-readiness.md`, `docs/release-checklist.md`, `docs/phase-status.md`,
  `.env.example`.

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 38 files / 149 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 4 Playwright tests.
- `rtk npm run test:load` - passed, 100-player browser rehearsal.
- `rtk npm run test:phase9` - passed, four-round hosted-rehearsal spec.
- `rtk npm run import:charts` - passed, 4,426 charts imported with required pool counts.
- `rtk npm run cache:chart-images` - passed, 639 cached and 0 fallback image assets.
- `rtk npm run verify:real-chart-images` - passed, 639 non-fallback cached images for 4,426 charts.
- `rtk npm audit --omit=dev` - passed, 0 vulnerabilities.
- `rtk git diff --check` - passed.

### Manual Review

- Product rules were not changed: four rounds, two sets per round, seven drawn charts, max two bans
  per set, no-ban completion, server tiebreaks, and final dual-chart reveal remain intact.
- Browser code still cannot access service-role keys, session secrets, password hashes, or the new
  test-route token.
- The e2e load route remains available only for non-production test configurations with an explicit
  shared token.

### Risks And Assumptions

- The Supabase migration must be applied through
  `20260701010000_production_readiness_transactions.sql` before running with
  `TOURNAMENT_STATE_BACKEND=supabase`.
- `TOURNAMENT_TEST_ROUTE_TOKEN` must not be configured in production.
- Local phase9 now uses the dev-server harness unless explicitly configured otherwise; a separate
  hosted Supabase rehearsal still depends on valid hosted Supabase credentials and a disposable
  `TOURNAMENT_EVENT_ID`.
- `tmp-trace-phase9-close-22/` remains an unrelated untracked local artifact and was not modified.

## Release Closure - 2026-06-29

Status: complete for real cached artwork and automated repository-backed rehearsal coverage; not
event-ready until an explicitly approved hosted Supabase rehearsal is completed with a
non-production `TOURNAMENT_EVENT_ID`.

### Acceptance Criteria

- Real chart artwork: `rtk npm run cache:chart-images` runs through Node with `--use-system-ca` and
  produced `639 cached, 0 using fallback /chart-images/fallback-card.svg`.
- Deployable cache: `public/chart-images/cache` contains 639 real PNG files totaling 209,721,036
  bytes.
- Real-image gate: `rtk npm run verify:real-chart-images` verifies 639 non-fallback cached image
  assets assigned across 4,426 charts.
- Rendering verification: Playwright now requires rendered image paths to use `/chart-images/cache/`
  and not `fallback-card.svg` on `/stage`, `/vote`, `/charts`, and `/results`.
- Persistent rehearsal coverage: `persistent-tournament-flow.test.ts` now completes all four rounds
  through the operational repository boundary, persists/restores between rounds, verifies selected
  prior songs do not reappear, completes final reveal, and generates private CSV data for each round.
- CSV verification: e2e still verifies private CSV auto-download after final reveal and the manual
  `Download private ballot CSV` button; the four-round repository-backed test verifies manual
  override markers and selected chart data in generated CSV content.

### Changed Files

- Cache scripts: `package.json`, `scripts/verify-real-chart-images.ts`
- Real cached assets: `public/chart-images/cache/*.png`
- Tests: `src/lib/integration/persistent-tournament-flow.test.ts`,
  `tests/e2e/full-flow.spec.ts`
- Documentation: `docs/deployment-readiness.md`, `docs/event-day-runbook.md`,
  `docs/release-checklist.md`, `docs/release-closure-handover-2026-06-29.md`,
  `docs/remediation-issue-checklist.md`, `docs/phase-status.md`

### Checks Run

- `rtk npm run cache:chart-images` - initially reproduced `0 cached, 639 using fallback` before the
  Node CA fix; after the fix, repeated normal runs passed with `639 cached, 0 using fallback`.
- `rtk curl.exe -I https://piugame.com/data/song_img/3f951d73d3c1c32c7d238b2ce184459d.png` -
  returned `200 OK`, proving the source URL was reachable outside Node.
- `rtk node -e "fetch(...)"` - reproduced Node's `UNABLE_TO_VERIFY_LEAF_SIGNATURE` cause.
- `rtk node --use-system-ca -e "fetch(...)"` - fetched the representative image successfully.
- `rtk npm run import:charts` - passed, imported 4,426 charts with required pool counts S16 189,
  S17 196, S18 189, S19 167, S20 135, S21 150, S22 97, D23 125.
- `rtk npm run verify:real-chart-images` - passed, verified 639 non-fallback cached image assets for
  4,426 charts.
- Cache file count check - passed, 639 real files and 209,721,036 bytes under
  `public/chart-images/cache`.
- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 26 files / 76 tests.
- `rtk npm audit --omit=dev` - passed, 0 vulnerabilities.
- `rtk git diff --check` - passed.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.

### Manual Review

- Product rules: no round/set definitions, draw counts, ban rules, no-ban completion, voting window
  rules, result selection, or tiebreak authority changed.
- Artwork: fallback rendering remains available for resilience, but release closure checks now prove
  real cached artwork exists and renders on public/player surfaces.
- Persistence: the four-round repository-backed rehearsal uses the operational repository boundary
  shared with the Supabase backend, but it does not write to hosted Supabase.
- Security: `.env.local` was checked only for variable-name presence and public URL host; no secret
  values were printed or committed.
- CSV: browser e2e verifies auto/manual private CSV download for Round 1, and integration coverage
  verifies generated CSV content across all four rounds.

### Risks And Assumptions

- Hosted Supabase rehearsal remains intentionally unrun. Running it needs explicit approval, a
  confirmed non-production Supabase project/ref, and a disposable `TOURNAMENT_EVENT_ID` so real
  remote event state is not overwritten.
- The real cached image files add about 200 MB of deployable public assets. Individual files are well
  below common Git host single-file limits, but the repository and deployment artifact are larger.
- If future environments cannot reach `piugame.com` or cannot use the system CA store, keep the
  committed cache files in place and rerun `rtk npm run verify:real-chart-images` before release.

## Remediation Phase 0 - Align Instructions And Docs

Status: complete

### Acceptance Criteria

- Required-read docs: `AGENTS.md` now includes `docs/pump_open_stage_repo_validation_checklist.md`.
- Source-of-truth order: project instructions now state that the product spec and validation checklist
  override stale execution-plan text when they conflict.
- Stage layout docs: stale projector-preview layout guidance was replaced with the required two
  horizontal 7-card rows, Set 1 on top and Set 2 on bottom.
- Event readiness: this file now states the app is not event-ready until the remediation issue
  checklist is closed with evidence.
- Remediation links: event-day and release docs link the remediation plan and issue checklist.
- Gate repair: fixed the ambiguous Playwright `getByText("final")` selector exposed during
  verification by scoping the check to the result reveal controls.

### Changed Files

- `AGENTS.md`
- `docs/codex-execution-plan.md`
- `docs/testing-checklist.md`
- `docs/phase-status.md`
- `docs/event-day-runbook.md`
- `docs/release-checklist.md`
- `docs/remediation-issue-checklist.md`
- `tests/e2e/full-flow.spec.ts`

### Checks Run

- `rtk rg -n "4\\+3|4 cards on top|3 cards on bottom|compact 4\\+3|compact set panel" docs AGENTS.md`
- `rtk rg -n "not event-ready|remediation in progress|remediation-plan-2026-06-28|remediation-issue-checklist|pump_open_stage_repo_validation_checklist|source of truth" AGENTS.md docs/phase-status.md docs/event-day-runbook.md docs/release-checklist.md`
- `rtk npm run lint`
- `rtk npm run typecheck`
- `rtk npm run test`
- `rtk npm run build`
- `rtk npm run test:e2e`

### Manual Review

- Product rules: no tournament behavior was changed; this phase only aligned documentation with the
  product spec and validation checklist.
- Security: no secrets or implementation files were changed.
- Stage layout: docs now preserve the phone two-column layout as separate from the projector two-row
  layout.
- Tests: the e2e selector repair is test-only and targets the admin reveal-phase status instead of
  arbitrary chart text.

### Risks And Assumptions

- The remediation plan, remediation issue checklist, and validation checklist are currently untracked
  according to local Git status. This note documents that status; commit/staging is left to the user
  unless explicitly requested.
- Later remediation phases still need implementation work before event use.

## Remediation Phase 1 - Visible Stage And Image Fixes

Status: complete for the Phase 1 code paths; not event-ready because real cached artwork population
remains open in `docs/remediation-issue-checklist.md`.

### Acceptance Criteria

- Stage auto-refresh: `/stage` now includes `StageAutoRefresh`, which polls with `router.refresh()`
  every 2000ms.
- Public revalidation: admin draw and reroll actions now call `revalidateTournamentViews`, matching
  existing voting/reveal/reset revalidation behavior.
- Stage reveal sequence: projector rows reveal from committed draw `createdAt` timestamps at 1800ms
  per card, with Set 2 scheduled after all 7 Set 1 cards plus the reveal gap.
- Stage layout: projector preview is two labeled horizontal 7-card rows, Set 1 on top and Set 2 below.
- Phone layout: phone voting remains its separate two-column card grid with the 7th card centered.
- Runtime images: draw state now prefers `data/generated/charts-with-images.json` and verifies cached
  local public files before preserving non-fallback `localImagePath`.
- Fallback behavior: fallback art is used for missing, failed, or absent cached images.
- Real image cache attempt: `rtk npm run cache:chart-images` completed with 0 cached real images and
  639 fallback assets; `public/chart-images/cache` contained 0 files.

### Changed Files

- Stage/public UI: `src/app/stage/page.tsx`, `src/app/stage/StageAutoRefresh.tsx`,
  `src/components/StageSetPanel.tsx`, `src/components/StageDrawCard.tsx`,
  `src/components/ResultSetPanel.tsx`, `src/app/globals.css`
- Admin/public state: `src/app/coolguy69/actions.ts`, `src/lib/stage/stage-view.ts`,
  `src/lib/stage/stage-view.test.ts`
- Image/runtime data: `src/lib/charts/image-paths.ts`, `src/lib/charts/runtime-catalog.ts`,
  `src/lib/charts/runtime-catalog.test.ts`, `src/lib/charts/image-cache.ts`,
  `src/lib/charts/image-cache.test.ts`, `src/lib/draw/draw-state.ts`
- Phone/result image use: `src/app/vote/BallotFlow.tsx`, `src/app/vote/page.tsx`,
  `src/lib/vote/ballot.ts`
- E2E coverage: `tests/e2e/full-flow.spec.ts`
- Documentation: `docs/phase-status.md`, `docs/remediation-issue-checklist.md`

### Checks Run

- `rtk npm run lint` - passed
- `rtk npm run typecheck` - passed
- `rtk npm run test` - passed, 20 files / 54 tests
- `rtk npm run build` - passed
- `rtk npm run test:e2e` - passed, 1 Playwright test
- `rtk npm run cache:chart-images` - completed, but cached 0 real images and generated fallback
  metadata for all 639 image assets
- `rtk proxy powershell -NoProfile -Command "Get-ChildItem -Recurse -File -LiteralPath 'public\chart-images\cache' -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count"` - returned 0

### Manual Review

- Product rules: no tournament rules changed; round/set definitions, one voting window, ban rules,
  and server-side draw/reroll/result authority remain intact.
- Stage UI: projector rows are no longer 4+3 panels; reveal order is Set 1 cards 1-7, then Set 2
  cards 1-7; final reveal still shows exactly the two selected charts.
- Phone UI: the voter layout remains separate from projector layout and still uses two columns with
  the 7th card centered.
- Security: public refresh is read-only client polling; tournament-changing actions remain server
  actions behind admin session and host control.
- Tests: e2e now keeps a second `/stage` tab open and verifies draw, reroll, voting-open, and final
  reveal updates without manual stage navigation.

### Risks And Assumptions

- Real cached image files were not produced in this environment because all upstream image fetches
  failed. `RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028` remain open.
- `data/generated/*.json` and `public/chart-images/cache/` remain ignored/reproducible. Deployment
  still needs an event setup step or build workflow that provides generated metadata and real cached
  assets.
- The stage polling interval is 2000ms, so projector updates are intentionally lightweight rather
  than instant.
- Operational state is still in-memory until the later Supabase persistence remediation phase.

## Remediation Phase 2 - Stage, QR, And Result Reveal Polish

Status: complete for the Phase 2 code paths; not event-ready because real cached artwork population
and later remediation phases remain open.

### Acceptance Criteria

- QR code: `QRPanel` now generates a real SVG QR code with the `qrcode` package.
- QR target: the encoded room URL is built from `NEXT_PUBLIC_SITE_URL` plus `/room`, with a `/room`
  fallback if the event origin is not configured.
- Short URL: the stage QR panel shows the short event URL beneath the QR code.
- Timer and QR readability: the projector side rail is widened and Playwright verifies QR/timer
  bounding boxes during voting.
- Tiebreak reveal: the selected chart row and winner text stay hidden until the 5-second reveal
  duration completes.
- Backend authority: `ResultStore` records `winnerRevealStartedAt` for resolved tiebreak phases and
  blocks advancing past a tiebreak reveal before 5 seconds have elapsed.
- Final stage stability: Playwright verifies the final stage screen has exactly two selected chart
  cards.
- Visual/e2e coverage: Playwright covers two 7-card stage rows, QR SVG/target/short URL, timer,
  rendered stage image natural width, tiebreak hide/reveal behavior, and final reveal.

### Changed Files

- QR/public URL: `src/components/QRPanel.tsx`, `src/lib/public-url.ts`,
  `src/lib/public-url.test.ts`, `package.json`, `package-lock.json`
- Stage readability/test hooks: `src/app/stage/page.tsx`, `src/components/CountdownTimer.tsx`,
  `src/components/StageDrawCard.tsx`, `src/components/StageSetPanel.tsx`, `src/app/globals.css`
- Tiebreak reveal: `src/components/ResultSetPanel.tsx`, `src/components/RuneWheel.tsx`,
  `src/lib/results/result-engine.ts`, `src/lib/results/result-store.ts`,
  `src/lib/results/reveal-timing.ts`, `src/lib/results/result-store.test.ts`,
  `src/lib/results/private-csv.test.ts`
- E2E/docs: `tests/e2e/full-flow.spec.ts`, `docs/phase-status.md`,
  `docs/remediation-issue-checklist.md`

### Checks Run

- `rtk npm run typecheck` - passed
- `rtk npm run test -- src/lib/public-url.test.ts src/lib/results/result-store.test.ts src/lib/results/result-engine.test.ts` - passed
- `rtk npm run test:e2e` - initially exposed an e2e wait issue around the second tiebreak panel, then passed after the helper waited for the current reveal panel
- `rtk npm run lint` - passed
- `rtk npm run test` - passed, 22 files / 58 tests
- `rtk npm run build` - passed
- Final required checks were rerun after documentation updates; see the final Phase 2 handoff.

### Manual Review

- Product rules: QR remains a general `/room` link; no player-specific QR or `/vote` QR target was
  introduced.
- Results: tiebreak winners are still chosen by the server-side result computation before animation;
  the client only reveals the committed winner after the 5-second delay.
- Stage UI: the voting screen keeps the large timer and QR in a readable projector side rail, while
  the chart preview remains two horizontal 7-card rows.
- Final reveal: the final stage path maps only the two selected charts and the e2e test asserts
  exactly two final cards.
- Security: no secrets or password hashes were introduced; QR URL construction uses only the public
  `NEXT_PUBLIC_SITE_URL` value.

### Risks And Assumptions

- `NEXT_PUBLIC_SITE_URL` must be configured to the real event origin for phone scanning outside
  localhost. Without it, the QR falls back to `/room`, which is useful locally but not event-ready.
- Real cached artwork is still not populated in `public/chart-images/cache`; `RIC-020`, `RIC-021`,
  `RIC-022`, and `RIC-028` remain open.
- The stage polling interval is still 2000ms, so e2e waits account for lightweight refresh timing.
- Operational state remains in-memory until the later Supabase persistence remediation phase.

## Remediation Phase 3 - Phone Live State And Ballot UX

Status: complete for the Phase 3 code paths; not event-ready because real cached artwork population,
admin safety, persistence, and later remediation phases remain open.

### Acceptance Criteria

- Phone live refresh: active ballot screens poll server-backed voting state every 1500ms through
  `getVoteLiveStateAction`; paused, closed, revealed, and waiting `/vote` states refresh every 2000ms.
- Status transitions: phone UI updates from server state for pause/resume, final 30 seconds,
  one-minute extension, close, results revealing, and final reveal without manual navigation.
- Saved ballot recovery: selecting a start.gg username or reloading a remembered phone uses the
  existing ballot lookup to prefill saved choices and the server-confirmed timestamp.
- Remembered identity: the selected start.gg username is stored in device `localStorage` for the
  event and reused after refresh.
- Duplicate-use warning: a second device selecting an already-submitted username sees a warning before
  confirmation, including that the latest valid submitted ballot counts.
- Stale mutation safety: active ballot controls disable when the live snapshot reports voting is not
  accepting changes, and the server action still rejects stale invalid submissions.
- Emergency eligibility: password-gated current-round inactive-player add now updates an already-open
  voting snapshot and recalculates the turnout denominator.

### Changed Files

- Phone voting UI and polling: `src/app/vote/BallotFlow.tsx`,
  `src/app/vote/VoteAutoRefresh.tsx`, `src/app/vote/actions.ts`, `src/app/vote/page.tsx`
- Voting state: `src/lib/vote/voting-window.ts`, `src/lib/vote/voting-window.test.ts`
- Admin eligibility action: `src/app/coolguy69/actions.ts`
- E2E coverage: `tests/e2e/full-flow.spec.ts`
- Documentation: `docs/phase-status.md`, `docs/remediation-issue-checklist.md`

### Checks Run

- `rtk npm run lint` - passed
- `rtk npm run typecheck` - passed
- `rtk npm run test` - passed, 22 files / 59 tests
- `rtk npm run test:e2e` - passed, 2 Playwright tests
- `rtk npm run build` - passed

### Manual Review

- Product rules: voting still uses one round ballot covering both chart sets, explicit no-ban remains
  required for zero bans, and latest valid submitted ballot continues to win.
- Phone UX: saved choices and timestamps are visible after refresh; `Change vote` remains available
  only while server state allows player ballot changes.
- Security: phone polling exposes only voting status, turnout summary, eligibility/submitted IDs, and
  the selected player's existing ballot lookup; ballot mutations still go through server actions.
- Eligibility: emergency current-round additions keep the active voting snapshot authoritative for the
  in-memory phase and update turnout math.

### Risks And Assumptions

- Operational state remains in-memory until the later Supabase persistence remediation phase.
- Phone polling is intentionally lightweight rather than instant; the server remains the final guard
  against stale submissions during the interval between polls.
- Real cached artwork remains unverified and `RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028` remain open.

## Remediation Phase 4 - Admin Safety And Missing Workflows

Status: complete for the Phase 4 code paths; not event-ready because operational persistence and real
cached artwork population remain open.

### Acceptance Criteria

- Host lock safety: unexpired host locks cannot be silently stolen; takeover now requires the
  explicit force path and warning when another active host holds the lock.
- Admin audit trail: host control, draw/reroll, voting, manual ballot, emergency, result correction,
  rehearsal, round, and roster-changing server actions write in-memory audit records with session,
  action, reason, summary, metadata, affected records, and danger flags.
- Dangerous summaries: reroll, reset/rehearsal, manual ballot/replacement, emergency reopen,
  reset-round, and result override forms show clear consequences before password entry.
- Sensitive counts: admin-only live chart-by-chart counts sit behind a warning disclosure and do not
  require a second password, while public routes still expose only safe voting status/turnout before
  close.
- Emergency workflows: admins can reopen closed voting for a chosen 1-10 minute duration, reset one
  round's operational state, and override a computed selected chart through dangerous password-gated
  actions with required audit reasons.
- Manual ballot timing: manual ballots are allowed while voting is open or closed before reveal
  starts; a computed-but-unrevealed result is invalidated and must be recomputed after the manual
  ballot.

### Changed Files

- Admin audit and host safety: `src/lib/admin/audit.ts`, `src/lib/admin/audit.test.ts`,
  `src/lib/admin/host-lock.ts`, `src/lib/admin/host-lock.test.ts`,
  `src/lib/server/admin-state.ts`
- Admin workflows/UI: `src/app/coolguy69/actions.ts`, `src/app/coolguy69/page.tsx`,
  `src/app/coolguy69/_components/ManualBallotForm.tsx`,
  `src/components/DangerousActionDialog.tsx`
- Operational stores: `src/lib/vote/voting-window.ts`, `src/lib/vote/ballot-store.ts`,
  `src/lib/draw/draw-state.ts`, `src/lib/results/result-store.ts`
- Tests and docs: `src/lib/vote/voting-window.test.ts`,
  `src/lib/results/result-store.test.ts`, `tests/e2e/full-flow.spec.ts`,
  `docs/phase-status.md`, `docs/remediation-issue-checklist.md`

### Checks Run

- `rtk npm run typecheck` - passed
- `rtk npm run test -- src/lib/admin/host-lock.test.ts src/lib/admin/audit.test.ts src/lib/vote/voting-window.test.ts src/lib/results/result-store.test.ts` - passed
- `rtk npm run lint` - passed
- `rtk npm run test` - passed, 23 files / 64 tests
- `rtk git diff --check` - passed
- `rtk npm run test:e2e` - passed, 2 Playwright tests
- `rtk npm run build` - passed

### Manual Review

- Product rules: round/set definitions, two-set round ballots, explicit no-ban completion, least-ban
  selection, and server-decided tiebreaks are unchanged.
- Host lock: read-only admins see disabled tournament controls until they take the explicit force
  path or the existing host lock expires.
- Security: dangerous actions remain server actions requiring active host control and password
  re-entry; public route payloads were not expanded with live chart-by-chart counts.
- Result integrity: manual ballots after computation clear the computed result before reveal begins,
  and post-reveal corrections use an explicit override workflow instead of mutating ballots silently.

### Risks And Assumptions

- The Phase 4 audit store is still in memory until the persistence remediation phase moves
  operational state to Supabase.
- Reset-round is intentionally emergency-only and clears current in-memory state for the selected
  round; it does not repair already-exported CSV files outside the app.
- Real cached artwork remains unverified and `RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028` remain open.

## Remediation Phase 5 - Supabase Persistence

Status: complete for the Phase 5 persistence layer; not event-ready because real cached artwork,
chart exclusion UI/image pipeline hardening, and final rehearsal/CI reconciliation remain open.

### Acceptance Criteria

- Supabase repository: added a server-only `SupabaseOperationalStateRepository` that stores the
  authoritative tournament snapshot in `public.tournament_state_snapshots`.
- Runtime backend mode: `TOURNAMENT_STATE_BACKEND=supabase` selects Supabase persistence for
  deployed/event use; the memory backend remains only for tests, local demos, and single-process
  development.
- Hydration and saves: admin, stage, vote, charts, and results server reads hydrate from persistence;
  successful tournament-changing server actions persist state before revalidating views.
- Persisted operational state: roster, inactive/restored players, current-round eligibility, host
  lock/heartbeat, draw/reroll history, drawn chart order, excluded chart keys, voting windows,
  ballots/revisions/manual metadata, result snapshots/reveal phase, current round, rehearsal mode,
  and admin audit records are included in the snapshot.
- Selected-song exclusions: restored draw state derives selected prior songs from persisted final
  result snapshots rather than trusting only an in-memory set.
- Placeholder cleanup: removed the unused Phase 2 `tournament-mutations` placeholder module now that
  implemented server actions are the mutation boundary.

### Changed Files

- Persistence service: `src/lib/persistence/operational-state.ts`,
  `src/lib/persistence/repository.ts`, `src/lib/server/persistence.ts`,
  `src/lib/server/supabase-operational-state.ts`
- Store snapshots: `src/lib/admin/audit.ts`, `src/lib/admin/host-lock.ts`,
  `src/lib/admin/roster.ts`, `src/lib/draw/draw-state.ts`,
  `src/lib/vote/ballot-store.ts`, `src/lib/vote/voting-window.ts`,
  `src/lib/results/result-store.ts`, `src/lib/round/round-state.ts`,
  `src/lib/server/admin-state.ts`
- App wiring: `src/app/coolguy69/actions.ts`, `src/app/coolguy69/page.tsx`,
  `src/app/vote/actions.ts`, `src/app/vote/page.tsx`, `src/app/stage/page.tsx`,
  `src/app/charts/page.tsx`, `src/app/results/page.tsx`
- Schema/docs/tests: `supabase/migrations/20260628050200_initial_schema.sql`,
  `src/lib/db/database.types.ts`, `src/lib/db/schema.ts`, `.env.example`,
  `src/lib/persistence/operational-state.test.ts`, `docs/deployment-readiness.md`,
  `docs/phase-status.md`, `docs/remediation-issue-checklist.md`

### Checks Run

- `rtk npm run typecheck` - passed
- `rtk npm run test -- src/lib/persistence/operational-state.test.ts src/lib/admin/host-lock.test.ts src/lib/vote/voting-window.test.ts src/lib/results/result-store.test.ts src/lib/draw/draw-state.test.ts` - passed
- `rtk npm run lint` - passed
- `rtk npm run test` - passed, 24 files / 67 tests
- `rtk git diff --check` - passed
- `rtk npm run build` - passed
- `rtk npm run test:e2e` - passed, 2 Playwright tests

### Manual Review

- Product rules: no tournament rules changed; the existing server-side draw, voting, result, and
  tiebreak logic remains the authority inside the persisted operational snapshot.
- Security: service-role Supabase access stays in server-only modules; browser code only receives
  existing public/read payloads and no password hashes or service keys.
- Persistence: server components and server actions hydrate before reading mutable tournament state;
  successful mutations persist the snapshot before public revalidation.
- CSV/privacy: private CSV generation remains admin-session gated and now hydrates persisted
  result/ballot state before exporting.

### Risks And Assumptions

- `TOURNAMENT_STATE_BACKEND=supabase` must be set for deployed/event use. The default memory backend
  is only for local tests and demos.
- The Phase 5 persistence layer stores an operational snapshot row rather than fully rewriting every
  workflow against each normalized Supabase table. The existing normalized tables remain available
  for later reporting or migration hardening.
- Real cached artwork remains unverified and `RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028` remain open.

## Remediation Phase 6 - Data And Image Pipeline Hardening

Status: complete for the Phase 6 app/pipeline hardening code paths; not event-ready because full
event setup still produced 0 real cached artwork files in this environment.

### Acceptance Criteria

- Chart import exclusions: `rtk npm run import:charts` now reads
  `data/generated/chart-exclusions.json` before validating required pool counts.
- Admin chart eligibility: `/coolguy69` shows required pool counts and renders a selected pool's
  chart exclusion/re-inclusion controls.
- Exclusion auditability: chart exclusion changes require active host control, admin password
  re-entry, and an audit reason; persisted snapshots store full `chartExclusions` records.
- Pool validation: live chart exclusions are rejected when they would leave the chart's required pool
  below 7 eligible charts.
- Draw eligibility: live exclusions overlay runtime chart data before draw/reroll eligibility, and
  re-inclusions can return a chart to eligibility.
- Deployable cache support: `public/chart-images/cache` is no longer ignored, and runtime can derive
  deterministic cache paths from source `bg_img` when deployable public cache files exist.
- Image rendering checks: Playwright now verifies rendered artwork on `/stage`, `/vote`, `/charts`,
  and `/results` through natural-width checks.
- Real artwork blocker: normal and unsandboxed `rtk npm run cache:chart-images` both completed with
  `0 cached, 639 using fallback`; `public/chart-images/cache` still had 0 real files.

### Changed Files

- Chart import/cache/runtime: `.gitignore`, `public/chart-images/cache/.gitkeep`,
  `scripts/import-charts.ts`, `src/lib/charts/exclusions.ts`,
  `src/lib/charts/runtime-catalog.ts`
- Draw/persistence/contracts: `src/lib/draw/draw-state.ts`,
  `src/lib/persistence/operational-state.test.ts`,
  `src/lib/server/mutation-contracts.ts`
- Admin/player/e2e UI: `src/app/coolguy69/actions.ts`, `src/app/coolguy69/page.tsx`,
  `src/app/vote/BallotFlow.tsx`, `src/app/vote/page.tsx`,
  `tests/e2e/full-flow.spec.ts`
- Tests/docs: `src/lib/charts/importer.test.ts`, `src/lib/charts/runtime-catalog.test.ts`,
  `src/lib/draw/draw-state.test.ts`, `src/lib/server/mutation-contracts.test.ts`,
  `docs/deployment-readiness.md`, `docs/event-day-runbook.md`,
  `docs/release-checklist.md`, `docs/testing-checklist.md`,
  `docs/remediation-issue-checklist.md`, `docs/phase-status.md`

### Checks Run

- `rtk npm run test -- --run src/lib/charts/importer.test.ts src/lib/draw/draw-state.test.ts src/lib/charts/runtime-catalog.test.ts src/lib/server/mutation-contracts.test.ts` - passed, 4 files / 12 tests
- `rtk npm run import:charts` - passed, imported 4426 charts with required pool counts S16 189, S17 196, S18 189, S19 167, S20 135, S21 150, S22 97, D23 125
- `rtk npm run cache:chart-images` - completed with 0 cached, 639 fallback
- `rtk npm run cache:chart-images` unsandboxed - completed with 0 cached, 639 fallback
- Real cache file count: `public/chart-images/cache` contained 0 files excluding `.gitkeep`
- `rtk npm run lint` - passed
- `rtk npm run typecheck` - passed
- `rtk npm run test` - passed, 24 files / 71 tests
- `rtk git diff --check` - passed
- `rtk npm run build` - passed
- `rtk npm run test:e2e` - passed, 2 Playwright tests

### Manual Review

- Product rules: no round/set, draw-count, ban-count, no-ban, voting-window, result, or tiebreak
  tournament rules were changed.
- Admin safety: chart exclusion/re-inclusion is treated as dangerous because it changes future draw
  eligibility; it requires password re-entry and reasoned audit metadata.
- Runtime images: missing artwork still falls back and does not block draw, stage, phone, charts, or
  results; deterministic cache derivation only preserves non-fallback paths when public files exist.
- UI performance: the admin chart eligibility UI renders one selected pool's forms at a time so the
  private CSV client controls still hydrate promptly.

### Risks And Assumptions

- Full event setup still cannot claim non-fallback artwork: both cache attempts produced 0 real cached
  images with `failureReason: "fetch failed"`. `RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028` remain
  open.
- Generated JSON under `data/generated/*.json` remains reproducible and ignored; real cache image
  files under `public/chart-images/cache` are now deployable when populated.
- The chart exclusion UI defaults to the current round's first pool and lets the host switch pools;
  it intentionally avoids rendering every chart form at once.

## Remediation Phase 7 - Test And CI Repair

Status: complete for the Phase 7 test and CI reliability scope; not event-ready because remaining
remediation rows still include real cached artwork population and `/charts` live-refresh coverage.

### Acceptance Criteria

- Repository-backed integration: added a persistent tournament flow test that saves/restores through
  the operational repository boundary between roster/host-lock setup, draws, voting, ballot submit,
  result computation, and result reveal.
- Persistent load coverage: added a 100-player load-sized path that submits and edits every ballot,
  persists through the repository, restores, and verifies one latest revision-2 ballot per player.
- CI stability: added workflow tests that enforce the current GitHub Actions quality gates and block
  production secret references in `.github/workflows/ci.yml`.
- Secret hygiene: added a test proving `.env` and `.env.local` remain ignored and untracked while
  `.env.example` is allowed.
- CI/local parity: CI continues to run install, Playwright browser install, lint, typecheck, tests,
  chart import, fallback image cache, production audit, build, and e2e.

### Changed Files

- Added `src/lib/integration/persistent-tournament-flow.test.ts`
- Added `src/lib/server/ci-workflow.test.ts`
- Updated `docs/remediation-issue-checklist.md`
- Updated `docs/testing-checklist.md`
- Updated `docs/phase-status.md`

### Checks Run

- `rtk npm run test -- --run src/lib/integration/persistent-tournament-flow.test.ts src/lib/server/ci-workflow.test.ts` - passed, 2 files / 4 tests
- `rtk npm run test` - passed, 26 files / 75 tests
- `rtk npm run import:charts` - passed, imported 4426 charts with all required pools at 7+
- `rtk npm run cache:chart-images -- --fallback-only` - passed, 639 fallback assets
- `rtk npm run lint` - passed
- `rtk npm run typecheck` - passed
- `rtk git diff --check` - passed
- `rtk npm run build` - passed
- `rtk npm run test:e2e` - passed, 2 Playwright tests

### Manual Review

- Product rules: new tests exercise existing flows and do not change tournament behavior.
- Persistence: repository-backed tests use the same operational snapshot abstraction selected by the
  Supabase backend, without requiring production Supabase secrets in CI.
- CI security: workflow tests reject `secrets.` and production secret env names in CI configuration;
  Playwright generates test-only admin/session/service values at runtime.
- Load: the 100-player path uses normal ballot submission and replacement semantics and restores the
  persisted latest revisions before asserting final state.

### Risks And Assumptions

- Phase 7 does not run against a live Supabase project in CI; it verifies the repository/snapshot
  boundary used by both memory and Supabase persistence without production credentials.
- CI intentionally runs fallback image cache generation. Real non-fallback artwork remains an event
  setup blocker until `rtk npm run cache:chart-images` can produce cached assets.
- `/charts` live-refresh coverage remains open until Remediation Phase 8.

## Remediation Phase 8 - Final Documentation And Release Reconciliation

Status: complete for final route-refresh and documentation reconciliation; not event-ready because
real cached artwork verification and the full four-round persistent rehearsal remain open.

### Acceptance Criteria

- `/charts` live refresh: `/charts` now includes `ChartsAutoRefresh`, which polls with
  `router.refresh()` every 2000ms.
- `/charts` evidence: Playwright keeps an already-open `/charts` page through draw, reroll,
  both-set display, and final reveal without manual navigation.
- Release docs: release, deployment, event-day, admin, and testing docs now agree that deployed or
  event use requires `TOURNAMENT_STATE_BACKEND=supabase`.
- Final gates: release docs explicitly require the remediation issue checklist, real cached artwork
  verification, a full four-round rehearsal against persistent state, and private CSV verification
  after final reveal.
- Stale docs: the current admin runbook no longer says operational mutations are in-memory only, and
  the historical phase archive below is marked as superseded by the remediation status above.
- Closure status: `RIC-094` is closed with e2e evidence; `RIC-020`, `RIC-021`, `RIC-022`, and
  `RIC-028` remain open because real cached artwork was not verified.

### Changed Files

- `/charts` live refresh: `src/app/charts/ChartsAutoRefresh.tsx`, `src/app/charts/page.tsx`
- E2E coverage: `tests/e2e/full-flow.spec.ts`
- Documentation: `docs/admin-runbook.md`, `docs/deployment-readiness.md`,
  `docs/event-day-runbook.md`, `docs/release-checklist.md`,
  `docs/remediation-issue-checklist.md`, `docs/testing-checklist.md`,
  `docs/phase-status.md`

### Checks Run

- `rtk npm run typecheck` - passed
- `rtk npm run test:e2e` - passed, 2 Playwright tests
- `rtk npm run lint` - passed
- `rtk npm run test` - passed, 26 files / 75 tests
- `rtk npm run import:charts` - passed, imported 4426 charts with required pool counts S16 189,
  S17 196, S18 189, S19 167, S20 135, S21 150, S22 97, D23 125
- `rtk npm run cache:chart-images -- --fallback-only` - passed, 0 cached and 639 fallback assets
- `rtk npm audit --omit=dev` - passed
- `rtk git diff --check` - passed
- `rtk npm run build` - passed

### Manual Review

- Product rules: no round/set definitions, draw counts, ban rules, no-ban completion, voting window
  rules, result selection, or tiebreak authority changed.
- `/charts`: the new client polling is read-only and mirrors the existing public refresh pattern;
  tournament-changing actions remain server-side.
- Docs: deployment and runbook guidance now preserves the Phase 5 persistence requirement and does
  not claim event readiness while the remediation closure gate remains blocked.
- CSV: Playwright still verifies private CSV auto-download after final reveal and the manual admin
  download button; release docs require repeating that check during full rehearsal.

### Risks And Assumptions

- A full four-round browser rehearsal against persistent state was not completed in this phase; it
  remains a release blocker.
- Real cached artwork is still unverified. Prior Phase 6 non-fallback cache attempts produced
  `0 cached, 639 using fallback`; do not close `RIC-020`, `RIC-021`, `RIC-022`, or `RIC-028` until
  real cached files and rendering are verified.
- CI/local checks use fallback image cache generation; non-fallback artwork remains an event setup
  gate.

## Historical Implementation Phase Archive

The sections below predate the remediation plan and are retained as historical implementation notes.
When they conflict with the current remediation status above, `docs/product-spec.md`,
`docs/pump_open_stage_repo_validation_checklist.md`, and `docs/remediation-issue-checklist.md` are
authoritative.

## Phase 1 - Project Scaffold, Docs, And Route Skeleton

Status: complete

### Acceptance Criteria

- Required routes: complete
- Uploaded logo: present at `public/brand/tournament-logo.png`
- Documentation files: complete
- `AGENTS.md`: present
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test`
- Production build: passed with `npm run build`
- E2E: not available in Phase 1 because Playwright is not introduced yet

### Changed Files

- App scaffold: `package.json`, `package-lock.json`, Next, TypeScript, ESLint, Tailwind, PostCSS, Vitest, and Prettier config files
- Routes: `/stage`, `/room`, `/vote`, `/charts`, `/results`, `/coolguy69`
- Shared components: `TournamentLogo`, `ChartCard`, `ChartSetPanel`, `RoundHeader`, `CountdownTimer`, `QRPanel`, `AdminLayout`, `DangerousActionDialog`, `HostLockBadge`
- Shared constants and tests: `src/lib/tournament.ts`, `src/lib/tournament.test.ts`, `vitest.config.ts`
- Docs: `docs/implementation-plan.md`, `docs/data-model.md`, `docs/admin-runbook.md`, `docs/phase-status.md`, plus README/testing/runbook updates
- Ignore rules: `.gitignore` now covers Next output, generated TypeScript build info, local env files, Vercel, Supabase runtime files, logs, caches, and test output

### Manual Review

- Product rules: required routes exist, locked round set map is represented, the player label text is exact, the room offers voting and view-only choices, and no tournament decisions are made in browser code.
- Security: no secret values were added; only `.env.example` contains secret variable names; admin auth and dangerous actions remain non-operational placeholders until their planned phases.
- Data: Phase 1 has only typed constants and placeholder charts; database schema and chart import are deferred to Phases 2 and 3.
- UI: the shell uses the uploaded logo, black industrial panels, orange/red glow, rune-style accents, and readable placeholder screens without official DOOM assets.
- Tests: placeholder unit tests cover the locked route list and round set map.

### Risks And Assumptions

- Admin authentication, host lock, roster management, draw logic, voting logic, results, and CSV export are not implemented yet by design.
- E2E tests are not available yet; they should be added when Playwright is introduced in a later phase.
- The production build detected a local `.env.local`, but `.gitignore` excludes it and no local secret value was read or committed.
- npm audit for production dependencies passed after forcing patched PostCSS via npm overrides.

## Phase 2 - Database Schema And Server Foundation

Status: complete

### Acceptance Criteria

- Migrations: SQL migration created at `supabase/migrations/20260628050200_initial_schema.sql`
- Local migration apply: blocked because neither Supabase CLI nor `psql` is installed in this environment
- Round set seed data: present in migration and statically tested
- Server-side Supabase client: created in `src/lib/server/supabase.ts`
- Client-side code cannot import server-only secrets: server secret modules import `server-only`; browser client uses only `NEXT_PUBLIC_*`
- Placeholder mutation functions: complete for all Phase 2 required contracts
- Basic database tests: passed with `npm run test`
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Production build: passed with `npm run build`
- Production dependency audit: passed with `npm audit --omit=dev`
- E2E: not available because Playwright is not introduced yet

### Changed Files

- Added Supabase migration with core tournament tables, indexes, locked round/set seed data, and row level security enabled on all core tables
- Added database metadata and partial Supabase database types in `src/lib/db`
- Added browser-safe Supabase anon client helper in `src/lib/db/browser-client.ts`
- Added server-only environment and service-role Supabase helpers in `src/lib/server`
- Added Zod mutation contracts and placeholder server-side mutation functions for all tournament-changing operations
- Added migration and mutation contract tests
- Updated data model and security docs
- Updated package dependencies for Supabase, `server-only`, and Zod

### Manual Review

- Product rules: schema preserves four rounds, two fixed sets per round, draw count 7, max bans 2, duplicate active username blocking, round player eligibility snapshots, ballot revisions, manual overrides, result snapshots, and tiebreak records.
- Security: service-role key, admin password hash, and session secret are read only from server-only modules; RLS is enabled with no permissive browser policies; tournament mutation functions are server-only placeholders.
- Data: tables cover the Phase 2 required list plus `round_player_eligibility` for the active-player snapshot rule.
- UI: no Phase 2 UI behavior was added beyond existing route shells.
- Tests: static migration tests verify required tables, RLS, round-set seed rows, active username uniqueness, and completed ballot choice constraints.

### Risks And Assumptions

- The SQL migration has not been applied to a live or local Supabase database because required local tooling is unavailable. It is statically tested but still needs a real Supabase apply check once tooling/project credentials are available.
- Mutation functions validate input shape and clearly return `not_implemented`; real database behavior begins in later phases.
- Database types are partial hand-written types for the Phase 2 scaffold and should be replaced or expanded from Supabase-generated types once the schema stabilizes.

## Phase 3 - Chart Import, Normalization, Image Caching, And Exclusions

Status: complete

### Acceptance Criteria

- Chart import: passed with `npm run import:charts`
- Source data: imported from `data/source/charts.csv`
- Import result: 4,426 unique S/D charts imported from 4,571 source rows
- Unsupported rows: 145 `c` type rows skipped because tournament pools only use S/D charts
- Duplicate chart keys: 0 in the supplied CSV
- Required pools: S16=189, S17=196, S18=189, S19=167, S20=135, S21=150, S22=97, D23=125
- Image cache/fallback: passed with `npm run cache:chart-images -- --fallback-only`
- Image result: 639 unique image asset records planned with fallback art at `public/chart-images/fallback-card.svg`
- Exclusions and re-inclusions: covered by unit tests in `src/lib/charts/normalize.test.ts`
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (6 files, 19 tests)
- Production build: passed with `npm run build`
- E2E: placeholder passed with `npm run test:e2e`; Playwright is not introduced yet
- Production dependency audit: passed with `npm audit --omit=dev`

### Changed Files

- Added chart domain modules in `src/lib/charts`
- Added `npm run import:charts` and `npm run cache:chart-images`
- Added chart import and fallback cache scripts in `scripts`
- Added local fallback chart art in `public/chart-images/fallback-card.svg`
- Added generated-output ignore rules and `data/generated/.gitkeep`
- Updated README, testing checklist, and event-day runbook with import/cache workflow
- Added `csv-parse` and `tsx` dependencies

### Manual Review

- Product rules: normalization limits active tournament pools to S16/S17, S18/S19, S20/S21, and S22/D23; each required pool has far more than 7 eligible charts in current source data.
- Security: import/cache scripts do not read service-role keys or browser secrets; generated chart data contains public chart metadata and remote art references only.
- Data: chart type, level, display difficulty, song key, and chart key are stable; duplicate chart keys are detected and skipped; unsupported `c` chart rows are reported rather than silently mixed into tournament pools.
- Exclusions: helper functions require a reason and support both exclusion and re-inclusion by chart key.
- Images: cache planning deduplicates remote `bg_img` URLs and uses a committed original fallback card when live downloads are unavailable.
- Tests: unit tests cover normalization, duplicate handling, required pool validation against the real CSV, exclusion/re-inclusion, and image fallback planning.

### Risks And Assumptions

- The fallback-only cache run does not download third-party images. Full image fetching is available through `npm run cache:chart-images` and should be run before the event on a network-enabled machine.
- Generated manifests under `data/generated/*.json` are ignored because they are reproducible from the source CSV and can be several megabytes.
- Real Supabase chart upserts still depend on Phase 2 credentials/tooling becoming available; local generated JSON is the offline/import verification artifact for this phase.

## Phase 4 - Admin Authentication, Host Lock, And Roster Management

Status: complete

### Acceptance Criteria

- `/coolguy69` requires password: implemented with login-only unauthenticated view
- Admin password storage: verifies `ADMIN_PASSWORD_HASH`; plaintext password is never stored
- Admin session cookie: signed HTTP-only cookie with 30-minute max age
- Host lock: implemented with server-side lock, host token cookie, heartbeat client, release action, and takeover behavior after expiry
- Read-only admin browsers: roster and dangerous controls are disabled and server actions reject mutations without active host control
- Roster management: add player, bulk import, mark active/inactive, reactivate inactive players, and active count are implemented
- Duplicate active start.gg usernames: blocked in the roster store and covered by tests
- Current-round eligibility: inactive player addition requires active host control, admin password re-entry, and audit reason
- Dangerous action dialog: reusable password/reason-capable component is wired for current-round eligibility
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (9 files, 25 tests)
- E2E: placeholder passed with `npm run test:e2e`
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added admin password hash verification, signed session tokens, host lock store, and roster store
- Added server-only admin auth/state helpers
- Added `/coolguy69` server actions for login/logout, host lock, roster edits, and dangerous eligibility changes
- Replaced the admin route shell with password-gated admin UI and host-lock-aware controls
- Added host heartbeat and inactivity timer client components
- Added unit tests for password hashing, host lock behavior, and roster behavior
- Updated admin docs, testing checklist, and `.env.example`

### Manual Review

- Product rules: roster uses start.gg usernames, keeps inactive players visible/restorable, blocks duplicate active usernames, and gates current-round eligibility changes behind dangerous confirmation.
- Security: admin password is checked against a hash only; sessions and host tokens use HTTP-only cookies; tournament-changing admin actions require a server-side session and active host control.
- Data: Phase 4 uses server-only in-memory stores because Supabase credentials/tooling are unavailable; later phases should move these operations to Supabase tables.
- UI: `/coolguy69` is no longer a public console; unauthenticated users see only login. Read-only admins can view state but cannot operate roster or dangerous controls.
- Tests: unit coverage verifies password hashing, duplicate active username blocking, inactive restore, current-round eligibility reason requirement, host lock ownership, and host lock expiry takeover.

### Risks And Assumptions

- In-memory admin state survives browser refresh in the same dev/server process but does not survive server restart or multi-instance deployment. Supabase persistence is required before event use.
- Login requires `ADMIN_PASSWORD_HASH` and `SESSION_SECRET` to be configured. Without them, the admin page still loads but login returns a configuration error.
- The current dangerous eligibility form is the first use of the dangerous action dialog; later dangerous actions must reuse the same password re-entry pattern.

## Phase 5 - Chart Draw Engine And Reroll Controls

Status: complete

### Acceptance Criteria

- Each set draws exactly 7 unique charts: implemented and covered by unit tests
- Excluded chart keys are filtered before draw: implemented and covered by unit tests
- Selected songs from prior rounds are excluded: implemented and covered by unit tests
- Same song is not drawn in both sets of the same round: implemented and covered by unit tests
- Rerolls preserve history: one-chart and set rerolls create new versions and supersede prior active draw records
- Voting cannot open until both sets are drawn: implemented as `canOpenVoting`
- Backend randomness: draw engine uses Node `crypto.randomInt`, never browser randomness
- Backend draw state survives browser refresh: server-only in-memory draw state is shared across admin page refreshes in the same process
- Admin draw controls: active host can draw every required set and reroll one chart, one set, or one round
- Dangerous rerolls: reroll actions require active host control, admin password re-entry, and reason
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (11 files, 31 tests)
- E2E: placeholder passed with `npm run test:e2e`
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added draw engine and draw state store under `src/lib/draw`
- Added draw engine/state unit tests
- Extended server-only admin state with draw state
- Added admin server actions for draw set, reroll chart, reroll set, and reroll round
- Added `/coolguy69` draw controls for all required round sets
- Updated admin runbook, testing checklist, README, and phase status

### Manual Review

- Product rules: draw set definitions still match the product spec; draws are 7 charts; only selected prior songs are blocked from future draws; same-round duplicate songs are blocked across the two sets.
- Security: draw/reroll actions run server-side, require a valid admin session and active host control, and rerolls require password re-entry plus reason.
- Data: draw versions are preserved in server memory with superseded timestamps, eligible pool counts, chart order, and reason.
- UI: admin controls expose all required sets and keep controls disabled for read-only admins.
- Tests: unit coverage verifies draw count, uniqueness, exclusions, prior selected song blocking, same-round duplicate blocking, history preservation, one-chart reroll, and voting-open readiness.

### Risks And Assumptions

- Draw state is in-memory until Supabase credentials/tooling are available. It survives browser refresh in one server process but not server restart, serverless cold starts, or multiple instances.
- The admin UI displays draw controls in the admin route only; dramatic stage visualization begins in Phase 6.
- Chart exclusion UI is not fully wired to the draw store yet. The draw engine supports excluded chart keys, and persistent exclusion management should be connected when Supabase-backed chart exclusions are implemented.

## Phase 6 - Stage Display And Draw Visualization

Status: complete

### Acceptance Criteria

- Stage can reveal Set 1 and Set 2: implemented with animated stage cards for active draw records
- Stage shows both sets together: `/stage` renders both round set panels from server draw state
- QR code points to `/room`: existing `QRPanel` remains on the stage page
- Timer and QR are readable on projector: stage sidebar keeps large timer/status and QR panel
- Missing chart image fallback: stage cards use `public/chart-images/fallback-card.svg` when no local image path exists
- Refresh returns stage to current state: `/stage` reads server-only draw state on every request and is marked dynamic
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (12 files, 32 tests)
- E2E: placeholder passed with `npm run test:e2e`
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added stage view helper and unit test in `src/lib/stage`
- Added stage-specific draw card and set panel components
- Updated `/stage` to render dynamic server draw state instead of static placeholders
- Added card reveal animation CSS
- Updated README, testing checklist, and phase status

### Manual Review

- Product rules: stage still shows the two fixed sets for the current round and does not decide draw results in browser code.
- Security: stage route reads server state only; it does not expose admin secrets, password hashes, service-role keys, or mutation controls.
- Data: stage refresh reflects the in-memory active draw records created by admin draw controls in the same server process.
- UI: stage uses uploaded logo through `RoundHeader`, a readable timer/QR sidebar, original industrial/rune styling, and animated chart cards. The original projector card layout noted in this historical phase is superseded by the remediation requirement for two horizontal 7-card rows.
- Tests: unit coverage verifies stage readiness depends on both set draws.

### Risks And Assumptions

- Stage currently displays Round 1 because current-round state is not persistent yet. Later voting/round state phases should drive the active round.
- Draw animation is CSS reveal-on-render, not a host-stepped reveal sequence. More detailed stage control can build on the same draw state in later phases.
- Visual verification was limited to build/static checks in this phase; full browser-driven E2E and screenshot coverage begins when Playwright is introduced.

## Phase 7 - Player Room, View-Only Mode, And Ballot Flow

Status: complete

### Acceptance Criteria

- Room landing: `/room` already offers `I am a player voting` and `View charts only`
- Player identity: `/vote` uses active roster players only and exact label `Select your start.gg username`
- Username confirmation: exact confirmation copy appears after selection
- Existing ballot detection: submitted player IDs trigger the duplicate-device warning and latest valid ballot wins in the server store
- Ballot flow: Set 1, Set 2, and Review/Submit steps are implemented
- Submit blocking: player cannot submit until both sets are complete
- No bans: `No bans for this set` explicitly completes a set and clears bans
- Ban max: UI and server validation cap bans at 2 per set
- Ballot editing: saved view offers `Change vote`; new save revisions replace prior valid ballot
- View-only mode: `/charts` reads draw state and exposes no submit controls
- Inactive players: filtered out of the voting dropdown
- After close/reveal phone behavior: `/vote` has closed/revealing and revealed phone status views for later state-machine phases
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (13 files, 35 tests)
- E2E: placeholder passed with `npm run test:e2e`
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added ballot validation and in-memory ballot store under `src/lib/vote`
- Extended server-only admin state with ballot state
- Added `/vote` server actions and client ballot flow
- Replaced `/vote` placeholder with active-player identity, set voting, review, submit, saved/edit, closed, and revealed views
- Updated `/charts` to view draw state without voting controls
- Updated README, testing checklist, and phase status

### Manual Review

- Product rules: the voting form covers both chart sets in one round ballot, bans are capped at 2 per set, no-ban is explicit, no vague skip button was added, and latest valid ballot revision wins.
- Security: ballot submission is a server action and validates drawn chart IDs server-side; view-only route has no mutation action.
- Data: ballots are stored server-side in memory with revision count and submitted timestamp until Supabase persistence is wired.
- UI: phone card layout uses two columns with the 7th card centered; identity and duplicate warning copy match the product spec.
- Tests: unit coverage verifies no-ban completion, ban completion, latest ballot replacement, and phone status transitions.

### Risks And Assumptions

- Voting open/closed timers and pause behavior are not implemented until Phase 8. Phase 7 adds the phone display states that Phase 8 and Phase 9 will drive.
- Ballot state is in-memory until Supabase persistence is wired. It survives browser refresh in one server process but not server restart or multiple instances.
- Current route state is still fixed to Round 1 until later round-state work.

## Phase 8 - Voting Window, Timer Logic, Pause, Turnout, And Manual Ballots

Status: complete

### Acceptance Criteria

- Timer source: voting windows use server-side time for `openedAt`, `closesAt`, pause remaining time, extension deadlines, final-change deadlines, and ballot timestamps
- One 10-minute window: opening voting snapshots eligible players and sets one deadline for both drawn sets
- Draw gate: voting cannot open until both sets are drawn
- Turnout display: stage and admin show `Ballots submitted: X / Y` and `Ban selections cast: Z` without public chart-by-chart live counts
- 75% extension: normal expiration below 75% turnout automatically enters one `extension_1_minute` state and then closes regardless of turnout
- Everyone submitted early: all eligible submitted before normal expiration enters `final_30_seconds`, allows edits, and then closes
- Pause behavior: host pause freezes countdown, submissions, and edits; resume restores the remaining official time
- Player saves: `/vote` accepts submissions only while `voting_open`, `final_30_seconds`, or `extension_1_minute`
- Eligible snapshot: `/vote` uses the active/current-round eligible snapshot captured when voting opens, not later roster edits
- Manual ballots: admin can enter a password-gated manual ballot while voting is open or after close before result reveal
- Existing ballot warning: manual admin entry shows `This player already has a submitted ballot.` and `Are you sure you want to replace it?`
- Post-close overrides: manual ballots saved after close are marked `manualOverride` for the future private CSV export
- Reveal lock: manual and player ballot saves are blocked after `results_revealed`
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (14 files, 42 tests)
- E2E: placeholder passed with `npm run test:e2e`
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added `VotingWindowStore` state machine and tests under `src/lib/vote`
- Extended ballot records with player/manual source, manual reason, and manual override metadata
- Added server-only voting round snapshot helpers for draw records, eligible players, turnout, and view revalidation
- Wired `/vote` submissions to the voting-window state and eligible-player snapshot
- Wired `/stage` to server-time timer state and public turnout display
- Added admin voting controls for open, pause, resume, and close
- Added password-gated manual ballot entry with replace-existing warning
- Extended roster eligibility resolution to include current-round emergency additions
- Updated README, testing checklist, and phase status

### Manual Review

- Product rules: one round ballot still covers both sets, voting opens only after both sets are drawn, the active eligible roster is snapshotted on open, and edits are allowed only while server state says voting is open.
- Security: tournament-changing actions remain server actions; manual ballots require host control plus admin password re-entry; public screens expose only turnout totals, not live chart counts.
- Timer behavior: client countdowns are visual only; official deadlines and transitions are computed by the server-side voting store.
- Data: post-close manual ballots carry `manualOverride` and reason metadata so Phase 9 CSV export can include them.
- Tests: unit coverage verifies the 10-minute deadline, 75% extension, final 30 seconds, pause/resume, post-reveal manual lock, manual override metadata, and current-round eligibility resolution.

### Risks And Assumptions

- Voting window state is still in-memory until Supabase persistence is wired. It survives refresh in one server process but not server restart or multiple instances.
- Current route state remains fixed to Round 1 until later round progression work.
- There is no special correction workflow yet after results reveal; Phase 8 blocks normal/manual ballot changes at that point as required.
- Manual ballot checkbox UX relies on server validation for the 1-2 ban limit and no-bans exclusivity; richer client validation can be added later without changing the server contract.

## Phase 9 - Results Computation, Rune-Wheel Tiebreak, Final Reveal, And CSV Export

Status: complete

### Acceptance Criteria

- Result computation: each drawn chart gets a ban count, including zero-ban charts
- Sort order: result rows reveal from least banned to most banned, with tied rows sorted alphabetically
- Selection: each set selects the chart with the fewest bans
- Tiebreaks: tied least-ban charts use a backend-decided winner before reveal
- Rune wheel: 2-4 chart least-ban ties produce a 12-slot wheel animation that reveals the committed winner
- Fallback ties: 5+ chart least-ban ties use a plain fallback reveal with the backend winner already committed
- Stage sequence: host can reveal Set 1 counts, Set 1 selected chart, Set 2 counts, Set 2 selected chart, then the final two charts
- Final screen: `/stage` shows `ROUND X FINAL CHARTS` with exactly two selected charts after final reveal
- Phone behavior: `/vote` shows the closed/revealing message until final reveal, then selected charts first and expandable full ban counts
- View-only behavior: `/charts` and `/results` show post-reveal results only after final reveal
- Private CSV: admin download includes player-level rows, manual overrides, selected charts, and tiebreak flags
- CSV auto-download: admin client attempts one automatic private CSV download after final reveal and keeps a manual button
- Selected songs: final reveal marks selected song keys for later draw exclusion
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test` (16 files, 45 tests)
- E2E: placeholder passed with `npm run test:e2e`
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added result computation, reveal state, and private CSV modules under `src/lib/results`
- Extended server-only admin state with a result store
- Added result display components for count rows, selected highlights, and rune-wheel tiebreak reveal
- Added admin result controls and private CSV download behavior
- Updated `/stage`, `/vote`, `/charts`, and `/results` to use committed result state
- Extended ballot metadata with `replacedExistingBallot`
- Added result and CSV unit tests
- Updated README, testing checklist, and phase status

### Manual Review

- Product rules: results use ban counts only, include zero-ban charts, choose least-ban charts, and do not use browser randomness for tiebreak decisions.
- Reveal flow: public phones and view-only pages do not show result details until the host reaches the final reveal.
- Security: result computation and reveal actions are server actions behind admin session and host lock; private CSV download requires an admin session.
- Data: private CSV rows include unsubmitted eligible players, manual override fields, selected charts, and tiebreak flags.
- UI: stage final screen shows exactly the two selected charts, and result rows use both count badges and small bars.

### Risks And Assumptions

- Result state is still in-memory until Supabase persistence is wired. It survives refresh in one server process but not server restart or multiple instances.
- Current route state remains fixed to Round 1 until later round progression work.
- Manual ballots are blocked after result computation to avoid stale committed results; a future correction/override workflow should handle post-compute changes.
- CSV auto-download depends on browser download permissions; the manual button remains available after final reveal.

## Phase 10 - Testing, Edge Cases, And Review Hardening

Status: complete

### Acceptance Criteria

- Unit coverage: chart import, active player eligibility, duplicate active usernames, draw count, excluded/selected songs, same-round duplicate songs, ban completion, result sorting/selection, tiebreaks, and private CSV generation are covered
- Integration coverage: full round flow, player edit/latest ballot, post-reveal voting lock, Round 2 selected-song exclusion, and 100-player/multiple-edit load-sized ballot behavior are covered
- E2E coverage: Playwright smoke flow covers stage load, room links, admin login, host control, roster import, both set draws, player vote, close, result reveal, final screens, and private CSV download
- Security coverage: client components are scanned for server-only secret environment names
- Result integrity: no known issue can change a committed result without a later explicit correction workflow
- Ballot integrity: latest valid ballot wins and submitted ballots are not lost across edits in tested flows
- Post-reveal lock: server state blocks ballot changes after `results_revealed`
- View-only behavior: `/charts` and `/results` expose no submit controls and only show result details after final reveal
- Service-key safety: no client component references service-role keys, session secrets, or admin password hash names
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (18 files, 49 tests)
- E2E: passed with `npm run test:e2e` (1 Playwright test)
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added Playwright dependency, config, `start` script, and full-flow e2e smoke test
- Replaced the placeholder e2e script with `playwright test`
- Added integration hardening tests under `src/lib/integration`
- Added browser security-boundary test under `src/lib/server`
- Updated README, testing checklist, and phase status

### Manual Review

- Product rules: the new integration tests exercise result-relevant round flow, selected-song exclusion, latest-ballot behavior, post-reveal lock, and load-sized submissions.
- Security: the browser-boundary test guards against accidentally referencing server-only secret names from client components.
- E2E: the Playwright smoke test uses a deterministic test-only admin hash and runtime-generated session/service placeholders, not production secrets.
- Load: the 100-player test uses normal store submissions and multiple edits without realtime connections.

### Risks And Assumptions

- Playwright browser binaries must be installed locally or in CI with `npx playwright install chromium`.
- E2E uses a test-only admin password and in-memory state on a local production Next server.
- Full multi-round browser e2e coverage remains limited to a Round 1 smoke path; deeper round progression is still tied to later current-round work.

## Phase 11 - Deployment Readiness And Rehearsal Tooling

Status: complete

### Acceptance Criteria

- Production build readiness: `npm run build` passes with dynamic public/admin routes
- Deployment workflow: `docs/deployment-readiness.md` documents Vercel, Supabase, environment variables, build checks, and free-tier constraints
- Data setup workflow: chart import, image cache, chart exclusion review, roster import, active-player review, duplicate username blocking, and pool validation are documented
- Rehearsal mode: admin can start rehearsal mode, reset rehearsal data, and see a visible rehearsal/tournament mode indicator
- Test roster: starting rehearsal mode resets operational state and loads 12 disposable rehearsal players
- Current round control: admin can set or advance the current round; `/stage`, `/vote`, `/charts`, and `/results` read that server current-round state
- Forced tiebreak rehearsal: rehearsal-only seeding creates two-way least-ban tiebreak ballots after both current-round sets are drawn
- Data separation: rehearsal reset clears operational state and returns to tournament mode before real event use
- Venue checklist: `docs/event-day-runbook.md` includes stage laptop, projector/stream capture, QR readability, phone testing, admin laptop, host lock, and private CSV download location checklists
- Rehearsal runbook: `docs/rehearsal-runbook.md` documents a complete four-round rehearsal using test data
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (19 files, 51 tests)
- E2E: passed with `npm run test:e2e` (1 Playwright test)
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added current-round and rehearsal state under `src/lib/round`
- Extended server-only admin state with round state and operational reset support
- Added admin actions and UI for current round, rehearsal mode, rehearsal reset, and forced tiebreak seeding
- Updated current-round public routes to use server current-round state
- Added deployment readiness and rehearsal runbooks
- Expanded event-day and admin runbooks
- Updated README, testing checklist, and phase status

### Manual Review

- Product rules: fixed round chart-set definitions are unchanged; current-round state only selects which already-defined round is active.
- Rehearsal safety: rehearsal controls are host-only; start/reset require admin password re-entry and clear destructive summaries.
- Data separation: rehearsal mode visibly labels the admin page and reset returns to tournament mode.
- Deployment: documentation keeps secrets out of Git and calls out the remaining Supabase persistence requirement before multi-instance/serverless event use.

### Risks And Assumptions

- Operational stores remain in-memory. Local rehearsal works in one server process; production event use still needs Supabase-backed persistence or an explicitly controlled single-process host.
- Forced tiebreak seeding is a rehearsal helper only and is blocked outside rehearsal mode.
- Full browser e2e still exercises Round 1; the four-round rehearsal workflow is documented and supported through current-round admin controls.

## Phase 12 - Final Polish, Runbook Verification, And Release Checklist

Status: complete

### Acceptance Criteria

- Release checklist: `docs/release-checklist.md` exists and covers environment, data, roster, admin/host, public screens, results/export, and final checks
- Event-day runbook: includes before-event, stage laptop, projector/stream capture, QR, phone, admin laptop, host lock, before-round, during-voting, after-close, CSV location, and website-failure sections
- GitHub Actions: `.github/workflows/ci.yml` exists and runs install, Playwright browser install, lint, typecheck, tests, chart import, fallback image cache, production audit, build, and e2e
- Critical UI flow review: release checklist explicitly covers stage readability, phone voting, QR, timer readability, selected chart highlight, final two-chart screen, inactive restore, manual override, and CSV download behavior
- Full four-round rehearsal: supported through Phase 11 current-round/rehearsal controls and documented in `docs/rehearsal-runbook.md`
- Private CSV verification: release checklist and Playwright e2e cover private CSV download behavior
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (19 files, 51 tests)
- E2E: passed with `npm run test:e2e` (1 Playwright test)
- Chart import: passed with `npm run import:charts`
- Image fallback cache: passed with `npm run cache:chart-images -- --fallback-only`
- Production dependency audit: passed with `npm audit --omit=dev`
- Production build: passed with `npm run build`

### Changed Files

- Added GitHub Actions CI workflow
- Added release checklist
- Expanded event-day runbook with final operating flow
- Updated README, testing checklist, and phase status

### Manual Review

- Tournament rules: no tournament rule constants changed; final docs preserve two sets per round, one voting window, explicit no-ban, least-ban selection, server-decided tiebreaks, and private CSV handling.
- Security: CI uses no production secrets; Playwright e2e generates test-only auth material at runtime; release docs keep secrets in Vercel/local env only.
- UI/ops: release checklist requires manual verification of the projector, phone, QR, timer, final selected chart, admin dangerous action, inactive restore, manual override, and CSV flows.
- Tests: local final gates match the workflow gates, with Playwright e2e included because it runs against generated local test credentials.

### Risks And Assumptions

- Operational stores remain in-memory. Production event use still needs Supabase-backed persistence or an explicitly controlled single-process host.
- GitHub Actions includes Playwright e2e and installs Chromium; if CI browser install becomes unreliable, keep e2e as a documented local rehearsal gate rather than requiring production secrets.
- Playwright currently covers a full Round 1 smoke path; four-round validation is supported and documented as a rehearsal workflow.

## Normalized Runtime Persistence Phase 1 - Event Scope And Schema

Status: complete

### Acceptance Criteria

- `TOURNAMENT_EVENT_ID` is part of server runtime configuration and Supabase-backed runtime
  persistence refuses to initialize when it is missing.
- Mutable runtime tables now have an `event_id` column and nonblank event-id constraints.
- Cross-event-colliding uniqueness now includes `event_id` for active player usernames, admin
  sessions, draws, voting windows, eligibility, ballots, result snapshots, tiebreaks, and host
  locks.
- Static chart catalog, fixed rounds, fixed round sets, image assets, and the existing debug snapshot
  table remain global for this phase.
- Local Supabase database types now represent every core runtime table.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (28 files, 87 tests)
- E2E: passed with `npm run test:e2e` (2 Playwright tests)
- Production build: passed with `npm run build`
- Prettier check: passed for touched TypeScript and Markdown files. SQL formatting is not configured
  because Prettier has no SQL parser in this project.

### Changed Files

- Added `supabase/migrations/20260629090000_event_scoped_runtime.sql`
- Expanded `src/lib/db/database.types.ts` to cover all core tables and event-scoped columns
- Added event-scoped schema constants and migration/type coverage tests
- Added `TOURNAMENT_EVENT_ID` server configuration and Supabase persistence guard
- Updated deployment/admin/event-day docs for the required event namespace
- Added a Playwright-only public URL override so local `.env.local` event URLs cannot break e2e QR
  assertions

### Manual Review

- Tournament rules: no round, draw, vote, result, tiebreak, or UI tournament behavior changed.
- Security: `TOURNAMENT_EVENT_ID` is runtime configuration, not a browser public value or secret; the
  service-role key, session secret, and admin password hash remain server-only.
- Persistence: this phase prepares normalized event-scoped tables but does not yet cut runtime reads
  or writes over from `tournament_state_snapshots`.

### Risks And Assumptions

- Existing Supabase projects need the new migration applied before normalized repositories can write
  event-scoped runtime records.
- Runtime state is still snapshot-authoritative until later normalized persistence phases replace the
  snapshot repository.
- Existing rows receive the migration default `local-dev`; event/rehearsal repositories must set the
  configured `TOURNAMENT_EVENT_ID` explicitly when they are introduced.

## Normalized Runtime Persistence Phase 2 - Repository Boundaries

Status: complete

### Acceptance Criteria

- Added server-only repository classes for players, chart exclusions, draws, voting windows, ballots,
  results, admin sessions, admin audit, and host locks.
- Repository boundaries share a configured event id and service-role Supabase client dependency.
- Every mutable event-scoped runtime table is assigned to exactly one repository boundary.
- Repository scoped selects attach `event_id` before returning a query boundary.
- Existing in-memory stores remain available for tests and local fake runs; runtime cutover is still
  deferred to later phases.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (29 files, 92 tests)
- Production build: passed with `npm run build`
- E2E: passed with `npm run test:e2e` (2 Playwright tests)

### Changed Files

- Added `src/lib/server/repositories/normalized-runtime.ts`
- Added `src/lib/server/repositories/normalized-runtime.test.ts`
- Updated phase status

### Manual Review

- Tournament rules: no player, draw, voting, result, tiebreak, or admin UI behavior changed.
- Security: repositories import `server-only`, use the service-role client only inside server code,
  and carry event ids without exposing service keys, password hashes, session secrets, or token
  hashes to browser components.
- Persistence: this phase creates the repository boundary layer only; no runtime reads or writes have
  been cut over from snapshots yet.

### Risks And Assumptions

- Repository methods are intentionally minimal boundary primitives; transactional writes are deferred
  to Phase 3.
- Runtime state remains snapshot-authoritative until the Phase 4 cutover.

## Normalized Runtime Persistence Phase 3 - Transactional Mutations

Status: complete

### Acceptance Criteria

- Added normalized transactional RPC entrypoints for ballot submit/edit, manual ballot override,
  active voter presence claim/touch, host lock acquire/heartbeat/release, voting window state
  changes, draw/reroll operations, post-vote reroll invalidation, result compute/reveal/override,
  round reset, and admin session create/touch/logout/revoke.
- Added `active_voter_presence` with event scope and RLS for duplicate-device/presence workflows.
- Added ballot invalidation columns needed for post-vote reroll recovery and audit.
- Added a server-only transactional executor that validates payloads, attaches `TOURNAMENT_EVENT_ID`,
  and calls the mapped Supabase RPC through the service-role client.
- Local Supabase database types now include the presence table, ballot invalidation columns, and
  normalized RPC function signatures.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (30 files, 99 tests)
- Production build: passed with `npm run build`
- E2E: passed with `npm run test:e2e` (2 Playwright tests)

### Changed Files

- Added `supabase/migrations/20260629093000_transactional_runtime_rpc.sql`
- Added `src/lib/server/transactions/normalized-runtime.ts`
- Added `src/lib/server/transactions/normalized-runtime.test.ts`
- Updated schema constants, database types, schema tests, and player repository table coverage
- Updated phase status

### Manual Review

- Tournament rules: no current runtime tournament behavior changed; existing actions still use the
  snapshot-backed stores until cutover.
- Security: transactional executor imports `server-only`, uses the service-role RPC boundary, and
  does not expose service keys, admin password hashes, session secrets, or token hashes to browser
  components.
- Transactionality: each normalized mutation goes through a single Supabase RPC call, so the
  database-side implementation has an atomic commit/rollback boundary for dependent records.

### Risks And Assumptions

- Runtime state remains snapshot-authoritative until Phase 4 replaces snapshot load/save with
  normalized repositories and RPC calls.
- RPC bodies currently establish the operation-specific transaction boundary and validation surface;
  Phase 4 must connect the existing tournament logic to these boundaries before deployed Supabase
  state is authoritative.

## Normalized Runtime Persistence Phase 4 - Draw-Aware Ballot And Result Model Correction

Status: complete

### Acceptance Criteria

- Added draw-level `draw_id` references to normalized `ballot_choices`, `result_rows`, and
  `tiebreaks` persistence.
- Preserved static `round_set_id` as the fixed `round_sets.id` reference for grouping, labels, CSV,
  and consistency checks.
- Added database trigger validation so ballot choices, result rows, and tiebreaks cannot mix a
  static round set with an unrelated active draw.
- Added validation that banned/result/tiebreak chart ids belong to `drawn_charts` for the referenced
  `draw_id`.
- Split runtime/domain payloads so `drawId` is the active draw attempt and `roundSetId` is the
  static chart-set id.
- Updated vote, admin/manual ballot, result computation, live counts, private CSV, persistence
  snapshots, mutation contracts, and tests to use draw-aware identity.
- Runtime cutover is still deferred; snapshot persistence remains authoritative until the next
  phase replaces `SupabaseOperationalStateRepository` load/save with normalized reads/writes.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (30 files, 104 tests)
- Production build: passed with `npm run build`
- E2E: passed with `npm run test:e2e` (2 Playwright tests)

### Changed Files

- Added `supabase/migrations/20260629100000_draw_aware_ballot_result_identity.sql`
- Updated `supabase/migrations/20260628050200_initial_schema.sql`
- Updated `src/lib/tournament.ts`, draw state, ballot validation/store consumers, result engine/store,
  private CSV export, snapshot restore, mutation contracts, database types, schema constants, and
  tests
- Updated `/vote` and `/coolguy69` ballot payload construction to submit both `drawId` and
  `roundSetId`
- Updated `docs/normalized-runtime-persistence-plan-2026-06-29.md`

### Manual Review

- Tournament rules: no round, draw count, vote, no-ban, result, tiebreak, or reveal behavior changed.
  This phase only corrected identifiers so existing behavior can be represented safely in normalized
  persistence.
- Security: no new browser secret exposure; the new SQL checks run at the database boundary and
  tournament-changing mutations remain server-side.
- Persistence: normalized ballot/result tables now have enough identity to avoid corrupting choices
  or result rows during rerolls. Snapshot restore includes a compatibility shim for old debug
  snapshots that stored active draw ids in `roundSetId`.

### Risks And Assumptions

- Existing Supabase projects need the new migration applied before normalized cutover work resumes.
- The forward migration updates deterministic static `round_sets.id` values with `on update cascade`
  on related normalized FKs; this is safe for normalized rows, but should still be rehearsed against
  a non-production Supabase project before event use.
- Initial parallel execution of `npm run build` and `npm run test:e2e` conflicted on `.next` cache
  writes; after clearing generated `.next`, both passed sequentially.

## Normalized Runtime Persistence Phase 5 - Runtime Cutover

Status: complete

### Acceptance Criteria

- Supabase-backed operational persistence now uses normalized runtime tables instead of
  `tournament_state_snapshots` for load/save.
- Runtime reads reconstruct the existing operational store snapshot from normalized players, draws,
  voting windows, ballots, results, admin sessions/actions, presence, host locks, and event runtime
  state.
- Runtime writes persist draw-aware ballot/result identity with both active `draw_id` and static
  `round_set_id`.
- Added cutover support columns/tables for event runtime state, draw reasons, eligibility reasons,
  voting pause state, result reveal timestamps, tiebreak reveal timestamps, host lock owners, and
  ballot invalidation audit.
- Repository boundary coverage now includes `event_runtime_state` and `ballot_invalidations`.
- Snapshot persistence remains available only as the old debug table; the Supabase runtime backend no
  longer hydrates from or writes to it.
- Production still rejects unsafe non-Supabase runtime backend configuration.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (31 files, 105 tests)
- Production build: passed with `npm run build`
- E2E: passed with `npm run test:e2e` (2 Playwright tests)

### Changed Files

- Added `supabase/migrations/20260629103000_normalized_runtime_cutover_support.sql`
- Added `src/lib/server/normalized-operational-state.ts`
- Added `src/lib/server/normalized-operational-state.test.ts`
- Updated `src/lib/server/persistence.ts` to use normalized Supabase operational persistence
- Updated database types, schema table lists, normalized repository boundaries, and persistence
  safety tests

### Manual Review

- Tournament rules: no round definitions, draw counts, ban limits, no-ban behavior, least-ban result
  selection, tiebreak reveal timing, or final reveal behavior changed.
- Security: normalized persistence imports `server-only`, uses the service-role Supabase client only
  on the server, and does not expose service keys, password hashes, session secrets, or token hashes
  to browser code.
- Persistence: the new round-trip test proves normalized save/load does not touch
  `tournament_state_snapshots` and preserves draw-aware ballot/result identity across reconstruction.

### Risks And Assumptions

- Existing Supabase projects need all normalized runtime migrations through
  `20260629103000_normalized_runtime_cutover_support.sql` applied before enabling
  `TOURNAMENT_STATE_BACKEND=supabase`.
- The phase was validated with an in-memory Supabase-shaped client and local app gates; a hosted
  Supabase rehearsal with a non-production `TOURNAMENT_EVENT_ID` is still required before event use.
- Active voter presence is now round-scoped for runtime reconstruction, but hosted rehearsal should
  still verify duplicate-device warnings across refresh/redeploy boundaries.

## Normalized Runtime Persistence Phase 6 - Admin Sessions And Host Locks

Status: complete

### Acceptance Criteria

- Supabase-backed admin login now writes only a SHA-256 hash of the opaque admin session token to
  `admin_sessions`.
- Admin session validation requires both a valid signed cookie and an active, unrevoked normalized
  `admin_sessions` row for the configured `TOURNAMENT_EVENT_ID`.
- Admin heartbeat refresh rotates the signed cookie, updates the stored token hash, touches
  `last_seen_at`, and slides `expires_at` to the 10-hour inactivity window.
- Admin logout revokes the normalized server-side session before clearing admin and host cookies.
- Operational runtime save/load no longer deletes or creates placeholder `admin_sessions` rows;
  session lifecycle is owned by the auth path.
- Host locks remain persisted in normalized `host_locks` with owner session id, token hash,
  heartbeat, expiry, and active-lock indexes for TTL lookup.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (32 files, 107 tests)
- Production build: passed with `npm run build`
- E2E: passed with `npm run test:e2e` (2 Playwright tests)

### Changed Files

- Added `supabase/migrations/20260629110000_admin_session_host_lock_security.sql`
- Added `src/lib/server/admin-session-store.ts`
- Added `src/lib/server/admin-session-store.test.ts`
- Updated `src/lib/server/admin-auth.ts` to create, validate, refresh, and revoke normalized admin
  sessions when the runtime backend is Supabase
- Updated `src/lib/server/normalized-operational-state.ts` so operational state replacement no
  longer manages `admin_sessions`
- Updated normalized cutover tests and phase docs

### Manual Review

- Tournament rules: no player, draw, voting, result, tiebreak, or reveal behavior changed.
- Security: admin session database rows store token hashes only; signed cookie validation alone is no
  longer sufficient when Supabase-backed runtime persistence is enabled.
- Host control: the existing host-lock token hash and 15-second TTL behavior is preserved, with
  normalized indexes added for active lock lookup.

### Risks And Assumptions

- Existing Supabase projects need all normalized runtime migrations through
  `20260629110000_admin_session_host_lock_security.sql` applied before enabling the Supabase
  backend.
- A hosted Supabase rehearsal is still required to verify admin heartbeat, logout revocation, and
  host-lock takeover behavior across refresh/redeploy boundaries.
- Admin session token hash rotation means a stale pre-refresh cookie becomes invalid once a refreshed
  cookie has been persisted for the same session id.

## Normalized Runtime Persistence Phase 7 - Audit, Export, And Recovery

Status: complete

### Acceptance Criteria

- Private ballot CSV now includes result id, result compute/reveal timestamps, reveal phase, final
  reveal timestamp, ballot revision, static `round_set_id`, active `draw_id`, and draw version for
  each set.
- Private ballot CSV now includes tiebreak candidate ids, backend winner chart id, and winner reveal
  start timestamp for each set.
- Manual override markers and reasons remain in the CSV export.
- Admin console now exposes a password-session-gated debug operational snapshot download.
- Debug snapshot exports are labeled `debug_operational_state_snapshot` with
  `authoritativeRuntimeSource: false` and a warning that deployed runtime authority comes from
  normalized Supabase tables.
- Downloading a debug snapshot records a non-tournament-changing audit action before export.
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit/integration tests: passed with `npm run test` (33 files, 108 tests)
- Production build: passed with `npm run build`
- E2E: passed with `npm run test:e2e` (2 Playwright tests)

### Changed Files

- Added `src/lib/persistence/debug-export.ts`
- Added `src/lib/persistence/debug-export.test.ts`
- Added `src/app/coolguy69/_components/DebugSnapshotDownload.tsx`
- Updated private CSV generation/tests and four-round persistent rehearsal CSV assertions
- Updated admin actions/page to provide the debug snapshot download
- Updated phase docs

### Manual Review

- Tournament rules: no draw, vote, result, tiebreak, or reveal behavior changed.
- Security: debug snapshots require an admin session, are not exposed to browser code until an admin
  explicitly downloads them, and are labeled as non-authoritative backup/debug exports.
- Recovery: the export preserves the existing operational snapshot shape, including audit records,
  ballot invalidations, draw ids, static round-set ids, result/tiebreak metadata, and host state for
  manual inspection.

### Risks And Assumptions

- Debug snapshot import/restore is intentionally not implemented; deployed runtime reads continue to
  use normalized Supabase tables.
- Hosted Supabase rehearsal remains the next required gate to validate export behavior against the
  real remote backend and event namespace.

## Comprehensive Review Remediation Phase 1 - Authoritative State And Concurrency

Status: complete with `CR-001` explicitly deferred to remediation Phase 9.

### Checklist Items Addressed

- CR-013: closed. Placeholder mutation RPC acknowledgements now fail the server-side wrapper unless
  row-change evidence is returned, and the migration overrides mutation-named RPC bodies so they
  raise instead of reporting false commits.
- CR-014: closed. Added database guards for active draw uniqueness, draw status, drawn chart
  pool/exclusion/same-round/prior-selected-song rules, and voting-open draw completion.
- CR-018: closed. Added explicit `REVOKE EXECUTE` from `public`, `anon`, and `authenticated`, with
  `GRANT EXECUTE` only to `service_role`, for each normalized mutation RPC.
- CR-001: improved but still open; moved to remediation Phase 9. Persistence now merges baseline/current/latest snapshots and
  serializes in-process saves, with regression tests for concurrent different-player ballots,
  same-player latest-ballot wins, and host-heartbeat/ballot races. The Supabase save path still
  needs a cross-instance database transaction, row-scoped mutation, or optimistic event revision
  before this item is closed.

### Changed Files

- Added `src/lib/persistence/merge.ts`
- Added `supabase/migrations/20260630010000_phase1_rpc_lockdown_and_draw_guards.sql`
- Updated `src/lib/server/persistence.ts`
- Updated `src/lib/server/persistence.test.ts`
- Updated `src/lib/server/transactions/normalized-runtime.ts`
- Updated `src/lib/server/transactions/normalized-runtime.test.ts`
- Updated `src/lib/db/schema.test.ts`
- Updated `docs/comprehensive-review-checklist-2026-06-30.md`

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 33 files / 115 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.
  - Note: one attempted parallel `build` + `test:e2e` run hit a `.next` rename race while
    Playwright was also building/starting the app. Rerunning the gates sequentially passed.

### Manual Review

- Product spec: no tournament rule, route, voting, draw, result, tiebreak, admin, or visual behavior
  was intentionally changed.
- Security: public and authenticated clients are explicitly revoked from normalized mutation RPCs;
  service-role execution remains server-side only.
- Persistence: app-instance races are covered by merge and queue tests, but hosted Supabase
  multi-instance writes still need a database-transactional closeout before event readiness.

### Risks And Assumptions

- Existing Supabase projects need the new Phase 1 remediation migration applied after the prior
  normalized runtime migrations.
- The new RPC override intentionally disables mutation-named RPCs until they are implemented as real
  row-changing transactions; current application actions continue through the existing persistence
  path.
- The draw guard migration is statically covered by tests but still needs hosted Supabase rehearsal
  before treating the database boundary as event-verified.

## Comprehensive Review Remediation Phase 2 - Ballot Privacy And Public Mutation Safety

Status: complete.

### Checklist Items Addressed

- CR-002: closed. Public ballot lookup and live polling no longer return another player's `choices`
  unless the caller presents the matching device-scoped edit token. Duplicate-name warnings still
  work from existence/revision metadata, and second devices can submit replacements without reading
  the prior ballot.
- CR-017: closed. Added basic fixed-window throttling for admin login, dangerous password re-entry,
  voter presence claims, and public ballot submissions/edits, plus action-boundary length caps for
  sensitive free-text and identifier inputs.

### Changed Files

- Added `src/lib/vote/ballot-privacy.ts`
- Added `src/lib/vote/ballot-privacy.test.ts`
- Added `src/lib/server/rate-limit.ts`
- Added `src/lib/server/rate-limit.test.ts`
- Added `src/lib/server/input-limits.ts`
- Added `supabase/migrations/20260630020000_ballot_edit_token_hash.sql`
- Updated `src/app/vote/actions.ts`
- Updated `src/app/vote/BallotFlow.tsx`
- Updated `src/app/coolguy69/actions.ts`
- Updated `src/lib/server/admin-auth.ts`
- Updated ballot, DB type, normalized persistence, schema, and phase documentation files

### Checks Run

- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 35 files / 122 tests.
- `rtk npm run lint` - passed.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.

### Manual Review

- Product spec: no tournament rules, round structure, draw logic, result selection, or reveal order
  changed.
- Security: browser clients receive only public ballot metadata unless a private device token
  authorizes editing; stored edit tokens are hashed and stripped from public responses.
- Voting behavior: latest valid submitted ballot still replaces prior same-player revisions.

### Risks And Assumptions

- The rate limiter is process-local. It provides basic abuse protection for this runtime but is not
  a cross-instance/global throttle.
- Local-storage edit tokens are device/browser scoped. Clearing browser storage removes same-device
  edit authorization, but the player can still submit a replacement ballot after the duplicate
  warning.

## Comprehensive Review Remediation Phase 3 - Voting Timer Correctness

Status: complete for `CR-015`, `CR-026`, and the poll-dependent portion of `CR-003`; hosted
database-time timer mutation remains deferred to remediation Phase 9.

### Checklist Items Addressed

- CR-015: closed. Emergency reopen now marks the window extension-used, so the selected reopen
  duration does not receive another low-turnout extension.
- CR-026: closed. `/vote` renders final selected charts for both `results_revealed` and
  `round_complete` when the committed result phase is final.
- CR-003: improved but still open. Voting snapshots no longer mutate official state during reads,
  and deadline derivation is anchored to persisted close times. True hosted database-time
  transactional timer mutation is moved to Phase 9 with the remaining Supabase runtime closure work.

### Changed Files

- Added `src/lib/vote/phone-view.ts`
- Added `src/lib/vote/phone-view.test.ts`
- Updated `src/lib/vote/voting-window.ts`
- Updated `src/lib/vote/voting-window.test.ts`
- Updated `src/app/coolguy69/actions.ts`
- Updated `src/app/vote/actions.ts`
- Updated `src/app/vote/page.tsx`
- Updated remediation checklist and plan documentation

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 36 files / 127 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.

### Manual Review

- Product spec: tournament voting, draw, result selection, tiebreak, and reveal rules were not
  changed.
- Timer behavior: snapshots are read-only derivations; actions that mutate tournament state now
  explicitly advance timer state before persisting where needed.
- Phone results: final selected chart cards continue to render before full ban counts through
  `PublicResultSummary`.

### Risks And Assumptions

- Official database-time timer decisions are not fully closed until Phase 9 implements real hosted
  Supabase row-scoped/transactional mutations.
- A late read can derive closed/extension status without persisting it; the next timer-related
  mutation persists the advanced state.

## Comprehensive Review Remediation Phase 4 - Draw And Result Rule Hardening

Status: complete.

### Checklist Items Addressed

- CR-004: closed. Selected-song blocks are synchronized from all computed result snapshots, not only
  final reveals, so future draws after compute but before final stage reveal exclude prior selected
  songs.
- CR-009: closed. True zero-ballot sets now use a backend-decided seven-chart wheel; non-zero 5+
  least-ban ties still use the documented fallback reveal.
- CR-010: closed. Draw records are planned and validated before active history is superseded, and
  full-round rerolls commit only after both replacement sets are planned successfully.
- CR-011: closed. One-chart rerolls exclude the exact target chart and prefer a different song,
  falling back only to a different chart from the target song if needed.
- CR-012: closed. Draw records now persist eligible chart IDs plus exclusion, selected-song, and
  same-round-blocking snapshots in operational state and normalized `draws` rows.
- CR-032: closed. Stale source docs now describe result reveal order as least banned to most banned.

### Changed Files

- Added `src/lib/results/selected-song-blocks.ts`
- Added `supabase/migrations/20260630030000_draw_eligible_pool_snapshots.sql`
- Updated `src/lib/draw/draw-state.ts` and `src/lib/draw/draw-state.test.ts`
- Updated `src/lib/results/result-engine.ts` and `src/lib/results/result-engine.test.ts`
- Updated `src/components/RuneWheel.tsx`
- Updated `src/app/coolguy69/actions.ts`
- Updated operational restore and normalized persistence files/tests
- Updated database type/schema tests and remediation documentation

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 36 files / 134 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.
- Additional focused regression command passed before full gates:
  `rtk npm run test -- src/lib/draw/draw-state.test.ts src/lib/results/result-engine.test.ts src/lib/integration/tournament-flow.test.ts src/lib/persistence/operational-state.test.ts src/lib/server/normalized-operational-state.test.ts src/lib/db/schema.test.ts`

### Manual Review

- Product spec: least-banned winner selection, least-to-most reveal order, backend-decided
  tiebreaks, same-round duplicate blocking, and selected-prior-song blocking remain aligned.
- Security: no browser randomness or client-side tournament mutation path was added; selected-song
  block synchronization happens through server-side result/admin state.
- Data/audit: new draw audit arrays are additive and persisted in both snapshot and normalized
  runtime paths.

### Risks And Assumptions

- Existing Supabase projects need migration `20260630030000_draw_eligible_pool_snapshots.sql`
  applied before relying on normalized draw audit columns.
- Phase 4 has no deferred items. Existing Phase 9 deferrals for hosted Supabase row-scoped
  persistence and database-time transactional timer mutation remain open.

## Comprehensive Review Remediation Phase 5 - Admin Security And Dangerous Actions

Status: complete.

### Checklist Items Addressed

- CR-016: closed. Admin sessions now use a 30-minute TTL. Browser activity refreshes are
  interaction-driven and debounced; passive host-lock heartbeat validates without sliding the admin
  session.
- CR-019: closed. Debug operational snapshot export now requires active host control and password
  re-entry, is blocked during active/paused voting, and redacts session/host/edit-token/device
  internals.
- CR-020: closed. Shared dangerous-action prompts render target fields before a visible summary and
  password field. Reopen/reset/override/current-round-add pass selected-target summary fields.
- CR-021: closed. Manual ballot replacement warnings and confirmation controls name the selected
  start.gg username, and the server-side rejection also names the player.
- CR-022: closed. Manual ballot UI caps bans at two per set and enforces no-bans mutual exclusion
  before submit.

### Changed Files

- Updated `src/lib/admin/session.ts` and `src/lib/admin/session.test.ts`
- Updated `src/app/coolguy69/actions.ts`
- Updated `src/app/coolguy69/page.tsx`
- Updated `src/app/coolguy69/_components/AdminSessionHeartbeat.tsx`
- Updated `src/app/coolguy69/_components/AdminInactivityTimer.tsx`
- Updated `src/app/coolguy69/_components/DebugSnapshotDownload.tsx`
- Updated `src/app/coolguy69/_components/ManualBallotForm.tsx`
- Updated `src/components/DangerousActionDialog.tsx`
- Updated `src/lib/persistence/debug-export.ts` and `src/lib/persistence/debug-export.test.ts`
- Updated remediation checklist and plan documentation

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 36 files / 134 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 2 Playwright tests.
- Additional focused regression command passed before full gates:
  `rtk npm run test -- src/lib/admin/session.test.ts src/lib/server/admin-session-store.test.ts src/lib/persistence/debug-export.test.ts`

### Manual Review

- Product spec: admin route, shared password, dangerous-action password re-entry, host lock, and
  manual ballot rules remain aligned.
- Security: passive host heartbeat no longer extends admin sessions; debug exports are gated and
  redacted; password re-entry remains server-verified.
- UI: dangerous prompts now put target inputs and action summary before password entry; manual
  ballot replacement and set completion controls match the required admin workflow more closely.

### Risks And Assumptions

- Debug snapshots are still an admin/host backup tool in non-production and production, but now
  require active host control and password re-entry and are blocked during active voting.
- Phase 5 has no deferred items.

## Comprehensive Review Remediation Phase 6 - Stage And Results Visual UX

Status: complete.

### Checklist Items Addressed

- CR-005: closed. `/stage` voting now uses a top voting band with a large countdown timer on the
  left and compact QR/short URL on the right, above the two chart rows.
- CR-006: closed. Set 2 result reveal phases collapse Set 1 into a selected-chart summary, and
  stage-mode result panels use compact rows with reveal details beside the active count grid.
- CR-007: closed. Rune-wheel slots show chart names during the sealed animation, and the final
  rotation lands a slot for the backend-committed winner under the pointer.
- CR-027: closed. Stage-only compact header, timer, QR, and chart-card sizing keep voting display
  readable at the default 1280x720 projector viewport while retaining larger 2xl cards.
- CR-028: closed. Final `/stage` results now use a dedicated two-card selected-chart layout with set
  labels and featured chart cards.

### Changed Files

- Added `src/components/rune-wheel-rotation.ts`
- Added `src/components/rune-wheel-rotation.test.ts`
- Updated `src/app/stage/page.tsx`
- Updated `src/app/globals.css`
- Updated `src/components/CountdownTimer.tsx`
- Updated `src/components/QRPanel.tsx`
- Updated `src/components/ResultSetPanel.tsx`
- Updated `src/components/RoundHeader.tsx`
- Updated `src/components/RuneWheel.tsx`
- Updated `src/components/StageDrawCard.tsx`
- Updated `src/components/StageSetPanel.tsx`
- Updated `src/components/TournamentLogo.tsx`
- Updated `tests/e2e/full-flow.spec.ts`
- Updated remediation checklist and plan documentation

### Checks Run

- `rtk npm run typecheck` - passed.
- `rtk npm run test -- src/components/rune-wheel-rotation.test.ts` - passed, 1 file / 3 tests.
- `rtk npm run lint` - passed.
- `rtk npm run test` - passed, 37 files / 137 tests.
- `rtk npm run test:e2e` - initially exposed voting-stage overflow and an obsolete two-visible-wheel
  assertion, then passed after layout tuning and test update. GitHub Actions later reproduced an
  Ubuntu-only 11px voting-stage overflow, fixed by trimming standard stage card height below `2xl`;
  local e2e passed again after that fix.
- `rtk npm run build` - passed.
- Final `rtk npm run test:e2e` after the CI-height fix passed, 2 Playwright tests.

### Manual Review

- Product spec: no round structure, voting, ban, result-selection, or tiebreak authority rules were
  changed. The final stage screen still shows exactly two selected charts for the round.
- Stage UI: QR still targets `/room`, short URL remains visible, the voting display remains two
  horizontal seven-card rows, and public screens still avoid live chart-by-chart counts during
  voting.
- Results: the rune wheel remains a reveal of the already committed backend winner; client rotation
  now aligns the visual pointer to a winner slot but does not choose the winner.
- Security: no secrets, password hashes, service keys, or tournament-changing client mutations were
  introduced.

### Risks And Assumptions

- Phase 6 has no deferred items.
- Existing Phase 9 deferrals remain open for hosted Supabase row-scoped persistence, database-time
  transactional timer mutation, and hosted rehearsal evidence.
- Stage layout was automatically verified at Playwright's Desktop Chrome viewport, 1280x720. The
  code is tuned for the documented 1024x768, 1280x720, and 1920x1080 targets, but only the 1280x720
  geometry is currently enforced by e2e.

## Comprehensive Review Remediation Phase 7 - Phone And View-Only UX

Status: complete.

### Checklist Items Addressed

- CR-023: closed. `/charts` now has a compact view-only status banner and mobile Set 1/Set 2 tabs
  with next/back controls, while desktop still shows both sets side by side.
- CR-024: closed. Vote cards now expose `aria-pressed`, visible selected state, a `0/2 bans selected`
  counter, and third-ban feedback that preserves existing selections.
- CR-025: closed. Phone ballot cards use stable dimensions, constrained seventh-card width,
  `break-words`, and line clamps for chart names and artists.
- CR-033: closed. Saved-ballot and review screens include direct `Edit [set label]` actions for each
  set.
- CR-034: closed. The unused legacy `ChartSetPanel` component and barrel export were removed.

### Changed Files

- Added `src/app/charts/ChartsSetNavigator.tsx`
- Updated `src/app/charts/page.tsx`
- Updated `src/app/vote/BallotFlow.tsx`
- Removed `src/components/ChartSetPanel.tsx`
- Updated `src/components/index.ts`
- Updated `tests/e2e/full-flow.spec.ts`
- Updated remediation checklist and plan documentation

### Checks Run

- `rtk npm run typecheck` - passed during implementation.
- `rtk npm run lint` - passed during implementation.
- `rtk npm run test:e2e` - initially exposed a strict locator conflict after adding `Edit S16`,
  then passed after the set-label assertion was made exact.
- Final `rtk npm run lint` - passed.
- Final `rtk npm run typecheck` - passed.
- Final `rtk npm run test` - passed, 37 files / 137 tests.
- Final `rtk npm run build` - passed.
- Final `rtk npm run test:e2e` - passed, 2 Playwright tests.

### Manual Review

- Product spec: voting still uses one round ballot covering both chart sets, each set still requires
  1-2 bans or explicit `No bans for this set`, and view-only users still cannot submit votes or
  affect turnout.
- Phone UX: the seventh vote card remains centered in the two-column phone layout; selected bans are
  visible to sighted users and exposed through `aria-pressed` for assistive tech.
- View-only UX: `/charts` exposes chart and voting/reveal status without rendering a username
  selector, ballot controls, or turnout-affecting actions.
- Security: all ballot mutations still go through server actions; no browser-side tournament
  decisions or public live chart counts were added.

### Risks And Assumptions

- Phase 7 has no deferred items.
- Existing Phase 9 deferrals remain open for hosted Supabase row-scoped persistence, database-time
  transactional timer mutation, and hosted rehearsal evidence.
- Automated mobile coverage added here uses Chromium at 390px. Broader mobile Chromium/WebKit
  project coverage remains part of Phase 8.

## Comprehensive Review Remediation Phase 8 - Test Harness, Mobile Coverage, And Load

Status: complete.

### Checklist Items Addressed

- CR-029: closed. The Playwright wrapper now selects a free port, sets matching public URL env,
  builds once before Playwright starts, and starts only the already-built app in Playwright's
  web server.
- CR-030: closed. Default e2e coverage now includes desktop Chromium, mobile Chromium, and mobile
  WebKit projects with route and phone-layout checks.
- CR-031: closed. `npm run test:load` now runs a Playwright/API hybrid 100-player rehearsal with
  stage, admin, room, charts, and results routes active and final private CSV verification.

### Changed Files

- Added `scripts/run-playwright.mjs`
- Added `playwright.env.ts`
- Added `playwright.load.config.ts`
- Added `src/app/api/e2e/load-ballot/route.ts`
- Added `tests/e2e/mobile-routes.spec.ts`
- Added `tests/load/load-rehearsal.spec.ts`
- Updated `package.json`
- Updated `playwright.config.ts`
- Updated `.github/workflows/ci.yml`
- Updated `src/lib/server/ci-workflow.test.ts`
- Updated `tests/e2e/full-flow.spec.ts`
- Updated remediation checklist and plan documentation

### Checks Run

- Final `rtk npm run lint` - passed.
- Final `rtk npm run typecheck` - passed.
- Final `rtk npm run test` - passed, 37 files / 137 tests.
- Final `rtk npm run build` - passed.
- Final `rtk npm run test:e2e` - passed, 4 Playwright tests across desktop Chromium, mobile
  Chromium, and mobile WebKit.
- Final `rtk npm run test:load` - passed, 1 Playwright load test with 100 player submissions and
  edits plus final private CSV verification.
- `rtk npm run test:e2e` - initially exposed the mobile WebKit admin-host setup issue, then passed
  after WebKit was scoped to public/player phone routes and Chromium handled setup. Final passing
  run: 4 Playwright tests.
- `rtk npm run test:load` - initially exposed the impractical runtime of 200 browser-only mobile
  ballot interactions and a reveal-timing assumption, then passed after switching ballot load to a
  gated HTTP route and waiting through reveal timing. Final passing run: 1 load Playwright test,
  100 player submissions and edits, final CSV verified.

### Manual Review

- Product spec: tournament rules, ballot completion rules, backend result/tiebreak authority, and
  final CSV contents were not changed. The load helper submits normal server-side player ballots
  for the open round and then edits them before reveal.
- Test harness: e2e no longer hard-codes port 3100, and Playwright no longer builds inside the
  server command. Single-worker execution is intentional because the memory backend is shared by
  the e2e server process.
- Mobile UI: mobile Chromium performs setup and verifies a real phone ballot; mobile WebKit covers
  public/player phone routes, view-only boundaries, no horizontal overflow, and the centered seventh
  card against the same open-voting state.
- Security: `/api/e2e/load-ballot` returns 404 unless the explicit memory test backend env is set.
  No production Supabase, service-role, admin hash, or session secret values are exposed to browser
  code or workflow config.

### Risks And Assumptions

- The WebKit project intentionally does not drive `/coolguy69` host controls. Admin/host operation
  remains covered by desktop Chromium and should be manually rehearsed in the real host browser
  during Phase 9.
- The 100-player load rehearsal is local memory-backend HTTP coverage, not hosted Supabase
  concurrency proof. Hosted row-scoped persistence, database-time timer mutation, and hosted
  rehearsal evidence remain Phase 9 work.

## Comprehensive Review Remediation Phase 9 - Hosted Rehearsal And Release Evidence

Status: complete.

### Checklist Items Triage

- CR-001: closed. Supabase-backed player ballot writes now use the service-role
  `normalized_submit_ballot` RPC for row-scoped ballot/choice/revision mutation. Admin state
  mutations run through queued hydrate/mutate/persist helpers, and host heartbeats persist only
  host-lock state so they cannot overwrite unrelated voting/result changes.
- CR-003: closed. Supabase backend operation reads authoritative time through
  `normalized_database_time`; hosted voting/admin mutations exercised this path during the Phase 9
  rehearsal and the Supabase load/e2e checks.
- CR-008: closed. A full hosted Supabase four-round rehearsal passed against production Supabase by
  approved exception using event id `phase9-fourround-2026-06-30-prod-05`.
- CR-035: closed. Final clean Phase 8 gate evidence is now recorded in this file and in
  `docs/comprehensive-review-checklist-2026-06-30.md`; the previous e2e port-conflict risk is
  addressed by the free-port Playwright wrapper.

### Evidence

- Production Supabase exception: approved by the user because no spare project remained. Do not
  reuse the rehearsal event id for the real tournament.
- Migrations applied to the linked hosted Supabase project through
  `20260630041000_normalized_submit_ballot_rpc.sql`.
- Supabase schema lint passed with `rtk npx supabase db lint --linked`.
- Supabase migration list confirmed remote migration `20260630041000`.
- Hosted route issue reported as Vercel digest `2042555441` was fixed by setting the production
  Vercel environment variables and redeploying; non-root route smoke checks passed afterward.
- Hosted e2e passed with `TOURNAMENT_STATE_BACKEND=supabase` and event id
  `phase9-e2e-2026-06-30-prod-23`.
- Hosted load passed with `TOURNAMENT_STATE_BACKEND=supabase` and event id
  `phase9-load-2026-06-30-prod-07`, covering 100 player submissions/edits and final private CSV.
- Hosted four-round rehearsal passed with `TOURNAMENT_STATE_BACKEND=supabase` and event id
  `phase9-fourround-2026-06-30-prod-05`, covering all four rounds, Round 1 seeded tiebreaks,
  API-backed ballot submit/edit for later rounds, manual no-ban admin ballots, `/stage`, `/charts`,
  `/results`, final reveal, and manual private CSV download.

### Checks Run

- `rtk npm run lint` - passed.
- `rtk npm run typecheck` - passed.
- `rtk npm run test` - passed, 37 files / 143 tests.
- `rtk npm run build` - passed.
- `rtk npm run test:e2e` - passed, 4 Playwright tests.
- `rtk npm run test:load` - passed, 1 Playwright load test with 100 player submissions/edits and
  final private CSV verification.
- Hosted `rtk npm run test:e2e` with `TOURNAMENT_STATE_BACKEND=supabase` - passed, 4 Playwright
  tests.
- Hosted `rtk npm run test:load` with `TOURNAMENT_STATE_BACKEND=supabase` - passed, 1 Playwright
  load test.
- Hosted `rtk npm run test:phase9` with `TOURNAMENT_STATE_BACKEND=supabase` - passed, 1 Playwright
  four-round rehearsal test in about 6.3 minutes.
- `rtk npx supabase db lint --linked` - passed, no schema errors found.
- `rtk npx supabase migration list --linked` - passed and showed remote migration
  `20260630041000`.
- `rtk git diff --check` - passed after the final documentation update.

### Remaining Release Notes

- Reset or replace the production `TOURNAMENT_EVENT_ID` before the real tournament so Phase 9
  rehearsal data cannot be confused with event data.
- Re-run final release gates after any additional code/configuration changes.
