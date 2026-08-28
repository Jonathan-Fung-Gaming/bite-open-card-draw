# Karaoke Party stable front-tier queue repair checklist

- [x] Read repository instructions, current brief, security notes, phase gates, and prior queue plan.
- [x] Reproduce and document the raw-round terminal transition edge case.
- [x] Define and review the stable front-tier contract, including late-singer repeats and promotion
      timing.
- [x] Add one forward migration without editing applied migrations.
- [x] Add and backfill internal `front_tier_sequence` without changing persisted active-only
      `queue_round` assignment.
- [x] Maintain exactly one front marker per unfinished participant through insert and terminal
      transition triggers, including bulk updates.
- [x] Preserve selector/projector signatures, room lock, playback behavior, public JSON,
      security-definer, search-path, and ACL boundaries.
- [x] Align the consuming selector/projector with stable effective-tier ordering.
- [x] Update current queue contracts while preserving active-only round assignment.
- [x] Add deterministic application and SQL regressions for `C1,B2,A2,D1,D2`.
- [x] Pass application formatting, lint, typecheck, tests, and production build.
- [ ] Confirm the canonical database target is loopback-only before destructive local validation.
- [ ] Pass full local reset, local database lint, guarded Karaoke database/concurrency coverage,
      and required sibling gates.
- [x] Complete one focused diff review and `git diff --check`.
- [x] Record changed files, evidence, assumptions, risks, and review findings in phase status.
- [ ] Commit, push, open both PRs, pass required checks, and merge in the documented order.
- [ ] Verify the exact linked project and dry-run only the reviewed migration after merge.
- [ ] Apply the migration and prove hosted parity plus zero-finding linked lint.

## Current evidence

- `git diff --check`: passed; only the existing Windows line-ending warning was emitted.
- Linked dry run: passed and named only
  `20260829010000_karaoke_front_tier_ordering.sql`.
- Local database execution is blocked because Docker Desktop is not running; no hosted mutation was
  attempted before merge.
- Focused review confirmed selected/playing remain unfinished, late singers receive only one front
  marker, terminal promotion preserves prior front waiters, selector/projector ordering matches,
  and internal trigger helpers remain revoked from API roles.
- Consuming application verification passed formatting, lint, typecheck, 14 test files / 88 tests,
  the focused 20-test queue slice, and the optimized production build.
