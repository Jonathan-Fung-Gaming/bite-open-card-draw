# Crossplay tournament lifecycle

Implementation authorized October 8, 2026 through the Crossplay app's portrait and tournament management plan. Scope is the private Crossplay schema only; Pump It Up rules, application and shared Auth users are unchanged.

Add archive/restore for draft, active and finished events; reset preserving current roster/config/seeds; and permanent deletion. Reset clears play/access, reactivates retained entrants and increments version/generation. Archive retains published history and freezes unfinished controllers. Preserve published results and clock precision during archive. Delete removes dependent rows and sensitive request snapshots while retaining only replay markers. Add a capability function without changing base/clock versions.

Use tournament-first row locking across execute, clock execute and invitation claims; recheck state after locks. Fingerprinted lifecycle retries must not repeat a reset after new play, nor recreate a deleted tournament. Preserve existing clock/manual-report protection, runtime-only function grants and empty search paths.

Plan review: dependency cleanup must precede deleting parents; result/report pointers must be cleared first. Archived drafts must remain private. Archived active events require new-app presentation. Pending shared reports must retain their acknowledgement clock version when controllers change. Retired request snapshots must reject stale replay; generic legacy receipts may not be attributable and contain no private payload. Row deletion must not attempt a tournament audit insert afterward.

## Checklist

- [x] New additive migration and private API boundaries.
- [x] Focused lifecycle SQL checks: states, permissions, preserved precision/content, cleanup, rollback and replay.
- [x] Six focused lifecycle concurrency checks: reset/delete/archive against ordinary and clock commands/claims.
- [x] One implementation review; focused repair only for evidenced failure.
- [ ] Commit, PR, required checks, merge.
- [ ] Verify linked target, migration parity and push dry run; deploy only this migration and verify capability/ACLs.

Test the new migration on a cloned disposable Crossplay database in the existing loopback PostgreSQL container. Do not reset the shared stack or run unrelated application/older migration suites. The consuming app owns its UI and end-to-end acceptance.

Deploy database capability before enabling new app controls. Rollback disables new controls and keeps additive schema. The consuming app must retain archived-state compatibility if unfinished events have been archived. Data already deleted or reset is not restored by application rollback.

## Verification

The new migration and transactional SQL acceptance passed against `crossplay_lifecycle_20261008_verified`, cloned from an existing disposable Crossplay database in `crossplay-test-clock-smoke` (PostgreSQL 17, loopback port 25432). Six observed-lock races passed: reset before append, delete before invitation claim, archive before publish, append before reset, result before stale reset, archive before control claim. No shared database reset or older migration test suite ran.

One general review identified that archive-state errors preceded permission checks. A deterministic unauthorized-write assertion reproduced it; the focused repair puts access checks before archived-state errors. The new SQL and six affected races pass after repair. No second general review was performed. Test-fixture variable collisions, missing starter setup and an invalid two-player round count were corrected during initial verification without changing tournament rules.

Linked target is the established Crossplay shared project `gsiyqhkcgegjrvqcqioc`. Read-only migration history shows exact parity before this new migration; only `20261008010000` is pending. PR checks and reviewed push remain outstanding.
