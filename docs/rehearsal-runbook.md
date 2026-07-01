# Rehearsal Runbook

Use rehearsal mode only with disposable local/in-memory data. Reset rehearsal data before tournament operation.

This runbook is for local operator practice. Production readiness still requires a full hosted
Supabase four-round rehearsal with `TOURNAMENT_STATE_BACKEND=supabase` and a disposable
`TOURNAMENT_EVENT_ID`; local memory-mode rehearsal does not count as release evidence.

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
