# Remediation Issue Checklist

Use this checklist at the end of the remediation plan to verify that every known repo validation issue has been addressed.

Phased remediation plan: `docs/remediation-plan-2026-06-28.md`.

Do not mark an item complete unless the fix is implemented, verified by an appropriate automated or manual check, and any related documentation has been updated. When closing an item, add the evidence in the `Evidence` column or in the phase completion notes.

## Stage, Reveal, And Projector

| Done |      ID | Issue                                                                                             | Evidence                                                                                                                                                                                                                   |
| ---- | ------: | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x]  | RIC-001 | `/stage` auto-updates after admin draw actions without manual refresh.                            | Phase 1: `tests/e2e/full-flow.spec.ts` keeps a `/stage` tab open while admin draws Set 1 and expects the stage to show `Version 1 / ...` without navigation; `rtk npm run test:e2e` passes.                                |
| [x]  | RIC-002 | `/stage` auto-updates after admin reroll actions without manual refresh.                          | Phase 1: e2e submits a per-chart reroll from admin and the already-open `/stage` tab updates to `Version 2 / ...`; `rtk npm run test:e2e` passes.                                                                          |
| [x]  | RIC-003 | `/stage` auto-updates after admin reset, voting, and reveal actions without manual refresh.       | Phase 1: `StageAutoRefresh` polls committed state; e2e verifies the already-open stage updates when voting opens and when final reveal is committed. Reset/rehearsal actions already call `revalidateTournamentViews`.     |
| [x]  | RIC-004 | Stage uses a polling, SSE, Supabase Realtime, or equivalent client refresh mechanism.             | Phase 1: `src/app/stage/StageAutoRefresh.tsx` calls `router.refresh()` every 2000ms.                                                                                                                                       |
| [x]  | RIC-005 | Draw and reroll actions revalidate all affected tournament views, not only `/coolguy69`.          | Phase 1: `drawRoundSetAction`, `rerollOneChartAction`, `rerollRoundSetAction`, and `rerollFullRoundAction` call `revalidateTournamentViews`, which revalidates `/coolguy69`, `/stage`, `/vote`, `/charts`, and `/results`. |
| [x]  | RIC-006 | Stage chart reveal is a slow automatic sequence driven by committed server/admin state.           | Phase 1: `buildStageRoundView` schedules reveal starts from draw `createdAt`; `StageSetPanel` reveals cards at 1800ms intervals from that committed timestamp.                                                             |
| [x]  | RIC-007 | Stage animation is not merely a short CSS animation on initial page render.                       | Phase 1: removed `.stage-card-reveal` and the `stage-card-rise` keyframes; cards appear according to committed draw timestamps and client time.                                                                            |
| [x]  | RIC-008 | Stage timer/status cannot go stale during pause, resume, extension, close, or reveal transitions. | Phase 1: `/stage` polls every 2000ms and e2e verifies live updates for voting-open and final-reveal transitions; timer/status snapshots are refreshed from server state.                                                   |
| [x]  | RIC-009 | Stage preview uses exactly two horizontal rows of 7 charts.                                       | Phase 1: `StageSetPanel` renders one `grid-cols-7` row per chart set, and `/stage` stacks the two set panels.                                                                                                              |
| [x]  | RIC-010 | Stage top row is Set 1 and bottom row is Set 2.                                                   | Phase 1: `buildStageRoundView` preserves `ROUND_SET_DEFINITIONS` set order; `/stage` maps Set 1 before Set 2.                                                                                                              |
| [x]  | RIC-011 | Stage row labels clearly show round and chart set labels.                                         | Phase 1: row headings render `Round X - S16/S17/...` plus `Set N / 7 charts`.                                                                                                                                              |
| [x]  | RIC-012 | Stage no longer uses 4+3 per-set panels for the projector preview.                                | Phase 1: removed the `firstRow`/`secondRow` 4+3 split from `StageSetPanel`; projector rows are always 7 columns.                                                                                                           |
| [x]  | RIC-013 | Stage reveal order is all 7 charts from Set 1, then all 7 charts from Set 2.                      | Phase 1: `stage-view.test.ts` verifies Set 2 reveal starts after `7 * STAGE_CHART_REVEAL_INTERVAL_MS + STAGE_SET_REVEAL_GAP_MS`.                                                                                           |
| [x]  | RIC-014 | Final stage reveal still shows exactly the two selected charts together.                          | Phase 1: unchanged final stage path still maps the two result sets; e2e verifies `/stage` reaches `ROUND 1 FINAL CHARTS`.                                                                                                  |
| [x]  | RIC-015 | Tiebreak winner is hidden until the 5-second rune wheel reveal completes.                         | Phase 2: `ResultSetPanel` hides selected-row highlighting and winner copy while `RuneWheel`/fallback reveal has `data-winner-revealed="false"`; `tests/e2e/full-flow.spec.ts` verifies the wheel stays sealed, then reveals after 5 seconds. |
| [x]  | RIC-016 | Tiebreak wheel still reveals a backend-decided winner and never decides the result in-browser.    | Phase 2: `ResultStore` stamps server-side `winnerRevealStartedAt` and blocks reveal advancement until the committed tiebreak reveal duration completes; `result-store.test.ts` verifies the backend winner is already chosen before the reveal. |

