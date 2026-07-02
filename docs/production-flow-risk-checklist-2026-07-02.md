# Production Flow Risk Checklist - 2026-07-02

This checklist captures the full-app production-readiness review requested on 2026-07-02 for the
Pump It Up Open Stage tournament app. It is an issue catalog for brittle or potentially breaking
logic, admin workflows, public UX, data exports, and rehearsal automation design.

Primary sources of truth:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/codex-execution-plan.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

Review method:

- First pass: core tournament logic, admin/security, public UX, data/export, and rehearsal/load
  architecture review.
- Second pass: independent gap review against the first-pass list and direct comparison against the
  product spec and repo validation checklist.
- Scope: potential breaking points and brittle UX/test paths. Items remain unchecked until fixed,
  verified, or explicitly accepted as event-day risk.

Original checklist validation note:

- During the initial documentation-only review, no automated checks were run.
- Playwright was intentionally not run as part of that documentation-only review.
- This checklist intentionally does not require Playwright as the only acceptable evidence source.
  Where the app needs future evidence, the item describes the product behavior to prove and allows
  manual, unit, integration, SQL, or future automation evidence.

## Remediation Implementation Evidence - 2026-07-02

This section records evidence from the implementation pass for
`docs/production-flow-risk-remediation-plan-2026-07-02.md`. It does not by itself close checklist
items whose evidence requirement calls for live Supabase, two-session browser behavior, target
browser downloads, projector screenshots, or the grouped Phase 7 production-flow Playwright window.
Those item checkboxes remain unchecked until the named closure evidence exists.

Evidence metadata:

| Field          | Value                                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue IDs      | PFR-001 through PFR-049 implementation pass, with browser/live-Supabase closures still deferred where noted below                                                                                                            |
| Evidence type  | Unit, integration, source review, command validation, import, asset verification, docs                                                                                                                                       |
| Environment    | Local workspace on branch `main`, base commit `2b86988c53c30eeb9ca8651edb54e4b9049924ba`, uncommitted remediation changes                                                                                                    |
| Backend        | Memory/local unit tests, fake-Supabase repository tests, local production build, validation-only production-flow env check                                                                                                   |
| Reviewer       | Codex, 2026-07-02                                                                                                                                                                                                            |
| Artifact paths | `docs/phase-status.md`, `data/generated/chart-import-report.json`, `data/generated/chart-import-report.sha256`, `data/generated/charts-with-images.json`, `data/generated/image-assets.json`, unit test output, build output |
| Closure status | Implementation evidence recorded; final closure still requires item-specific evidence below                                                                                                                                  |

Commands and results:

