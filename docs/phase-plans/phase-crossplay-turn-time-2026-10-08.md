# Crossplay current-turn duration

Add a display-only `currentTurnMs` value to the existing authorized clock read. Sum accepted elapsed milliseconds after the most recent start/switch in the current epoch, through the returned sequence. Pause/resume and recovery retain turn duration; a new controller epoch begins at zero. Existing totals, writes, versions, scoring and access rules are unchanged. The consuming app adds live elapsed time and replays pending events locally.

Plan review: read through the existing lifecycle wrapper before accessing event history; restrict the new wrapper and renamed helper to their existing roles. Bound queries to the returned epoch/sequence. Omit state enrichment when no clock exists. Optional client fields preserve older persisted journals and make app rollback compatible. No table changes or production data mutations are needed.

## Checklist

- [x] Add migration and focused SQL acceptance (turn boundaries, pause/resume/recovery, epochs, absent clock, access).
- [x] One diff review and directly relevant verification.
- [x] PR, required migration-only CI, merge.
- [x] Verify established project, parity and dry run; deploy only the reviewed migration.

Use a clone of the existing disposable Crossplay database, never reset the shared stack. CI provisions only required schema fixtures and runs this migration's tests. Do not run unrelated application or previous migration suites. Deploy this additive read before the consuming app; rollback the app without removing the migration. Consumer UI/journal tests belong in the Crossplay repository.

The new SQL and focused transactional assertions passed in `crossplay_turn_time_20261008`, cloned from the existing disposable lifecycle database in the loopback PostgreSQL 17 container. One coordinated diff review found no SQL blocker. The consumer's regression test reproduced stale display metadata saved by an old client during rollout; its focused compatibility repair rebuilds that display projection while preserving exact validation of authoritative timing. No unrelated database or sibling application suite ran.

Release complete: [PR 169](https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/169) passed migration-only CI and merged as `3d6bba2`. The verified project `gsiyqhkcgegjrvqcqioc` had only this migration pending; the dry run named only it, and it was applied with complete history parity. Read-only hosted checks confirm the projection and restricted runtime boundary. No production tournament data was mutated. See the migration release record for evidence.
