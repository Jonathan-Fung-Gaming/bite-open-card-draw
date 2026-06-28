# Phase Status

## Current Remediation Status

Status: remediation in progress; not event-ready.

The app is not event-ready until every item in `docs/remediation-issue-checklist.md` is closed
with evidence and the final closure gate in that checklist passes. The authoritative behavior
sources during remediation are `docs/product-spec.md` and
`docs/pump_open_stage_repo_validation_checklist.md`; they override stale execution-plan or phase
status text when there is a conflict.

`docs/pump_open_stage_repo_validation_checklist.md` is present in the workspace and is intentionally
called out as a required-read project document. As of this Phase 0 remediation note, `rtk git status
--short` reports it as untracked alongside the remediation plan and issue checklist, so these docs
must be added to version control before release if they are not already tracked by the user's
branch workflow.

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
- Sort order: result rows reveal from most banned to least banned, with tied rows sorted alphabetically
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
