# Event-Day Runbook

This runbook starts as a Phase 1 scaffold and must be updated as implementation details are added.

## Before the Event

- Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` on the release branch.
- Confirm production environment variables are set in Vercel and not committed to Git.
- Confirm Supabase migrations are applied.
- Run `npm run import:charts` and confirm required pools have at least 7 eligible charts.
- Run `npm run cache:chart-images` before the event, or `npm run cache:chart-images -- --fallback-only` for a local fallback manifest.
- Confirm chart artwork is cached locally or has fallback cards.
- Confirm the tournament logo renders correctly.
- Confirm the admin password hash and session secret are configured.
- Confirm the player roster has been imported and reviewed.
- Run a complete four-round rehearsal.

## Host Setup

- Open `/coolguy69`.
- Log in with the shared admin password.
- Click `Take Host Control`.
- Confirm the host lock heartbeat is active.
- Open `/stage` on the projector display.
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

## After the Final Reveal

- Confirm the private ballot CSV auto-downloads.
- Use the manual `Download private ballot CSV` button if needed.
- Store the private CSV somewhere appropriate for tournament records.
- Do not publish player-level ballot data unless explicitly approved.

## Emergency Notes

- Dangerous actions must summarize the change and require admin password re-entry.
- Manual ballots and overrides must be auditable.
- If a real secret is exposed, rotate it before continuing.
- If the website fails, pause and fix the website unless the tournament director explicitly decides on an outside-the-app fallback.
