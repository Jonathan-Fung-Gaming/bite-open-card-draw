# Crossplay TV live clocks and pending scores

October 11, 2026. Authorized by the Crossplay application's `docs/tv-live-clocks-and-16-player-plan.md` and the user's implementation request.

Add private, latest-only spectator timing samples and a function-only authenticated writer. Preserve official clocks, event sequence/version accounting, scoring, pairing inputs, and the existing runtime role. Expand the actor-free public display projection with pending adjusted scores and safe clock fields. Keep drafts, private report details, credentials, and device/controller identity private. A sample must match the current controller, generation, epoch, version, and sequence; expiry is based on capture time, not arrival. Public reads never write.

Plan review: acquire tournament, match, then clock locks in the established order; validate session ownership again under those locks. Sample writes do not advance tournament/clock versions. Archive/reset/replacement/finalization invalidate samples by lifecycle/version/status checks. Use one coherent statement snapshot for pending scores, official results, and clocks. Revoke direct table and helper access from browser, service, and runtime roles. Keep the previous display function private as a published-only base projection.

Apply only `20261011010000_crossplay_tv_live_clocks.sql` to an isolated clone of the existing schema. Run only the new migration's permission, sample ownership/version/freshness, pending/final/dispute, and lifecycle checks. No owner-application or older migration suites, full resets, or schema-wide lint. The consuming app runs its own relevant checks and coordinates one general review.

Deploy migration before the consuming build; inspect target, history/parity, and a push dry run naming only the reviewed migration. Rollback disables the new app capability; additive data can remain. No production fixture writes.

## Checklist

- [x] Scoped plan and plan review
- [x] Migration and focused SQL checks
- [ ] Consumer integration checks
- [x] One coordinated review
- [ ] Scoped PR and verified migration deployment

## Current evidence

Docker was restarted with user authorization. The new migration and its focused SQL test pass on isolated clones of `crossplay_display_20261008` in the loopback-only PostgreSQL 17 container `crossplay-test-workflows`. CI uses a schema-only snapshot of that existing schema and runs only the new migration's test. No shared local database reset, older migration test, or sibling application suite ran. Read-only linked target verification confirms `bite-open-card-draw` / `gsiyqhkcgegjrvqcqioc`; migration history and push dry run show only the new migration pending.

The consuming app passes TypeScript, lint, production build, seventy focused unit/server tests, and Chromium/WebKit fixture acceptance for clocks, score transitions, full-height sixteen-player standings, long names, smaller viewports, and final standings. Its steady-ticking CPU profile records zero long tasks or layout shifts. One coordinated manual review found two client timing regressions, reproduced in tests and repaired; no further general review is planned. Real browser integration and the ten-minute eight-controller timing check are running. A demonstrated delayed correction after round completion is repaired in the app's polling schedule, with its affected rerun pending. The user explicitly authorized production push/merge while these extended browser tests continue; the completed SQL checks and migration-first ordering remain release requirements.
