# Production Readiness Review - 2026-07-01

## Verdict

Not production ready yet.

The app is close functionally, and the normal validation checks pass on the current branch, but the review found production-blocking risks around Supabase transaction boundaries, test-only mutation routes, and public live player-status exposure.

## Review Scope

This review compared the current implementation against:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/codex-execution-plan.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

Four focused review passes were used:

- Tournament logic and database correctness
- Security and server authority
- UX/UI and product compliance
- Build, CI, e2e, load, and release readiness

No code changes were made as part of the review itself.

## Critical And High Findings

### 1. Supabase ballot/result races can produce stale or wrong results

References:

- `src/app/vote/actions.ts:145`
- `src/app/coolguy69/actions.ts:796`
- `src/app/coolguy69/actions.ts:809`
- `src/lib/server/normalized-operational-state.ts:267`
- `supabase/migrations/20260630041000_normalized_submit_ballot_rpc.sql`

Current behavior:

Production Supabase ballot submission and admin result computation are not one authoritative locked database transaction. Result computation hydrates state, computes from in-memory ballots, then persists merged state. A concurrent valid ballot can commit after hydration but before result persistence.

Expected behavior:

Result computation should use the authoritative latest ballot set at the exact moment results are locked.

Production risk:

A valid last-second ballot can be stored but omitted from selected-chart computation and result counts.

Recommended fix:

Move close/compute/result writes into a single database RPC/transaction that:

- Locks the voting window.
- Applies any deadline transition.
- Blocks or includes concurrent submits deterministically.
- Reloads authoritative ballots inside the transaction.
- Writes result and tiebreak rows atomically.

Recommended test:

Simulate admin compute with stale hydrated ballots plus a concurrent accepted submit. Assert the result includes that ballot or the submit is rejected after close.

### 2. Low-turnout extension can be skipped in the production ballot RPC

References:

- `supabase/migrations/20260630041000_normalized_submit_ballot_rpc.sql:55`
- `src/app/vote/actions.ts:145`

Current behavior:

Production Supabase ballot submits call `normalized_submit_ballot`, which rejects when `v_now > closes_at` before applying the required low-turnout one-minute extension rule.

Expected behavior:

At the 10-minute deadline, server/database time should extend voting once by 1 minute when turnout is below 75%, then accept submissions during that extension.

Production risk:

Players submitting during the required extension may be rejected.

Recommended fix:

Move voting deadline advancement into the DB transaction, before the open/closed check, under the same `voting_windows FOR UPDATE` lock.

Recommended test:

Add a SQL/RPC integration test with an expired open window and 0/4 submitted players. Expected result: status becomes `extension_1_minute` and the ballot is accepted.

### 3. Test-only ballot API can mutate production if misconfigured

References:

- `src/app/api/e2e/load-ballot/route.ts:40`
- `src/app/api/e2e/load-ballot/route.ts:161`

Current behavior:

`POST /api/e2e/load-ballot` is available when `TOURNAMENT_TEST_ALLOW_E2E_ROUTES=true`. It does not require admin auth, a secret header, or a hard `NODE_ENV !== "production"` guard. In Supabase mode it uses service-role authority to submit ballots.

Expected behavior:

Test-only mutation endpoints should be impossible to use in production. Non-production usage should also require a private test token.

Production risk:

A misconfigured environment variable could let any public caller submit or replace ballots for players.

Recommended fix:

Return `404` when `NODE_ENV === "production"` regardless of test flags. Also require a private test token header for non-production test routes.

Recommended test:

Set `NODE_ENV=production`, `TOURNAMENT_TEST_ALLOW_E2E_ROUTES=true`, and Supabase backend. Assert `POST /api/e2e/load-ballot` returns `404` and no ballot mutation occurs.

### 4. Public vote payload leaks named live submission status

References:

- `src/app/vote/page.tsx:116`
- `src/app/vote/actions.ts:86`
- `src/app/vote/BallotFlow.tsx:342`

Current behavior:

The public vote page sends `players`, `eligiblePlayerIds`, and `submittedPlayerIds` to the browser. Polling refreshes the full submitted-player ID list.

