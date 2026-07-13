# Implementation Plan

This project follows `docs/codex-execution-plan.md` one phase at a time.

## Phase Order

1. Project scaffold, docs, and route skeleton
2. Database schema and server foundation
3. Chart import, normalization, image caching, and exclusions
4. Admin authentication, host lock, and roster management
5. Chart draw engine and reroll controls
6. Stage display and draw visualization
7. Player room, view-only mode, and ballot flow
8. Voting window, timer logic, pause, turnout, and manual ballots
9. Results computation, rune-wheel tiebreak, final reveal, and CSV export
10. Testing, edge cases, and review hardening
11. Deployment readiness and rehearsal tooling
12. Final polish, runbook verification, and release checklist

## Phase 1 Scope

Phase 1 establishes the app shell only:

- Next.js App Router scaffold
- Required routes
- Shared visual components
- Locked tournament constants
- Baseline docs
- Placeholder unit tests

Database state, mutations, chart import, admin auth, draw logic, voting logic, and result
computation begin in later phases.

## Quality Gates

After each phase, run available checks:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run build`

The Phase 1 `test:e2e` script is a placeholder that reports no end-to-end tests exist yet.
