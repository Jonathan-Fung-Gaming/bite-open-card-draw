# Karaoke Party lifecycle and admission correction checklist

- [x] Read repository instructions, current brief, security notes, phase gates, and the prior
      Karaoke Party runtime-guard plan/checklist.
- [x] Freeze deterministic findings and confirm canonical migration ownership.
- [x] Self-review the standalone plan for migration order, rollback, privilege, concurrency,
      cleanup-capacity, and sibling-regression risk.
- [x] Add exactly one forward-only lifecycle/admission/search-fill migration.
- [x] Add executable behavior, concurrency, cleanup-capacity, and ACL/RLS assertions.
- [x] Update the consuming application without introducing pre-migration production dependency.
- [x] Pass local reset, database lint, Karaoke schema/concurrency tests, and focused consuming app
      type/unit checks.
- [ ] Pass relevant sibling lint, typecheck, tests, and build.
- [x] Review the complete diff once and resolve only deterministic findings.
- [x] Record changed files, checks, assumptions, and remaining risks in `docs/phase-status.md`.
- [ ] Commit, push, open a PR, wait for required checks, and merge.
- [ ] Verify the exact linked project, dry-run and apply only the intended migration.
- [ ] Verify local/remote parity, linked lint, and hosted service-role behavior before deploying the
      dependent application.
