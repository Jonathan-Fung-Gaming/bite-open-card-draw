# Production Readiness Remediation - 2026-07-01

This document tracks the fixes for `docs/production-readiness-review-2026-07-01.md`.

## Code Remediation

- Supabase ballot submission now applies deadline advancement before accepting or rejecting a ballot.
- Supabase result computation is handled by `normalized_compute_results`, which locks the voting
  window, reloads authoritative ballots, writes result rows/tiebreaks, updates voting status, and
  audits the compute action in one database transaction.
- `/api/e2e/load-ballot` returns `404` in production regardless of test flags and requires
  `TOURNAMENT_TEST_ROUTE_TOKEN` plus `x-tournament-test-token` outside production.
- Public vote polling no longer returns full submitted-player or eligibility ID arrays; it returns
  aggregate counts plus selected-player ballot lookup state.
- Same-username presence claims are awaited before confirmation and the warning remains visible on
  confirmed ballot screens.
- Rehearsal tiebreak seeding now requires dangerous-action password re-entry and an audit reason.
- Production rate limiting uses the Supabase `normalized_check_rate_limit` RPC; memory mode keeps
  the in-process limiter for local tests/demos.
- Mobile WebKit route coverage can seed its own rehearsal state instead of depending on another
  project, and CI uses `test:e2e:no-build` after its explicit build gate.

## Required Release Evidence

- Apply Supabase migrations through `20260701010000_production_readiness_transactions.sql`.
- Re-run the full local gate suite after this remediation:
  `lint`, `typecheck`, `test`, `build`, `test:e2e`, `test:load`, `import:charts`,
  `cache:chart-images`, `verify:real-chart-images`, `npm audit --omit=dev`, and `git diff --check`.
- Confirm Vercel production uses `TOURNAMENT_STATE_BACKEND=supabase` and the real
  `TOURNAMENT_EVENT_ID`.
- Confirm `TOURNAMENT_TEST_ROUTE_TOKEN` is not configured in production.
- Complete the remaining event/operator release checklist items with evidence before tournament use.