| Command or step                                                | Result               | Notes                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rtk npm run lint`                                             | Pass                 | Full ESLint gate passed.                                                                                                                                                                                                                                                                        |
| `rtk npm run typecheck`                                        | Pass                 | Full TypeScript gate passed.                                                                                                                                                                                                                                                                    |
| `rtk npm run test`                                             | Pass                 | 44 files / 214 Vitest tests passed.                                                                                                                                                                                                                                                             |
| `rtk npm run import:charts`                                    | Pass                 | Imported 4,426 charts; reported 9 repaired rows and 145 skipped malformed rows for release review.                                                                                                                                                                                              |
| `rtk npm run import:charts -- --strict`                        | Expected fail-closed | Failed with 154 strict issues, proving final-event strict mode rejects repaired/skipped malformed source data.                                                                                                                                                                                  |
| `rtk npm run cache:chart-images`                               | Pass                 | Prepared 639 image assets: 639 cached, 0 fallback.                                                                                                                                                                                                                                              |
| `rtk npm run verify:real-chart-images`                         | Pass                 | Verified runtime catalog `data/generated/charts-with-images.json` against 639 public cache files for 4,426 charts.                                                                                                                                                                              |
| `rtk npm run build`                                            | Pass                 | Next.js production build completed.                                                                                                                                                                                                                                                             |
| `rtk npm run test:e2e:memory-dev-smoke -- --validate-env-only` | Pass                 | Validation-only profile summary showed memory/dev smoke settings.                                                                                                                                                                                                                               |
| `rtk npm run test:e2e:production-flow:validate`                | Pass                 | Ran with disposable dummy Supabase-shaped env values; validation summary showed `profile=production-flow`, `backend=supabase`, production server mode, heartbeats/polling enabled, admin-actions-only enabled, and test routes disabled. No browser run or external Supabase mutation occurred. |
| `rtk git diff --check`                                         | Pass                 | No whitespace errors.                                                                                                                                                                                                                                                                           |

Issue evidence links from this pass:

| Issue IDs                                                                                          | Evidence recorded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Closure status                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PFR-001, PFR-011, PFR-012, PFR-016, PFR-045                                                        | Normalized transaction facade now advertises only implemented submit/compute RPCs; disabled RPCs are explicit blocked metadata; Supabase manual ballot/reopen/reset paths fail closed; voting-admin hydration includes ballot tables; shared mutation contracts cover critical scalar parsing. Covered by `src/lib/server/transactions/normalized-runtime.test.ts`, `src/lib/server/mutation-contracts.test.ts`, `src/lib/server/normalized-operational-state.test.ts`, `src/lib/server/admin-actions.test.ts`, and full test/build gates.                                                                                                                                  | Not closed for PFR-001/PFR-012 until live Supabase interleaving evidence proves ballots/results/CSV agree under concurrent admin/player mutations.                                                                          |
| PFR-002, PFR-044                                                                                   | Host-lock store and persistence now use compare-aware decisions for acquire, heartbeat, takeover, and release; stale release/heartbeat resolves as no-op and non-host release audits as `host_lock_release_noop`. Covered by `src/lib/admin/host-lock.test.ts`, `src/lib/server/normalized-operational-state.test.ts`, and full test/build gates.                                                                                                                                                                                                                                                                                                                           | Not closed until two-session live Supabase evidence proves delayed session A heartbeat/release cannot overwrite session B.                                                                                                  |
| PFR-006, PFR-007, PFR-009, PFR-010, PFR-013, PFR-014, PFR-015, PFR-017                             | Round state guards, route-state helper matrix, emergency eligibility timing/blocking, result eligibility filtering, player history locking, future-state override blocking, and production test-flag fail-closed behavior were implemented. Covered by `src/lib/round/round-state.test.ts`, `src/lib/vote/voting-window.test.ts`, `src/lib/results/result-engine.test.ts`, `src/lib/results/selected-song-blocks.test.ts`, `src/lib/admin/roster.test.ts`, `src/lib/server/env.test.ts`, `src/lib/public-url.test.ts`, migration updates, and full test/build gates.                                                                                                        | Route-visible closure for PFR-007 remains deferred to Phase 7 browser evidence.                                                                                                                                             |
| PFR-008, PFR-018, PFR-024 implementation portions, PFR-038 policy/action portions, PFR-048         | Rehearsal start/reset/seed actions are server-guarded by deployment policy and hidden in event mode unless a disposable rehearsal event is explicitly enabled; private CSV export requires active host control, audits success/denial, and uses event/round/timestamp/nonce filenames; reset copy describes memory versus persistent Supabase data. Covered by `src/lib/server/deployment-safety.test.ts`, `src/lib/server/admin-actions.test.ts`, source review, and full test/build gates.                                                                                                                                                                                | Browser rendering/two-admin export evidence remains deferred to Phase 7/live evidence.                                                                                                                                      |
| PFR-020, PFR-021, PFR-025, PFR-026, PFR-027, PFR-028, PFR-029, PFR-030, PFR-032, PFR-033           | Player/public UX hardening implemented: distinct first-save versus edit-failure copy, explicit pre-submit change username action, draft persistence through pause/refresh, early duplicate-device warning, reroll invalidation copy, lighter polling cadences, non-navigating stage QR, final-state auto-refresh stop/slow, server-side ballot negative validation, and failed-edit preservation. Covered by `src/lib/vote/ballot.test.ts`, `src/lib/vote/phone-view.test.ts`, source review, and full test/build gates.                                                                                                                                                    | Browser confirmation remains deferred to the grouped Phase 7 production-flow run.                                                                                                                                           |
| PFR-003, PFR-004, PFR-005, PFR-019 through PFR-024 planning portions, PFR-030 load-design portions | Added explicit e2e profiles and scripts: memory/dev smoke, Supabase/dev rehearsal, production-flow validation, production-flow browser evidence, and synthetic API-load. Production-flow validation fails unless backend/server/event/heartbeat/polling/public-refresh/admin-action settings are production-like. Load design now documents 100 players plus spectators and separates synthetic API injection from real player-route evidence. Covered by `package.json`, `scripts/run-playwright.mjs`, `playwright.env.ts`, Playwright configs, docs, `rtk npm run test:e2e:memory-dev-smoke -- --validate-env-only`, and `rtk npm run test:e2e:production-flow:validate`. | Not closed until the actual grouped production-flow browser run and 100-player route evidence are collected with real disposable Supabase credentials.                                                                      |
| PFR-034, PFR-035, PFR-036, PFR-037, PFR-038 implementation portions                                | Private CSV now neutralizes spreadsheet formulas, exports active-at-round-start metadata, preserves original and latest revision timestamps, includes stable chart IDs/difficulty for banned and selected charts, and uses collision-resistant filenames. Covered by `src/lib/results/private-csv.test.ts`, admin export source review, and full test/build gates.                                                                                                                                                                                                                                                                                                          | Browser auto-download/target-browser evidence remains deferred for PFR-046.                                                                                                                                                 |
| PFR-039, PFR-040, PFR-041, PFR-042, PFR-043, PFR-047, PFR-049                                      | Chart level parsing is strict; import produces checksums and reports; strict mode fails closed; runtime image verification checks the runtime catalog and public cache files; release/data/asset docs now separate historical evidence from current gates and add checksum/manifest/logo evidence placeholders. Covered by `src/lib/charts/normalize.test.ts`, `src/lib/charts/importer.test.ts`, `rtk npm run import:charts`, expected-failing `rtk npm run import:charts -- --strict`, `rtk npm run cache:chart-images`, `rtk npm run verify:real-chart-images`, and docs updates.                                                                                        | PFR-040 remains open until the real CSV is cleaned or its strict import report is reviewed/accepted with dated release evidence. PFR-041/PFR-043 still need final release artifact values and runtime performance evidence. |
| PFR-031                                                                                            | No new projector screenshot evidence was collected in this pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Still deferred to Phase 7 browser/manual projector evidence.                                                                                                                                                                |
| PFR-046                                                                                            | Manual button remains and export path is hardened; no target-browser download evidence was collected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Still deferred to Phase 7 or dated target-browser manual evidence.                                                                                                                                                          |

## Remediation Implementation Evidence - 2026-07-03

This section records the local remediation pass for the remaining checklist items. The later
2026-07-03 commands include a local Supabase-backed grouped production-flow Playwright run. It does
not close items whose stated evidence still requires concurrent Supabase interleavings,
two-browser/admin stale-session proof, full timer/admin/tiebreak matrices, projector/mobile
screenshots, or hosted event-day target-browser confirmation beyond the local Chromium evidence.

Commands and results:

| Command or step                                                                                                                                                                                                                                                                                                          | Result        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rtk npm run test -- src/lib/vote/ballot.test.ts src/lib/vote/phone-view.test.ts src/lib/round/round-state.test.ts src/lib/server/admin-actions.test.ts src/lib/admin/audit.test.ts`                                                                                                                                     | Pass          | 5 files / 38 Vitest tests passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `rtk npm run test -- src/lib/server/normalized-rpc-locking.test.ts src/lib/server/transactions/normalized-runtime.test.ts src/lib/server/normalized-operational-state.test.ts src/lib/admin/host-lock.test.ts src/lib/server/admin-actions.test.ts src/lib/server/persistence.test.ts src/lib/persistence/merge.test.ts` | Pass          | 7 files / 48 Vitest tests passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `rtk npm run test -- src/lib/vote/ballot.test.ts src/lib/vote/phone-view.test.ts src/lib/round/round-state.test.ts src/lib/admin/audit.test.ts`                                                                                                                                                                          | Pass          | Follow-up focused gate, 4 files / 29 Vitest tests passed.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `rtk npm run lint`                                                                                                                                                                                                                                                                                                       | Pass          | Full ESLint gate passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `rtk npm run typecheck`                                                                                                                                                                                                                                                                                                  | Pass          | Full TypeScript gate passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `rtk npm run test`                                                                                                                                                                                                                                                                                                       | Pass          | Full Vitest gate passed after the new tests, 46 files / 233 tests.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `rtk npm run import:charts`                                                                                                                                                                                                                                                                                              | Pass          | Imported 4,426 charts; required pools have at least 7 charts. Report still notes 9 repaired rows and 145 skipped malformed rows for release review.                                                                                                                                                                                                                                                                                                                                                     |
| `rtk npm run cache:chart-images`                                                                                                                                                                                                                                                                                         | Pass          | Prepared 639 image assets: 639 cached, 0 fallback.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `rtk npm run build`                                                                                                                                                                                                                                                                                                      | Pass          | Next.js production build completed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `rtk powershell -NoProfile -ExecutionPolicy Bypass -File scripts/write-asset-audit.ps1`                                                                                                                                                                                                                                  | Pass          | Regenerated `docs/asset-audit.md` with current logo, runtime catalog, manifest, and cache identities.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `rtk git diff --check`                                                                                                                                                                                                                                                                                                   | Pass          | No whitespace errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `rtk npm run verify:real-chart-images`                                                                                                                                                                                                                                                                                   | Pass          | Subagent-run verification reported runtime catalog/image cache consistency for 4,426 charts and 639 cached PNG assets.                                                                                                                                                                                                                                                                                                                                                                                  |
| `rtk npm run test -- src/lib/server/admin-local-flow.test.ts src/lib/server/admin-actions.test.ts src/lib/vote/ballot.test.ts src/lib/vote/voting-window.test.ts src/lib/admin/audit.test.ts`                                                                                                                            | Pass          | 5 files / 55 Vitest tests passed after adding local admin/manual-ballot/export evidence.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `rtk npm run test:e2e:no-build -- tests/e2e/full-flow.spec.ts`                                                                                                                                                                                                                                                           | Pass on retry | 2 Playwright tests passed in memory/dev smoke mode after one pre-existing host-control acquisition flake. Added evidence for final refresh stability, duplicate-name warning timing, public anti-spoiler checks, non-navigating stage QR, and browser CSV download content.                                                                                                                                                                                                                             |
| `rtk npx supabase start`                                                                                                                                                                                                                                                                                                 | Pass          | Started local Supabase and applied migrations through `20260701020000_replace_draw_state_rpc.sql`.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `rtk npx supabase migration up`                                                                                                                                                                                                                                                                                          | Pass          | Applied `supabase/migrations/20260703010000_service_role_table_privileges.sql` to local Supabase so server-only service-role repositories can access RLS-protected tables.                                                                                                                                                                                                                                                                                                                              |
| `rtk npm run test:e2e:production-flow:validate`                                                                                                                                                                                                                                                                          | Pass          | Local Supabase production-flow env validation passed with `backend=supabase`, `serverMode=start`, heartbeats/polling enabled, `adminActionsOnly=enabled`, and test routes disabled.                                                                                                                                                                                                                                                                                                                     |
| `rtk npm run test:e2e:production-flow`                                                                                                                                                                                                                                                                                   | Pass          | Local Supabase production-build four-round Playwright run passed with `NEXT_PUBLIC_SITE_URL=https://event.example.test`, `TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL=false`, explicit disposable event id `e2e-local-supabase-20260703`, and `TOURNAMENT_ALLOW_REHEARSAL_ADMIN_CONTROLS=true`. Artifacts: `test-results/phase9/results.json`, `test-results/phase9/downloads/round-1-private-ballots.csv`, `round-2-private-ballots.csv`, `round-3-private-ballots.csv`, and `round-4-private-ballots.csv`. |
| `rtk npx supabase stop`                                                                                                                                                                                                                                                                                                  | Pass          | Stopped the local Supabase stack after evidence collection.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `rtk npx supabase db push --linked --yes`                                                                                                                                                                                                                                                                                | Pass          | Applied `20260703010000_service_role_table_privileges.sql` to the linked Supabase project. The CLI warned that optional migration catalog caching failed because of a missing temporary pg-delta certificate, but the migration apply completed.                                                                                                                                                                                                                                                        |
| `rtk npx supabase migration list`                                                                                                                                                                                                                                                                                        | Pass          | Verified local and remote migration history are caught up through `20260703010000`.                                                                                                                                                                                                                                                                                                                                                                                                                     |

