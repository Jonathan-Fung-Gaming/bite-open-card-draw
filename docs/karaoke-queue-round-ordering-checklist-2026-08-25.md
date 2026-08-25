# Karaoke Party queue-round ordering checklist

- [x] Read repository instructions, current brief, security notes, and existing Karaoke schema plan.
- [x] Inspect the latest applied replacements of add, select, and projection functions.
- [x] Define the internal round assignment and exact `B1,C1,A1,B2` regression.
- [x] Add one forward migration without editing applied migrations.
- [x] Backfill `queue_round` safely and enforce default, `NOT NULL`, and nonnegative values.
- [x] Add active-round uniqueness and pending-order indexes.
- [x] Preserve add RPC signature, locking, authentication, idempotency, admission, versioning,
      action, invalidation, security-definer, search-path, and ACL behavior.
- [x] Make locked selection and bounded projection use identical queue-round ordering.
- [x] Add catalog, regression, and selector/projector parity assertions.
- [x] Confirm the configured database target is local-only before attempting database execution.
- [x] Pass full local reset, local database lint, and guarded Karaoke database/concurrency harness.
- [x] Regenerate consuming database types from the verified local schema.
- [x] Complete one focused diff review and `git diff --check`.
- [x] Repair and pass the guarded local Karaoke rollback rehearsal, then prove the forward rebuild.
- [x] Record local executable evidence and hosted-publication status in phase status.
- [x] Merge the reviewed schema-owner PR.
- [x] Apply only the reviewed migration to the verified linked project after the app deployment.
- [x] Prove hosted parity, linked lint, catalog behavior, sibling smokes, and linked type parity.
