# Protein Tracker training-focus schema checklist

- [x] Read the current brief, security notes, phase gates, and existing Protein Tracker contracts.
- [x] Create and review the standalone phase plan.
- [x] Add the profile field, constraint, default, and existing-row backfill.
- [x] Add versioned onboarding and profile-change RPCs while retaining legacy compatibility.
- [x] Prove policy calculations, snapshots, isolation, idempotency, and history preservation.
- [x] Pass local reset, focused and regression integration tests, database lint, lint, typecheck,
      unit tests, and build.
- [x] Complete one bounded diff/security review and update phase status.
- [x] Commit, push, open a PR, pass required checks, and merge.
- [x] Verify the linked Supabase target, push the migration, and verify parity and linked lint.
