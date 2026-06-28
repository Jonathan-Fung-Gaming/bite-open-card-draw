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
- Source CSV: loaded from `data/source/charts.csv`
- Required columns: validated by importer and tests
- Required pools: all have at least 7 eligible charts
- Pool counts: S16 189, S17 196, S18 189, S19 167, S20 135, S21 150, S22 97, D23 125
- Duplicate chart keys: handled by importer and covered by tests; current source report has none
- Exclusions and re-inclusions: implemented in pure helpers and covered by tests
- Image cache: fallback manifest generated with `npm run cache:chart-images -- --fallback-only`
- Image assets: 639 planned assets using `/chart-images/fallback-card.svg` in fallback-only mode
- Lint: passed with `npm run lint`
- Typecheck: passed with `npm run typecheck`
- Unit tests: passed with `npm run test`
- E2E: placeholder passed with `npm run test:e2e`
- Production build: passed with `npm run build`
- Production dependency audit: passed with `npm audit --omit=dev`

### Changed Files

- Added chart normalization, import, exclusion, and image-cache modules in `src/lib/charts`
- Added chart importer/cache tests
- Added `scripts/import-charts.ts` and `scripts/cache-chart-images.ts`
- Added `npm run import:charts` and `npm run cache:chart-images`
- Added `data/generated/.gitkeep`; generated chart JSON artifacts are local outputs ignored by git
- Added original fallback chart artwork at `public/chart-images/fallback-card.svg`
- Added and committed the placeholder `test:e2e` script target so the existing script is not broken before Playwright is introduced
- Updated README, testing checklist, and event-day runbook with chart setup commands

### Manual Review

- Product rules: importer preserves only S/D chart types for tournament use, validates the required pools, marks matching charts eligible by default, and does not alter draw or selection rules.
- Security: scripts read local source data and write generated public-safe chart metadata; no secrets or service-role keys are involved.
- Data: malformed CSV rows with unquoted commas and quotes are repaired; unsupported chart type `c` rows are skipped and reported because only S and D pools are in scope.
- UI: no new live UI behavior was added; fallback artwork is original and does not use official DOOM assets.
- Tests: import, normalization, duplicate handling, malformed row repair, exclusions, re-inclusions, and image fallback planning are covered.

### Risks And Assumptions

- The final image check used fallback-only mode to avoid downloading hundreds of live third-party assets during local validation. The remote-fetch path is implemented in `npm run cache:chart-images`; run it before the event on a stable network to populate local cached artwork.
- `data/generated/charts.json` and `data/generated/charts-with-images.json` are generated local snapshots from the current CSV and should be regenerated if `data/source/charts.csv` changes.
- The CSV contains unsupported `c` chart rows. They are skipped by design because the product spec only uses S and D chart pools.
