# Production Readiness Phase 0 - Reproduction, Contracts, And Diagnostics Plan - 2026-07-13

Parent plan: `docs/production-readiness-remediation-plan-2026-07-13.md`
Checklist: `docs/production-readiness-remediation-checklist-2026-07-13.md`
Phase: 0 only

## Goal

Turn PRR-001 through PRR-013 into isolated, measurable reproductions or deterministic source
traces without changing tournament behavior. Capture a sanitized baseline for the persistence,
timing, roster, loading, and narrow-screen failures that later phases must close.

## Source-Of-Truth Review

- `docs/product-spec.md` controls tournament behavior, player identity, voting, result, host-lock,
  roster, and route requirements.
- `docs/pump_open_stage_repo_validation_checklist.md` controls validation expectations, including
  the release-blocking 48 -> 36 -> 24 -> 12 rehearsal.
- `docs/security-notes.md` controls secrets, server-only mutation boundaries, disposable test data,
  and host recovery.
- `docs/admin-action-policy.md` controls password re-entry, host-lock, and audit requirements.
- `docs/phase-gates.md` controls closure checks and manual product-spec review.

No tournament decision is changed in Phase 0. The diagnostic suite observes current behavior and
records later-phase contracts; it does not weaken assertions already protecting product rules.

## Repository Baseline

- The current Playwright runner already rejects hosted event ids that do not begin with `e2e-`,
  `phase9-`, `load-`, or `rehearsal-`, and requires an explicit destructive-reset opt-in.
- Hosted Supabase credentials are available locally without being committed. Evidence must never
  serialize their values.
- Existing page objects and rehearsal flows cover draw, voting, tiebreak, reveal, roster, host-lock,
  and public-route states, but no single Phase 0 artifact ties all PRR items to a reproduction,
  measurable closure contract, or sanitized baseline.
- Existing evidence helpers write screenshots and JSON under Playwright output directories. Phase
  0 will reuse that mechanism and commit only a human-readable sanitized summary.

## Scope

### 1. Diagnostic Contract And Safety Layer

- Add a Phase 0 Playwright diagnostic spec that is opt-in and tagged separately from the default
  smoke suite.
- Require the Supabase backend and an explicit disposable event id before any hosted diagnostic
  starts.
- Generate the run event id at command time with a `phase0-` prefix; do not reuse the configured
  production tournament event id.
- Capture only an allowlist of diagnostic fields: round number, draw ids and versions, voting
  status/deadline, result id/phase, freshness generation, HTTP method/path/status/sequence,
  anonymous timing samples, geometry, and aggregate roster counts/latencies.
- Reject evidence objects containing keys or values associated with usernames, cookies, passwords,
  session/host tokens, service keys, hashes, authorization headers, or raw request/response bodies.
- Sanitize browser/server failures to route, status, error class, and RSC digest when present.
  Never attach console arguments, headers, cookies, POST bodies, stack-local secrets, or full HTML.

### 2. Hosted Persistence Reproduction

Using the disposable namespace and existing admin/rehearsal actions:

- draw both sets, open voting, reroll after voting opens, then restart voting;
- drive Set 1 and Set 2 through result/tiebreak transitions and confirm the stage reveal;
- capture public-route response ordering around mutations;
- capture the allowlisted state before and after each transition;
- perform 30 rapid roster status changes, record per-action confirmation latency, p50, p95, total
  workflow duration, and second-client propagation;
- simulate operation beyond the old 30-minute boundary by aging only disposable host/session
  timestamps or using the existing accelerated clock seams, then verify ownership remains explicit
  and recovery/takeover remains password-confirmed and audited;
- sample stage and phone countdowns from the same voting deadline and record their skew.

The diagnostic is allowed to report an observed defect while still passing if collection itself is
successful. Later-phase acceptance thresholds remain explicit in the contract matrix and are not
silently converted into Phase 0 failures.

### 3. Visual And Responsive Baseline

In the memory rehearsal profile, where rendering is deterministic and no database write is needed:

- record tournament-logo and container boxes at the earliest observable frame, after image load,
  and after layout settles; include layout-shift entries attributable to the logo subtree;
- record `/charts`, the native username select on `/vote`, and `/results` at widths 320, 360, and
  390 pixels;
- capture viewport, bounding boxes, scroll dimensions, overflow, font sizes, and screenshots;
- keep the exact player-identity label and native-select semantics as assertions.

