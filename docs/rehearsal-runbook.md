# Rehearsal Runbook

Use rehearsal mode only with disposable data. Local memory rehearsal is for operator practice.
Production-flow release evidence must use a disposable Supabase event id and production-like browser
runtime settings. Reset rehearsal data before tournament operation.

This runbook is for local operator practice. Production readiness still requires a full hosted
Supabase four-round rehearsal with `TOURNAMENT_STATE_BACKEND=supabase` and a disposable
`TOURNAMENT_EVENT_ID`; local memory-mode rehearsal does not count as release evidence.

## Automated Rehearsal Commands

The Phase 9 Playwright rehearsal is split into reusable page objects and flows under
`tests/phase9/`:

- `rtk npm run test:e2e:memory-dev-smoke` runs the local memory/dev smoke path. It is useful after
  routine UI or route changes and is not release evidence for PFR-003 or PFR-004.
- `rtk npm run test:phase9` runs the one-round Phase 9 smoke path in the memory/dev profile.
- `rtk npm run test:phase9:supabase-dev` runs the one-round Supabase rehearsal on `next dev` with
  test liveness shortcuts. It is useful for debugging Supabase data setup, but is not production
  release evidence.
- `rtk npm run test:phase9:full` runs the four-round Supabase/dev rehearsal tagged `@full`. It
  still keeps the dev server and test liveness shortcuts, so treat it as pre-release debugging only.
- `rtk npm run test:e2e:production-flow:validate` prints and validates the production-flow
  environment without launching Playwright.
- `rtk npm run test:e2e:production-flow` is the release-evidence browser command for Phase 7. It
  requires Supabase, an explicit disposable event id, production server mode, enabled admin session
  heartbeat, enabled host heartbeat, enabled vote polling, enabled public refresh, and UI ballot
  submission.

Use memory/dev smoke after routine changes. Use the production-flow command only during the grouped
Phase 7 browser evidence window, after Phase 1 through Phase 6 remediation checks pass.

Example production-flow validation setup:

```powershell
$env:E2E_TOURNAMENT_EVENT_ID = "rehearsal-2026-07-02-disposable"
$env:E2E_ALLOW_DESTRUCTIVE_RESET = "true"
$env:NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "<anon key>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role key>"
rtk npm run test:e2e:production-flow:validate
```

Expected validation output includes `profile=production-flow`, `backend=supabase`,
`serverMode=start` or `serverMode=external`, the disposable `eventId`, `adminSessionHeartbeat=enabled`,
`hostHeartbeat=enabled`, `voteLivePolling=enabled`, `publicRouteRefresh=enabled`, and
`adminActionsOnly=enabled`.

Do not use direct Supabase fixture writes as a replacement for hosted admin action coverage. They
are acceptable only for disposable setup/teardown or deterministic diagnostics that do not perform
the admin action being rehearsed.

## Load Rehearsal Commands

- `rtk npm run test:load:api-injection` runs the focused synthetic `/api/e2e/load-ballot` load tool.
  It defaults to 100 eligible players, multiple edits, stage connected, and spectator traffic on
  `/room`, `/charts`, and `/results`.
- This synthetic API load is not release evidence for real player-route behavior. Phase 7 must add
  or run browser evidence that uses `/room` and `/vote` roster selection, duplicate-username
  warnings, real form submission, edits, public route polling, and spectator/view-only traffic.

## Start Rehearsal

1. Open `/coolguy69`.
2. Log in.
3. Take host control.
4. In `Event Mode`, enter the admin password and click `Start Rehearsal`.
5. Confirm the page shows `Rehearsal mode`.
6. Confirm the rehearsal roster contains `Rehearsal Player 01` through `Rehearsal Player 12`.

Starting rehearsal resets roster, draws, ballots, voting windows, and results while preserving the active host lock.

## Four-Round Rehearsal Flow

For each round:

1. Use `Set Current Round` to select the round.
2. Draw both sets for that round.
3. Open `/stage` and confirm the current round appears.
4. Open `/room` from a phone and confirm both room choices load.
5. Open voting.
6. Submit at least one `/vote` ballot as a rehearsal player.
7. Optionally click `Seed Tiebreak` after both sets are drawn to create a two-chart least-ban tie for the current round.
8. Close voting.
9. Compute results.
10. Advance through every reveal step.
11. Confirm `/stage`, `/vote`, `/charts`, and `/results` show the final charts only after final reveal.
12. Download the private CSV.
13. Click `Advance Round`, or use `Set Current Round` for the next round.

## Forced Tiebreak

`Seed Tiebreak` is available only in rehearsal mode. It uses the first three eligible rehearsal players and seeds manual-admin ballots that leave the first two charts in each current-round set tied for fewest bans.

Rules:

- Both current-round sets must already be drawn.
- Results must not already be computed.
- The action is blocked outside rehearsal mode.

## Reset Rehearsal

1. In `/coolguy69`, confirm host control is active.
2. Enter the admin password in `Reset rehearsal data`.
3. Click `Reset Rehearsal`.
4. Confirm the page returns to `Tournament mode`.
5. Re-import or review the real roster before event operation.

Reset clears disposable rehearsal roster, draws, ballots, voting windows, and results.

## Do Not Mix Data

- Do not start rehearsal after importing the real event roster unless you intend to clear it.
- Do not use rehearsal private CSV files as tournament records.
- Do not leave rehearsal mode active on the event machine.