Issue evidence from this pass:

| Issue IDs        | Evidence recorded                                                                                                                                                                                                                                                                                                                               | Closure status                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PFR-001          | `submitNormalizedPlayerBallot` and `computeNormalizedResults` now acquire the same normalized event persistence lock as snapshot saves before running Supabase RPC mutations. Covered by `src/lib/server/normalized-rpc-locking.test.ts` plus existing normalized runtime/persistence tests.                                                    | Implementation risk reduced; not fully closed until live Supabase interleaving evidence proves ballots/results/CSV agree under concurrent admin/player mutations.             |
| PFR-007          | `/results` now uses `resolvePublicRouteState()` so the latest previous final result stays addressable after advancing to a not-started future round. Covered by `src/lib/round/round-state.test.ts`.                                                                                                                                            | Closed for local route-state implementation evidence; browser transition evidence remains in the production readiness evidence checklist.                                     |
| PFR-018, PFR-038 | Private CSV export remains host-lock gated and audited; the Phase 9 helper now accepts collision-resistant filenames instead of the old fixed `round-N-private-ballots.csv` name.                                                                                                                                                               | Implementation/evidence helper fixed; two-admin target-browser proof remains open.                                                                                            |
| PFR-020, PFR-030 | Added explicit server-side ballot validation tests for both-sets-drawn and duplicate chart bans; expanded polling cadence coverage for voter page, live poll, stage/public inspection, and presence refresh intervals.                                                                                                                          | Local coverage strengthened.                                                                                                                                                  |
| PFR-024          | Dangerous debug snapshot export now requires an audit reason in addition to password re-entry and active host control. Covered by `src/lib/server/admin-actions.test.ts`.                                                                                                                                                                       | Local gap fixed; full admin workflow matrix remains open for browser/live evidence.                                                                                           |
| PFR-029, PFR-033 | `/charts` now mirrors reroll invalidation/revote copy; final `/vote`, `/charts`, and `/results` branches still omit auto-refresh once final results are rendered.                                                                                                                                                                               | Local source evidence strengthened; final-state scroll/focus browser evidence remains open.                                                                                   |
| PFR-043          | Added `public/brand/tournament-logo-web.png` and switched `TournamentLogo` to the optimized app rendition while preserving the required source logo at `public/brand/tournament-logo.png`; asset audit now records source/web dimensions and bytes.                                                                                             | Implementation fixed; route transfer/performance evidence remains open.                                                                                                       |
| PFR-047          | Chart exclusion audits now store stable display snapshot metadata: chart ID/key/name/Korean name, artist, label, type, level, difficulty, song key, source image URL, and source row. Covered by `src/lib/admin/audit.test.ts` and `src/lib/server/admin-actions.test.ts`.                                                                      | Closed for local audit clarity evidence.                                                                                                                                      |
| PFR-041, PFR-042 | `docs/release-checklist.md` and `docs/asset-audit.md` now record current chart CSV, import report, runtime catalog, image manifest, and cache artifact identities.                                                                                                                                                                              | Artifact identity docs updated; final release commit/date/operator gates remain unchecked.                                                                                    |
| PFR-003          | Local Supabase production-flow now runs as a production build with Supabase backend, real admin server actions, admin/session and host heartbeats enabled, vote polling and public refresh enabled, admin-actions-only enabled, test routes disabled, explicit disposable event id, and browser CSV downloads. The run covered all four rounds. | Closed for local Supabase production-flow rehearsal evidence. Hosted deployment evidence can still be collected as release evidence but is no longer the blocking design gap. |
| PFR-033          | Final-stage auto-refresh is now disabled on the stable final two-chart screen; memory Playwright evidence verifies final ban-count details stay open after a wait and after final-state reloads on `/charts`, `/vote`, and `/results`.                                                                                                          | Closed for local browser final-state stability evidence.                                                                                                                      |
| PFR-046          | Memory Playwright evidence verifies both automatic and manual private CSV downloads in Chromium, including collision-resistant filenames and expected CSV content; local Supabase production-flow downloaded per-round private CSV files through the browser path.                                                                              | Closed for local Chromium target-browser evidence. Event-day host-browser rehearsal may still repeat this as release evidence.                                                |

## Blocking / Must Fix Before Production

- [ ] **Blocking: Production persistence uses incompatible locking paths for ballots, results, and
      snapshot-style admin mutations.**
  - Area: Supabase persistence, voting, result computation.
  - References: `src/app/vote/actions.ts:145`, `src/app/coolguy69/actions.ts:886`,
    `src/lib/server/normalized-operational-state.ts:271`,
    `src/lib/server/normalized-operational-state.ts:293`,
    `supabase/migrations/20260701010000_production_readiness_transactions.sql:236`,
    `supabase/migrations/20260701010000_production_readiness_transactions.sql:592`.
  - Current risk: player ballot submission and result computation use normalized SQL RPCs, while
    many admin mutations still hydrate, mutate memory stores, and persist snapshots. The SQL ballot
    RPC is not coordinated with the same event persistence lock as snapshot saves. A valid ballot can
    be accepted but omitted from result computation, or snapshot persistence can overwrite newer
    normalized state.
  - Expected behavior: one authoritative server/database path should deterministically include or
    reject every ballot at close/compute time, with no stale snapshot overwrites.
  - Evidence needed: concurrent Supabase integration evidence where a player submits while an admin
    computes results and while a separate admin snapshot mutation persists; final ballot table,
    result snapshot, public result, and private CSV must agree.
  - Verified Evidence: PFR-001: See Remediation Implementation Evidence - 2026-07-02 and
    2026-07-03 above for commands, artifacts, implementation locking, and remaining live-Supabase
    closure status.

- [ ] **Blocking: Supabase host-lock persistence is not compare-and-swap protected.**
  - Area: admin host lock, multi-instance production safety.
  - References: `src/lib/server/normalized-operational-state.ts:289`,
    `src/lib/server/normalized-operational-state.ts:548`, `src/app/coolguy69/actions.ts:264`,
    `src/lib/admin/host-lock.ts:64`.
  - Current risk: stale heartbeat or release writes can upsert an older host-lock snapshot after a
    newer takeover. In a multi-instance deployment, two hosts can believe they control the event or a
    current host can be overwritten by a stale tab.
  - Expected behavior: refresh, takeover, and release should update only when the current database
    lock still matches the caller session/token and should fail loudly otherwise.
  - Evidence needed: two-session Supabase evidence where session B takes over after expiry and a
    delayed session A heartbeat/release cannot reclaim or clear host control.
  - Verified Evidence: PFR-002: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Blocking: Hosted rehearsal design is not production-like enough to prove event safety.**
  - Area: rehearsal orchestration, hosted Phase 9 coverage.
  - References: `scripts/run-playwright.mjs:83`, `playwright.env.ts:95`,
    `playwright.env.ts:96`, `playwright.env.ts:97`,
    `tests/phase9/pages/admin.page.ts:191`, `tests/phase9/pages/admin.page.ts:237`,
    `tests/phase9/pages/admin.page.ts:441`.
  - Current risk: phase/load configs default to `next dev` and skip build, e2e disables admin
    session heartbeat, host heartbeat, and vote live polling, and hosted helpers directly seed or
    mutate Supabase state for rehearsal steps. A rehearsal can pass without exercising the production
    admin server actions and browser polling/heartbeat behavior that will run during the tournament.
  - Expected behavior: the main production rehearsal design should use a production build,
    production-like env flags, real admin actions, real host lock behavior, and real public route
    refresh behavior.
  - Evidence needed: documented rehearsal evidence from a production-build, Supabase-backed flow
    without disabled heartbeats/polling and without direct fixture writes except disposable event
    setup/teardown. Playwright execution is explicitly not part of this checklist update.
  - Verified Evidence: PFR-003: See Remediation Implementation Evidence - 2026-07-02 and
    2026-07-03 above for command/runbook hardening and the passing local Supabase
    production-build four-round Playwright run.

