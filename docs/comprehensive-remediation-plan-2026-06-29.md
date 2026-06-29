# Comprehensive Remediation Plan - 2026-06-29

## Status

This implementation pass addresses the non-architectural runtime, UX, session, QR, reroll, and
test guardrail items that can be landed on the current snapshot-backed runtime.

The normalized Supabase runtime repository conversion is intentionally not implemented in this
pass. It is tracked separately in:

`docs/normalized-runtime-persistence-plan-2026-06-29.md`

## Implemented Scope For This Pass

- Public result views show the two selected charts first.
- Public result views render collapsed per-set ban count sections below the selected charts.
- Result rows now display from least banned to most banned.
- `/charts` uses a view-only public chart layout instead of the projector seven-column row.
- `/results` auto-refreshes while waiting for final results.
- QR generation renders a visible setup error when production public origin config is unsafe.
- Production rejects missing, invalid, or `memory` tournament state backend config.
- Admin sessions use a 10-hour inactivity window with cookie refresh on server activity.
- The admin page runs a lightweight read-only heartbeat to refresh open sessions.
- Player username confirmation claims a short-lived device presence record and warns on another
  active device.
- Player ballot submission rolls back in-process state if persistence fails.
- Post-vote rerolls invalidate active round ballots, clear computed results, reset the voting
  window, and require the host to open voting again.
- The tiebreak reveal uses a circular 12-slot rune wheel with winner text hidden until the
  five-second reveal completes.
- Private CSV auto-download is keyed per final reveal so multiple rounds can download in one
  admin session.
- Chart image verification now enforces total cache and per-file size budgets.
- Mutation contract schemas now cover reopen voting, reset round, override result, rehearsal
  start/reset, round changes, and reveal advancement.

## Deferred Scope

The following items require the normalized Supabase runtime conversion and are not claimed complete
by this pass:

- Replacing `tournament_state_snapshots` as the authoritative deployed runtime store.
- Writing operational records to normalized tables with `TOURNAMENT_EVENT_ID` scoping.
- Storing opaque admin session token hashes in `admin_sessions`.
- Moving host locks, ballot revisions, tiebreaks, result rows, and audit records from snapshot JSON
  to transactional table writes.
- Generating complete Supabase types from the applied normalized migration.
- Adding SQL RPCs or equivalent transactional service-role functions for high-risk mutations.
- Transcoding cached artwork to bounded WebP output.

## Verification Targets

Run before considering this pass complete:

```bash
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run import:charts
rtk npm run cache:chart-images
rtk npm run verify:real-chart-images
rtk npm audit --omit=dev
rtk git diff --check
rtk npm run build
rtk npm run test:e2e
```

If `test:e2e` cannot run in the current environment, keep the remaining risk explicit in the
handoff.
