# Crossplay shared schema checklist — 2026-09-28

- [x] Read repository instructions, current brief, security notes, and accepted consuming plan.
- [x] Create and self-review this standalone phase plan.
- [x] Verify existing linked local/remote migration parity before selecting timestamp.
- [x] Implement normalized private schema and restricted runtime interface.
- [x] Pass focused isolated schema, permission, scoring, mutation and reporting checks.
- [x] Perform one bounded manual diff review.
- [x] Inspect dry-run showing only the reviewed new migration.
- [ ] Merge canonical migration and apply to verified target.
- [ ] Inspect effective runtime privileges and provision role credentials/first organizer.
- [ ] Complete hosted contract smoke and verify migration parity.

No unrelated phase status or sibling application behavior is changed by this phase.

## Local evidence

- Docker PostgreSQL 17 in the separate `crossplay-test-db` container, bound only to loopback
  `55432`; the existing local Supabase database was not changed/reset.
- `supabase/tests/crossplay_schema_test.sql` passes: runtime/browser permissions, all-table RLS,
  empty function search paths, same-schema composite constraints, scoring boundary/custom/negative
  fixtures, duplicate-batch atomicity and Unicode normalization, draft privacy/invalidation,
  version/idempotency conflicts, byes/rematches, proposal edit/dispute/finalization, correction
  history, withdrawals, invitation consumption/revocation, copied settings, lifecycle and rate limits.
- `node supabase/tests/crossplay_concurrency_test.mjs` passes using a newly created isolated
  database containing only the minimal prerequisites plus this migration. The test holds the first
  transaction open, observes the second PostgreSQL backend waiting on an actual lock, then verifies
  exactly one publication and one conflicting report. It also verifies successful opponent
  confirmation and replay of a trusted request fingerprint after server preprocessing changes.
- Linked read-only migration list matched before implementation. `npx supabase db push --linked
  --dry-run` reports exactly `20260928010000_crossplay_schema.sql`; nothing was applied remotely.
- One final manual review found that revision rules needed explicit rounding/version metadata to
  meet the accepted plan. One focused repair adds `completed_intervals`, `crossplay-v1`, and fixed
  win/draw/loss units to every official revision; the affected SQL behavior checks pass again.
  No second general review was performed.

## Deployment handoff

The parent implementation agent owns commit/PR/merge and hosted provisioning/deployment. The
canonical migration creates `crossplay_runtime` without LOGIN or a password. A verified admin must
provision credentials and insert the first existing Auth user into `crossplay.organizers`; neither
arbitrary Auth users nor the runtime can self-enroll. The production app must use this dedicated
role and keep Crossplay outside Data API exposure. Runtime inherits PostgreSQL PUBLIC privileges,
so inspect effective sibling schema/function/table permissions before credential provisioning.

Local application E2E uses separate `crossplay_app_test` in the disposable container with a unique
local Supabase Auth fixture. It does not use hosted data or production credentials. No hosted smoke,
production role provisioning, PR merge, or migration application is claimed by this checklist.
