# Karaoke Party runtime-guard correction checklist

- [x] Read repository instructions, current brief, security notes, phase gates, and prior Karaoke
      Party schema plan/checklist.
- [x] Confirm the linked migration lineage is owned only by this repository.
- [x] Self-review the scoped plan for migration order, rollback, security, atomicity, and DST risk.
- [x] Add the Pacific-day atomic YouTube quota reservation migration.
- [x] Add executable allowance, rejection, atomicity, PT/UTC-boundary, and DST assertions.
- [x] Preserve RLS and exact service-role-only execution grants.
- [x] Pass local reset, database lint, Karaoke schema/concurrency tests, and sibling checks.
- [ ] Review the final diff once and resolve only deterministic findings.
- [ ] Record changed files, checks, risks, and assumptions in `docs/phase-status.md`.
- [ ] Commit, push, open a PR, pass required checks, and merge.
- [ ] Verify the exact linked project; dry-run and apply only the intended migration.
- [ ] Verify local/remote parity, linked lint, and the hosted function grant/boundary behavior.
