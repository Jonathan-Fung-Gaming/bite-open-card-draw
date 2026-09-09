# PIU Trainer: twenty-chart sessions

Scope: support the consuming trainer's eight warmups and twelve push charts, with three random and three improvement slots per push mode. Preserve saved sixteen-chart sessions, plays, profile isolation, revision fences and replay receipts. No tournament behavior changes.

Implementation: replace only `PIU_TRAINER_DAILY_VALID` and `PIU_TRAINER_COMMIT`. Recognize the new selection/order policy with twenty slots and thirty-two suggested steps; validate 4S/4D warmups and 6S/6D push slots with three slots per selection lane. Derive the commit assignment count from the validated snapshot instead of hardcoding sixteen. Keep the old format accepted.

Review: the wider array limits must not allow arbitrary session sizes, cross-profile writes, missing assignments or loss of receipts. The new policy requires its exact lane counts and level-20 push floor. Existing function signatures, grants and other commit validation remain unchanged.

Validation: run only the new migration's focused schema, constraint, grant, commit, revision and replay tests against a disposable local database using a frozen predecessor fixture. No older migration tests, migration replay, application tests or schema-wide lint. Inspect linked project identity, migration parity and the push dry run before applying only this migration.

Release order: merge this backward-compatible schema change and apply it to the verified linked project before merging/deploying the consuming app. If application deployment fails, leave the additive schema support in place and roll back the app; do not delete or rewrite saved session history.

Checklist:

- [x] Scope and implementation plan reviewed.
- [x] New migration and focused tests implemented.
- [x] New migration SQL checks and one code review passed before release.
- [ ] Schema PR merged; verified target, dry run and remote application complete.
- [ ] Consuming app deployed after schema readiness.

Release update: the new migration passed its isolated SQL checks before the user requested skipping further tests and immediate production deployment. No additional tests or CI suites will run for this release. Linked target gsiyqhkcgegjrvqcqioc is verified; all predecessor migrations match and the dry run names only 20260909020000_piu_twenty_chart_sessions.sql.