Expected behavior:

Public clients should receive aggregate turnout and selected-voter-only state. They should not receive full live submission lists that can be mapped to start.gg usernames.

Production risk:

Anyone can infer which named players have voted during the live window.

Recommended fix:

Remove public `submittedPlayerIds` and full eligibility arrays from browser payloads. Return aggregate counts plus selected-player-only duplicate/submitted status from server actions.

Recommended test:

Render `/vote` and call `getVoteLiveStateAction`; assert responses do not include full submitted-player ID arrays while selected-player duplicate warnings still work.

### 5. Same-username second-device warning can be missed

References:

- `src/app/vote/BallotFlow.tsx:270`
- `src/app/vote/BallotFlow.tsx:566`
- `src/app/vote/BallotFlow.tsx:571`

Current behavior:

`claimPresence()` sets `presenceWarning` when another active device exists, but the warning is only rendered in the pre-confirmation branch. The confirm button starts the async claim and immediately advances the voter past that branch.

Expected behavior:

If the same start.gg username opens on another phone, the user must visibly see the warning while latest valid submitted ballot still wins.

Production risk:

Two devices can unknowingly vote as the same username.

Recommended fix:

Either await the presence claim before advancing past confirmation, or render `presenceWarning` in all confirmed ballot, review, and saved states until dismissed.

Recommended test:

Use two browser contexts, select and confirm the same username on both, and assert the second device visibly shows the duplicate-device warning while still allowing submission.

## Medium Findings

### 6. Final-30-second warning does not trigger from extension state

References:

- `src/lib/vote/voting-window.ts:457`
- `supabase/migrations/20260630041000_normalized_submit_ballot_rpc.sql:271`

Current behavior:

The "all eligible players submitted" 30-second final-change warning only triggers when status is `voting_open`, not during `extension_1_minute`.

Expected behavior:

If every eligible player submits early, the 30-second final-change warning should run during any submission-open voting phase.

Recommended fix:

Allow transition from `extension_1_minute` to `final_30_seconds`, excluding only already-final, closed, paused, and result states.

### 7. Required confirmation copy is not exact

Reference:

- `src/app/vote/BallotFlow.tsx:558`

Current behavior:

The confirmation prompt renders without the required trailing question mark.

Expected copy:

`Are you sure you are voting as [start.gg username]?`

Recommended fix:

Append the question mark and add an exact-copy assertion.

### 8. Rehearsal tiebreak seeding lacks dangerous-action re-entry

References:

- `src/app/coolguy69/actions.ts:1007`
- `src/app/coolguy69/actions.ts:1029`
- `src/app/coolguy69/actions.ts:1052`

Current behavior:

`seedRehearsalTiebreakAction()` requires active host and rehearsal mode, but does not require admin password re-entry or a reason. It can open voting and submit manual-admin ballots.

Expected behavior:

Manual ballot creation and voting-state changes should follow dangerous-action handling: password re-entry, clear summary/reason, and dangerous audit metadata.

Recommended fix:

Require dangerous-action password and reason, mark the audit entry as dangerous, or hard-disable this helper outside non-production environments.

### 9. Rate limiting is process-local only

References:

- `src/lib/server/rate-limit.ts:14`
- `src/lib/server/admin-auth.ts:82`
- `src/app/vote/actions.ts:136`

Current behavior:

Admin login, dangerous password checks, voter presence, and ballot submission use an in-memory `globalThis` map.

Expected behavior:

Production abuse controls should survive serverless cold starts and multiple instances where practical.

Recommended fix:

Move high-value limits, especially admin login and dangerous re-entry, to Supabase, KV, edge, or WAF-backed counters.

### 10. Release checklist still has open production gates

References:

- `docs/release-checklist.md:22`
- `docs/release-checklist.md:30`
- `docs/release-checklist.md:81`
- `docs/release-checklist.md:91`
- `docs/phase-status.md:5`

Current behavior:

Vercel environment, event data setup, roster/admin checks, private CSV verification, and final checks are not all marked complete.

Expected behavior:

