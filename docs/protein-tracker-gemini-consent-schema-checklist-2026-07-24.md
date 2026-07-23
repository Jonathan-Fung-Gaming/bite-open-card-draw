# Protein Tracker Gemini consent schema checklist

- [x] Read the current brief, security notes, phase gates, and existing preference/erase contracts.
- [x] Review the phase-specific plan before implementation.
- [x] Add the paired, versioned consent fields and authenticated column grants.
- [x] Prove owner write/read/revoke and cross-user isolation through the local Data API.
- [x] Prove invalid partial or blank consent is rejected.
- [x] Prove tracking-data erase preserves consent.
- [x] Pass local reset, focused integration tests, database lint, lint, typecheck, unit tests, and build.
- [x] Complete one bounded diff/security review.
- [ ] Commit, push, open a PR, pass required checks, and merge.
- [ ] Verify the exact linked Supabase target, push the migration, and verify parity and linked lint.
