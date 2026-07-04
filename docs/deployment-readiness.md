# Deployment Readiness

## Required Services

- Vercel project linked to this repository.
- Supabase project with migrations applied through
  `20260704010000_normalized_voter_presence_rpc.sql`.
- Production environment variables configured in Vercel project settings only.

Do not commit `.env`, `.env.local`, Supabase service-role keys, Vercel tokens, session secrets, or plaintext admin passwords.

## Environment Variables

Set these in Vercel and in local `.env.local` only:

```text
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_PASSWORD_HASH
SESSION_SECRET
TOURNAMENT_EVENT_ID=<event-or-rehearsal-id>
TOURNAMENT_STATE_BACKEND=supabase
```

Generate `ADMIN_PASSWORD_HASH` with the supported `scrypt:v1:<salt_hex>:<hash_hex>` format. Store the plaintext shared admin password outside the repo.

Do not configure `TOURNAMENT_TEST_ROUTE_TOKEN` in production. It is only for non-production e2e
helpers, and `/api/e2e/load-ballot` plus `/api/e2e/private-csv` are hard-disabled when either
`NODE_ENV=production` or `VERCEL_ENV=production`.

## Build Verification

Run before deployment:

```bash
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run test:e2e
rtk npm run test:e2e:production-flow
rtk npm run test:load
rtk npm run test:load:player-routes
rtk npm run test:phase9
rtk npm run supabase:migration:list
rtk npm run import:charts
rtk npm run cache:chart-images
rtk npm run verify:real-chart-images
rtk npm run verify:release-data
rtk npm audit --omit=dev
rtk npm run build
```

Playwright requires a local browser install:

```bash
rtk npx playwright install chromium webkit
```

## Release Blockers To Clear

Do not use the release for tournament operation until:

- `TOURNAMENT_STATE_BACKEND=supabase` is configured for the deployed environment.
- `TOURNAMENT_EVENT_ID` is configured to a stable nonblank event namespace. Do not use any Phase 9
  rehearsal id, including `phase9-e2e-2026-06-30-prod-23`,
  `phase9-load-2026-06-30-prod-07`, or `phase9-fourround-2026-06-30-prod-05`, for the real
  tournament.
- Supabase migrations are applied through `20260704010000_normalized_voter_presence_rpc.sql`.
- `TOURNAMENT_TEST_ROUTE_TOKEN` is absent from production environment variables.
- `rtk npm run cache:chart-images` produces at least one non-fallback cached artwork file and
  `public/chart-images/cache` or the chosen controlled storage has real files.
- Rehearsal mode has been reset or a clean production event namespace has been selected before real
  tournament operation.
- Private CSV auto-download and the manual admin CSV download have both been verified after a final
  reveal.
- The release-blocking production-flow Playwright rehearsal has verified Round 1 starts with 48
  active voting players, then exactly 12 voting players are removed before each later round so
  Rounds 2, 3, and 4 use 36, 24, and 12 active voting players.
- The same rehearsal has verified the per-round active count, turnout denominator, eligibility
  snapshot, submitted ballot count, and private CSV row count.
- `docs/remediation-issue-checklist.md` has every row checked with evidence and its final closure
  gate passes.

## Phase 9 Hosted Evidence

Hosted Supabase rehearsal is no longer an unresolved release blocker as of 2026-06-30.

- Production Supabase was used by explicit exception because no spare project remained. The accepted
  risk is that global migrations were applied to the existing production project.
- `rtk npx supabase db lint --linked` passed with no schema errors.
- Historical `rtk npx supabase migration list --linked` showed remote migration `20260630041000`.
  Current Phase 11 readiness requires `20260704010000_normalized_voter_presence_rpc.sql`.
- Hosted `rtk npm run test:e2e` passed with `TOURNAMENT_STATE_BACKEND=supabase` and event id
  `phase9-e2e-2026-06-30-prod-23`.
- Hosted `rtk npm run test:load` passed with `TOURNAMENT_STATE_BACKEND=supabase` and event id
  `phase9-load-2026-06-30-prod-07`.
- Hosted four-round Phase 9 rehearsal evidence was recorded before the command split. Current
  release four-round runs use `rtk npm run test:e2e:production-flow`; the default
  `rtk npm run test:phase9` now runs the shorter one-round smoke path. The Supabase-dev full profile
  is available only as `rtk npm run test:diagnostic:supabase-dev-full`.
- Historical hosted `rtk npm run test:phase9` passed a four-round rehearsal with event id
  `phase9-fourround-2026-06-30-prod-05`.
- The Vercel non-root route failure reported with digest `2042555441` was resolved by configuring
  the production runtime environment variables and redeploying.

## Supabase Setup

For a step-by-step hosted rehearsal walkthrough, use
`docs/phase-9-hosted-supabase-manual-guide.md`.

Apply migrations before event use:

```bash
rtk npx supabase link --project-ref <project-ref>
rtk npm run supabase:db:push
```

Then verify:

```bash
rtk npm run supabase:migration:list
rtk npm run test
```

For event or deployed use, set `TOURNAMENT_STATE_BACKEND=supabase` and a nonblank
`TOURNAMENT_EVENT_ID`. The event id namespaces mutable runtime records so rehearsals and production
do not collide in normalized Supabase tables. Leaving `TOURNAMENT_STATE_BACKEND=memory` is for tests,
local demos, or single-process development only.

## Data Setup Workflow

