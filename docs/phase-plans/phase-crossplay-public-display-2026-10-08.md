# Crossplay public tournament display projection

October 8, 2026. Scoped additive database phase authorized by the consuming Crossplay app's `docs/tv-display-and-visual-refresh-plan.md`. No Pump Open Stage application behavior or tournament rules change.

Add `crossplay.display_version()` and an actor-free `crossplay.display_read(text)` function. The read must force the existing public snapshot and return only published entrants, rounds, official results, public physical locations and safe saved-clock status metadata. Exclude pending reports, reasons, actors, clock/controller/device/session details and unpublished pairings. Reuse existing public read/location helpers inside a stable database function so all projected values use one statement snapshot. Preserve the existing schema, clock, lifecycle and table capabilities and function-only runtime permissions.

The consuming server computes official standings using its established calculation, reduces the source to the public display contract, and hashes visible data separately from server time. It must call this actor-free read even with organizer cookies. It falls back to the existing anonymous public read when this capability is absent, showing coarse result status without inferring clock state.

Plan review: no mutations or expanded browser grants; publication/privacy checks remain identical to the current public read and require a published round. Final/disputed/report states take precedence over stale saved clock status. Archived/finished unfinished matches must not be labeled as actively playing. Only official result timestamps feed latest-result presentation. Database owners retain existing tables and grants. Runtime can execute only the two new top-level functions; no new access to base tables.

Apply only `20261008040000_crossplay_public_display.sql` to a clone of the isolated existing-schema database. Run only its focused permission, projection, publication, clock-status, location, lifecycle and stable-revision input checks. Do not reset/replay the full database or run older migration/app suites here. Root coordinates the single general review and release; no separate agent review loop.

Deploy the additive migration before its consuming app build. Read-only target/parity inspection and a push dry run must name only the reviewed migration. Rollback disables the consuming display feature or uses its fallback; the additive functions can remain with no data loss. No production fixtures or tournament writes are needed.

## Checklist

- [x] Scoped plan and bounded plan review
- [x] Additive function and permission contract
- [x] New migration's focused isolated tests
- [x] Consumer public shaping and fallback checks
- [x] One coordinated implementation review
- [ ] Scoped migration release and parity evidence

## Direct verification

The isolated PostgreSQL 17 database `crossplay_display_20261008` was cloned from `crossplay_tables_20261008` in the existing loopback-only `crossplay-test-workflows` container. Only the new display migration was applied. `supabase/tests/crossplay_public_display_test.sql` passed with `ON_ERROR_STOP=1` and rolled back its fixtures. It verifies actor-free permissions, actual runtime execution, drafts/private/reset/deleted events, published archives, official-only results, private-field exclusion, all saved clock/report/queue states, bye locations, withdrawn entrants, physical relocation, and status changes without a tournament-version change. The stable function keeps the public snapshot and metadata within one database statement snapshot.

The consuming app's eleven `tests/server/display.test.ts` tests passed, covering defensive public shaping from organizer-shaped input, official/shared-rank standings, saved-state labels, revision stability excluding server time/private changes, visibility, organizer-cookie requests, capability fallback, no-store/ETag and 404 behavior. Targeted ESLint passed. The known pre-existing Vite native-loader warning was observed and left unchanged. Integrated app checks and the one coordinated review remain the root agent's responsibility; no old migration tests, app tests in this owner, database reset, broad review or deployment ran during this data phase.

The parent completed the one coordinated implementation review. No database repair was required. Consuming app checks passed, including 206 unit tests and Chromium/WebKit public projection and tournament transitions. UI-only layout repairs and their affected reruns are recorded in the consumer release record. Read-only preflight reconfirmed target `gsiyqhkcgegjrvqcqioc`, all 62 predecessor migration pairs and a push dry run naming only this migration. Release proceeds through the scoped PR and target-verified deployment.
