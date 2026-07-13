# Phase 12 Release Metadata Closure Plan - 2026-07-04

Status: reviewed plan, ready for execution.

Source plan: `docs/production-readiness-remediation-plan-2026-07-03.md`, Phase 12.

Authoritative behavior sources:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Scope

Phase 12 closes the release metadata and source-stability work for PRC-008 and PRC-036. It must tie
final evidence to the current source branch, commit lineage, backend, environment, generated data
artifacts, image cache artifacts, Playwright evidence paths, and release checklist state.

This is also the first phase where `.github/workflows/*` is allowed. The original execution plan and
validation checklist require GitHub Actions to remain absent before Phase 12 and to be created in
the final phase, so Phase 12 includes a stable CI workflow that runs only local source gates and does
not require production secrets.

## Non-Goals

- Do not change tournament rules, voting behavior, draw logic, result logic, or admin password
  policy.
- Do not check off deployment, manual QR scan, real event roster, or Vercel environment rows without
  current evidence.
- Do not commit secrets, `.env`, `.env.local`, service-role keys, admin plaintext passwords,
  session secrets, Vercel tokens, or Supabase project secrets.
- Do not run migrations against the real event namespace unless a local migration check shows
  pending migrations and the target has been confirmed.

## Constraints

- A tracked file cannot permanently contain the hash of the same final commit that changes it. Any
  literal final source or merge commit must be recorded after merge in PR/release evidence, or in a
  later metadata-only commit that intentionally changes the release commit again.
- Deployed commit evidence requires a deployed URL or deployment system metadata. If unavailable,
  the release checklist must keep the deployed rows open and state the blocker.
- Manual venue-distance QR evidence requires real devices and venue conditions. Automated geometry
  evidence does not replace that manual signoff.

## Execution Plan

1. Baseline source state.
   - Record the pre-Phase-12 base commit and branch.
   - Confirm the worktree is clean before edits.
   - Confirm latest local Supabase migration filename.

2. Final CI workflow.
   - Add `.github/workflows/ci.yml`.
   - Run on pull requests and pushes to `main`.
   - Use Node 22 and `npm ci`.
   - Run stable source gates: `npm run lint`, `npm run typecheck`, `npm run test`, and
     `npm run build`.
   - Exclude production-flow, Supabase, load, chart image cache, migration push, and e2e gates from
     default CI because those require disposable backend configuration, browsers, external network,
     or release artifact handling.
   - Update `src/lib/server/ci-workflow.test.ts` so it validates the Phase 12 workflow instead of
     asserting workflow absence.

3. Release metadata documentation.
   - Update `docs/release-checklist.md` with a Phase 12 metadata closure record.
   - Keep external, deployed, real-roster, venue, and operator-only rows unchecked unless evidence
     exists during this run.
   - Record current generated-data identities:
     - source CSV SHA
     - chart import report SHA
     - imported catalog SHA
     - runtime catalog SHA
     - image manifest SHA
     - public PNG cache count and byte total
   - Document that final source and deployed commits must be attached after merge/deploy.
   - Update `docs/asset-audit.md` placeholders where current source evidence is available, while
     keeping deployed route evidence open if no deployed run is performed.

4. Phase status and issue checklist.
   - Add a Phase 12 section to `docs/phase-status.md`.
   - Summarize changed files, commands, risks, assumptions, and manual review.
   - Update production-readiness review notes for PRC-008 and PRC-036 to reflect Phase 12 progress
     without overstating event readiness.

5. Verification gates.
   - Run focused tests for the CI workflow and release documentation if practical.
   - Run project gates:
     - `npm run lint`
     - `npm run typecheck`
     - `npm run test`
     - `npm run build`
   - Run release data gates:
     - `npm run verify:real-chart-images`
     - `npm run verify:release-data`
     - `git diff --check`
   - Run broader browser/release gates when feasible in this environment:
     - `npm run test:e2e`
     - `npm run test:phase9`
     - `npm run test:e2e:production-flow:validate`
   - Run full production-flow and load gates only if the linked disposable Supabase environment is
     available and the time budget permits.

6. Manual review.
   - Review the diff against `docs/product-spec.md` and
     `docs/pump_open_stage_repo_validation_checklist.md`.
   - Confirm no tournament logic changed.
   - Confirm no workflow or docs expose secrets.
   - Confirm release checklist rows distinguish current automated evidence from pending external
     evidence.

7. Publish and merge.
   - Inspect `git status` and `git diff`.
   - Commit the Phase 12 closure changes on a branch.
   - Push the branch.
   - Open a PR with validation results and open external evidence items.
   - Merge only after local review passes and remote checks are acceptable.

8. Supabase migrations after merge.
   - Re-check migration status after merge with `npm run supabase:migration:list`.
   - If local migrations are pending remotely, run `npm run supabase:db:push`.
   - If no migration was added in Phase 12 and local/remote are already aligned, record that no
     migration push was applicable.

## Plan Review

- Product rule review: This plan is metadata, documentation, and CI-only. It does not alter the
  four-round structure, two chart sets per round, seven-chart draws, one voting window, explicit
  no-ban completion, least-ban results, server-decided tiebreaks, or final two-chart reveal.
- Security review: The CI workflow intentionally avoids production Supabase secrets and migration
  pushes. Release docs keep secret values out of source and continue to require `.env` and
  `.env.local` to remain untracked.
- Release evidence review: Current local evidence can be recorded in repo docs. Deployed commit,
  Vercel environment, real event namespace, real roster, and venue-distance QR evidence must remain
  unchecked unless current external evidence is supplied.
- CI review: Adding `.github/workflows/ci.yml` is allowed only because this is Phase 12. The workflow
  should be small, stable, and source-only; full production-flow and Supabase gates remain explicit
  release commands rather than default pull request checks.
- Risk review: The largest risk is overstating readiness. The implementation must make incomplete
  external gates visible instead of marking them complete.
