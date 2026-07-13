# Phase 9 Hosted Supabase Manual Guide

This guide is for completing Phase 9 of
`docs/archive/comprehensive-review-remediation-plan-2026-06-30.md` with a hosted Supabase project.
That plan is retained as historical context; current release requirements come from
`docs/production-readiness-remediation-plan-2026-07-13.md`. This guide
assumes you have not done this workflow before.

Prefer a non-production Supabase project. If no spare project is available, production may be used
only as an explicitly approved exception, before a live event, with a fresh disposable rehearsal
event id. Production-project migration risk is accepted for that exception because migrations and
chart/catalog upserts are global database changes even when runtime state is event-scoped.

2026-06-30 evidence note: Phase 9 was completed against the existing production Supabase project by
explicit exception. The final four-round rehearsal event id was
`phase9-fourround-2026-06-30-prod-05`; do not reuse any Phase 9 rehearsal event id for the real
tournament.

## What Phase 9 Proves

Phase 9 is not just a visual rehearsal. It is the release evidence for these open items:

- `CR-001`: hosted Supabase persistence does not lose ballots or roll back unrelated state.
- `CR-003`: voting timer decisions use hosted database time and survive app restart/redeploy.
- `CR-008`: a full hosted Supabase rehearsal has been completed and documented.

For the 2026-07-03 production-readiness remediation plan, Phase 9 is narrower and maps to:

- `PRC-009`: real/disposable Supabase confidence for migrations, event scoping, concurrent ballot
  submit, concurrent result compute, host lock behavior, and critical RPC permissions.
- `PRC-014`: load evidence must label API-injection behavior separately from normal
  `/room -> /vote` route-player behavior.
- `PRC-030`: `/api/e2e/private-csv` route security must be covered at route level; deployed 404
  probes remain later production-flow/deployed-evidence work.

Current focused commands:

```bash
rtk npm run test:phase9:supabase-dev
rtk npm run test:load:api-injection
rtk npm run test:load:player-routes
```

`test:load:api-injection` is the 100-player API pressure profile. `test:load:player-routes` is a
smaller browser-real profile that submits through `/room -> /vote` with spectator/view-only traffic.
Do not treat either profile as the Phase 11 full production-flow rehearsal.

## Safety Rules

- Do not paste secrets into chat.
- Do not commit `.env`, `.env.local`, service-role keys, database passwords, Vercel tokens,
  session secrets, plaintext admin passwords, or admin password hashes.
- Use a non-production Supabase project whenever one is available.
- If using the existing production Supabase project as an approved exception:
  - Confirm no live event is in progress.
  - Do not use the real event `TOURNAMENT_EVENT_ID`.
  - Accept that migrations and chart/catalog data changes affect the production schema.
  - Keep all rehearsal runtime writes under a fresh disposable `TOURNAMENT_EVENT_ID`.
- Use a fresh `TOURNAMENT_EVENT_ID` for every rehearsal attempt.
- Stop if you are unsure whether the selected project or event id contains real event data that
  must be preserved.

Safe to share with Codex:

- Supabase project ref.
- Public Supabase URL.
- Publishable or anon key.
- Disposable `TOURNAMENT_EVENT_ID`.
- Error messages that do not contain secrets.

Not safe to share with Codex:

- Supabase service-role key.
- Supabase database password.
- Admin plaintext password.
- `ADMIN_PASSWORD_HASH`.
- `SESSION_SECRET`.
- `.env.local` contents.

## Glossary

- Supabase project ref: the short id in the Supabase project URL, such as
  `abcdefghijklmnopqrst`.
- Supabase project URL: usually `https://<project-ref>.supabase.co`.
- Publishable or anon key: browser-safe Supabase key. It is still configuration, but not a
  service secret.
- Service-role key: server-only key. Never expose it to browser code or chat.
- `TOURNAMENT_EVENT_ID`: app namespace for one rehearsal or event run. Example:
  `phase9-rehearsal-2026-06-30-a`.

## Part 1: Confirm The Supabase Target

1. Open the Supabase dashboard in your browser.
2. Select the project you intend to use.
3. Confirm the target:
   - Preferred: project name clearly says rehearsal, staging, dev, or disposable.
   - Approved exception: existing production project is allowed only if no live event is running and
     the production schema migration risk has been accepted.
   - The selected `TOURNAMENT_EVENT_ID` must not contain real tournament state that you need to
     preserve.
   - If in doubt, stop and create a new Supabase project for rehearsal.
4. Copy the project ref from the dashboard URL.
   - Dashboard URLs usually look like:
     `https://supabase.com/dashboard/project/<project-ref>`.
5. Choose a fresh event id.
   - Recommended format:
     `phase9-rehearsal-YYYY-MM-DD-your-initials-01`.
   - Do not reuse an old id unless you intentionally want to inspect old rehearsal data.

