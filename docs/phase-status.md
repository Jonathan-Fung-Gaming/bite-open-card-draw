# Phase Status

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
