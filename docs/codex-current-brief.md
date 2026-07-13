# Codex Current Brief

This is the default first document for Codex work in this repository. Read this file before
task work, then follow the routing rules below instead of loading every long planning document.

## Current Active Workstream

The active production-readiness remediation workstream is:

- Plan: `docs/production-readiness-remediation-plan-2026-07-13.md`
- Checklist: `docs/production-readiness-remediation-checklist-2026-07-13.md`

Use the active plan one phase at a time. Use its `PRR-*` checklist rows for closure. Before every
implementation phase, create and self-review the required detailed phase plan under
`docs/phase-plans/`. Do not use documents under `docs/archive/` as current instructions unless the
user explicitly references them.

For a future code-change request outside this workstream, create a scoped plan and checklist first,
then apply the same plan-review, implementation, diff-review, PR merge, and post-merge migration
workflow required by `AGENTS.md`.

## Source Of Truth Order

1. `docs/product-spec.md` - tournament behavior, routes, voting, draw, result, admin, and security
   requirements.
2. `docs/pump_open_stage_repo_validation_checklist.md` - final behavior validation and release
   blocking evidence requirements.
3. `docs/production-readiness-remediation-plan-2026-07-13.md` - current active remediation phases
   and mandatory delivery workflow.
4. `docs/production-readiness-remediation-checklist-2026-07-13.md` - current issue and phase closure
   checklist.
5. `docs/phase-gates.md` - phase completion gates and required checks.
6. `docs/security-notes.md` - secrets, Supabase, admin, host lock, dangerous actions, and mutation
   boundary rules.

If documents conflict, follow `docs/product-spec.md` and
`docs/pump_open_stage_repo_validation_checklist.md` for tournament behavior.

## Read Routing

Always read this file first.

For production-readiness remediation phase work, read:

- the relevant phase in `docs/production-readiness-remediation-plan-2026-07-13.md`,
- the matching rows in `docs/production-readiness-remediation-checklist-2026-07-13.md`,
- the phase-specific plan created under `docs/phase-plans/`,
- `docs/phase-gates.md` before closing the phase.

Read `docs/product-spec.md` when changing or reviewing:

- tournament rules,
- voting behavior,
- draw, reroll, result, or tiebreak logic,
- player identity,
- public route behavior,
- admin behavior that can change tournament state.

Read `docs/security-notes.md` when changing or reviewing:

- admin actions,
- authentication, sessions, passwords, host lock, or dangerous actions,
- Supabase/server code,
- environment variables, secrets, migrations, or mutation boundaries.

Read `docs/pump_open_stage_repo_validation_checklist.md` when:

- validating final behavior,
- preparing release-blocking evidence,
- changing acceptance criteria,
- checking the 48 -> 36 -> 24 -> 12 full-tournament Playwright requirement.

Read `docs/phase-status.md` only when:

- adding phase completion notes,
- checking what evidence was already recorded,
- investigating historical context after current docs are insufficient.

Do not read `docs/archive/` by default. It contains superseded execution plans, phase plans,
remediation checklists, reviews, audits, and handovers retained only for historical evidence.

## Phase Working Rules

- Work one phase at a time.
- Do not implement future phases early unless the active plan explicitly says to create placeholders.
- Close checklist items only with route evidence, automated tests, screenshots, or an explicit user
  decision.
- After each phase, run available checks: lint, typecheck, unit tests, build, and e2e tests when
  relevant.
- Record changed files, checks, evidence, risks, and assumptions in `docs/phase-status.md`.
- Do not change tournament rules unless explicitly asked.
- Self-review every phase plan before implementation and every complete diff before delivery.
- After a phase passes, commit, push, open/update a PR, merge automatically after required checks,
  and apply/verify any merged Supabase migrations against the unambiguous configured project.