- [x] **Blocking: The default e2e gate command appears misaligned with production backend
      requirements.**
  - Area: release gates, command ergonomics.
  - References: `package.json`, `scripts/run-playwright.mjs:75`,
    `scripts/run-playwright.mjs:83`, `playwright.env.ts:94`.
  - Current risk: `npm run test:e2e` defaults to `serverMode=start` and `backend=memory`. The
    production app rejects that combination with `TOURNAMENT_STATE_BACKEND=supabase is required in
production`, so release operators can encounter route rendering failures before the flow begins.
  - Expected behavior: release commands should have explicit names for supported memory/dev and
    production/Supabase modes, with no hidden env combinations required for meaningful evidence.
  - Evidence needed: command/runbook review proving each release gate has the expected backend,
    server mode, env vars, and acceptance evidence. Do not run Playwright for this doc-only item.
  - Verified Evidence: PFR-004: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Blocking: Load rehearsal design is below expected scale and bypasses the real player UI.**
  - Area: load rehearsal, player flow.
  - References: `tests/load/load-rehearsal.spec.ts:25`,
    `tests/load/load-rehearsal.spec.ts:102`, `src/app/api/e2e/load-ballot/route.ts:192`.
  - Current risk: the load test uses 50 players and a synthetic `/api/e2e/load-ballot` route. It
    does not prove the app can handle the validation checklist's 100-plus eligible players, phones,
    spectators, route polling, roster selection, duplicate username behavior, or real form submits.
  - Expected behavior: load evidence should cover 100-plus eligible players and spectator traffic
    using production-like player routes, with the test-only route reserved for focused load
    injection.
  - Evidence needed: load-design update and future evidence plan that separates API injection from
    actual player-route behavior. Playwright execution is excluded from this checklist.
  - Verified Evidence: PFR-005: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

## High Priority App Logic

- [x] **High: Current-round changes can move all public routes mid-round without dangerous-action
      confirmation or a state guard.**
  - Area: admin round control, public routes.
  - References: `src/app/coolguy69/page.tsx:273`, `src/app/coolguy69/actions.ts:1008`,
    `src/app/coolguy69/actions.ts:1028`, `src/app/stage/page.tsx:113`,
    `src/app/vote/page.tsx:19`.
  - Current risk: `Set Current Round` and `Advance Round` require host control only. Public
    `/stage`, `/vote`, `/charts`, and `/results` immediately follow the new current round even if
    voting or reveal is in progress.
  - Expected behavior: round changes during voting/reveal should be blocked until the round is
    complete or treated as a dangerous recovery action with password re-entry, a clear summary, and
    explicit public-state consequences.
  - Evidence needed: state-machine evidence that round changes are blocked or dangerous-confirmed
    and that public routes do not silently jump during an active round.
  - Verified Evidence: PFR-006: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **High: Mutable current-round routing can split public screens or hide just-finished results.**
  - Area: public route consistency.
  - References: `src/app/stage/page.tsx:113`, `src/app/vote/page.tsx:19`,
    `src/app/vote/page.tsx:107`, `src/app/charts/page.tsx:64`,
    `src/app/results/page.tsx:87`, `src/app/coolguy69/actions.ts:1008`.
  - Current risk: public routes all read global `currentRound`, while already-mounted active vote
    clients keep polling/submitting the `roundNumber` prop they loaded with. An accidental round
    change can put `/stage`, `/charts`, and new `/vote` visitors on one round while existing voters
    remain on another. After a normal advance, `/results` also stops being an addressable view of the
    just-revealed round.
  - Expected behavior: all public surfaces should either remain pinned to the active live round or
    provide explicit previous-round result access after advancement.
  - Evidence needed: route-state matrix showing what each public route displays before, during, and
    after round advancement.
  - Verified Evidence: PFR-007: See Remediation Implementation Evidence - 2026-07-03 above.

