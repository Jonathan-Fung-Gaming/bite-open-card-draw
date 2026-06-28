# Release Checklist

Use this checklist on the release branch before tournament use.

## Environment

- [ ] `NEXT_PUBLIC_SITE_URL` is set in Vercel.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` is set in Vercel.
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set in Vercel.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel and not committed.
- [ ] `ADMIN_PASSWORD_HASH` is set in Vercel.
- [ ] `SESSION_SECRET` is set in Vercel.
- [ ] No `.env` or `.env.local` file is committed.

## Data

- [ ] `data/source/charts.csv` is the approved event chart export.
- [ ] `rtk npm run import:charts` completed.
- [ ] All required pools have at least 7 eligible charts.
- [ ] Chart exclusions were reviewed.
- [ ] `rtk npm run cache:chart-images` completed, or fallback cache was explicitly accepted.
- [ ] Tournament logo renders from `public/brand/tournament-logo.png`.

## Roster

- [ ] Player start.gg usernames were imported.
- [ ] Active roster was reviewed.
- [ ] Duplicate active usernames were checked.
- [ ] Inactive/restored player flow was tested.

## Admin And Host

- [ ] Admin password works.
- [ ] Host lock was tested from two admin browsers.
- [ ] Dangerous action password re-entry was tested.
- [ ] Manual ballot override flow was tested.
- [ ] Rehearsal mode was reset and page shows `Tournament mode`.

## Public And Phone Screens

- [ ] `/stage` readability was checked on projector/stream capture.
- [ ] `/room` QR destination opens on phones.
- [ ] `/vote` mobile ballot flow was tested.
- [ ] `/charts` view-only mode was tested.
- [ ] `/results` post-reveal mode was tested.
- [ ] Timer readability was checked.
- [ ] Selected chart highlight was checked.
- [ ] Final two-chart screen clarity was checked.

## Results And Export

- [ ] Result reveal sequence was tested.
- [ ] Rune-wheel tiebreak reveal was tested in rehearsal.
- [ ] Private CSV auto-download was tested.
- [ ] Manual `Download private ballot CSV` was tested.
- [ ] CSV file location was confirmed.

## Final Checks

- [ ] `rtk npm run lint`
- [ ] `rtk npm run typecheck`
- [ ] `rtk npm run test`
- [ ] `rtk npm run test:e2e`
- [ ] `rtk npm run import:charts`
- [ ] `rtk npm run cache:chart-images -- --fallback-only`
- [ ] `rtk npm audit --omit=dev`
- [ ] `rtk npm run build`
- [ ] Final release commit recorded: `git rev-parse HEAD`
