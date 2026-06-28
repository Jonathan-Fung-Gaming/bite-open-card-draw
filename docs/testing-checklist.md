# Testing Checklist

This checklist is a Phase 1 baseline. It should be expanded as automated tests are added.

## Static Checks

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- E2E is not available in Phase 1 and should be added when Playwright is introduced.

## Phase 1 Shell Tests

- `/stage` loads.
- `/room` loads and offers `I am a player voting` and `View charts only`.
- `/vote` loads with the exact label `Select your start.gg username`.
- `/charts` loads as a view-only chart display shell.
- `/results` loads with the closed-voting stage reveal message.
- `/coolguy69` loads as the admin route shell.
- Tournament constants define S16/S17, S18/S19, S20/S21, and S22/D23.

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

## Stage and Results Tests

- `/stage` displays drawn charts and final selected charts.
- Phones show `Voting is closed. Results are being revealed on stage.` before reveal completion.
- Phones show selected charts first after reveal completion.
- Full ban counts are expandable after reveal completion.
- Final reveal shows both selected charts together.

## Admin Tests

- Host lock allows one active host.
- Host heartbeat expires and allows takeover.
- Other admin browsers are read-only without host control.
- Roster import and active/inactive player controls work.
- Current-round eligibility changes require password and audit reason.
- Private CSV export includes player-level ballots, manual overrides, selected charts, and tiebreak flags.
