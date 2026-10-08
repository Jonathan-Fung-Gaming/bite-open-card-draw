# Crossplay tables and device operations

October 8, 2026. Implementation authorized through the Crossplay app's table-device-workflow-implementation-plan.md. This is an additive private-schema phase; no Pump Open Stage rules or application code changes.

Add stable physical tables, device duties, and match locations/queues. Preserve immutable opponent pairings, results, starter history and withdrawn-player standings. Add guarded operations for configuration, duty assignment/retirement, relocation and transactional shared-device replacement. Public location projections contain no private device/session information. Runtime retains function-only access.

Use tournament-first serialization, expected operations version plus affected clock version/epoch, and fingerprinted idempotent receipts. Only the head unfinished match at an available table can claim/start/resume. Final results release the next head. An unavailable device never expires itself; replacement revokes its session, advances epoch and retains mandatory time review. Moving a physical location never implicitly transfers clock authority.

Integrate reset/delete/archive through current lifecycle wrappers and cascading operational records. Preserve base/clock/lifecycle versions; expose an additive tables capability. Existing events stay in legacy mode until explicitly enabled with current table mappings. Old app clock calls must obey availability/queue restrictions for enabled events.

Validation is limited to the new migration's isolated SQL behavior, permissions, lifecycle and concurrency tests. Reuse an isolated existing-schema database as a template, apply only this migration, and do not run older migration or sibling application suites. Consumer browser tests run separately in crossplay-tournaments. Before deployment verify target, migration parity and push dry run; apply only this migration. Rollback retains operational data and requires a compatible consuming build for queued events.

Plan review complete: actor authority stays server-verified; replacements create a shared match session rather than a staff-only clock; deferred queue work is blocked at SQL boundaries; reads must retain official historical locations; all operations compare current run/version. At most one general implementation review, followed only by focused repairs and their affected checks.

## Checklist

- [x] Schema and capability
- [x] Atomic operations and compatibility wrappers
- [x] Focused behavior and permission tests
- [x] Observed-lock concurrency tests
- [x] One implementation review
- [x] Scoped PR and migration rollout evidence

Isolated PostgreSQL 17 database `crossplay_tables_20261008` was cloned from an existing Crossplay acceptance database; only this migration was applied. Its transactional SQL checks passed, including nine pairings on eight tables, precise saved-time handoff, shared acknowledgements, idempotent lost-cookie recovery, old-controller rejection, queue release, closure/history preservation, reset and private permissions. Ten observed-lock races passed. One coordinated implementation review completed. The consumer owns browser/visual acceptance; no old migration suite or unrelated app checks ran here.

Read-only preflight verified the established target `gsiyqhkcgegjrvqcqioc`, all predecessor migration pairs, and a dry run naming only `20261008030000_crossplay_table_devices.sql`.

Release completed after the consumer phone/iPad screen presentation. [PR 171](https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/171) passed Classify Changes, migration-only Quality Gates and New Migration Tests, then merged as `9d00cff7f73c9578491e41dd69c03bbb73dd1bdf`. After synchronizing main and reverifying target and sole pending migration, only `20261008030000_crossplay_table_devices.sql` was applied. All 62 migration pairs match and the final dry run is empty. Read-only runtime verification confirmed the tables capability, private operational tables/helpers and intended function-only grants. No production tournament data was mutated and no database blocker remains. The consumer app subsequently deployed successfully; its release record is `crossplay-tournaments/docs/table-device-workflow-release.md`.
