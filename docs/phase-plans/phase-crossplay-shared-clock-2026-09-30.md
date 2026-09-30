# Crossplay shared match clock migration

Scope: additive private Crossplay clock/starter/session/report records and authenticated SQL commands for the accepted consuming-app plan at `C:/Users/jfung/crossplay-tournaments/docs/shared-match-clock-plan.md` and contract `docs/clock-integration-contract.md` in that repository. No Open Stage app behavior changes.

The existing base schema version remains unchanged. Apply this migration before the consuming app release; rollback means redeploying the previous app, retaining additive records. No destructive rollback is required. Runtime continues to have function-only access; browser roles have no Crossplay access. Credentials are hash-only. Clock batches use match/controller epoch/sequence/version checks independent from tournament pairing versions. Report writes reuse existing result calculation/finalization and transaction locking.

Validation is scoped to this new migration under the migration-only exception: install minimal prerequisites plus the existing Crossplay schema as setup in an isolated loopback database, apply only this new migration under test, run its schema/security/start-history/event/report checks. No older migration tests or sibling application checks. Root coordinates the single final code review and authorized merge/deployment with target/parity inspection.

Plan review: preserve manual/legacy flow, explicit shared-device attestation, version freeze, exact milliseconds, starter accounting for byes/forfeits/manual games, revoke/takeover stale-controller rejection, no secret in public snapshots, no base-version change, bounded isolated validation. Deployment target must be verified before applying reviewed migration.

Checklist:
- [x] Additive records and SQL boundary implemented.
- [x] Focused isolated migration checks pass.
- [x] Single scoped review completed and evidence recorded.
- [ ] Reviewed migration merged/applied to verified target with parity.

Implementation: `supabase/migrations/20260930020000_crossplay_shared_clock.sql`, focused transactional checks in `supabase/tests/crossplay_clock_test.sql`, and observed PostgreSQL lock-contention checks in `supabase/tests/crossplay_clock_concurrency_test.mjs`. `supabase/migration-tests.json` registers only the new migration's focused suite; the existing base migration is prerequisite setup, not an older test run.

Local evidence: `node supabase/tests/crossplay_clock_concurrency_test.mjs` passed on isolated PostgreSQL 17 database `crossplay_clock_1790748252269`. It installs minimal prerequisites, base Crossplay schema, and this migration; executes the new focused SQL checks; then observes actual blocked backends for competing controller claims, identical-request replay, conflicting event versions, and manual-report/clock-creation contention. All four races passed. The manual-report contention initially demonstrated a real race; acquiring the existing tournament lock before selecting the manual/clock reporting path fixes it. SQL checks verify private ACL/RLS, unchanged base capability, new capability, scope/revocation, starter accounting, millisecond totals, frozen overtime, report revisions, explicit shared attestation and final adjusted result. No sibling application tests or unrelated migration tests ran.

Root completed the single scoped review. Its focused repairs allow pending/disputed same-controller reattachment without creating a clock over manual reports, increment correction epochs to invalidate old local journals, require review on every claimed-controller replacement/revocation even when the last server checkpoint was stopped, and expose confirmation method from the current official revision. Specific SQL regressions cover all four findings, including organizer corrections whose adjusted totals match an older shared report. New focused checks plus all four lock races passed again in `crossplay_clock_1790748635784`. No second general review was performed.

This phase has not yet committed, merged, or deployed; no production records were changed during these checks.
