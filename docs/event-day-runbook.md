# Event-Day Runbook

Use this checklist on the event machine before players arrive and before every round.

## Remediation Gate

- Review `docs/production-readiness-remediation-plan-2026-07-13.md` and
  `docs/production-readiness-remediation-checklist-2026-07-13.md` before release prep.
- Do not treat the app as event-ready until every production-readiness item is closed with dated
  evidence or explicitly accepted as event-day risk by the tournament owner.
- When docs disagree, follow `docs/product-spec.md` and
  `docs/pump_open_stage_repo_validation_checklist.md` over stale execution-plan text.

## Before the Event

- Run `npm run lint`, `npm run typecheck`, `npm run test`, and
  `npm run build` on the release branch.
- Run `npm run test:e2e:production-flow:validate` with the intended disposable Supabase
  rehearsal event before the grouped browser evidence window. Confirm the output says
  `profile=production-flow`, `backend=supabase`, production server mode, explicit disposable
  `eventId`, `adminSessionHeartbeat=enabled`, `hostHeartbeat=enabled`,
  `voteLivePolling=enabled`, `publicRouteRefresh=enabled`, and `adminActionsOnly=enabled`.
- Run `npm run test:e2e:production-flow` only as the grouped Phase 11 browser evidence command.
  Do not substitute `npm run test:e2e`, `npm run test:diagnostic:supabase-dev-full`, or
  `npm run test:load:api-injection` as production-flow closure evidence.
- Confirm the grouped production-flow Playwright run starts Round 1 with 48 active voting players,
  marks exactly 12 voting players inactive before Round 2, exactly 12 more before Round 3, and
  exactly 12 more before Round 4, leaving active voting-player counts of 48, 36, 24, and 12.
- Confirm each round's active count, turnout denominator, eligibility snapshot, submitted ballot
  count, and private CSV row count match the expected 48, 36, 24, or 12 count.
- Confirm production environment variables are set in Vercel and not committed to Git.
- Confirm Supabase migrations are applied through
  `20260713010000_event_scoped_voter_device_binding.sql` with
  `npm run supabase:migration:list`.
- Confirm `TOURNAMENT_STATE_BACKEND=supabase` and a stable `TOURNAMENT_EVENT_ID` are configured for
  deployed or event use.
- Run `npm run import:charts` and confirm the output prints `Imported ... charts` plus required
  pool counts with every required pool at 7 or more.
- If strict import is not clean, confirm `data/generated/chart-import-report.json` records
  `reviewedBy`, ISO `reviewedAt`, and `reviewedCommit` for every repaired or skipped diagnostic.
- Run `npm run cache:chart-images` before the event. Expected output is
  `Prepared ... image assets: N cached, M using fallback /chart-images/fallback-card.svg`; `N` must
  be greater than 0 before claiming real cached artwork is ready.
- Run `npm run verify:real-chart-images` and confirm it reports non-fallback cached image assets.
- Run `npm run verify:release-data` and confirm it passes with matching source CSV, import
  report, runtime catalog, and image manifest hashes.
- If remote artwork fetching is unavailable, run `npm run cache:chart-images -- --fallback-only`
  only after explicitly accepting fallback cards for rehearsal or emergency operation.
- Confirm `public/chart-images/cache` contains real files when non-fallback artwork is required.
- Confirm the tournament logo renders correctly.
- Confirm the admin password hash and session secret are configured.
- Confirm the player roster has been imported and reviewed.
- Run a complete four-round rehearsal against hosted Supabase persistent state. Local rehearsal mode
  is useful for operator practice, but it is not production release evidence.
- Confirm the production-flow browser evidence covers the PFR matrix in `docs/testing-checklist.md`,
  including timer transitions, negative ballots, same-username behavior, anti-spoiler/live-count
  privacy, tiebreak edge cases, admin workflows, 100 eligible players, real player-route behavior,
  spectator/view-only traffic, and request-rate artifacts.
- During rehearsal, confirm private CSV auto-download and manual CSV download after final reveal.
- During Phase 11 evidence, confirm the production-flow artifacts include
  `phase11-deployed-visual-evidence.json`, projector screenshots at 1280x720 and 1366x768, mobile
  `/vote` evidence, QR `/room` geometry, and local cached chart-art paths.
- Reset rehearsal data and confirm `Tournament mode` before importing or using real event data.

## Stage Laptop Checklist

- Open `/stage` in the browser used for projector/stream capture.
- Confirm the tournament logo is visible.
- Confirm the current round number is correct.
- Confirm chart card titles fit at projector resolution.
- Confirm the timer and QR panel are readable from the room.
- Disable browser UI or use fullscreen if the venue setup expects it.
- If `/stage` shows `Stage view interrupted`, wait for the automatic retry. If it remains
  interrupted, confirm `/coolguy69` is healthy on the host laptop, then refresh the projector
  browser.