- [x] **High: Rehearsal reset controls are visible in the production admin UX and lack a deployment
      guard.**
  - Area: admin UX, event-day safety.
  - References: `src/app/coolguy69/page.tsx:303`, `src/app/coolguy69/actions.ts:1046`,
    `src/app/coolguy69/actions.ts:1077`, `src/app/coolguy69/actions.ts:1100`.
  - Current risk: `Start rehearsal mode` and reset/seed rehearsal actions are shown inside Event
    Mode to any active host. They require password/reason, but they reset operational tournament
    state and seed rehearsal data, making them dangerous to expose during a live tournament.
  - Expected behavior: rehearsal reset/seed controls should be hidden or disabled unless an explicit
    rehearsal/test environment or disposable event context is active.
  - Evidence needed: server-side deployment guard and admin UX evidence showing these actions are
    unavailable in production/event mode.
  - Verified Evidence: PFR-008: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **High: Current-round eligibility can change after results are computed or reveal has started.**
  - Area: emergency eligibility, results integrity.
  - References: `src/app/coolguy69/actions.ts:494`, `src/lib/vote/voting-window.ts:356`,
    `src/app/coolguy69/actions.ts:794`.
  - Current risk: emergency add can update the active voting snapshot until `results_revealed` or
    `round_complete`. It can add a player after `results_computed` or `results_revealing`, while
    manual ballot entry is blocked after reveal starts and existing results may not be invalidated.
  - Expected behavior: emergency eligibility changes after close/compute should either be blocked or
    force a clear recompute/reset workflow before any reveal continues.
  - Evidence needed: state-machine evidence that adding an inactive player after compute/reveal is
    blocked or invalidates computed results with a required recompute.
  - Verified Evidence: PFR-009: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **High: Emergency current-round eligibility does not recalculate all-submitted final-warning
      timing.**
  - Area: voting timer, emergency add.
  - References: `src/lib/vote/voting-window.ts:356`.
  - Current risk: adding a newly eligible player after the all-submitted final 30-second state has
    been triggered updates the eligible pool but does not obviously recalculate deadline/status
    semantics for the new turnout state.
  - Expected behavior: adding a player to an open voting window should recompute timer state and
    turnout-derived final-warning behavior consistently.
  - Evidence needed: focused timer/state evidence for "all submitted, final warning active,
    emergency add" behavior.
  - Verified Evidence: PFR-010: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **High: Voting-admin partial hydration can advance deadlines with an empty ballot store.**
  - Area: Supabase voting admin state.
  - References: `src/lib/server/normalized-operational-state.ts:263`,
    `src/app/coolguy69/actions.ts:718`, `src/lib/server/voting-round.ts:38`.
  - Current risk: `loadVotingAdminState()` excludes ballot tables, but pause/close paths still call
    ballot-derived deadline logic. In Supabase mode, deadline or turnout logic can be calculated
    from an incomplete in-memory view of current ballots.
  - Expected behavior: admin timer transitions should use authoritative Supabase ballot/eligibility
    state or a transaction-safe summary, not a partially hydrated local store.
  - Evidence needed: partial-load integration evidence with existing DB ballots and admin
    pause/close actions.
  - Verified Evidence: PFR-011: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [ ] **High: Post-close manual ballots and emergency reopens after computed results are snapshot
      rewrites, not one database transaction.**
  - Area: manual ballots, reopen, result invalidation.
  - References: `src/app/coolguy69/actions.ts:777`, `src/app/coolguy69/actions.ts:848`,
    `src/app/coolguy69/actions.ts:875`, `src/app/coolguy69/actions.ts:1190`,
    `src/app/coolguy69/actions.ts:1207`, `src/app/coolguy69/actions.ts:1234`.
  - Current risk: manual override clears computed results and persists a full snapshot; emergency
    reopen does the same. Because Supabase result computation is RPC-backed, these actions can race
    with compute/reveal and rewrite ballots/results outside the same row lock.
  - Expected behavior: post-close manual corrections and reopens should run through one
    server/database transaction that invalidates/recomputes results atomically.
  - Evidence needed: integration evidence for manual-ballot-after-compute and reopen-after-compute
    interleavings.
  - Verified Evidence: PFR-012: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **High: Result counting trusts stored ballots instead of filtering by the authoritative
      eligibility snapshot.**
  - Area: result engine, SQL result computation.
  - References: `src/lib/results/result-engine.ts:87`,
    `supabase/migrations/20260701010000_production_readiness_transactions.sql:695`,
    `supabase/migrations/20260701010000_production_readiness_transactions.sql:707`.
  - Current risk: memory and SQL result paths count submitted ballots passed to the engine/table
    without rejoining every counted ballot to the round eligibility snapshot. Stale, corrupt,
    manually inserted, or formerly eligible ballots could influence selected charts.
  - Expected behavior: only ballots from the round's authoritative eligible-player snapshot should
    count toward ban totals.
  - Evidence needed: compute evidence with an injected non-eligible submitted ballot showing it is
    excluded from counts and CSV context.
  - Verified Evidence: PFR-013: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **High: Player history lock is not clearly set after ballot submission.**
  - Area: roster identity, audit safety.
  - References: `src/lib/admin/roster.ts:91`, `src/app/vote/actions.ts:145`,
    `supabase/migrations/20260701010000_production_readiness_transactions.sql:391`.
  - Current risk: username edits are blocked only when `hasTournamentHistory` is true, but player
    ballot submission and manual ballot submission do not appear to set that flag. An admin may be
    able to rename a player after voting history exists.
  - Expected behavior: once a player has a ballot/manual ballot/tournament history, start.gg
    username edits should be blocked except through an explicit correction workflow.
  - Evidence needed: submit player and manual ballots, then prove username edits fail and Supabase
    `players.has_tournament_history` is true.
  - Verified Evidence: PFR-014: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **High: Earlier-round result overrides can invalidate future selected-song constraints.**
  - Area: result override, draw constraints.
  - References: `src/app/coolguy69/actions.ts:1262`,
    `src/lib/results/selected-song-blocks.ts:5`, `src/lib/draw/draw-state.ts:331`.
  - Current risk: overriding a selected chart in an earlier round refreshes selected-song blocks but
    does not check later active draws/results for the newly selected song or invalidate affected
    future state.
  - Expected behavior: correcting an earlier result after later rounds exist should either be blocked
    or require a workflow that resets/invalidates affected later draws/results so selected songs do
    not repeat across rounds.
  - Evidence needed: cross-round override evidence where a newly selected earlier song already
    appears in later round state.
  - Verified Evidence: PFR-015: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **High: The normalized transaction facade lists core RPCs that migrations still disable.**
  - Area: Supabase transaction coverage.
  - References: `src/lib/server/transactions/normalized-runtime.ts:83`,
    `supabase/migrations/20260630010000_phase1_rpc_lockdown_and_draw_guards.sql:55`.
  - Current risk: the runtime schema names host-lock, voting-window, reveal, reset, and manual-ballot
    mutations, while migrations disable many of those functions. Later migrations implement
    submit/compute and draw replacement, not the full listed surface. This creates a false
    production-readiness signal and leaves several tournament-changing paths on snapshot
    persistence.
  - Expected behavior: transaction facade, migrations, and admin actions should agree on which
    tournament-changing paths are database-transactional.
  - Evidence needed: schema/migration audit confirming every production mutation has an implemented,
    deployed transaction or is explicitly documented as snapshot-only risk.
  - Verified Evidence: PFR-016: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **High: One production test flag weakens admin/host cookie transport and public URL guards.**
  - Area: security configuration.
  - References: `src/lib/server/admin-auth.ts:23`, `src/lib/public-url.ts:42`.
  - Current risk: `TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL=true` makes admin cookies non-`Secure` in
    production and relaxes production localhost/public URL validation. A mistaken deployment env can
    silently degrade admin-session handling.
  - Expected behavior: test-only flags should fail closed or be impossible in production deployment
    contexts.
  - Evidence needed: environment validation evidence that this flag cannot be enabled for the real
    event deployment.
  - Verified Evidence: PFR-017: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **High: Private CSV download is admin-session gated but not host-lock gated.**
  - Area: admin permissions, data export.
  - References: `src/app/coolguy69/actions.ts:966`, `src/app/coolguy69/page.tsx:724`.
  - Current risk: any valid admin session can request the private CSV after final reveal, even if it
    is not the active host. This may conflict with the product requirement that the final CSV is
    saved to the host computer.
  - Expected behavior: decide explicitly whether read-only admins may export private player data. If
    the host is the only intended exporter, require active host lock.
  - Evidence needed: permission policy and two-admin-session evidence for allowed/denied export.
  - Verified Evidence: PFR-018: See Remediation Implementation Evidence - 2026-07-02 and
    2026-07-03 above for commands, artifacts, host-gated export implementation, future evidence
    helper alignment, and remaining two-admin/browser closure status.

## High Priority Browser/Rehearsal Design Gaps

- [ ] **High: Timer rules are not fully covered by the current browser-rehearsal design.**
  - Area: voting window, rehearsal coverage.
  - References: `src/lib/vote/voting-window.ts`, `tests/phase9/flows/rehearsal.flow.ts`,
    `tests/phase9/flows/voting-window.flow.ts`.
  - Current risk: the 10-minute window, 75-percent one-minute extension, all-submitted final 30
    seconds, edit allowance during final warning, pause/resume, manual close, and emergency reopen
    are not all exercised through production-like browser flows.
  - Expected behavior: every deadline transition should have deterministic evidence in both memory
    and Supabase paths.
  - Evidence needed: coverage plan or non-Playwright evidence matrix for below-75-percent extension,
    at/above-75 close, all-submitted final warning with edit, pause/resume, manual close, and reopen.
  - Verified Evidence: PFR-019: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **High: Critical negative ballot cases are not fully rehearsed.**
  - Area: player vote validation.
  - References: `src/lib/vote/ballot.ts`, `src/app/vote/BallotFlow.tsx`,
    `tests/e2e/full-flow.spec.ts`.
  - Current risk: tests do not comprehensively prove the UI and server reject opening voting before
    both sets are drawn, incomplete ballots, vague skip states, third bans, wrong draw IDs, stale
    chart IDs, and invalid no-bans-plus-bans combinations.
  - Expected behavior: invalid player submissions should be blocked client-side where possible and
    rejected server-side authoritatively.
  - Evidence needed: validation matrix for each invalid ballot shape, with server-side coverage as
    the minimum evidence.
  - Verified Evidence: PFR-020: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [ ] **High: Same-username, latest-valid-ballot, and failed-edit preservation need full coverage.**
  - Area: player identity, duplicate device handling, ballot revisions.
  - References: `src/app/vote/BallotFlow.tsx`, `src/lib/vote/ballot-store.ts`.
  - Current risk: duplicate active username and already-submitted warning paths are partially tested,
    but the full two-device latest-wins behavior and failed-edit rollback behavior are not proven.
  - Expected behavior: duplicate active usernames should be blocked or warned clearly, the latest
    valid revision should win, and a failed edit must preserve the previous server-confirmed ballot.
  - Evidence needed: two-session identity evidence showing revision ordering and failed-edit
    preservation.
  - Verified Evidence: PFR-021: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [ ] **High: Anti-spoiler and live-count privacy are under-tested across public routes.**
  - Area: `/vote`, `/stage`, `/charts`, `/results`.
  - References: `src/app/stage/page.tsx`, `src/app/charts/page.tsx`,
    `src/app/results/page.tsx`, `src/components/PublicResultSummary.tsx`.
  - Current risk: public pages should not reveal chart-by-chart counts or selected charts before the
    appropriate reveal phases. Existing coverage focuses on happy-path visibility and does not
    exhaustively assert absence of spoilers.
  - Expected behavior: before final reveal, public routes should expose only allowed player/status
    information and no selected chart/count spoilers.
  - Evidence needed: state-by-state public route evidence for pre-draw, voting, closed,
    results-computed, each tiebreak phase, and final reveal.
  - Verified Evidence: PFR-022: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [ ] **High: Tiebreak edge cases are not fully rehearsed through browser-visible states.**
  - Area: result reveal, stage UX.
  - References: `src/lib/results/result-engine.ts`, `src/components/ResultSetPanel.tsx`,
    `src/components/StageSetPanel.tsx`.
  - Current risk: the 5-second rune-wheel behavior is not comprehensively covered for 2-, 3-, 4-,
    and 5-plus-way ties, zero-ballot ties, non-minimum ties, alphabetized reveal order, and
    minimum-only tied candidates.
  - Expected behavior: the wheel should show only least-banned tied candidates, hide the selected
    winner until the 5-second reveal completes, and handle all tie cardinalities deterministically in
    test mode.
  - Evidence needed: controlled ballot/result fixtures for each tie shape and a state log showing
    wheel candidates, hidden winner state, duration, final selected chart, and final two-chart
    reveal.
  - Verified Evidence: PFR-023: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [ ] **High: Admin roster, manual ballot, dangerous action, and audit workflows lack full coverage.**
  - Area: admin UX, operations.
  - References: `src/app/coolguy69/page.tsx`, `src/app/coolguy69/actions.ts`.
  - Current risk: inactive/reactivate, active-round snapshot behavior, emergency current-round add,
    manual overwrite, reset, reroll, reopen, result override, password re-entry, clear action
    summaries, and audit rows are not all verified through real admin UI.
  - Expected behavior: every tournament-changing admin action should require the documented
    authority, password where dangerous, reason/summary where required, and should leave an audit
    trail.
  - Evidence needed: admin action matrix with allowed, rejected, and audited outcomes.
  - Verified Evidence: PFR-024: See Remediation Implementation Evidence - 2026-07-02 and
    2026-07-03 above for commands, artifacts, debug snapshot reason hardening, and remaining full
    admin workflow matrix closure status.

