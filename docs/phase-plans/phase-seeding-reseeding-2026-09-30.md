# Predicted reseeding commit compatibility

The Pumbility application is replacing its two-pass processor with `phoenix2-predicted-gap150-higher-pool-v1`. Its new runs contain one decision per accepted entrant and no passes/swaps. The existing RPC rejects these otherwise complete runs.

Scope: replace only the commit RPC's completion check with version-aware validation, retain the old two-pass write path for rollback, and add readiness marker `20260930010000`. Preserve all other transaction, source, numeric, idempotency, publication and permission checks. No data rewrite, schema reset, or unrelated migration.

Pre-implementation review: the consuming app must remain undeployed until this migration is merged and applied. Decisions are server-generated; the database checks completion shape and the same input revision, while the consuming app tests algorithm semantics. No new RPC privileges are needed. Rollback is to the previous app deployment; leave this backward-compatible migration installed.

Verification checklist:
- [x] Isolated pre-change schema snapshot, new migration only, focused SQL behavior checks.
- [x] New complete runs accepted; missing/partial decisions, legacy incomplete passes and stale revisions rejected.
- [x] Legacy complete runs remain accepted; replay, source and publication preservation checked.
- [x] Service-only invoker function ACLs and new readiness marker verified.
- [ ] One scoped diff review; required focused CI passes.
- [ ] Verify configured target, migration parity and push dry run; apply only this migration after merge.
- [ ] Read-only hosted readiness/ACL check and post-deployment parity.

Application suites belong to the consuming repository. No application tests, old SQL suites, database reset, schema-wide lint, or unrelated fixes run in this migration-only change.

Local evidence: isolated PGlite runner `node supabase/tests/seeding_reseeding_pglite.mjs` passed all new SQL assertions. Scoped diff review confirmed only completion validation and readiness differ from the prior commit function. Configured target `gsiyqhkcgegjrvqcqioc` has 54 matching predecessor migrations; dry run lists only `20260930010000`. CI/merge/apply remain pending.
