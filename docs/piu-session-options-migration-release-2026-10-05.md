# PIU session options migration release

[Migration PR #163](https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/163) merged as `599c09573688115de93b283855028f488895e64b` after Classify Changes, migration-only Quality Gates and New Migration Tests passed. The coordinated consuming-root review and one focused fixture repair were already complete.

The intended linked target was reverified as healthy project `bite-open-card-draw`, ref `gsiyqhkcgegjrvqcqioc`. All 57 predecessor migrations matched, and the post-merge push dry run listed only `20261005010000_piu_session_options.sql`. That single reviewed migration was applied successfully. All 58 local/remote records now match, and the final dry run is empty.

Rollback-only head reads for the three existing allowlisted profiles returned `sessionOptions: 1`, `workouts: 1` and `personalSync: 1`. The changed read and daily-validation functions retain service-role execution with anonymous/authenticated execution denied. Read-only checks before and after application showed identical profile revisions and run, assignment, attempt and receipt counts.

Only the new migration's focused SQL checks ran locally and in CI. No older migration tests, sibling application gates, full reset, schema-wide lint, shared Auth changes, journal mutations or additional review cycle were performed. The consuming trainer can deploy its new session creation capability. Rollback restores the prior trainer app while retaining the additive validation and saved history.