1. Replace `data/source/charts.csv` only with the approved chart export.
2. Run `rtk npm run import:charts`.
3. Confirm the output says `Imported ... charts` and prints required pool counts with every
   required pool at 7 or more. If it prints `Required pools with fewer than 7 eligible charts`,
   stop and repair the CSV or exclusions before drawing.
4. If `rtk npm run import:charts -- --strict` fails because repaired or skipped diagnostics remain,
   rerun the import with explicit review evidence:
   `rtk npm run import:charts -- --reviewed-by=<reviewer> --reviewed-commit=<commit>`.
   The report must include `reviewedBy`, ISO `reviewedAt`, and `reviewedCommit`.
5. Run `rtk npm run cache:chart-images` for remote artwork caching. Expected success output is
   `Prepared ... image assets: N cached, M using fallback /chart-images/fallback-card.svg`.
   `N` must be greater than 0 before claiming real cached artwork is ready.
6. Run `rtk npm run verify:real-chart-images`; it must report non-fallback cached image assets and
   chart assignments before release closure.
7. Run `rtk npm run verify:release-data`; it must pass with either strict-clean import artifacts or
   signed diagnostics and must report matching source CSV, import report, runtime catalog, and image
   manifest hashes.
8. If remote fetching is unavailable, run `rtk npm run cache:chart-images -- --fallback-only` and
   explicitly accept fallback artwork for rehearsal only. This does not close the real-image
   remediation items.
9. Confirm `public/chart-images/cache` contains real cached image files before relying on deployed
   non-fallback artwork. Runtime can derive deterministic cache paths from source `bg_img` when those
   public files exist.
10. Log in to `/coolguy69`.
11. Take host control.
12. Review chart exclusions in `Chart Eligibility`; every exclusion or re-inclusion requires admin
    password re-entry and an audit reason, and required pools must stay at 7 eligible charts or more.
13. Bulk import start.gg usernames.
14. Mark inactive/eliminated players before opening voting.
15. Confirm duplicate active usernames are blocked.

## Post-Deployment Image And QR Smoke

Run this against every deployed preview or production URL before using it for rehearsal or event
operation.

1. Record the deployed URL, Vercel deployment id, deployed source commit, and deployment time.
2. Confirm `NEXT_PUBLIC_SITE_URL` in the deployed environment is the same public origin that phones
   should open.
3. Run `rtk npm run verify:real-chart-images` locally and copy one
   `Sample runtime cached artwork` path from the output.
4. Probe that exact path on the deployed URL. It must return 200. Example:

   ```powershell
   rtk proxy powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://your-deployment.example/chart-images/cache/<sample>.png' -Method Head"
   ```

5. Probe the fallback asset too. It should return 200, but it must not be the only chart art used by
   live chart cards:

   ```powershell
   rtk proxy powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://your-deployment.example/chart-images/fallback-card.svg' -Method Head"
   ```

6. Open `/stage` and `/charts` on the deployed URL and record route/network evidence that chart-card
   images request `/chart-images/cache/*`. During a rehearsal state that renders phone/result cards,
   repeat the check for `/vote` and `/results`.
7. Inspect `/stage` and record the QR target. It must be an absolute public `/room` URL for the same
   deployed/event origin.
8. If a tracked cache PNG returns 404 from the deployed URL, classify the issue as a deployment
   artifact problem before changing app code. Check the deployed branch/commit, Vercel uploaded file
   count, ignored files, and whether the deployment was created before `public/chart-images/cache`
   was populated.
9. `data/generated/*.json` files are ignored/reproducible local release artifacts under the current
   repository strategy. The deployed runtime can fall back to `data/source/charts.csv` and derive the
   public cache path from `bg_img`; the deploy-critical asset is `public/chart-images/cache/*` unless
   the build strategy is later changed to generate and include the JSON artifacts.

## Phase 11 Production-Flow Evidence

Local production-build evidence:

```powershell
$env:E2E_TOURNAMENT_EVENT_ID = "rehearsal-YYYY-MM-DD-disposable"
$env:E2E_ALLOW_DESTRUCTIVE_RESET = "true"
rtk npm run test:e2e:production-flow:validate
rtk npm run test:e2e:production-flow
```

External deployed evidence needs the same Supabase/rehearsal variables plus deployed route metadata:

```powershell
$env:E2E_SERVER_MODE = "external"
$env:E2E_BASE_URL = "https://your-deployed-preview-or-production-url.example"
$env:E2E_DEPLOYED_TEST_ROUTE_TOKEN = "<deployed probe token value for negative /api/e2e/* checks>"
$env:E2E_DEPLOYED_COMMIT_SHA = "<deployed commit sha>"
rtk npm run test:e2e:production-flow:validate
rtk npm run test:e2e:production-flow
```

The external command must use a disposable `E2E_TOURNAMENT_EVENT_ID`. It probes `/api/e2e/*` with
no token, the local test token, and the deployed probe token; all probes must return 404. Phase 11
visual artifacts are attached to the production-flow run and include projector screenshots, QR
geometry, mobile `/vote` evidence, image request/resource metadata, and local cached artwork path
checks.

## Free-Tier Notes

- Player phones use ordinary page requests and server actions, not always-on Realtime connections.
- Public screens show turnout totals before reveal, not live chart-by-chart counts.
- Chart image fallback keeps the app usable without expensive remote image requests.
- No background job is required for local rehearsal mode.
