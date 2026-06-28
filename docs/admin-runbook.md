# Admin Runbook

Phase 1 provides only the admin route shell at `/coolguy69`. Later phases add authentication,
host locking, roster controls, draw controls, voting controls, result reveal controls, and private
CSV export.

## Required Admin Rules

- Use one shared admin password.
- Store only `ADMIN_PASSWORD_HASH`, never a plaintext password.
- Set HTTP-only admin session cookies after login.
- Expire sessions after inactivity.
- Require password re-entry for dangerous actions.
- Show a clear action summary before a dangerous action password prompt.
- Keep tournament-changing actions server-side.
- Use the host lock so only one active host controls the tournament.

## Dangerous Actions

Dangerous actions include:

- rerolling a set
- rerolling a round
- replacing a chart
- reopening voting
- manually entering a ballot
- overwriting an existing ballot
- adding an inactive player back into the current round
- overriding a result
- resetting a round

## Current Phase Notes

The Phase 1 admin screen is intentionally non-operational. It exists so route loading, layout,
shared components, and security copy can be reviewed before server behavior is implemented.