## Medium Priority App And UX Issues

- [x] **Medium: First-time save failure message falsely says a previous server-confirmed ballot
      remains valid.**
  - Area: player vote UX.
  - References: `src/app/vote/BallotFlow.tsx:172`, `src/app/vote/BallotFlow.tsx:486`.
  - Current risk: `saveFailureMessage` always appends "Previous server-confirmed ballot remains
    valid." even when the player has no existing ballot. A first-submit failure can mislead a player
    into thinking their vote was saved.
  - Expected behavior: the reassurance should appear only when an existing server-confirmed ballot
    exists.
  - Evidence needed: first-submit failure and failed-edit evidence with distinct copy.
  - Verified Evidence: PFR-025: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: Player cannot clearly change selected username after confirmation but before first
      submit.**
  - Area: player identity UX.
  - References: `src/app/vote/BallotFlow.tsx`.
  - Current risk: after confirming "Are you sure you are voting as [start.gg username]?", there is no
    obvious in-flow "change username" path before the first submission. A player who picked the wrong
    name may need to reload or use indirect browser behavior.
  - Expected behavior: before a ballot is submitted, the player should have an explicit way to back
    out and choose the correct start.gg username.
  - Evidence needed: UI review showing a clear pre-submit identity correction path.
  - Verified Evidence: PFR-026: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [ ] **Medium: Pause can discard an in-progress first-time ballot instead of freezing it.**
  - Area: pause/resume player UX.
  - References: `docs/product-spec.md:187`, `src/app/vote/BallotFlow.tsx:197`,
    `src/app/vote/BallotFlow.tsx:380`, `src/app/vote/page.tsx:27`.
  - Current risk: active ballot choices live only in component state. When polling sees
    `canSubmit=false`, it refreshes into the separate pause page and unmounts the ballot flow. If the
    host pauses while a player is midway through an unsaved first ballot, resume can force them to
    restart instead of preserving the frozen edit state.
  - Expected behavior: pause/resume should preserve in-progress ballot choices where the product
    promises voting can resume after a pause.
  - Evidence needed: pause/resume UI evidence showing unsaved choices survive or a product decision
    accepting that unsaved choices are discarded with clear copy.
  - Verified Evidence: PFR-027: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [ ] **Medium: Active duplicate-device warning appears only after confirmation/presence claim and is
      not fully rehearsed.**
  - Area: duplicate active username UX.
  - References: `src/app/vote/BallotFlow.tsx`.
  - Current risk: the warning for another active device is delayed until the player confirms and
    claims presence. Coverage mainly covers already-submitted ballot warning, not the active
    duplicate warning timing and wording.
  - Expected behavior: duplicate active username risk should be surfaced clearly before a player
    invests time completing a ballot on the wrong device.
  - Evidence needed: two-device UX evidence for active duplicate warning timing and wording.
  - Verified Evidence: PFR-028: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: Post-vote reroll invalidation lacks player-facing recovery copy.**
  - Area: reroll recovery UX.
  - References: `docs/pump_open_stage_repo_validation_checklist.md:288`,
    `src/app/coolguy69/actions.ts:167`, `src/app/vote/page.tsx:88`,
    `src/app/charts/page.tsx:54`.
  - Current risk: a dangerous reroll after voting starts invalidates ballots and resets the voting
    window, but public pages fall back to generic "waiting/open" copy. Players with previously saved
    ballots may not be told clearly that their ballot was invalidated and they need to vote again.
  - Expected behavior: recovery/reroll paths should present clear player-facing copy when prior
    ballots are invalidated.
  - Evidence needed: copy review and reroll-state evidence across `/vote` and `/charts`.
  - Verified Evidence: PFR-029: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: Public polling cadence may exceed the light-polling production target.**
  - Area: route polling, Supabase load.
  - References: `docs/product-spec.md:348`, `docs/pump_open_stage_repo_validation_checklist.md:679`,
    `src/app/vote/BallotFlow.tsx:396`, `src/app/vote/actions.ts:79`,
    `src/app/stage/StageAutoRefresh.tsx:6`, `src/app/charts/ChartsAutoRefresh.tsx:6`,
    `src/app/results/ResultsAutoRefresh.tsx:6`.
  - Current risk: active voters call live state every 1.5 seconds, and public route refreshes run
    every 2 seconds. At 100 players plus spectators, that can become a high steady request rate
    against server hydration/Supabase state during the voting peak.
  - Expected behavior: polling cadence should match the product's light-polling target and be backed
    by request-rate/load evidence.
  - Evidence needed: request-rate estimate or load evidence for 100 players plus spectators.
  - Verified Evidence: PFR-030: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [ ] **Medium: Stage card readability may be brittle on common projector sizes.**
  - Area: `/stage` projector UX.
  - References: `src/components/StageDrawCard.tsx`, `src/components/StageSetPanel.tsx`.
  - Current risk: two rows of seven cards are correct, but dense chart names, artists, jackets, and
    status labels may become cramped at 1280x720 or 1366x768.
  - Expected behavior: the stage must remain readable from a tournament venue projector at common
    resolutions.
  - Evidence needed: screenshot or manual projector review at 1280x720, 1366x768, 1920x1080, and a
    narrow fallback. This checklist does not require Playwright for that review.
  - Verified Evidence: PFR-031: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: The projector QR is a live link that can navigate the stage away from `/stage`.**
  - Area: projector safety.
  - References: `docs/pump_open_stage_repo_validation_checklist.md:308`,
    `src/app/stage/page.tsx:238`, `src/components/QRPanel.tsx:61`.
  - Current risk: the QR panel wraps the QR image in a `Link` to `/room`. Scanning does not require a
    clickable QR on the projector, and an accidental click/tap on the stage laptop can replace the
    live stage display with the room landing page mid-round.
  - Expected behavior: projector surfaces should avoid accidental navigation away from the live stage
    display.
  - Evidence needed: UI decision to remove the link, make it non-interactive on stage, or otherwise
    prevent accidental navigation.
  - Verified Evidence: PFR-032: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: Final/public auto-refresh can disturb expanded details, scroll, or focus.**
  - Area: `/vote`, `/charts`, `/results` UX.
  - References: `src/app/vote/_components/VoteAutoRefresh.tsx`,
    `src/app/charts/_components/ChartsAutoRefresh.tsx`,
    `src/app/results/_components/ResultsAutoRefresh.tsx`.
  - Current risk: pages keep refreshing after final states. This can collapse expanded `<details>`,
    reset scroll, or steal focus while admins or spectators inspect final counts.
  - Expected behavior: auto-refresh should stop or slow once state is final, or preserve user
    inspection state.
  - Evidence needed: final-state UX evidence showing details, scroll, and focus remain stable.
  - Verified Evidence: PFR-033: See Remediation Implementation Evidence - 2026-07-02 and
    2026-07-03 above for final public-route refresh gating, final stage refresh disabling, and
    Playwright evidence that final ban-count details remain open after waits and final-state reloads.