### 4. PRR Evidence And Later-Phase Test Matrix

Create a dated Phase 0 report with one row for PRR-001 through PRR-013. Each row must include:

- reproduction or deterministic source trace;
- current observed behavior;
- measurable closure criteria copied or narrowed from the active checklist;
- planned unit, integration, hosted Supabase, and Playwright evidence;
- owning later phase;
- evidence artifact or source path.

The report must distinguish measured observations from source-based inferences and must not mark a
later-phase remediation item complete.

## Implementation Boundaries

- Do not change application behavior, database schema, tournament rules, refresh cadence, session
  policy, or UI in Phase 0.
- Do not add a production route, public diagnostic endpoint, client secret, or browser mutation
  authority.
- Do not commit `.env.local`, raw Playwright traces, raw server logs, or hosted database dumps.
- Do not run diagnostics against an ambiguous or non-disposable event id.
- Keep diagnostics serial because they mutate one disposable event namespace.
- Use aggregate player labels/counts in committed evidence; do not record roster usernames.

## Acceptance And Checks

- PRR-001 through PRR-013 each have a reproduction or deterministic source trace.
- Every PRR row has measurable closure criteria and planned evidence.
- Hosted evidence proves the event id passed the disposable-prefix guard and differs from the
  normal configured event id.
- Sanitization tests prove prohibited keys/values cannot enter JSON evidence.
- Roster latency, 30-action duration, second-client propagation, countdown skew, logo early-frame,
  layout-shift, and 320/360/390 route geometry baselines are recorded.
- RSC/public-route diagnostics contain no usernames, cookies, passwords, tokens, hashes, secrets,
  headers, bodies, or full HTML.
- Formatting/checks: `npx prettier --check` for changed supported files,
  `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, targeted
  memory diagnostics, targeted hosted diagnostics, and the relevant default e2e suite.
- Run `git diff --check` and scan changed files/artifacts for secret-like strings.
- Review the complete diff against `docs/product-spec.md`, security notes, responsive/accessibility
  requirements, stale-state risks, and data-loss risks.

## Evidence Recording

- Store ephemeral JSON/screenshots under Playwright's ignored test-results directory.
- Record the exact commands, pass/fail result, event-id prefix only, aggregate metrics, artifact
  names, review findings, risks, and assumptions in the dated Phase 0 report and
  `docs/phase-status.md`.
- Mark Phase 0 checklist rows `[x]` only after their evidence exists. The PR-merged row is updated
  after merge evidence exists; if that final update cannot be part of the merged commit, record the
  merge URL in `docs/phase-status.md` on the synchronized default branch only when repository policy
  permits a follow-up documentation PR.

## Migration, Rollout, Rollback

- Database migration: not applicable. Phase 0 adds diagnostics and documentation only.
- Rollout: opt-in test files and documentation have no production runtime effect.
- Rollback: revert the Phase 0 diagnostic/report commits. The disposable hosted event namespace may
  be retained for audit evidence or deleted later with an explicitly targeted cleanup; it is never
  reused as the real tournament namespace.

## Plan Self-Review And Amendments

The plan was reviewed before implementation for missing requirements, unsafe assumptions,
tournament conflicts, regression risk, security, concurrency, data loss, migration order,
rollback, accessibility, responsive UX, and test coverage. The following amendments were applied:

- Added an evidence allowlist plus a negative sanitization test instead of relying on prose-only
  log hygiene.
- Added a hard requirement that the generated `phase0-` event id differ from the normally configured
  event id, preventing accidental writes even when local configuration points elsewhere.
- Kept hosted tests serial to avoid races in shared event state.
- Used accelerated timestamp seams for the old 30-minute host boundary so Phase 0 does not require
  a 35-minute wall-clock wait while still exercising authoritative stored time.
- Separated deterministic memory visual capture from hosted persistence capture to reduce hosted
  data churn without weakening the persistence reproductions.
- Explicitly prohibited full response bodies, console payloads, headers, HTML, and raw database
  dumps because key-name filtering alone would not prevent sensitive values from leaking.
- Added second-client roster propagation and public response ordering, which were easy to omit if
  only mutation latency were measured.
- Documented that no migration exists and that application logic must remain untouched.

No unresolved plan-review finding blocks implementation.
