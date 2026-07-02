# Release Checklist

Use this checklist on the release branch before tournament use.

## Historical Evidence, Not Current Release Gates

These entries are retained for context only. They do not satisfy the current release-blocking gates
unless they are rerun or explicitly linked to dated evidence for the current release commit.

- Phase 8 clean e2e evidence was previously recorded with `rtk npm run test:e2e`.
- Phase 8 load evidence was previously recorded with `rtk npm run test:load`.
- Hosted Supabase rehearsal evidence was previously recorded with a disposable
  `TOURNAMENT_EVENT_ID`; production Supabase was used by explicit exception because no spare project
  remained.
- Phase 9 hosted four-round evidence was previously recorded before the command split. Current
  four-round rehearsals use `rtk npm run test:phase9:full`.
- Phase 9 hosted load evidence was previously recorded with `TOURNAMENT_STATE_BACKEND=supabase`.

Use `docs/phase-9-hosted-supabase-manual-guide.md` for the beginner-friendly hosted rehearsal
workflow.

## Current Release Evidence Rules

- [ ] Every checked item below includes date, commit, branch, environment, backend, command/manual
      step, result, and artifact path where applicable.
- [ ] Historical evidence above has not been treated as current release evidence unless rerun or
      linked with current release metadata.
- [ ] Current release commit recorded: `TODO`.
- [ ] Current release branch recorded: `TODO`.
- [ ] Deployed commit recorded: `TODO`.
- [ ] Reviewer/operator recorded: `TODO`.

## Remediation Gate

- [ ] `docs/remediation-plan-2026-06-28.md` has been reviewed for the current release.
- [ ] Every item in `docs/remediation-issue-checklist.md` is closed with evidence.
- [ ] The final closure gate in `docs/remediation-issue-checklist.md` passes.
- [ ] `docs/production-readiness-remediation-2026-07-01.md` has been reviewed and its required
      release evidence is complete.
- [ ] `docs/production-flow-risk-remediation-plan-2026-07-02.md` has been reviewed and Phase 5
      release artifact gates are complete.
- [ ] `docs/product-spec.md` and `docs/pump_open_stage_repo_validation_checklist.md` have been used
      as the final behavior source of truth for release review.

## Environment

- [ ] `NEXT_PUBLIC_SITE_URL` is set in Vercel.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` is set in Vercel.
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set in Vercel.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel and not committed.
- [ ] `ADMIN_PASSWORD_HASH` is set in Vercel.
- [ ] `SESSION_SECRET` is set in Vercel.
- [ ] `TOURNAMENT_STATE_BACKEND=supabase` is set in Vercel.
- [ ] Production does not set or rely on `TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND`.
- [ ] `TOURNAMENT_EVENT_ID` is set in Vercel to the real event namespace, not a Phase 9 rehearsal
      id.
- [ ] `TOURNAMENT_TEST_ROUTE_TOKEN` is not set in production.
- [ ] No `.env` or `.env.local` file is committed.

## Data

- [ ] `data/source/charts.csv` is the approved event chart export.
- [ ] Chart CSV SHA-256 recorded: `8FADB13C6E3F153DF5DA3CBC0B62A753771B12E8A34086AA87A677F5EC8885F5`.
- [ ] Chart CSV row count recorded: `4,571 source rows`.
- [ ] `rtk npm run import:charts` completed.
- [ ] `data/generated/chart-import-report.json` archived with SHA-256 from
      `data/generated/chart-import-report.sha256`:
      `ae31f8388c96d7247deb4ae4b2164551f4eb5b643e6040bd430a2c44eb68dc40`.
- [ ] Import report reviewed or strict mode passed. Current generated report:
      `2026-07-02T13:59:55.671Z`, 4,426 imported charts, 9 repaired rows, 145 skipped
      rows, 154 strict failures. Reviewer and date: `TODO`.
- [ ] All required pools have at least 7 eligible charts.
- [ ] Chart exclusions were reviewed.
- [ ] `rtk npm run cache:chart-images` completed with at least 1 real cached image asset.
- [ ] Image cache manifest identity recorded from `data/generated/image-assets.json`:
      `F5D886138BEE349A88F942D1196F0BC219C5E2211BCFF0014497A437D76653E0`
      with 639 cached assets and 0 fallback assets.
- [ ] `rtk npm run verify:real-chart-images` completed.
- [ ] Runtime catalog identity recorded from `rtk npm run verify:real-chart-images`:
      `F5DC28CA048E69C33AF9CD97B0C566A87BAC1E386796C0743F028F1DBF2F2E2B`
      for 4,426 runtime charts and 639 public PNG cache files.
- [ ] `public/chart-images/cache` contains real cached image files.
- [ ] Tournament logo source exists at `public/brand/tournament-logo.png`.
- [ ] Tournament logo app rendition exists at `public/brand/tournament-logo-web.png`
      and is used by `TournamentLogo`.
- [x] Tournament logo source size and optimized delivery/performance evidence recorded for phone
      and projector routes: source `2,390,536` bytes / web rendition `337,044` bytes; local
      Chromium route evidence on 2026-07-03 recorded optimized Next image responses of `14,598`
      body bytes / `14,898` transfer bytes for `/vote` at 390x844 and `/stage` at 1920x1080.
      Artifact: `test-results/full-flow-full-round-smoke-a6fff-l-and-downloads-private-CSV-desktop-chromium/pfr-logo-route-performance.json`.
- [ ] Real cached artwork rendering was verified on `/stage`, `/vote`, `/charts`, and `/results`.

## Roster

- [ ] Player start.gg usernames were imported.
- [ ] Active roster was reviewed.
- [ ] Duplicate active usernames were checked.
- [ ] Inactive/restored player flow was tested.

## Admin And Host

- [ ] Admin password works.
- [ ] Host lock was tested from two admin browsers.
- [ ] Forced host takeover was tested with password re-entry and an audit reason.
- [ ] Dangerous action password re-entry was tested.
- [ ] Current-round inactive player add was tested and confirmed to affect only the current round.
- [ ] Start.gg username typo editing was tested before history and rejected after history.
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
- [ ] Full four-round rehearsal completed against hosted Supabase persistent state with an approved
      disposable `TOURNAMENT_EVENT_ID`.
- [ ] Private CSV auto-download was tested.
- [ ] Manual `Download private ballot CSV` was tested.
- [ ] Private CSV filename includes event id, round, timestamp, and collision-resistant suffix.
- [ ] Private CSV formula-neutralization fixture was checked before opening in a spreadsheet.
- [ ] Private CSV active-at-round-start and original/latest revision timestamps were checked.
- [ ] Private CSV selected and banned chart columns include stable IDs and display difficulty.
- [ ] CSV file location was confirmed.

## Final Checks

- [ ] `rtk npm run lint`
- [ ] `rtk npm run typecheck`
- [ ] `rtk npm run test`
- [ ] `rtk npm run test:e2e`
- [ ] `rtk npm run test:load`
- [ ] `rtk npm run test:phase9`
- [ ] `rtk npm run test:phase9:full`
- [ ] `rtk npm run import:charts`
- [ ] `rtk npm run cache:chart-images`
- [ ] `rtk npm run verify:real-chart-images`
- [ ] `rtk npm audit --omit=dev`
- [ ] `rtk git diff --check`
- [ ] `rtk npm run build`
- [ ] Final release commit recorded: `git rev-parse HEAD`
