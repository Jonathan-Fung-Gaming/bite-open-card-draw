# Admin Runbook

Phase 4 provides the first operational admin route at `/coolguy69`.

Implemented now:

- shared password login
- HTTP-only signed admin session cookie
- 30-minute session max age
- host lock with heartbeat
- roster add, bulk import, active/inactive toggle, and restore
- duplicate active start.gg username blocking
- emergency current-round eligibility form with password re-entry and audit reason

Draw controls, voting controls, result reveal controls, manual ballot overrides, and private CSV
export are added in later phases.

## Required Admin Rules

- Use one shared admin password.
- Store only `ADMIN_PASSWORD_HASH`, never a plaintext password.
- Use the supported local hash format `scrypt:v1:<salt_hex>:<hash_hex>`.
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

The Phase 4 implementation uses server-only in-memory stores for host lock and roster state because
local Supabase credentials/tooling are not available. This keeps all mutations server-side for local
testing, but persistence must move to Supabase tables before event use.
