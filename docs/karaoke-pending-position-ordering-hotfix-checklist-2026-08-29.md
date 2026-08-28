# Karaoke Party pending-position ordering hotfix checklist

- [x] Read repository instructions, current brief, security notes, phase gates, and prior queue
      repair artifacts.
- [x] Define and review the photographed current-song and relative-repeat ordering contract.
- [x] Add one collision-free forward migration without editing applied migrations.
- [x] Rank pending requests per active singer and order by relative pending tier.
- [x] Preserve persisted front order for marked pending fronts and synthesize projector-only order
      for an unmarked first pending request behind all existing marked pending fronts.
- [x] Preserve selector/projector signatures, room lock, playback behavior, public JSON,
      security-definer, empty search path, cap, and ACL boundaries.
- [x] Add the exact `J1,E1,D2,J2,E2,J3` focused SQL regression.
- [x] Pass PostgreSQL parsing and `git diff --check`.
- [x] Complete one focused diff/security review and record findings.
- [x] Verify the linked target and dry-run only the reviewed migration without applying it.
- [x] Record changed files, checks, assumptions, risks, and release handoff in phase status.
- [x] Hand the uncommitted, unapplied diff to the release owner for full gates, commit, PR, merge,
      hosted migration apply, parity, and linked lint.

## Evidence and handoff

- `pglast==6.2` parsed the complete new migration and the SQL harness after its psql-only meta
  command. The migration contains exactly two function replacements and two execute revocations.
- `git diff --check`, untracked-file whitespace checks, and focused signature/search-path/ACL/limit
  contract checks passed. The only output was the repository's existing Windows line-ending
  warning for the tracked SQL harness.
- The linked target was independently identified as healthy project `bite-open-card-draw`
  (`gsiyqhkcgegjrvqcqioc`). `npx supabase db push --dry-run` named only
  `20260829020000_karaoke_pending_position_ordering.sql`; no hosted mutation was made.
- Migration SHA-256:
  `F806AB6EE0FD76D516FEEDAC9F516353628FBA9A07B3974DA4320F79E252B50B`.
- The focused review found and repaired one test-fixture issue by claiming a valid controller and
  refreshing room state before the completion/selection assertion. No remaining deterministic
  migration, JSON, ACL, or sibling-isolation defect was found.
- Per the urgent parallel release split, this workstream did not run a local reset, execute the SQL
  harness, commit, push, merge, or apply the migration. The release owner must run those remaining
  gates and publish the migration.
