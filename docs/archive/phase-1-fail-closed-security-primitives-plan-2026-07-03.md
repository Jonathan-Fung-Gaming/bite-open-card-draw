# Phase 1 Fail-Closed Security Primitives Plan - 2026-07-03

Source plan: `docs/production-readiness-remediation-plan-2026-07-03.md`.

Authoritative behavior sources:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Goal

Close the Phase 1 production-readiness risks without changing tournament rules,
operator workflows, draw behavior, ballot behavior, or result behavior.

This phase is limited to fail-closed security primitives around test-only
surfaces, cookie security, authoritative database time, and secret-boundary
coverage.

## Scope

Phase 1 covers:

- PRC-006: test-only service-role routes must fail closed under production
  deployment semantics.
- PRC-030: `/api/e2e/private-csv` needs behavioral security tests.
- PRC-031: authoritative database-time helper needs direct boundary tests.
- PRC-032: admin and host cookies must be `Secure` in production deployment
  environments.
- PRC-034: test-only API routes still ship in the app tree, so route guards
  must be strict now and deployed route probes remain later evidence.

Phase 1 does not cover:

- Future draw correctness.
- Durable timer persistence.
- Supabase emergency workflows.
- Audit persistence, exclusion uniqueness, host-lock release on inactivity.
- Production-flow Playwright rehearsal changes.
- GitHub Actions or CI workflow creation.

## Implementation Plan

1. Centralize production deployment semantics.
   - Use the existing server-only `isProductionDeploymentEnv` helper from
     `src/lib/server/env.ts`.
   - Add a small e2e-route availability helper in server-only code so both test
     routes share the same production and token policy.
   - Treat either `NODE_ENV=production` or `VERCEL_ENV=production` as
     production.

2. Apply the shared helper to test-only routes.
   - Update `src/app/api/e2e/load-ballot/route.ts`.
   - Update `src/app/api/e2e/private-csv/route.ts`.
   - Preserve current non-production token behavior.
   - Preserve current rehearsal/memory backend allow-list semantics.
   - Return `404` for unavailable test routes so route probing does not reveal
     a service-role capable surface.

3. Apply the shared helper to adjacent Phase 1 production safety checks found
   during review.
   - Ensure rehearsal/admin test controls do not treat `VERCEL_ENV=production`
     as local development.
   - Ensure production deployment semantics reject non-Supabase runtime backend
     configuration.

4. Fix production cookie detection.
   - Update `src/lib/server/admin-auth.ts` to derive secure-cookie behavior
     from `isProductionDeploymentEnv`.
   - Cover both admin session and host token cookies because both share the
     same cookie option builder.

5. Add route-level behavioral tests.
   - Extend `/api/e2e/load-ballot` tests so `VERCEL_ENV=production` blocks the
     route even when `NODE_ENV=development`, a token is present, and test flags
     are enabled.
   - Add `/api/e2e/load-ballot` production-without-token coverage.
   - Add `/api/e2e/private-csv` route tests for:
     - `NODE_ENV=production` with token returns 404.
     - `NODE_ENV=production` without token returns 404.
     - `VERCEL_ENV=production` with `NODE_ENV=development` and token returns
       404.
     - `VERCEL_ENV=production` with `NODE_ENV=development` and without token
       returns 404.
     - missing token outside production returns 404.
     - non-final reveal outside production returns 409.
     - final reveal under explicit safe non-production memory test
       configuration returns CSV JSON.

6. Add authoritative clock tests.
   - Add direct tests for `src/lib/server/authoritative-clock.ts`.
   - Verify memory mode uses local time without calling Supabase.
   - Verify Supabase mode calls `normalized_database_time`.
   - Verify an RPC error throws.
   - Verify a null or invalid timestamp throws.

7. Add admin cookie tests.
   - Add focused tests for `src/lib/server/admin-auth.ts`.
   - Mock Next cookies and headers.
   - Verify admin session cookies and host token cookies are `Secure` when
     `VERCEL_ENV=production`, even if `NODE_ENV` is not production.
   - Verify non-production cookies are not forced secure.

8. Update source-based security-boundary tests.
   - Keep the browser bundle secret-name checks.
   - Update the e2e route hard-disable assertion to require the centralized
     production helper and private test token header, rather than a literal
     `process.env.NODE_ENV === "production"` string.

9. Document completion.
   - Update `docs/phase-status.md` with changed files, checks run, risks, and
     any remaining assumptions.
   - Mark PRC-034 as guarded but not fully closed by code alone because the
     later deployed route probe remains required.

## Acceptance Mapping

| Acceptance criterion | Planned evidence |
| --- | --- |
| Test-only routes return 404 when `VERCEL_ENV=production`, even with token and flags | `src/app/api/e2e/load-ballot/route.test.ts`, `src/app/api/e2e/private-csv/route.test.ts` |
| Test-only routes return 404 in production without a token | `src/app/api/e2e/load-ballot/route.test.ts`, `src/app/api/e2e/private-csv/route.test.ts` |
| Admin and host cookies are `Secure` in production deployment environments | `src/lib/server/admin-auth.test.ts` |
| Database-time helper fails closed on RPC error or invalid timestamp | `src/lib/server/authoritative-clock.test.ts` |
| Supabase mode calls `normalized_database_time` | `src/lib/server/authoritative-clock.test.ts` |
| No browser bundle imports service-role keys, password hashes, or session secrets | `src/lib/server/security-boundary.test.ts` |
| E2E routes stay unavailable rather than exposing service-role behavior in production | Route tests plus source-boundary test |

## Review Checklist

Before implementation:

- Confirm the plan changes no tournament rules.
- Confirm no client component imports server-only helpers.
- Confirm the route behavior remains useful for explicit non-production e2e and
  memory rehearsal scenarios.
- Confirm route denial uses 404, not 401 or 403, for unavailable test surfaces.

After implementation:

- Inspect the diff for accidental secret exposure.
- Confirm all Phase 1 cookie/test-route production checks use the centralized
  helper.
- Confirm no `.github/workflows/*` files were created.
- Confirm focused tests pass before full lint/typecheck/test/e2e/build.
- Confirm `docs/phase-status.md` records risks and assumptions.

## Risks And Assumptions

- Keeping e2e route files in the app tree means PRC-034 still needs later
  deployed route probes. This phase makes the handlers fail closed but does not
  remove the route modules.
- The private CSV route remains a test-only helper; normal admin CSV export
  behavior is unchanged.
- The authoritative clock change should be test-only unless tests reveal that
  the current helper already fails closed correctly.
- Secure cookies in `VERCEL_ENV=production` can make production-preview-like
  environments require HTTPS. That is intended for production deployment
  semantics.
