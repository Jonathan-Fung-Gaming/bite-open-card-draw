# Admin Runbook

Phase 4 provides the first operational admin route at `/coolguy69`.

Implemented now:

- shared password login
- HTTP-only signed admin session cookie
- 30-minute inactivity timeout for non-host and standby sessions
- non-expiring active host ownership with heartbeat health reporting
- roster add, bulk import, active/inactive toggle, and restore
- duplicate active start.gg username blocking
- emergency current-round eligibility form with password re-entry and audit reason
- chart draw controls for all round sets
- reroll one chart, one set, or one round with password re-entry and audit reason
- current-round controls
- rehearsal mode start/reset with disposable test roster
- rehearsal forced tiebreak seeding
- voting open, pause, resume, and close controls
- manual ballot overrides with password re-entry and audit reason
- result computation and reveal controls
- private CSV auto/manual download
- chart eligibility exclusions and re-inclusions with pool-count validation

## Required Admin Rules

- Use one shared admin password.
- Store only `ADMIN_PASSWORD_HASH`, never a plaintext password.
- Use the supported local hash format `scrypt:v1:<salt_hex>:<hash_hex>`.
- Set HTTP-only admin session cookies after login.
- Expire non-host and standby sessions after inactivity.
- Never expire the active host automatically because of inactivity or heartbeat loss.
- End host ownership only through explicit release or password-confirmed, audited forced takeover.
- If heartbeat is missing, use explicit forced takeover from another authenticated device; do not
  wait for ownership to expire because it will not expire automatically.
- Allow the original secured host laptop to recover after reauthentication.
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

## Persistence And Event Mode

Tournament-changing actions remain server-side. For deployed or event use, set
`TOURNAMENT_STATE_BACKEND=supabase` and a stable `TOURNAMENT_EVENT_ID` so the app can namespace
operational state for the active rehearsal or production event. `TOURNAMENT_STATE_BACKEND=memory` is
only for tests, local demos, or single-process development.
