# Release Checklist

Use this checklist on the release branch before tournament use.

## Remediation Gate

- [ ] `docs/remediation-plan-2026-06-28.md` has been reviewed for the current release.
- [ ] Every item in `docs/remediation-issue-checklist.md` is closed with evidence.
- [ ] The final closure gate in `docs/remediation-issue-checklist.md` passes.
- [ ] `docs/product-spec.md` and `docs/pump_open_stage_repo_validation_checklist.md` have been used
      as the final behavior source of truth for release review.

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
- [ ] `rtk npm run cache:chart-images` completed with at least 1 real cached image asset.
- [ ] `rtk npm run verify:real-chart-images` completed.
- [ ] `public/chart-images/cache` contains real cached image files.
- [ ] Tournament logo renders from `public/brand/tournament-logo.png`.
- [ ] Real cached artwork rendering was verified on `/stage`, `/vote`, `/charts`, and `/results`.

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
- [ ] `/charts` view-only mode was tested and auto-refreshes after draw and final reveal.
- [ ] `/results` post-reveal mode was tested.
- [ ] Timer readability was checked.
- [ ] Selected chart highlight was checked.
- [ ] Final two-chart screen clarity was checked.

## Results And Export

- [ ] Result reveal sequence was tested.
- [ ] Rune-wheel tiebreak reveal was tested in rehearsal.
- [ ] Full four-round rehearsal completed against persistent state.
- [ ] Private CSV auto-download was tested.
- [ ] Manual `Download private ballot CSV` was tested.
- [ ] CSV file location was confirmed.

## Final Checks

- [ ] `rtk npm run lint`
- [ ] `rtk npm run typecheck`
- [ ] `rtk npm run test`
- [ ] `rtk npm run test:e2e`
- [ ] `rtk npm run import:charts`
- [ ] `rtk npm run cache:chart-images`
- [ ] `rtk npm run verify:real-chart-images`
- [ ] `rtk npm audit --omit=dev`
- [ ] `rtk git diff --check`
- [ ] `rtk npm run build`
- [ ] Final release commit recorded: `git rev-parse HEAD`