## Medium Priority Data, Export, And Asset Issues

- [x] **Medium: Private CSV is spreadsheet-formula injectable.**
  - Area: private export security.
  - References: `src/lib/results/private-csv.ts:47`, `src/lib/results/private-csv.ts:96`,
    `src/lib/admin/roster.ts:25`.
  - Current risk: usernames and chart names are escaped for CSV syntax, but not neutralized for
    Excel/Sheets formula execution.
  - Expected behavior: exported user/chart-provided cells should be neutralized for spreadsheet
    formula execution or the export should document that it is not safe to open directly in
    spreadsheets.
  - Evidence needed: CSV fixture with leading `=`, `+`, `-`, and `@` values showing neutralized
    output.
  - Verified Evidence: PFR-034: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: Private CSV marks every row as active at round start.**
  - Area: private export accuracy.
  - References: `src/lib/results/private-csv.ts:97`,
    `src/lib/server/normalized-operational-state.ts`.
  - Current risk: `player_active_at_round_start` is always exported as `true`, even for emergency
    current-round additions that were not active at the original round snapshot.
  - Expected behavior: the CSV should distinguish original active players from emergency-added
    eligible players if the column exists.
  - Evidence needed: emergency-add export evidence showing correct active-at-round-start values.
  - Verified Evidence: PFR-035: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: Private CSV cannot distinguish original submission time from latest revision time.**
  - Area: audit export, ballot revisions.
  - References: `src/lib/vote/ballot.ts:17`, `src/lib/vote/ballot-store.ts:68`,
    `src/lib/results/private-csv.ts:99`, `src/lib/results/private-csv.ts:100`,
    `src/lib/server/normalized-operational-state.ts:1010`,
    `src/lib/server/normalized-operational-state.ts:1011`,
    `src/lib/server/normalized-operational-state.ts:1296`,
    `src/lib/results/private-csv.test.ts:139`.
  - Current risk: ballot edits increment `revision`, but `submittedAt` is overwritten on each edit.
    The CSV writes both `submitted_at` and `last_revision_at` from the same value, and normalized
    persistence hydrates only `submitted_at`.
  - Expected behavior: private export should preserve original submission time and latest
    revision/manual override time separately.
  - Evidence needed: submit-at-`t1`, edit-at-`t2` export evidence where `ballot_revision === 2`,
    `submitted_at === t1`, and `last_revision_at === t2`.
  - Verified Evidence: PFR-036: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: Private CSV chart identity can be ambiguous for duplicate/remix names.**
  - Area: private export accuracy.
  - References: `src/lib/results/private-csv.ts:83`.
  - Current risk: banned chart columns primarily contain chart names, which can be ambiguous if the
    chart catalog contains duplicate names, remixes, or same-song variants.
  - Expected behavior: export should include stable chart IDs and/or display difficulty alongside
    names for every selected and banned chart.
  - Evidence needed: duplicate-name fixture evidence showing exported rows remain unambiguous.
  - Verified Evidence: PFR-037: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: Private CSV export is not host-only, audited, or collision-resistant.**
  - Area: private export operations.
  - References: `docs/product-spec.md:315`, `src/app/coolguy69/actions.ts:966`,
    `src/app/coolguy69/actions.ts:976`.
  - Current risk: any admin session can export private player data, export itself is not audited,
    and `round-N-private-ballots.csv` can overwrite or confuse repeated rehearsal, correction, or
    event exports.
  - Expected behavior: export policy should state who can export, every export should be audited if
    private-data access must be tracked, and filenames should uniquely identify event/round/time.
  - Evidence needed: permission/audit/filename policy and implementation evidence.
  - Verified Evidence: PFR-038: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: Chart CSV normalization is too permissive for level values.**
  - Area: chart import, data validation.
  - References: `src/lib/charts/normalize.ts:19`, `src/lib/charts/importer.ts`.
  - Current risk: `Number.parseInt` accepts values such as `16x` as `16`, and importer repair logic
    is relaxed. Bad source data can silently enter a tournament pool.
  - Expected behavior: chart levels should be strict positive integers matching the required
    S16-S22/D23 pools.
  - Evidence needed: import fixtures for `16x`, `16`, empty level, decimal level, and wrong
    type/level combinations.
  - Verified Evidence: PFR-039: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: CSV import can silently repair or skip malformed event data.**
  - Area: chart import, data integrity.
  - References: `docs/data-audit.md:50`, `src/lib/charts/importer.ts:16`,
    `src/lib/charts/importer.ts:159`, `scripts/import-charts.ts:91`.
  - Current risk: pool counts can pass while repaired/skipped rows change song keys, duplicate
    handling, exclusions, and draw eligibility.
  - Expected behavior: final event imports should fail loudly on malformed required rows unless the
    repair is explicitly reviewed and recorded.
  - Evidence needed: strict import mode or signed import report for the exact event CSV.
  - Verified Evidence: PFR-040: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: Release docs do not freeze the exact event chart/artifact set.**
  - Area: release process, chart assets.
  - References: `docs/release-checklist.md:50`, `.gitignore:28`, `scripts/import-charts.ts:72`,
    `docs/release-checklist.md:114`.
  - Current risk: final rehearsal could use one CSV/cache state, while event day uses another, with
    no recorded CSV checksum, row count, import report hash, or cache manifest identity.
  - Expected behavior: release evidence should freeze the exact chart CSV, import report, image
    cache manifest, and deployed commit.
  - Evidence needed: checksum/manifest section in the release checklist.
  - Verified Evidence: PFR-041: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Medium: Runtime image evidence and runtime image source can diverge.**
  - Area: chart images, deployment assets.
  - References: `scripts/verify-real-chart-images.ts:25`, `src/lib/charts/runtime-catalog.ts:60`,
    `src/lib/charts/runtime-catalog.ts:67`.
  - Current risk: verification depends on ignored generated JSON, while production can fall back to
    raw CSV plus deterministic public cache paths. Evidence can pass without proving the exact
    deployed runtime behavior.
  - Expected behavior: image verification should validate the same source of truth and paths used by
    the deployed app.
  - Evidence needed: release check tied to the exact deployed runtime catalog and public cache files.
  - Verified Evidence: PFR-042: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [ ] **Medium: Tournament logo asset readiness is treated as visual-only.**
  - Area: asset performance.
  - References: `docs/asset-audit.md:7`, `docs/asset-audit.md:15`,
    `src/components/TournamentLogo.tsx:19`, `docs/release-checklist.md:57`.
  - Current risk: the source logo is large; "renders" does not prove phone/stage performance or image
    optimization safety for free-tier event use.
  - Expected behavior: logo asset readiness should include size/performance evidence for phone and
    projector routes.
  - Evidence needed: optimized asset size target and route performance evidence for the logo.
  - Verified Evidence: PFR-043: See Remediation Implementation Evidence - 2026-07-02 and
    2026-07-03 above for commands, artifacts, optimized logo rendition evidence, and remaining
    route-level performance closure status.

## Lower Priority / Operational Hardening

- [x] **Low: Non-host release-host action can create misleading audit history.**
  - Area: admin host lock.
  - References: `src/app/coolguy69/actions.ts:279`, `src/lib/admin/host-lock.ts:105`.
  - Current risk: a non-host release attempt clears the caller cookie and can audit a release even if
    the store no-ops because the caller did not hold the active lock.
  - Expected behavior: release should require the active host or record a clearly failed/no-op audit
    event.
  - Evidence needed: two-admin-session host release evidence with unambiguous audit rows.
  - Verified Evidence: PFR-044: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Low: Some admin actions still parse critical scalars by hand instead of shared mutation
      contracts.**
  - Area: admin action validation.
  - References: `src/app/coolguy69/actions.ts`.
  - Current risk: duplicated scalar parsing can drift between UI forms, server actions, and tests.
  - Expected behavior: dangerous or tournament-changing actions should use shared validation
    contracts where practical.
  - Evidence needed: mutation contract coverage for every admin server action input.
  - Verified Evidence: PFR-045: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Low: Private CSV auto-download may be blocked by browsers.**
  - Area: admin export UX.
  - References: `src/app/coolguy69/_components/PrivateCsvDownload.tsx`.
  - Current risk: auto-download triggered from `useEffect` may be blocked or ignored by some browser
    policies because it is not directly tied to the user's click. A manual fallback exists, but the
    event-day path should be verified.
  - Expected behavior: the CSV should reliably download in the browser that will be used by the host.
  - Evidence needed: manual target-browser evidence that the file appears with expected content.
  - Verified Evidence: PFR-046: See Remediation Implementation Evidence - 2026-07-02 and
    2026-07-03 above for manual fallback hardening, automatic and manual Chromium download
    assertions in `tests/e2e/full-flow.spec.ts`, and local Supabase production-flow browser
    downloads under `test-results/phase9/downloads/`.

