# Security Notes

## Secrets

Never commit:

- `.env`
- `.env.local`
- Supabase service-role keys
- Supabase secret keys
- Vercel tokens
- admin plaintext password
- session secrets

Only `.env.example` should be committed.

## Supabase keys

Browser code may use only public browser-safe Supabase values.

Server-only keys must remain server-only.

Tournament-changing writes should go through server-side code.

## Admin route

The admin route is `/coolguy69`, but the path is not security.

The admin route must require the shared admin password.

Admin sessions should expire after inactivity.

Dangerous actions require password re-entry.

## Dangerous actions

Dangerous actions must show a summary before the password prompt.

Examples:

- reroll set
- reroll round
- replace chart
- reopen voting
- manual ballot
- overwrite ballot
- add inactive player to active round
- override result
- reset round

## Public data

Public/stage/player screens must not show chart-by-chart live counts during voting.

Admin live counts are allowed only behind a warning button.

## Ballot integrity

The latest valid submitted ballot for a player counts.

No changes are allowed after results reveal except through an explicit correction workflow.

Manual ballots after close but before reveal must be marked as overrides in export.