## Chart Images And Data Pipeline

| Done |      ID | Issue                                                                                                                              | Evidence                                                                                                                                                                                                                          |
| ---- | ------: | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x]  | RIC-017 | Runtime draw data includes `localImagePath` for cached chart artwork.                                                              | Phase 1: `DrawStateStore` now loads through `loadRuntimeCharts`, and draw summaries carry `localImagePath` from image-enriched chart data.                                                                                        |
| [x]  | RIC-018 | Runtime draws no longer load only raw `data/source/charts.csv` rows with `localImagePath: null`.                                   | Phase 1: runtime prefers `data/generated/charts-with-images.json`; CSV is only the fallback source when the generated artifact is missing.                                                                                        |
| [x]  | RIC-019 | Runtime consumes `data/generated/charts-with-images.json`, Supabase image asset rows, or another controlled image metadata source. | Phase 1: `src/lib/charts/runtime-catalog.ts` reads `data/generated/charts-with-images.json` when present.                                                                                                                         |
| [ ]  | RIC-020 | Real cached chart image files exist in the deployed asset location or controlled storage.                                          | Phase 1 attempted `rtk npm run cache:chart-images`; it completed with `0 cached, 639 using fallback`, and `public/chart-images/cache` contained 0 files afterward. Remains open.                                                  |
| [ ]  | RIC-021 | `public/chart-images/cache` or the chosen controlled image storage is populated before event use.                                  | Phase 1 verification measured 0 files in `public/chart-images/cache`; remains open for event setup.                                                                                                                               |
| [ ]  | RIC-022 | `cache:chart-images` can produce non-fallback cached assets in normal event setup.                                                 | Phase 1 run exited 0 but all upstream fetches failed with generated `failureReason: "fetch failed"`; remains open until a network/source fix produces cached assets.                                                              |
| [x]  | RIC-023 | Fallback artwork is used only for missing or failed cached images.                                                                 | Phase 1: `resolveRuntimeChartImages` keeps non-fallback local paths only if the public asset exists; `image-cache.test.ts` and `runtime-catalog.test.ts` cover cached vs fallback behavior.                                       |
| [x]  | RIC-024 | Stage chart cards render cached chart artwork when available.                                                                      | Phase 1: `StageDrawCard` uses `chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH`; runtime catalog tests verify cached local paths are preserved when files exist.                                                                |
| [x]  | RIC-025 | Vote/player chart cards render chart artwork where chart art is required.                                                          | Phase 1: `BallotFlow` uses chart local image paths as card backgrounds while preserving the phone two-column layout.                                                                                                              |
| [x]  | RIC-026 | View-only chart surfaces render chart artwork where chart art is required.                                                         | Phase 1: `/charts` uses `StageSetPanel`/`StageDrawCard`, and result panels use `row.chart.localImagePath` with fallback.                                                                                                          |
| [x]  | RIC-027 | Image cache status, original `bg_img`, local image path, and failure reason are persisted or reproducible.                         | Phase 1: `rtk npm run cache:chart-images` regenerated `data/generated/image-assets.json` and `charts-with-images.json` with `remoteUrl`, `localPath`, `status`, and `failureReason`; generated files remain ignored/reproducible. |
| [ ]  | RIC-028 | Image rendering is verified with automated natural-width or screenshot checks.                                                     | Phase 2 added a Playwright natural-width check for the rendered stage image path, but this remains open because `public/chart-images/cache` still has 0 real cached files and real cached artwork rendering has not been verified.             |

