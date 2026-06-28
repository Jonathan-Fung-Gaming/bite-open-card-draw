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
rtk npm run cache:chart-images -- --fallback-only
rtk npm audit --omit=dev
rtk npm run build
```

Playwright requires a local browser install:

```bash
rtk npx playwright install chromium
```

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
3. Confirm required pools have at least 7 eligible charts.
4. Run `rtk npm run cache:chart-images -- --fallback-only` locally, or `rtk npm run cache:chart-images` when remote artwork caching is desired.
5. Review chart exclusions before drawing.
6. Log in to `/coolguy69`.
7. Take host control.
8. Bulk import start.gg usernames.
9. Mark inactive/eliminated players before opening voting.
10. Confirm duplicate active usernames are blocked.

## Free-Tier Notes

- Player phones use ordinary page requests and server actions, not always-on Realtime connections.
- Public screens show turnout totals before reveal, not live chart-by-chart counts.
- Chart image fallback keeps the app usable without expensive remote image requests.
- No background job is required for local rehearsal mode.
