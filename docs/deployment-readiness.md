# Deployment Readiness

## Required Services

- Vercel project linked to this repository.
- Supabase project with the Phase 2 migration applied.
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
TOURNAMENT_STATE_BACKEND=supabase
```

Generate `ADMIN_PASSWORD_HASH` with the supported `scrypt:v1:<salt_hex>:<hash_hex>` format. Store the plaintext shared admin password outside the repo.

## Build Verification

Run before deployment:

```bash
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run test:e2e
rtk npm run import:charts
rtk npm run cache:chart-images
rtk npm run verify:real-chart-images
rtk npm audit --omit=dev
rtk npm run build
```

Playwright requires a local browser install:

```bash
rtk npx playwright install chromium
```

## Release Blockers To Clear

Do not use the release for tournament operation until:

- `TOURNAMENT_STATE_BACKEND=supabase` is configured for the deployed environment.
- `rtk npm run cache:chart-images` produces at least one non-fallback cached artwork file and
  `public/chart-images/cache` or the chosen controlled storage has real files.
- A complete four-round rehearsal has been run against persistent state.
- Private CSV auto-download and the manual admin CSV download have both been verified after a final
  reveal.
- `docs/remediation-issue-checklist.md` has every row checked with evidence and its final closure
  gate passes.

## Supabase Setup

Apply migrations before event use:

```bash
rtk npx supabase link --project-ref <project-ref>
rtk npx supabase db push
```

Then verify:

```bash
rtk npm run test
```

For event or deployed use, set `TOURNAMENT_STATE_BACKEND=supabase`. In that mode the app hydrates
operational tournament state from Supabase before server reads and persists it after successful
tournament-changing actions. Leaving `TOURNAMENT_STATE_BACKEND=memory` is for tests, local demos, or
single-process development only.

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