## Persistence And Architecture

| Done |      ID | Issue                                                                                              | Evidence |
| ---- | ------: | -------------------------------------------------------------------------------------------------- | -------- |
| [ ]  | RIC-029 | Tournament operational state is database-authoritative, not process-local memory.                  |          |
| [ ]  | RIC-030 | Roster state persists across server restart and multiple app instances.                            |          |
| [ ]  | RIC-031 | Draw state persists across server restart and multiple app instances.                              |          |
| [ ]  | RIC-032 | Ballot state persists across server restart and multiple app instances.                            |          |
| [ ]  | RIC-033 | Voting window state persists across server restart and multiple app instances.                     |          |
| [ ]  | RIC-034 | Host lock state persists across server restart and multiple app instances.                         |          |
| [ ]  | RIC-035 | Result/reveal state persists across server restart and multiple app instances.                     |          |
| [ ]  | RIC-036 | Current round state persists across server restart and multiple app instances.                     |          |
| [ ]  | RIC-037 | Selected prior songs are derived from persisted results, not only an in-memory set.                |          |
| [ ]  | RIC-038 | Chart exclusions are persisted and applied by live draw services.                                  |          |
| [ ]  | RIC-039 | Supabase service/repository layer is used for tournament-changing operations.                      |          |
| [ ]  | RIC-040 | Placeholder mutation functions are replaced or removed for implemented workflows.                  |          |
| [ ]  | RIC-041 | In-memory stores are limited to tests, local fakes, or explicitly documented non-production modes. |          |

## Draws, Exclusions, And Auditability

| Done |      ID | Issue                                                                                           | Evidence |
| ---- | ------: | ----------------------------------------------------------------------------------------------- | -------- |
| [ ]  | RIC-042 | Draw history is durably persisted.                                                              |          |
| [ ]  | RIC-043 | Reroll history is durably persisted.                                                            |          |
| [ ]  | RIC-044 | Drawn chart order is persisted.                                                                 |          |
| [ ]  | RIC-045 | Eligible pool snapshot or reconstructable eligibility criteria are stored for each draw/reroll. |          |
| [ ]  | RIC-046 | Admin can pre-exclude charts from the app.                                                      |          |
| [ ]  | RIC-047 | Admin can re-include excluded charts from the app.                                              |          |
| [ ]  | RIC-048 | Chart exclusions require and store reasons.                                                     |          |
| [ ]  | RIC-049 | Excluded charts cannot be drawn.                                                                |          |
| [ ]  | RIC-050 | Selected songs from prior rounds cannot be drawn in later rounds after restart.                 |          |
| [ ]  | RIC-051 | Same-round duplicate-song prevention remains covered by tests.                                  |          |
| [ ]  | RIC-052 | Draw/reroll actions are linked to admin audit records.                                          |          |

## Player, Voting, And Phone UX

