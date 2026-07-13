# Phase 11 Plan - Production-Flow Playwright And Deployed Visual Evidence - 2026-07-04

Status: reviewed, executed, and verified. See `docs/phase-status.md` for final checks and risks.

Source plan: `docs/production-readiness-remediation-plan-2026-07-03.md`, Phase 11.

Authoritative behavior sources:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Goal

Turn the existing production-flow rehearsal into release-grade evidence for:

- the 48 -> 36 -> 24 -> 12 active voting-player progression;
- all active players submitting valid `/room -> /vote` ballots each round;
- per-round private CSV row/submission/active-snapshot checks;
- production-like Supabase execution with test-only routes disabled;
- projector, QR, and cached-image evidence at release viewports;
- deployable/external evidence that can be tied to the deployed commit.

No tournament rules change in this phase.

## Current Baseline

Phase 10 already upgraded the production-flow helpers so
`npm run test:e2e:production-flow` runs the hosted four-round Supabase rehearsal with:

- Round 1: 48 active voting players and 48 submitted UI ballots.
- Round 2: 36 active voting players after exactly 12 voting players are marked inactive.
- Round 3: 24 active voting players after exactly 12 more are marked inactive.
- Round 4: 12 active voting players after exactly 12 more are marked inactive.
- Per-round turnout, eligibility snapshot, result reveal, and private CSV checks.

The remaining Phase 11 gap is not core tournament logic. It is evidence quality:
the release evidence needs stronger projector/QR/image assertions, route/commit metadata, and an
external deployed mode that cannot be mistaken for memory or local smoke evidence.

## Implementation Plan

1. Preserve the production-flow gate as the release command.
   - Keep `npm run test:e2e:production-flow` as the canonical grouped evidence command.
   - Do not add `.github/workflows/*`; CI workflow creation stays deferred to Phase 12.
   - Keep `npm run test:e2e:production-flow:validate` as the fast environment probe.

2. Add Phase 11 visual/image evidence to the production-flow run.
   - Collect projector evidence during Round 1 voting, before bulk ballot submission mutates turnout.
   - Capture `/stage` at `1280x720`, `1366x768`, and `1920x1080`.
   - Assert exactly two horizontal rows of seven chart cards.
   - Assert no horizontal or vertical projector overflow.
   - Assert QR points to `/room`, is not clickable navigation, and meets the raised event-size
     threshold.
   - Assert timer and QR do not overlap and remain above the chart rows.
   - Assert chart titles have readable geometry and do not overflow their cards.

3. Add `/vote` mobile image evidence.
   - Open `/room -> /vote` through the normal player path at a phone viewport.
   - Confirm the start.gg username prompt and ballot cards.
   - Assert seven cards render in the phone layout with the seventh centered.
   - Assert card artwork uses local `/chart-images/cache/...` paths and not live third-party
     `bg_img` URLs or fallback artwork.

4. Record deployed/release metadata with evidence artifacts.
   - Write JSON evidence containing:
     - base URL;
     - source commit;
     - deployed commit, when provided by external/deployed mode;
     - backend;
     - server mode;
     - event id;
     - viewport;
     - screenshot artifact names;
     - chart image request/resource entries;
     - transfer/body sizes where the browser exposes them;
     - proof that chart image DOM/resource paths are local cached paths.
   - For local production-build mode, label evidence as local production-flow evidence.
   - For external deployed mode, require an explicit deployed commit identifier so route evidence can
     be tied to the deployment under test.

5. Strengthen attrition and evidence hygiene.
   - Add direct before/after evidence that each 12-player attrition batch transitions from active to
     inactive before the later round opens.
   - Keep the existing final active count, dropdown membership, and Supabase snapshot assertions.
   - Do not emit Playwright JSON reporter artifacts that include unredacted environment details.
     Use test attachments and purpose-built summaries instead.