Record these two non-secret values somewhere local:

```text
SUPABASE_PROJECT_REF=<project-ref>
TOURNAMENT_EVENT_ID=<fresh-disposable-event-id>
```

## Part 2: Collect Environment Values

In the Supabase dashboard:

1. Go to `Project Settings`.
2. Go to `API`.
3. Copy:
   - Project URL.
   - Publishable or anon key.
   - Service-role key.

Keep the service-role key private.

You also need:

- Admin password hash.
- Session secret.

If you do not already have an admin password hash, ask Codex to run an interactive local hash
helper. Type the plaintext admin password only into your local terminal prompt, never into chat.

For `SESSION_SECRET`, use a long random value. The helper script can generate one if you leave the
prompt blank.

## Part 3: Create Or Update `.env.local`

Use the helper script from an interactive PowerShell terminal:

```bash
rtk powershell -NoProfile -ExecutionPolicy Bypass -File scripts/write-local-env.ps1
```

The script asks for values. Paste only into the terminal prompts:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET`

If `.env.local` already exists and you intentionally want to replace it:

```bash
rtk powershell -NoProfile -ExecutionPolicy Bypass -File scripts/write-local-env.ps1 -Overwrite
```

Then add these two lines to `.env.local` manually:

```text
TOURNAMENT_STATE_BACKEND=supabase
TOURNAMENT_EVENT_ID=<fresh-disposable-event-id>
```

Check the file in your editor. Do not paste it into chat.

## Part 4: Apply Supabase Migrations

Preferred path: Supabase CLI.

1. Confirm the CLI works:

```bash
rtk npx supabase --version
```

2. Log in if needed:

```bash
rtk npx supabase login
```

This may open a browser. Follow the Supabase login prompt.

3. If the repo has no `supabase/config.toml`, initialize local Supabase metadata:

```bash
rtk npx supabase init
```

4. Link the non-production project:

```bash
rtk npx supabase link --project-ref <project-ref>
```

Supabase may ask for the database password. Type it into the terminal only.

5. Push migrations:

```bash
rtk npx supabase db push
```

Expected result:

- Migrations apply without errors.
- The latest migration includes `event_persistence_locks` and the database-time RPC.

If migration push fails, stop. Do not keep clicking around in production-like data. Copy only the
non-secret error text for troubleshooting.

Fallback path: Supabase SQL editor.

Use this only if CLI linking cannot work:

1. Open Supabase dashboard.
2. Go to `SQL Editor`.
3. Open each file under `supabase/migrations` locally, in filename order.
4. Paste one migration at a time into SQL Editor.
5. Click `Run`.
6. Stop on the first error.

The CLI path is safer because it tracks migration order.

## Part 5: Verify The Hosted Database Shape

In Supabase SQL Editor, run this read-only check:

```sql
select public.normalized_database_time();

select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'players',
    'draws',
    'drawn_charts',
    'voting_windows',
    'ballots',
    'ballot_choices',
    'result_snapshots',
    'result_rows',
    'tiebreaks',
    'host_locks',
    'event_persistence_locks'
  )
