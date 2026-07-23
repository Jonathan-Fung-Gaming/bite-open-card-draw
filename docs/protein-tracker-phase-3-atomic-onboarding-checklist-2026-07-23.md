# Protein Tracker Phase 3 atomic-onboarding database checklist

- [x] Confirm canonical branch, clean worktree, linked migration parity, and next timestamp.
- [x] Create and self-review a bounded phase plan.
- [x] Add only the prefixed atomic-onboarding RPC and explicit grants.
- [x] Prove anonymous denial and authenticated caller-derived ownership.
- [x] Prove absent-profile creation and incomplete-profile update.
- [x] Prove exact replay is idempotent and a conflicting replay is rejected.
- [x] Prove a failed child insert rolls back profile and weight changes.
- [x] Reset local Supabase, run focused integration tests, and run database lint.
- [x] Review the complete diff once and record verification evidence.
- [x] Revoke authenticated/service-role execution of the caller-calculated v1 RPC.
- [x] Add raw-input-only v2 with canonical dates, policy calculations, versions, and snapshots.
- [x] Prove v1 denial plus v2 canonical output, replay/conflict, incomplete-profile, and rollback.
- [x] Run only the affected reset, focused tests, lint, and diff checks after the repair.
