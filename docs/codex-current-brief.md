# Codex Current Brief

This is the default first document for Codex work in this repository. Read this file before
task work, then follow the routing rules below instead of loading every long planning document.

## Current Active Workstream

The active remediation workstream is:

- Plan: `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`
- Checklist: `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`

Use the active plan one phase at a time. Use the checklist to decide which `UXR-*` issues can be
closed. Do not use older remediation plans, older UX/UI audits, or historical phase plans as current
instructions unless the user explicitly references them.

## Source Of Truth Order

1. `docs/product-spec.md` - tournament behavior, routes, voting, draw, result, admin, and security
   requirements.
2. `docs/pump_open_stage_repo_validation_checklist.md` - final behavior validation and release
   blocking evidence requirements.
3. `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md` - current active UX/UI
   remediation phase plan.
4. `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md` - current active UX/UI issue closure
   checklist.
5. `docs/phase-gates.md` - phase completion gates and required checks.
6. `docs/security-notes.md` - secrets, Supabase, admin, host lock, dangerous actions, and mutation
   boundary rules.

If documents conflict, follow `docs/product-spec.md` and
`docs/pump_open_stage_repo_validation_checklist.md` for tournament behavior.

## Read Routing

Always read this file first.

For UX/UI remediation phase work, read:

- the relevant phase section in `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`,
- the matching checklist rows in `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`,
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

Do not read these by default:

- `docs/codex-execution-plan.md`,
- older `docs/phase-*-plan-*.md` files outside the active UX/UI remediation plan,
- older production-readiness or comprehensive-remediation plans,
- older UX/UI audit plans and checklists.

Those files are historical unless the user explicitly asks for them or the current active plan routes
to them.

## Phase Working Rules

- Work one phase at a time.
- Do not implement future phases early unless the active plan explicitly says to create placeholders.
- Close checklist items only with route evidence, automated tests, screenshots, or an explicit user
  decision.
- After each phase, run available checks: lint, typecheck, unit tests, build, and e2e tests when
  relevant.
- Record changed files, checks, evidence, risks, and assumptions in `docs/phase-status.md`.
- Do not change tournament rules unless explicitly asked.
