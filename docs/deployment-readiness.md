# Deployment Readiness

## Required Services

- Vercel project linked to this repository.
- Supabase project with migrations applied through
  `20260701010000_production_readiness_transactions.sql`.
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
helpers, and `/api/e2e/load-ballot` is hard-disabled when `NODE_ENV=production`.

## Build Verification

Run before deployment:

```bash
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run test:e2e
rtk npm run test:load
rtk npm run test:phase9
rtk npm run test:phase9:full
rtk npm run import:charts
rtk npm run cache:chart-images
rtk npm run verify:real-chart-images
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
- Supabase migrations are applied through
  `20260701010000_production_readiness_transactions.sql`.
- `TOURNAMENT_TEST_ROUTE_TOKEN` is absent from production environment variables.
- `rtk npm run cache:chart-images` produces at least one non-fallback cached artwork file and
  `public/chart-images/cache` or the chosen controlled storage has real files.
- Rehearsal mode has been reset or a clean production event namespace has been selected before real
  tournament operation.
- Private CSV auto-download and the manual admin CSV download have both been verified after a final
  reveal.
- `docs/remediation-issue-checklist.md` has every row checked with evidence and its final closure
  gate passes.

## Phase 9 Hosted Evidence

Hosted Supabase rehearsal is no longer an unresolved release blocker as of 2026-06-30.

- Production Supabase was used by explicit exception because no spare project remained. The accepted
  risk is that global migrations were applied to the existing production project.
- `rtk npx supabase db lint --linked` passed with no schema errors.
- `rtk npx supabase migration list --linked` showed remote migration `20260630041000`.
- Hosted `rtk npm run test:e2e` passed with `TOURNAMENT_STATE_BACKEND=supabase` and event id
  `phase9-e2e-2026-06-30-prod-23`.
- Hosted `rtk npm run test:load` passed with `TOURNAMENT_STATE_BACKEND=supabase` and event id
  `phase9-load-2026-06-30-prod-07`.
- Hosted four-round Phase 9 rehearsal evidence was recorded before the command split. Current
  four-round runs use `rtk npm run test:phase9:full`; the default `rtk npm run test:phase9` now runs
  the shorter one-round smoke path.
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
rtk npx supabase db push
```

Then verify:

```bash
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
4. Run `rtk npm run cache:chart-images` for remote artwork caching. Expected success output is
   `Prepared ... image assets: N cached, M using fallback /chart-images/fallback-card.svg`.
   `N` must be greater than 0 before claiming real cached artwork is ready.
5. Run `rtk npm run verify:real-chart-images`; it must report non-fallback cached image assets and
   chart assignments before release closure.
6. If remote fetching is unavailable, run `rtk npm run cache:chart-images -- --fallback-only` and
   explicitly accept fallback artwork for rehearsal only. This does not close the real-image
   remediation items.
7. Confirm `public/chart-images/cache` contains real cached image files before relying on deployed
   non-fallback artwork. Runtime can derive deterministic cache paths from source `bg_img` when those
   public files exist.
8. Log in to `/coolguy69`.
9. Take host control.
10. Review chart exclusions in `Chart Eligibility`; every exclusion or re-inclusion requires admin
    password re-entry and an audit reason, and required pools must stay at 7 eligible charts or more.
11. Bulk import start.gg usernames.
12. Mark inactive/eliminated players before opening voting.
13. Confirm duplicate active usernames are blocked.

## Free-Tier Notes

- Player phones use ordinary page requests and server actions, not always-on Realtime connections.
- Public screens show turnout totals before reveal, not live chart-by-chart counts.
- Chart image fallback keeps the app usable without expensive remote image requests.
- No background job is required for local rehearsal mode.