All release gates should be completed with evidence before tournament use.

Recommended fix:

Complete `docs/release-checklist.md`, record the final commit, and confirm production env uses `TOURNAMENT_STATE_BACKEND=supabase` and the real `TOURNAMENT_EVENT_ID`.

## Lower Severity / Follow-Up Findings

### 11. E2E has shown environment-sensitive failures

Observed behavior:

The main-workspace rerun passed all e2e tests, but earlier review runs saw two different failures:

- `/results` client exception after final reveal.
- Mobile admin login click blocked by the tournament logo intercepting pointer events.

Current status:

`npm run test:e2e` passed on rerun.

Recommended fix:

Treat this as a flake/layout risk until CI has repeated clean runs. Consider setting decorative logo imagery to ignore pointer events and keeping mobile admin-login coverage.

### 12. Mobile WebKit coverage can be skipped in some setups

References:

- `tests/e2e/mobile-routes.spec.ts:79`
- `tests/e2e/mobile-routes.spec.ts:89`

Current behavior:

WebKit public-route coverage can depend on mobile Chromium setup state.

Expected behavior:

iOS/WebKit coverage should have deterministic setup or explicit replacement coverage.

Recommended fix:

Use a Playwright setup project/shared seeded state, or make WebKit perform its own setup.

### 13. CI does redundant production builds

References:

- `.github/workflows/ci.yml:47`
- `scripts/run-playwright.mjs:72`

Current behavior:

CI runs `npm run build`, then `npm run test:e2e` runs another `next build`.

Production risk:

This is not a correctness blocker, but it slows CI and adds more `.next` churn.

Recommended fix:

Add a `test:e2e:no-build` mode or env flag for CI after the explicit build gate.

## Notable Passes

- Required routes exist: `/stage`, `/room`, `/vote`, `/charts`, `/results`, `/coolguy69`.
- Root redirects to `/room`.
- `/room` shows exact options `I am a player voting` and `View charts only`.
- QR defaults to `/room`.
- Tournament config matches the spec: S16/S17, S18/S19, S20/S21, S22/D23.
- Each round set draws 7 charts.
- CSV pools are large enough for all required draws.
- Voting enforces one round ballot across both sets.
- Voting enforces 1-2 bans or explicit `No bans for this set`.
- Draw/result code avoids browser randomness for tournament decisions.
- Public pre-reveal screens do not show chart-by-chart live ban counts.
- Admin live counts are hidden behind a disclosure.
- Phones/results are gated until final reveal.
- Stage layout shows two horizontal set rows with seven charts each.
- Phone/view-only chart grids use two columns with the seventh card centered.
- Admin route is password protected and uses host lock/read-only disabling.
- Core dangerous actions generally require password re-entry and action summaries.
- Service-role Supabase access is isolated behind server-only code.
- `.env` and `.env.*` are ignored while `.env.example` remains allowed.
- No official DOOM asset references or reduced-motion toggle were found in app source.

## Checks Run

Passed in the main workspace:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run import:charts`
- `npm run build`
- `npm run test:e2e`
- `npm run test:load`
- `npm run verify:real-chart-images`
- `npm audit --omit=dev`
- `git diff --check`

Observed details:

- Unit tests: 37 files, 143 tests passed.
- E2E tests: 4 passed on rerun.
- Load rehearsal: 100-player browser rehearsal passed.
- Chart import: 4426 charts imported.
- Required chart pool counts: S16 189, S17 196, S18 189, S19 167, S20 135, S21 150, S22 97, D23 125.
- Real chart image verification: 639 non-fallback cached assets.
- `npm audit --omit=dev`: 0 vulnerabilities.

## Recommended Fix Order

1. Implement authoritative DB transactions/RPCs for ballot submit, voting close, result computation, and result persistence.
2. Fix the production ballot RPC deadline-extension ordering.
3. Hard-disable test mutation routes in production.
4. Remove full submitted-player IDs from public vote payloads.
5. Fix duplicate-device warning visibility.
6. Fix exact confirmation copy.
7. Complete the release checklist and repeat the full validation suite in CI.
