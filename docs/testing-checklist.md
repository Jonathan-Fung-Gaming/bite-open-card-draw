# Testing Checklist

This checklist is a Phase 1 baseline. It should be expanded as automated tests are added.

## Static Checks

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run build`
- `npm run import:charts`
- `npm run cache:chart-images -- --fallback-only`
- E2E uses Playwright and runs the full Round 1 smoke flow.

## Phase 1 Shell Tests

- `/stage` loads.
- `/room` loads and offers `I am a player voting` and `View charts only`.
- `/vote` loads with the exact label `Select your start.gg username`.
- `/charts` loads as a view-only chart display shell.
- `/results` loads with the closed-voting stage reveal message.
- `/coolguy69` loads as the admin route shell.
- Tournament constants define S16/S17, S18/S19, S20/S21, and S22/D23.

## Phase 3 Import Tests

- CSV parser validates required source columns.
- Chart type and level normalize to S16, S17, D23, etc.
- Song keys and chart keys are stable.
- Duplicate chart keys are skipped and reported.
- Required pools have at least 7 eligible charts.
- Exclusions and re-inclusions change eligibility.
- Image cache planning deduplicates remote artwork and falls back safely.

## Product Rule Tests

- Four rounds exist with the required sets: S16/S17, S18/S19, S20/S21, S22/D23.
- Each set draws 7 charts.
- A round opens voting only after both sets are drawn.
- One 10-minute voting window covers both sets.
- Players may ban up to 2 charts per set.
- A set can be completed with explicit `No bans for this set`.
- No vague skip button exists.
- Results use ban counts only.
- Least-banned chart wins.
- Backend-decided tiebreaks are revealed by animation, not decided by animation.
- 5+ least-ban ties use simple fallback reveal.

## Security Tests

- Server-only keys are never available in browser code.
- `.env`, `.env.local`, Vercel tokens, service-role keys, plaintext admin passwords, and session secrets are not committed.
- Admin route requires authentication.
- Dangerous admin actions require password re-entry.
- Public screens do not show chart-by-chart live counts during voting.

## Voting Tests

- Player selector label is exactly `Select your start.gg username`.
- Username confirmation text is exactly `Are you sure you are voting as [start.gg username]?`.
- Duplicate active start.gg usernames are rejected.
- Latest valid submitted ballot wins for a username.
- Edits are allowed until voting closes.
- Failed saves preserve the previous server-confirmed ballot.
- View-only users cannot vote or affect turnout.
- Player cannot submit until both sets are complete.
- `No bans for this set` completes a set explicitly.
- Existing ballots show the duplicate-device warning copy.
- Server time sets `opened_at` and the 10-minute `closes_at` deadline.
- Turnout below 75% at normal expiration triggers exactly one 1-minute extension.
- All eligible players submitting early triggers a 30-second final-change warning.
- Host pause freezes the timer, submissions, and edits.
- Manual ballots require admin password re-entry and a reason.
- Manual ballots after close are marked as private export overrides.
- Ballots cannot change after results reveal without a later correction workflow.

## Stage and Results Tests

- `/stage` displays drawn charts and final selected charts.
- `/stage` shows both drawn sets together after both sets are available.
- Stage set layout uses 4 cards on the top row and 3 cards on the bottom row on wide displays.
- Stage QR panel points to `/room`.
- Missing chart art falls back to `public/chart-images/fallback-card.svg`.
- Phones show `Voting is closed. Results are being revealed on stage.` before reveal completion.
- Phones show selected charts first after reveal completion.
- Full ban counts are expandable after reveal completion.
- Final reveal shows both selected charts together.
- Result rows include zero-ban charts.
- Result rows sort from most banned to least banned.
- Least-ban charts are selected.
- Tied least-ban charts use backend-decided tiebreaks.
- 2-4 chart least-ban ties show a 12-slot rune wheel.
- 5+ chart least-ban ties use the plain fallback reveal.
- `/results` stays closed/revealing until the final stage reveal finishes.

## Admin Tests

- `/coolguy69` shows only the password login form without a valid admin session.
- Admin sessions use an HTTP-only signed cookie.
- Admin sessions expire after inactivity.
- Host lock allows one active host.
- Host heartbeat expires and allows takeover.
- Other admin browsers are read-only without host control.
- Roster import and active/inactive player controls work.
- Duplicate active start.gg usernames are blocked.
- Current-round eligibility changes require password and audit reason.
- Private CSV export includes player-level ballots, manual overrides, selected charts, and tiebreak flags.
- Private CSV auto-downloads once after final reveal and remains available by manual button.
- Playwright smoke test logs in as admin, takes host control, draws both sets, opens voting, submits a player ballot, closes voting, reveals results, and downloads the private CSV.

## Draw Tests

- Each set draws exactly 7 unique charts.
- Excluded charts are not drawn.
- Selected songs from prior rounds are not drawn.
- The same song is not drawn in both sets of the same round.
- Rerolling one chart, one set, or one round preserves draw history.
- Voting cannot open until both sets in the round are drawn.
- Draw and reroll actions use server-side randomness and require active host control.

## Phase 10 Hardening Tests

- Full Round 1 integration flow preserves one final ballot per player.
- Round 2 draw excludes songs selected in Round 1.
- Voting after results reveal is blocked.
- Manual overrides before result computation keep export metadata.
- 100 eligible players with multiple edits produce 100 latest ballots.
- Client components do not reference server-only secret environment names.

## Phase 11 Deployment And Rehearsal Tests

- Current round state drives `/stage`, `/vote`, `/charts`, and `/results`.
- Admin can set and advance the current round.
- Rehearsal mode loads a disposable 12-player roster.
- Rehearsal reset clears operational state and returns to tournament mode.
- Forced rehearsal tiebreak seeding is blocked outside rehearsal mode.
- Deployment, data setup, event-day, and rehearsal workflows are documented.

## Phase 12 Release Tests

- `docs/release-checklist.md` exists and covers env, data, roster, admin, public screens, results, CSV, and final checks.
- GitHub Actions CI runs stable quality gates on pull requests and `main`.
- Event-day runbook includes before-event, before-round, during-voting, after-close, and website-failure flows.
- Final local checks match CI gates plus e2e, import, fallback cache, audit, and production build.