| Done |      ID | Issue                                                                                         | Evidence |
| ---- | ------: | --------------------------------------------------------------------------------------------- | -------- |
| [x]  | RIC-053 | `/vote` live-updates voting status with light polling or equivalent server-backed refresh.    | Phase 3: `BallotFlow` polls `getVoteLiveStateAction` every 1500ms while voting is active, and `VoteAutoRefresh` refreshes non-active `/vote` states every 2000ms; `rtk npm run test:e2e` passes. |
| [x]  | RIC-054 | Phones update automatically for pause and resume.                                             | Phase 3: active ballots disable mutation controls when the live snapshot reports `canSubmit=false`, paused/waiting views include `VoteAutoRefresh`, and `voting-window.test.ts` covers pause/resume state transitions. |
| [x]  | RIC-055 | Phones update automatically for final-30-second warning.                                      | Phase 3: `getVoteLiveStateAction` returns `Final 30 seconds` plus server-timer text and `BallotFlow` updates those labels from polling; `voting-window.test.ts` covers the final-change transition. |
| [x]  | RIC-056 | Phones update automatically for one-minute turnout extension.                                 | Phase 3: `getVoteLiveStateAction` returns `One-minute extension` plus server-timer text and `BallotFlow` updates those labels from polling; `voting-window.test.ts` covers the extension transition. |
| [x]  | RIC-057 | Phones update automatically when voting closes.                                               | Phase 3: Playwright keeps a submitted phone tab open, closes voting from admin, and verifies the phone reaches `Voting is closed.` without navigation; `rtk npm run test:e2e` passes. |
| [x]  | RIC-058 | Phones update automatically when results begin revealing.                                     | Phase 3: closed/results-computed/results-revealing `/vote` states render `Results are being revealed on stage.` with `VoteAutoRefresh`, so phones refresh through reveal-state changes without manual navigation. |
| [x]  | RIC-059 | Phones update automatically when final results are revealed.                                  | Phase 3: Playwright keeps the phone tab open through the admin final reveal and verifies `Full ban counts` appears without navigating the phone; `rtk npm run test:e2e` passes. |
| [x]  | RIC-060 | Stale phone pages cannot appear submit-capable during pause or after close.                   | Phase 3: `BallotFlow` disables confirm, chart, no-ban, next/review, and submit controls when polling reports `canSubmit=false`; `submitRoundBallotAction` still rejects stale invalid submissions server-side. |
| [x]  | RIC-061 | Existing ballot lookup is used to prefill saved choices.                                      | Phase 3: `BallotFlow` loads `getExistingBallotAction`, reconciles saved choices with current draws, and Playwright verifies saved S16/no-ban choices after phone reload. |
| [x]  | RIC-062 | Saved ballot timestamp remains visible after refresh.                                         | Phase 3: Playwright reloads the submitted phone page and verifies `Ballot Saved`, `Loaded saved revision 1.`, and `Server-confirmed timestamp:` remain visible. |
| [x]  | RIC-063 | Players can edit an existing ballot until voting closes.                                      | Phase 3: saved ballots keep the `Change vote` control while the live server snapshot has `canSubmit=true`; the button is hidden once polling reports voting is closed/paused. |
| [x]  | RIC-064 | Same-username second-device warning appears before risky duplicate use.                       | Phase 3: Playwright opens a fresh browser context, selects Alpha after Alpha has submitted, and verifies `A ballot already exists for this start.gg username` before confirmation. |
| [x]  | RIC-065 | Latest valid submitted ballot still wins.                                                     | Phase 3: unchanged server `BallotStore` replacement behavior remains covered by `ballot.test.ts`; `BallotFlow` stores returned revisions and the full suite passes. |
| [x]  | RIC-066 | Selected start.gg username is remembered on the device for the event.                         | Phase 3: `BallotFlow` stores the selected player in `localStorage` under `bite-open-card-draw:startgg-identity:v1`; Playwright reloads the phone and reaches the saved ballot without selecting the name again. |
| [x]  | RIC-067 | Emergency current-round inactive-player add updates the active voting snapshot when intended. | Phase 3: `addInactivePlayerToCurrentRoundAction` now calls `VotingWindowStore.addEligiblePlayerToOpenRound` after the password-gated roster change; `voting-window.test.ts` covers adding to an already-open snapshot. |
| [x]  | RIC-068 | Turnout denominator updates correctly after emergency current-round eligibility changes.      | Phase 3: `voting-window.test.ts` verifies an open window moves from 2 to 3 eligible players and recalculates submitted count/turnout ratio after emergency addition. |

## Admin, Security, And Operations