order by tablename;
```

Expected result:

- `normalized_database_time()` returns a timestamp.
- All listed runtime tables appear.

## Part 6: Run Local Gates Before Rehearsal

From the repo root:

```bash
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run build
```

If any command fails, stop and fix it before hosted rehearsal.

Run e2e and load if the local browser dependencies are ready:

```bash
rtk npm run test:e2e
rtk npm run test:load
```

The local load test still uses the memory backend by design. It does not replace hosted Supabase
rehearsal.

## Part 7: Start The App Against Hosted Supabase

Start the local Next.js app:

```bash
rtk npm run dev
```

Keep this terminal open.

Open these URLs in Chrome:

```text
http://localhost:3000/coolguy69
http://localhost:3000/stage
http://localhost:3000/room
http://localhost:3000/charts
http://localhost:3000/results
```

For real phone QR testing, `localhost` is not enough. Use a deployed preview URL, a LAN-accessible
URL, or another approved tunnel, and set `NEXT_PUBLIC_SITE_URL` to that URL.

## Part 8: Admin Setup For Rehearsal

In `/coolguy69`:

1. Log in with the shared admin password.
2. Click `Take Host Control`.
3. Confirm the host badge shows active control.
4. In `Event Mode`, start rehearsal mode:
   - Enter admin password.
   - Enter an audit reason such as `Phase 9 hosted Supabase rehearsal`.
   - Click `Start Rehearsal`.
5. Confirm the page shows `Rehearsal mode`.
6. Confirm rehearsal players are loaded.

This writes disposable rehearsal state under your `TOURNAMENT_EVENT_ID`.

## Part 9: Four-Round Hosted Rehearsal

Repeat this flow for Rounds 1 through 4.

For each round:

1. In `/coolguy69`, set the current round.
2. Draw Set 1.
3. Draw Set 2.
4. Check `/stage`:
   - Top row is Set 1.
   - Bottom row is Set 2.
   - Each row has 7 charts.
   - QR points to `/room`.
5. Check `/charts`:
   - View-only status is visible.
   - No vote controls are present.
6. Open voting from admin.
7. Submit at least two player ballots from `/vote`.
   - Use different rehearsal players.
   - Complete both sets.
   - Use `No bans for this set` on at least one set.
   - Use 1 or 2 bans on another set.
8. Edit one submitted ballot before voting closes.
9. Close voting from admin.
10. For one round, enter a manual ballot after close but before results reveal.
11. Compute results.
12. Advance reveal through:

- Set 1 counts.
- Set 1 selected.
- Set 2 counts.
- Set 2 selected.
- Final charts.

13. Check `/stage` final screen:

- It shows exactly two selected charts.

14. Check `/vote`, `/charts`, and `/results`:

- Before final reveal, phones do not show full results.
- After final reveal, selected charts appear first.

15. Download private CSV:

- Confirm auto-download if it triggers.
- Click manual `Download private ballot CSV`.
- Open the CSV locally and confirm player rows and selected chart columns exist.

16. Advance to the next round.

At least once during the rehearsal:

- Use `Seed Tiebreak` before computing results to force a rune-wheel tiebreak.
- Verify the wheel runs for about 10 seconds and reveals the backend-committed winner.
- Use two admin browser windows to test host lock read-only and takeover behavior.
- Restart the app and confirm state survives:
  1. Stop `rtk npm run dev` with `Ctrl+C`.
  2. Start it again with `rtk npm run dev`.
  3. Refresh `/coolguy69`, `/stage`, `/vote`, `/charts`, and `/results`.
  4. Confirm draws, voting windows, ballots, results, admin session behavior, and host lock behavior are sane.

## Part 10: Hosted Persistence Checks

These are the Phase 9 evidence checks.

Different-player persistence:

1. Open two separate browser windows or profiles.
2. Submit ballots for two different rehearsal players close together.
3. Refresh admin.
4. Confirm both players are counted.
5. Confirm final CSV includes both players.

Same-player latest ballot:

1. Submit as one rehearsal player.
2. Open the same player on another browser/device.
3. Confirm duplicate warning appears.
4. Submit a replacement ballot.
5. Confirm the latest submitted ballot is the one reflected in final CSV.

Host heartbeat safety:

1. Leave admin open with active host control.
2. Submit ballots from another window while the admin page is open.
3. Refresh admin and public screens.
4. Confirm the ballot did not disappear.

Timer persistence:

1. Open voting.
2. Pause voting.
3. Restart the app.
4. Confirm the paused state and remaining time survive.
5. Resume voting.
6. Close voting or let the timer reach a close/extension condition.
7. Confirm status persists after another restart.

## Part 11: Finish And Record Evidence

After the hosted rehearsal completes:

1. Run final local gates:

```bash
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run build
rtk npm run test:e2e
rtk npm run test:load
```

2. Run a whitespace check:

```bash
rtk git diff --check
```

3. Confirm no secrets are staged:

```bash
rtk git status --short
```

4. Update release evidence docs:
   - `docs/phase-status.md`
   - `docs/deployment-readiness.md`
   - `docs/release-checklist.md`
   - `docs/archive/comprehensive-review-checklist-2026-06-30.md` (historical evidence only)

5. Mark `CR-001`, `CR-003`, and `CR-008` complete only if the hosted evidence actually passed.

## If Something Goes Wrong

Migration error:

- Stop.
- Keep the Supabase project selected.
- Copy only the error text, not secrets.
- Do not retry against a different project until the target is confirmed non-production.

Login fails:

- Confirm `ADMIN_PASSWORD_HASH` is set.
- Confirm `SESSION_SECRET` is set.
- Confirm the plaintext password was not stored in `.env.local`.

Supabase-backed app fails to start:

- Confirm `.env.local` has `TOURNAMENT_STATE_BACKEND=supabase`.
- Confirm `.env.local` has a nonblank `TOURNAMENT_EVENT_ID`.
- Confirm `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` are from the same project.

QR opens the wrong URL:

- Confirm `NEXT_PUBLIC_SITE_URL` matches the URL phones should use.
- Restart the app after changing `.env.local`.

State disappears:

- Confirm you did not change `TOURNAMENT_EVENT_ID`.
- Confirm the app is running with `TOURNAMENT_STATE_BACKEND=supabase`, not memory.
- Confirm the Supabase project is the same one used for migrations.

Accidentally used the wrong event id:

- Stop rehearsal.
- Choose a fresh event id.
- Restart the app.
- Start rehearsal mode again.
