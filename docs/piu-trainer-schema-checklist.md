# PIU Trainer schema checklist

- [x] Confirm canonical owner, project reference and additive scope.
- [x] Review phase contract before implementation.
- [x] Implement migration and database tests.
- [x] Pass the new migration's isolated database checks only.
- [x] Complete one scoped review; application/sibling checks are excluded by user instruction.
- [ ] Merge schema PR; verify target, dry-run and migration parity.
- [ ] Apply migration and verify hosted PIU read-only schema checks.