| Done |      ID | Issue                                                                                                                   | Evidence |
| ---- | ------: | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| [ ]  | RIC-069 | Active host lock cannot be silently stolen while unexpired.                                                             |          |
| [ ]  | RIC-070 | Host takeover requires expiry or an explicit warning/force path.                                                        |          |
| [ ]  | RIC-071 | Host takeover is audited.                                                                                               |          |
| [ ]  | RIC-072 | Every dangerous admin action writes an audit record.                                                                    |          |
| [ ]  | RIC-073 | Audit records include admin/session identity, action, reason, summary, metadata, and affected records where applicable. |          |
| [ ]  | RIC-074 | Reroll one chart uses a clear dangerous-action summary before password entry.                                           |          |
| [ ]  | RIC-075 | Reroll one set uses a clear dangerous-action summary before password entry.                                             |          |
| [ ]  | RIC-076 | Reroll full round uses a clear dangerous-action summary before password entry.                                          |          |
| [ ]  | RIC-077 | Reset/rehearsal destructive actions use clear dangerous-action summaries before password entry.                         |          |
| [ ]  | RIC-078 | Manual ballot and ballot replacement summaries clearly state consequences.                                              |          |
| [ ]  | RIC-079 | Admin live chart counts exist behind a warning button.                                                                  |          |
| [ ]  | RIC-080 | Admin live chart counts do not require extra password re-entry.                                                         |          |
| [ ]  | RIC-081 | Public/stage/phone routes still do not show live chart-by-chart counts before close.                                    |          |
| [ ]  | RIC-082 | Emergency reopen voting workflow exists.                                                                                |          |
| [ ]  | RIC-083 | Emergency reopen requires password confirmation, reason, and chosen duration.                                           |          |
| [ ]  | RIC-084 | Reset-round workflow exists.                                                                                            |          |
| [ ]  | RIC-085 | Result correction/override workflow exists and is treated as dangerous/emergency-only.                                  |          |
| [ ]  | RIC-086 | Manual ballot timing matches the final product rule or is explicitly clarified in docs.                                 |          |
| [ ]  | RIC-087 | Private CSV export remains admin-only after persistence migration.                                                      |          |
| [ ]  | RIC-088 | Private CSV includes player-level ballot data, selected charts, tiebreak flags, and manual override markers.            |          |
| [ ]  | RIC-089 | Private CSV includes or can trace reroll/audit context.                                                                 |          |

## QR, Routes, And Public Screens

| Done |      ID | Issue                                                                                            | Evidence |
| ---- | ------: | ------------------------------------------------------------------------------------------------ | -------- |
| [x]  | RIC-090 | QR panel renders a real scannable QR code.                                                       | Phase 2: `QRPanel` uses the `qrcode` package to render an SVG QR; e2e verifies the generated SVG is present and contains QR path data. |
| [x]  | RIC-091 | QR encodes the general `/room` URL, not `/vote` or a player-specific link.                       | Phase 2: `QRPanel` builds the target with `buildPublicRouteUrl("/room")`; e2e verifies `data-qr-target="http://127.0.0.1:3100/room"`. |
| [x]  | RIC-092 | QR uses `NEXT_PUBLIC_SITE_URL` or an equivalent configured event origin.                         | Phase 2: `src/lib/public-url.ts` uses `NEXT_PUBLIC_SITE_URL` when present and falls back to `/room`; `public-url.test.ts` covers configured and fallback origins. |
| [x]  | RIC-093 | Short event URL is visible beneath the QR.                                                       | Phase 2: `QRPanel` renders `formatShortEventUrl(roomUrl)` below the QR; e2e verifies `127.0.0.1:3100/room` is visible. |
| [ ]  | RIC-094 | `/charts` reflects current draw/result state without manual refresh where needed.                |          |
| [ ]  | RIC-095 | `/results` reflects final reveal state from persisted data.                                      |          |
| [ ]  | RIC-096 | Required routes remain present: `/stage`, `/room`, `/vote`, `/charts`, `/results`, `/coolguy69`. |          |

## Tests, CI, And Reliability