6. Harden production-flow environment validation for external deployed runs.
   - Keep the current requirements: Supabase backend, production/start or external server mode,
     disposable event id, destructive-reset opt-in, enabled heartbeats/polling/refresh, admin
     actions only, memory backend disabled, test routes disabled.
   - For `E2E_SERVER_MODE=external`, also require:
     - `E2E_BASE_URL`;
     - `E2E_DEPLOYED_TEST_ROUTE_TOKEN`;
     - `E2E_DEPLOYED_COMMIT_SHA`.
   - Continue probing `/api/e2e/load-ballot` and `/api/e2e/private-csv` with no token, the local test
     token, and the deployed token; all must return 404.

7. Update operator documentation.
   - Document the Phase 11 external/deployed production-flow command shape.
   - Update runbooks to stop referring to the production-flow gate as a historical Phase 7 gate.
   - Update release checklist language so local evidence, external deployed evidence, and manual
     venue QR scan evidence are distinct.
   - Update phase status and the production-readiness checklist closure notes after verification.

## Review Plan Before Implementation

Review the plan against these questions before code changes:

- Does it preserve the product rules and avoid changing tournament behavior?
- Does it keep release evidence distinct from memory/dev smoke tests?
- Does it avoid adding GitHub Actions before Phase 12?
- Does it avoid exposing secrets in browser code, logs, docs, or artifacts?
- Does it make external deployed evidence possible without requiring deployed credentials in normal
  local verification?
- Does it avoid interfering with the 48-player ballot run?

Review result after audit:

- PASS: the plan preserves tournament behavior and only changes evidence/test harnesses plus QR
  sizing.
- PASS: the plan keeps memory/dev smoke, local production-flow, and external deployed evidence
  distinct.
- PASS: no GitHub Actions workflow is introduced.
- ADJUSTED: explicit inactive-batch transition evidence was added because the current helper proves
  the final counts but not every line-item transition.
- ADJUSTED: evidence hygiene was added because the current Phase 9 JSON reporter can include
  secret-bearing environment fields in ignored `test-results` output.

## Verification Plan

Focused checks:

```text
npm run test -- tests/phase9/fixtures/rehearsal-plan.test.ts
npm run test:e2e:no-build -- --project=visual-evidence-chromium
npm run test:e2e:production-flow:validate
```

Phase-wide checks:

```text
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run test:phase9
npm run test:load:player-routes
npm run test:e2e:production-flow:validate
npm run test:e2e:production-flow
git diff --check
```

Data/image checks:

```text
npm run verify:real-chart-images
npm run verify:release-data
```

Supabase checks:

```text
npm run supabase:migration:list
```

Run `npm run supabase:db:push` only if a new migration is created or migration list shows a local
pending migration for the linked project.

## Acceptance Criteria

- `npm run test:e2e:production-flow` still proves the full 48 -> 36 -> 24 -> 12 rehearsal.
- The same production-flow run emits Phase 11 projector/mobile/image evidence artifacts.
- All four private CSVs are saved and checked.
- External deployed production-flow mode refuses to run without deployed commit evidence.
- Deployed route probes can prove `/api/e2e/*` returns 404 with no token and with the deployed test
  token.
- Visual evidence proves QR `/room` target, raised QR geometry threshold, no projector overflow,
  local cached chart artwork, and no live third-party chart art URLs.
- Documentation explains how to run local production-flow evidence and external deployed evidence.
- No `.github/workflows/*` files are added.
- Lint, typecheck, unit tests, build, e2e, production-flow validation, and applicable image/data
  checks pass.

## Risks And Mitigations

- Risk: collecting vote-page evidence can claim a player identity before the bulk ballot run.
  Mitigation: use an active player before ballot submission only, close the page immediately, and
  rely on the existing same-username/latest-valid behavior if the later ballot page sees a presence
  warning.
- Risk: stricter projector thresholds can make the current compact QR too small at 720p.
  Mitigation: adjust the compact QR size while keeping the stage rows visible and re-run the visual
  evidence project.
- Risk: external deployed evidence cannot be executed without deployment URL, Supabase secrets, and
  deployed commit metadata.
  Mitigation: make the repo gate support and require those values, document the blocker if the local
  environment does not provide them, and avoid marking external evidence complete unless it actually
  runs.
- Risk: the full production-flow run is slow and can be flaky if visual evidence is added at the
  wrong time.
  Mitigation: capture visual evidence once during Round 1 voting after open and before the 48-player
  ballot worker pool starts.
