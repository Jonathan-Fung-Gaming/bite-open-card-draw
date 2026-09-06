# PIU Trainer schema checklist

- [x] Confirm canonical owner, project reference and additive scope.
- [x] Review phase contract before implementation.
- [x] Implement migration and database tests.
- [x] Pass the new migration's isolated database checks only.
- [x] Complete one scoped review; application/sibling checks are excluded by user instruction.
- [x] Merge schema PR; verify target, dry-run and migration parity.
- [x] Apply migration and verify hosted PIU read-only schema checks.

PR #145 merged on 2026-09-06. Verified target `gsiyqhkcgegjrvqcqioc`; dry-run listed only `20260906010000_piu_trainer_schema.sql`; migration applied successfully and complete local/remote history matches. No sibling application suites or old migration tests ran after the migration-only instruction.

Migration support-only edits (focused test files, schema documentation or migration tooling) also bypass application gates even when no SQL file changes. With no new migration in the diff, no migration tests are selected.