| Done |      ID | Issue                                                                                                      | Evidence                                                                                                                                                                      |
| ---- | ------: | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x]  | RIC-097 | Ambiguous e2e selector around `getByText("final")` is fixed.                                               | Phase 0 verification found the failure; `tests/e2e/full-flow.spec.ts` now scopes the final reveal assertion to the result reveal controls, and `rtk npm run test:e2e` passes. |
| [x]  | RIC-098 | `npm run test:e2e` passes reliably against real chart data.                                                | Phase 1 final gate: `rtk npm run test:e2e` passed with the full Round 1 smoke flow against `data/source/charts.csv`.                                                          |
| [x]  | RIC-099 | Two-tab admin/stage e2e proves stage updates without refresh.                                              | Phase 1: `tests/e2e/full-flow.spec.ts` opens a separate `/stage` tab and verifies draw, reroll, voting-open, and final-reveal updates without manual stage navigation.        |
| [x]  | RIC-100 | Phone polling/status e2e proves phone state updates without manual refresh.                                | Phase 3: `tests/e2e/full-flow.spec.ts` keeps a phone tab open after submit, verifies close-state auto-update, then verifies final results appear without phone navigation; `rtk npm run test:e2e` passes. |
| [ ]  | RIC-101 | DB-backed integration tests cover roster, draws, ballots, voting windows, host lock, and results.          |                                                                                                                                                                               |
| [ ]  | RIC-102 | Cold-start persistence test proves state survives process/store recreation.                                |                                                                                                                                                                               |
| [ ]  | RIC-103 | Multi-instance or equivalent persistence test proves two app instances see the same state.                 |                                                                                                                                                                               |
| [ ]  | RIC-104 | 100-player load-sized test runs against persistent services.                                               |                                                                                                                                                                               |
| [x]  | RIC-105 | Stage screenshot/visual checks cover two 7-card rows, QR, timer, chart images, tiebreak, and final reveal. | Phase 2: Playwright checks two 7-card stage rows, real QR SVG and short URL, readable timer/QR bounding boxes, rendered stage image natural width, sealed/revealed tiebreak wheel, and final stage list with exactly two cards. |
| [ ]  | RIC-106 | CI runs only stable gates and does not require production secrets.                                         |                                                                                                                                                                               |
| [ ]  | RIC-107 | CI/e2e reliability is documented if any checks remain local-only.                                          |                                                                                                                                                                               |

## Documentation And Process

| Done |      ID | Issue                                                                                                                    | Evidence                                                                                                                                                                           |
| ---- | ------: | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x]  | RIC-108 | `AGENTS.md` requires reading `docs/pump_open_stage_repo_validation_checklist.md`.                                        | Phase 0: `AGENTS.md` required-read list now includes the validation checklist.                                                                                                     |
| [x]  | RIC-109 | Documentation states that product spec plus validation checklist override stale execution-plan text.                     | Phase 0: `AGENTS.md`, `docs/phase-status.md`, `docs/event-day-runbook.md`, and `docs/release-checklist.md` state the source-of-truth order.                                        |
| [x]  | RIC-110 | `docs/codex-execution-plan.md` no longer instructs 4+3 stage layout.                                                     | Phase 0: stale projector layout text replaced with two horizontal 7-card rows.                                                                                                     |
| [x]  | RIC-111 | `docs/testing-checklist.md` no longer validates 4+3 stage layout.                                                        | Phase 0: stage test now requires two horizontal 7-card rows.                                                                                                                       |
| [x]  | RIC-112 | `docs/phase-status.md` no longer presents known-failing areas as complete without warnings.                              | Phase 0: added current remediation status and updated the stale Phase 6 UI note.                                                                                                   |
| [x]  | RIC-113 | `docs/phase-status.md` clearly states the app is not event-ready until this checklist is closed.                         | Phase 0: current remediation status says not event-ready until this checklist and closure gate pass.                                                                               |
| [x]  | RIC-114 | `docs/pump_open_stage_repo_validation_checklist.md` is either tracked or intentionally ignored with a documented reason. | Phase 0: `docs/phase-status.md` documents that local Git currently reports this file as untracked and must be added before release unless the branch workflow tracks it elsewhere. |
| [x]  | RIC-115 | Remediation phase notes list changed files, checks run, risks, and assumptions.                                          | Phase 0: `docs/phase-status.md` includes changed files, checks run, manual review, risks, and assumptions for Remediation Phase 0.                                                 |
| [x]  | RIC-116 | Final release checklist links to this remediation issue checklist.                                                       | Phase 0: `docs/release-checklist.md` includes a remediation gate linking this checklist.                                                                                           |
| [ ]  | RIC-117 | Local `.env.local` remains ignored and no real secrets are committed.                                                    |                                                                                                                                                                                    |
| [ ]  | RIC-118 | Documentation no longer claims Vercel/serverless event readiness while operational state is in memory.                   |                                                                                                                                                                                    |

## Final Closure Gate

The remediation plan is complete only when:

- Every checklist item above is checked.
- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm run test` passes.
- `npm run build` passes.
- `npm run test:e2e` passes or any excluded e2e coverage is explicitly documented with a replacement manual rehearsal check.
- Chart import and image cache setup have been run and verified with non-fallback chart artwork.
- A full four-round rehearsal has been completed with persistent state.
- Risks and assumptions are documented in `docs/phase-status.md`.
