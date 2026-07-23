# Protein Tracker Phase 8 canonical database contracts

## Scope

- Add authenticated, atomic profile editing that creates a mandatory pending goal without rewriting historical goals.
- Keep Push endpoints and keys server-only while exposing service-role RPCs for owned subscription upsert/removal.
- Reconcile one 14-local-day weigh-in reminder from the latest weight, including DST-correct local scheduling and invalidation after a newer weight.
- Atomically claim due work, deduplicate destination deliveries, record retry/terminal outcomes, and remove invalid endpoints.
- Replace the legacy erase RPC with a recent-password-reconfirmation-attested service boundary that retains Auth, profile fields, preferences, push subscriptions, and security audit rows.
- Do not add an Auth-user deletion boundary; shared-project dependency auditing remains deferred.

## Security and transaction design

- Browser-callable profile editing derives `auth.uid()` and shares the existing per-user advisory lock and goal-confirmation semantics.
- Push, scheduler, worker, delivery, and erase functions require `auth.role() = 'service_role'`; underlying tables remain unavailable to browsers.
- All mutating paths share the Protein Tracker per-user advisory-lock domain. Claim selection uses row locks with `skip locked`; delivery uniqueness remains `(job_id, subscription_fingerprint)`.
- Endpoint fingerprints use SHA-256; provider error text is never stored. Only allow-listed status and short sanitized error codes cross the database boundary.
- Erase requires a recent trusted reauthentication timestamp plus request id and records an audit event; the one-argument legacy function is removed.

## Verification

- Reset only the loopback Supabase project, run a dedicated Phase 8 integration suite, and run database lint.
- Cover anonymous/authenticated denial of server boundaries, two-user isolation, profile edit/confirm behavior, DST/local-date reminder calculation, duplicate reconciliation, new-weight invalidation, concurrent claiming, retry and invalid-endpoint cleanup, exact erase retention, and unrelated shared-project row preservation.
- Perform one complete-diff review and one focused repair at most when deterministic evidence identifies a regression.

## Rollback

The change is additive except for replacing the obsolete one-argument erase signature. Rollback drops the new triggers/functions and restores the prior erase definition before removing the migration from an unreleased environment. Existing notification rows remain compatible with the original tables.