- [x] **Low: Chart exclusion audit can lose clarity if source CSV later removes or renames a chart.**
  - Area: chart exclusions, audit.
  - References: `src/app/coolguy69/actions.ts`, `src/lib/server/normalized-operational-state.ts`.
  - Current risk: exclusions are tied to chart keys and current chart metadata. If source data later
    changes, an old exclusion may become harder to interpret.
  - Expected behavior: audit records for exclusions should preserve enough display metadata to
    explain what was excluded even after data changes.
  - Evidence needed: exclusion audit evidence after fixture catalog rename/removal.
  - Verified Evidence: PFR-047: See Remediation Implementation Evidence - 2026-07-03 above.

- [x] **Low: Rehearsal reset UI copy understates persistence risk.**
  - Area: admin UX copy.
  - References: `src/app/coolguy69/page.tsx:268`, `src/app/coolguy69/page.tsx:303`,
    `src/app/coolguy69/actions.ts:1052`, `docs/deployment-readiness.md:116`.
  - Current risk: admin copy says disposable in-memory data, but deployed/event mode is
    Supabase-backed; a reset can affect persistent event-namespaced data.
  - Expected behavior: reset copy should accurately describe whether state is memory-only or
    persistent for the current deployment/backend.
  - Evidence needed: admin copy review across memory and Supabase modes.
  - Verified Evidence: PFR-048: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

- [x] **Low: Release checklist mixes stale checked evidence with current unchecked gates.**
  - Area: release docs.
  - References: `docs/release-checklist.md:5`, `docs/release-checklist.md:99`,
    `docs/deployment-readiness.md:78`.
  - Current risk: historical Phase 8/9 evidence can look production-ready even when current final
    checks and remediation gates remain unchecked.
  - Expected behavior: release docs should separate historical evidence from current release-blocking
    gates and require dates/commit IDs for completed items.
  - Evidence needed: release checklist cleanup with dates, commit IDs, and current status.
  - Verified Evidence: PFR-049: See Remediation Implementation Evidence - 2026-07-02 above for commands, artifacts, and closure status.

## Production Readiness Evidence Checklist

This section converts the risks above into non-Playwright acceptance evidence. Playwright execution
is intentionally excluded from this checklist.

- [x] Production-build, Supabase-backed full-flow evidence exists with production-like heartbeat,
      host-lock, polling, and admin action behavior.
  - Verified Evidence: `rtk npm run test:e2e:production-flow` passed on 2026-07-03 against local
    Supabase event `e2e-local-supabase-20260703` with a production build, heartbeats/polling
    enabled, admin-actions-only enabled, test routes disabled, and explicit disposable rehearsal
    controls.
- [x] All four rounds have evidence for draw both sets, open voting, submit/edit ballots,
      close/compute, tiebreak reveal, and final two-chart reveal.
  - Verified Evidence: The same 2026-07-03 local Supabase production-flow run completed Rounds 1-4
    with draw, public draw assertion, voting open, `/vote` UI ballot submission, close, compute,
    result reveal through final two-chart screen, and per-round private CSV browser download.
- [ ] `/stage`, `/room`, `/vote`, `/charts`, `/results`, and `/coolguy69` have state-transition
      evidence for every major round state.
  - Verified Evidence: Pending. Route-state helpers and implementation evidence exist; full
    route-visible transition evidence is still deferred.
- [x] `/stage` evidence shows exactly two set rows of seven cards and QR target `/room`.
  - Verified Evidence: Source-review evidence was already recorded in the review section; the stage
    QR target remains `/room`, and the stage card layout uses two set rows of seven cards.
- [x] Player dropdown label evidence shows exactly `Select your start.gg username`.
  - Verified Evidence: Source-review evidence was already recorded in the review section and the full
    test/build gates passed after the remediation changes.
- [x] Player confirmation evidence shows exactly
      `Are you sure you are voting as [start.gg username]?`.
  - Verified Evidence: Source-review evidence was already recorded in the review section and the full
    test/build gates passed after the remediation changes.
- [ ] Duplicate active usernames cannot vote silently from multiple devices.
  - Verified Evidence: Pending. Early duplicate-device warning was implemented, but two-device UX
    evidence is still deferred.
- [x] Each set requires either 1-2 bans or explicit `No bans for this set`.
  - Verified Evidence: Server-side negative ballot validation is covered by `src/lib/vote/ballot.test.ts`
    and the full `rtk npm run test` gate passed.
- [x] A player can edit before close and the latest valid revision wins.
  - Verified Evidence: Ballot revision behavior and failed-edit preservation are covered by
    `src/lib/vote/ballot.test.ts` and the full test/build gates passed.
- [x] First-submit failure does not imply a saved ballot.
  - Verified Evidence: Player vote copy was updated to distinguish first-submit failure from
    failed-edit preservation; the change is covered by source review and full test/build gates.
- [ ] Admin live counts are hidden by default and public pages do not leak chart-by-chart counts
      before reveal.
  - Verified Evidence: Pending. Implementation/source evidence exists for privacy behavior, but
    state-by-state public-route anti-spoiler evidence is still deferred.
- [ ] All dangerous admin actions require password re-entry, reason, and a clear action summary.
  - Verified Evidence: Pending. Several server-side guards and contracts were implemented, but a full
    admin action matrix with allowed/rejected/audited outcomes has not been collected.
- [ ] Only one host can control the tournament across two sessions and stale sessions cannot
      overwrite host control.
  - Verified Evidence: Pending. Compare-aware host-lock behavior is covered by unit/fake-store tests,
    but live two-session Supabase evidence is still required.
- [ ] Private CSV content after final reveal matches expected ballots, revisions, timestamps,
      active-at-round-start values, selected charts, and unambiguous chart identities.
  - Verified Evidence: Pending for final browser/export flow. CSV unit coverage exists for formula
    neutralization, active-at-round-start, timestamps, chart IDs/difficulty, and filename policy.
- [ ] Load evidence covers at least 100 eligible players and concurrent spectators without relying
      solely on synthetic ballot injection.
  - Verified Evidence: Pending. Load scripts/docs now target 100 players plus spectators and separate
    API injection from player-route evidence, but the full load evidence has not been run.
- [x] Event-day target browser can download the private CSV.
  - Verified Evidence: Chromium Playwright evidence on 2026-07-03 covered automatic and manual
    private CSV downloads with expected filename/content in memory smoke mode, and the local
    Supabase production-flow run downloaded round CSV artifacts under `test-results/phase9/downloads/`.
- [ ] Projector-size `/stage` and mobile `/vote` evidence show readable, non-overlapping UI.
  - Verified Evidence: Pending. No projector-size or mobile visual evidence was collected in this pass.

## Already Verified During Review

These were observed during manual code review and are not marked as completed remediation:

- Required routes exist: `/stage`, `/room`, `/vote`, `/charts`, `/results`, `/coolguy69`.
- `/room` includes player voting and chart-only paths.
- QR target defaults to `/room`.
- Player dropdown and confirmation copy match the product spec in the reviewed code path.
- `/stage` uses two rows of seven cards for the two round sets.
- Public result summary uses ban counts, not percentages.
- Server-side draw/result code uses server-side randomness rather than browser randomness for
  tournament decisions.
- E2E-only routes appear guarded by production/test tokens and rehearsal flags.

## Checks Run For This Documentation Update

- [x] No automated checks were run because this was a documentation-only update and the user asked
      to skip those checks.
- [x] Playwright was not run.
- [x] The checklist itself does not require running Playwright for any item.