## Projector / Stream Capture Checklist

- Confirm the capture source sees the full `/stage` viewport.
- Confirm no admin route, private CSV, or browser address bar is visible in the capture.
- Confirm the final two-chart screen is framed and readable.
- Confirm no extreme flashing or unreadable shake is visible during reveal animations.

## QR Readability Checklist

- Open `/room` from the QR destination.
- Confirm the room page offers `I am a player voting` and `View charts only`.
- Scan from at least two phones.
- Record the manual venue-distance QR scan date, devices, and approximate distance in
  `docs/release-checklist.md`.
- Confirm cellular and venue Wi-Fi both work if available.

## Phone Testing Checklist

- Open `/vote` from a player phone.
- Confirm the dropdown label is exactly `Select your start.gg username`.
- Submit a test ballot during rehearsal.
- Confirm editing works until voting closes.
- Confirm phones show the closed/revealing message before final reveal.
- Confirm phones show selected charts first after final reveal.

## Admin Laptop Checklist

- Open `/coolguy69`.
- Log in with the shared admin password.
- Take host control.
- Confirm the page shows `Tournament mode`.
- Confirm current round is correct.
- Confirm active roster count is correct.
- Keep the admin laptop off the projector/stream capture.

## Host Lock Checklist

- Confirm only the intended host has active control.
- Confirm other admin browsers are read-only.
- Keep the host browser open so heartbeat health remains visible.
- Host ownership does not expire automatically if heartbeat stops.
- If the host laptop fails, perform the password-confirmed, audited forced takeover from the backup
  admin laptop.
- Do not wait for a host timeout; missing heartbeat is the signal to evaluate explicit takeover,
  not an ownership transfer.

## Host Setup

- Open `/coolguy69`.
- Log in with the shared admin password.
- Click `Take Host Control`.
- Confirm the host lock heartbeat is active.
- Review `Chart Eligibility`; use exclusion/re-inclusion controls only with an admin password and an
  audit reason, and confirm every required pool remains at 7 eligible charts or more.
- Open `/stage` on the projector display.
- Open `/charts` on a view-only display if needed and confirm it follows draw and final result state
  without manual refresh.
- Open `/room` and verify the QR destination works on a phone.

## Round Flow

For each round:

- Draw both chart sets.
- Confirm both sets have 7 charts.
- Open voting.
- Monitor turnout without exposing chart-by-chart counts publicly.
- Pause voting only if the event needs a temporary stop.
- Close voting through the normal timer or admin controls.
- Reveal results on stage.
- Confirm phones do not show results before stage reveal finishes.
- Confirm the final two selected charts are visible together.

## Before Each Round

1. Confirm active players.
2. Restore an inactive player if there was an admin or roster error.
3. Set the current round in `/coolguy69`.
4. Draw Set 1.
5. Confirm Set 1 appears on `/stage`.
6. Draw Set 2.
7. Confirm Set 2 appears on `/stage`.
8. Confirm `/charts` reflects the current draw if the view-only chart display is in use.
9. Show both sets.
10. Open voting.
11. Monitor turnout.
12. Do not reveal public chart-by-chart counts.

## During Voting

Host may:

- pause voting if something breaks
- resume voting after the fix
- manually enter a ballot if necessary
- close voting manually only if event operations require it

Host should not show admin screens, private CSV data, or live chart-by-chart information on projector or stream.

## After Voting Closes

1. Enter any approved manual ballot before results are computed.
2. Compute results.
3. Reveal Set 1 results.
4. Resolve Set 1.
5. Reveal Set 2 results.
6. Resolve Set 2.
7. Show final two charts.
8. Download private CSV.
9. Move to the next round.

## If The Website Fails

Use this fallback:

```text
Pause and fix the website.
```

Do not switch to random selection unless the tournament director explicitly decides on an outside-the-app fallback.

## After the Final Reveal

- Confirm the private ballot CSV auto-downloads.
- Use the manual `Download private ballot CSV` button if needed.
- Store the private CSV somewhere appropriate for tournament records.
- Confirm the private CSV file name includes the round number.
- Do not publish player-level ballot data unless explicitly approved.

## Private CSV Download Location Checklist

- Confirm the browser download folder before the event.
- After each final reveal, confirm the CSV appears in that folder.
- Move or copy the CSV to the tournament records location.
- Do not store rehearsal CSV files with real tournament records.

## Emergency Notes

- Dangerous actions must summarize the change and require admin password re-entry.
- Manual ballots and overrides must be auditable.
- If a real secret is exposed, rotate it before continuing.
- If the website fails, pause and fix the website unless the tournament director explicitly decides on an outside-the-app fallback.
