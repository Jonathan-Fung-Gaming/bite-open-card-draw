# Phase 9 Real Supabase And Load Confidence Plan - 2026-07-03

Status: execution plan.

Parent plan: `docs/production-readiness-remediation-plan-2026-07-03.md`.

Authoritative behavior sources:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Scope

This phase covers production-readiness remediation Phase 9, not the older
execution-plan Phase 9. The target issues are:

- `PRC-009`: production-critical SQL/RPC behavior needs real database coverage,
  not only fake clients or migration source assertions.
- `PRC-014`: load evidence must clearly separate API-injection coverage from
  normal player-route coverage.
- `PRC-030`: the private CSV test-only route needs explicit route-level security
  coverage and later deployed probes.

## Non-Goals

- Do not run or rewrite the release-blocking full production-flow rehearsal in
  this phase. That is Phase 11 and must prove 48 -> 36 -> 24 -> 12 active voting
  players.
- Do not change tournament rules, result computation, tiebreak behavior, roster
  rules, admin password policy, or public route semantics.
- Do not add GitHub Actions or new CI workflow behavior here.
- Do not use a real tournament event namespace for test data.

## Execution Workstreams

### 1. Supabase Invariant Evidence

Add a focused Supabase-only Playwright spec that is included in
`npm run test:phase9:supabase-dev` and skipped in memory-only smoke runs.

The spec should verify, against a configured disposable Supabase target:

- `normalized_database_time()` is callable by the service-role client.
- Required runtime tables can be queried with `event_id` scoping.
- Critical tournament-changing RPCs are unavailable through the anon client.
- The latest migration set has reached the target well enough for the required
  runtime tables and RPCs to execute.
- The disposable event id is present and guarded by the existing runner checks.

This spec may write only inside the configured disposable event namespace and
only when the existing Supabase runner guard has required
`E2E_ALLOW_DESTRUCTIVE_RESET=true`.

### 2. Supabase Write And Concurrency Evidence

Add focused Supabase-dev coverage for production-critical write paths:

- concurrent ballot submissions through the guarded non-production load-ballot
  route against the Supabase backend
- concurrent `normalized_compute_results` service-role RPC calls after voting is
  closed, proving the database serializes result computation to one durable
  result snapshot
- final database reconciliation that verifies submitted ballots, ballot choices,
  result rows, and selected rows are event-scoped and internally consistent

This is not release-flow evidence. It is a targeted database confidence check
for Phase 9.

### 3. Supabase Rehearsal Coverage Mapping

Keep the hosted one-round smoke and host-lock evidence separate from the later
full production-flow rehearsal:

- `test:phase9:supabase-dev` remains the disposable Supabase smoke/evidence
  command for this phase.
- Host-lock/takeover evidence remains focused Phase 9 database-invariant
  evidence against the production `tournament-host` row and should not be
  treated as production-flow attrition evidence.
- Host-lock acceptance for this phase must cover one current event-scoped lock,
  non-owner read-only semantics by ownership comparison, heartbeat persistence,
  expiry replacement, and forced takeover ownership changes.
- The manual hosted guide should identify Phase 9 evidence requirements in terms
  of `PRC-009`, `PRC-014`, and `PRC-030`, not older comprehensive-review issue
  names only.

### 4. Load Profile Separation

Split load evidence into two non-overlapping Playwright profiles:

- `@api-injection`: a 100-player API-injection load check that keeps public
  routes active and verifies the final private CSV. This is load-oriented API
  evidence, not proof that players can use the phone route.
- `@player-route`: a normal route-player check using `/room -> /vote` submissions
  plus spectator/view-only traffic on `/room`, `/charts`, and `/results`. This is
  route evidence, not the 100-player API pressure profile.

Both profiles should write explicit JSON evidence that labels:

- profile type
- player count
- route-player count
- API-injection count
- spectator paths
- CSV row count and submitted count

The runner should reject ambiguous load invocations that select both profiles or
neither profile.

### 5. Private CSV Route Security

Keep the existing route-handler tests as the Phase 9 route-level PRC-030 gate:

- production semantics return 404 with and without token
- Vercel production semantics return 404 with and without token
- missing token is denied outside production
- non-final reveal is denied
- safe non-production rehearsal export is allowed only after final reveal

Later deployed route probes remain Phase 11 work because the e2e route files
still ship in the app tree.

### 6. Documentation And Status

Update `docs/phase-status.md` after implementation with:

- changed files
- checks run and their results
- Supabase migration applicability
- risks and assumptions
- manual review against `docs/product-spec.md`

Update checklist or guide documentation only where it improves Phase 9 evidence
traceability. Do not mark hosted evidence complete unless the command actually
runs against disposable Supabase.

## Acceptance Mapping

| Phase 9 acceptance criterion                                                               | Planned evidence                                                                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Critical Supabase invariants have real DB coverage or explicit hosted disposable evidence. | Supabase-only invariant/concurrency/host-lock spec plus hosted one-round smoke.                   |
| Load evidence labels API-injection versus route-player behavior.                           | Separate `@api-injection` and `@player-route` tests and evidence JSON.                           |
| Private CSV route security is covered at route level and later by deployed probes.         | Existing route tests remain in `npm run test`; Phase 11 deployed probes stay documented.     |

## Verification Commands

Focused checks:

```text
npm run test -- src/app/api/e2e/private-csv/route.test.ts
npm run test:load:api-injection
npm run test:load:player-routes
npm run test:phase9:supabase-dev
```

Project gates:

```text
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

Run `npm run test:phase9:supabase-dev` only with an explicit disposable
Supabase event id and the required Supabase environment variables. If that
environment is unavailable, record the validation failure rather than weakening
the guard.

## Risks And Controls

- Hosted Supabase checks require service-role configuration. The runner must
  continue failing before browser execution when the disposable event id or
  destructive reset opt-in is missing.
- API-injection load is useful pressure evidence but cannot stand in for normal
  player-route evidence.
- Route-player load should stay smaller than the 100-player API profile unless
  the browser runtime is explicitly being load tested.
- Test-only routes remain in the app tree. Route guards and unit tests reduce
  risk, but deployed 404 probes are still required later.
- No Supabase migration is expected for this phase unless the implementation
  uncovers a real database behavior gap.
