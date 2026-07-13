# UX/UI Phase 6 Full Regression Evidence And Release Closure Plan - 2026-07-05

Parent plan: `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`.

## Goal

Close the active UX/UI remediation workstream with current evidence at the release commit. Phase 6
is evidence, documentation, and release-closure work; it must not change tournament rules, draw
logic, voting logic, result logic, admin authority, or database schema unless a verification run
finds a real release-blocking defect.

## Source Documents Reviewed

- `docs/codex-current-brief.md`
- `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`
- `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`
- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`
- `docs/release-checklist.md`
- `docs/testing-checklist.md`

## Scope

### UXR checklist closure

- Reconfirm every checked `UXR-*` item has current route, test, or screenshot evidence.
- Keep `UXR-001` open unless a newer deployed production build serves tracked
  `/chart-images/cache/*.png` assets and route evidence proves real cached art renders.
- Check the closure gate only after all remaining `UXR-*` rows are checked or explicitly accepted
  as-is by the user.
- Do not treat historical Phase 11 or Phase 12 evidence as current release evidence unless the
  relevant command is rerun at the current commit or the evidence is explicitly recorded as
  historical context only.

### Browser evidence

- Run local memory-backend UX regression evidence with `npm run test:e2e`.
- Record that this evidence covers:
  - desktop/projector `/stage`,
  - desktop `/coolguy69`,
  - mobile `/room`,
  - mobile `/vote`,
  - mobile `/charts`,
  - mobile `/results`,
  - already-open route freshness after final release, result correction, reset, and round advance.
- Record relevant artifact filenames from Playwright output, including:
  - `pfr-projector-stage-voting.png`,
  - `uxr-phase1-admin-event-day-flow.png`,
  - `uxr-012-mobile-room-awaiting-draw.png`,
  - `pfr-*-mobile-vote-ballot.png`,
  - `uxr-003-*-mobile-charts-set-*.png`,
  - `uxr-019-*-mobile-results-pending.png`,
  - `uxr-009-open-*.png`,
  - `uxr-009-open-route-correction.json`.

### Full production-flow rehearsal

- Run `npm run test:e2e:production-flow:validate` before the full production-flow browser run.
- Run `npm run test:e2e:production-flow` with a disposable Supabase event id from the local
  environment.
- Confirm the production-flow evidence still verifies:
  - Round 1 starts with 48 active voting players,
  - exactly 12 voting players are removed before Round 2, leaving 36,
  - exactly 12 more voting players are removed before Round 3, leaving 24,
  - exactly 12 more voting players are removed before Round 4, leaving 12,
  - active roster counts, eligibility snapshots, public turnout denominators, ballot rows, and
    private CSV rows match the round expectations.
- Record the Phase 11 visual artifact from the production-flow run:
  `phase11-deployed-visual-evidence.json`, plus the stage and mobile screenshot names nested in the
  evidence payload.

### Image and release data verification

- Run `npm run verify:real-chart-images` and `npm run verify:release-data`.
- Confirm local runtime chart image paths point at non-fallback cached assets under
  `public/chart-images/cache`.
- Probe the production URL for a tracked cache PNG before and after merge/deployment. The pre-merge
  probe on 2026-07-05 still returned 404 for
  `/chart-images/cache/00b1031436cec4f071f9713c.png`; this does not close `UXR-001`.
- If the post-merge production probe still returns 404, stop and keep `UXR-001` and the final
  closure gate open.

### Documentation updates

- Add this Phase 6 plan and self-review.
- Update `docs/phase-status.md` with:
  - changed files,
  - checks run,
  - evidence and artifact names,
  - UXR rows closed or intentionally left open,
  - risks and assumptions,
  - manual review against `docs/product-spec.md`,
  - Supabase migration applicability.
- Update `docs/release-checklist.md` only for current evidence that was actually collected. Leave
  deployed/manual/event rows unchecked unless they are verified during this run.
- Update `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md` only after evidence satisfies the
  row or closure-gate requirement.

### Publish, merge, and Supabase follow-up

- Use a feature branch and PR for repository changes.
- Run review and checks before pushing.
- After PR checks are acceptable, merge the PR.
- After merge, run `npm run supabase:migration:list`.
- Run `npm run supabase:db:push` only if the migration list shows pending local migrations or a
  migration was added during this phase. No new Supabase migration is expected for Phase 6.
- After merge/deployment, rerun the production cache PNG probe. If the deployment is not updated or
  still does not serve cache PNGs, document the blocker instead of claiming `UXR-001` closure.

## Execution Steps

1. Preflight the worktree and current live production image state.
2. Add and review this Phase 6 plan.
3. Run focused source/data verification:
   - `npm run verify:real-chart-images`
   - `npm run verify:release-data`
4. Run required quality gates:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
   - `git diff --check`
5. Run browser evidence:
   - `npm run test:e2e`
   - `npm run test:e2e:production-flow:validate`
   - `npm run test:e2e:production-flow`
6. Run release-supporting checks where available and not already covered:
   - `npm run test:load`
   - `npm run test:load:player-routes`
   - `npm audit --omit=dev`
   - `npm run supabase:migration:list`
7. Update `docs/phase-status.md`, `docs/release-checklist.md`, and the UX/UI checklist according to
   the evidence actually collected.
8. Review the final diff against product and security rules.
9. Commit, push, open a PR, check PR status, and merge only if review and checks pass.
10. After merge, rerun Supabase migration verification and apply pending migrations only if needed.
11. After the production deployment is updated, rerun the live cache probe and record whether
    `UXR-001` can close or remains blocked by deployment artifacts.

## Non-Goals

- No tournament rule changes.
- No new routes or route purpose changes.
- No changes to draw randomness, tiebreak selection, vote validity, timer authority, roster
  eligibility, host lock enforcement, dangerous-action requirements, or final reveal sequencing.
- No new public live chart counts or public admin data.
- No new secrets, committed environment files, service-role exposure, or client-side tournament
  mutation paths.
- No Supabase migration unless verification discovers an actual schema/RPC gap.

## Plan Review

- The plan is scoped to Phase 6 evidence closure and does not implement future behavior.
- The plan uses `docs/product-spec.md` and
  `docs/pump_open_stage_repo_validation_checklist.md` as the tournament behavior source of truth.
- The plan keeps `UXR-001` evidence-gated because current production still returns 404 for a tracked
  cache PNG. It does not pre-check the item on intent or local evidence alone.
- The planned full production-flow command is the release-blocking path, not the older diagnostic
  Supabase-dev full profile.
- The plan preserves the security boundary: production-flow uses a disposable event namespace, test
  routes are disabled, memory backend fallback is rejected, and no secrets are recorded in docs.
- Supabase migrations are expected to be verification-only for this phase because no schema or RPC
  changes are planned.
