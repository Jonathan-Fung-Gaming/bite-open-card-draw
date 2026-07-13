# AGENTS.md - Codex Instructions

## Project

This project is a tournament voting and stage-visualization app for Pump It Up Open Stage.

Read this file before task work:

1. `docs/codex-current-brief.md`

Then follow its read-routing rules. Do not load every long historical planning document by default.

Current active production-readiness remediation work is in:

1. `docs/production-readiness-remediation-plan-2026-07-13.md`
2. `docs/production-readiness-remediation-checklist-2026-07-13.md`

The product spec and repo validation checklist are still the source of truth for final tournament
behavior. If they conflict with older execution-plan text, follow `docs/product-spec.md` and
`docs/pump_open_stage_repo_validation_checklist.md`. Do not change tournament rules unless
explicitly asked.

Treat everything under `docs/archive/` as historical. Do not read archived documents by default.
Use them only when the user explicitly references one or the current brief requires historical
evidence.

## Local command rule

Run shell commands directly. The former command wrapper has been removed.

Examples:

```bash
git status
npm run build
```

## Core tournament rules

The app has 4 rounds. Each round has 2 chart sets:

- Round 1: S16 and S17
- Round 2: S18 and S19
- Round 3: S20 and S21
- Round 4: S22 and D23

Each set draws 7 charts.

Players vote on both sets in one 10-minute voting window.

Players may ban up to 2 charts per set.

A set is complete if the player selects 1-2 bans or explicitly selects `No bans for this set`.

Each set selects the chart with the fewest bans.

Ties for fewest bans are resolved by a server-decided tiebreak, revealed by a 10-second rune-wheel animation.

The final reveal for a round shows the 2 selected charts together.

## Required routes

- `/stage`
- `/room`
- `/vote`
- `/charts`
- `/results`
- `/coolguy69`

## Admin

Admin route is `/coolguy69`.

Admin uses one shared password.

Store only a password hash, not plaintext.

Dangerous actions require password re-entry and a clear action summary.

Use a host lock so only one active host can control the tournament.

The active host never expires automatically. Host ownership persists until the host explicitly
releases it or another authenticated admin performs a password-confirmed, audited forced takeover.
Heartbeat state is a health signal only and must not expire or release host ownership.
If heartbeat is missing, another authenticated admin on another device must be able to use the
forced-takeover flow; heartbeat loss never transfers ownership by itself.

## Player identity

Players select their start.gg username from an alphabetical dropdown.

The label must be:

`Select your start.gg username`

After selection, confirm:

`Are you sure you are voting as [start.gg username]?`

Duplicate active start.gg usernames are not allowed.

## Chart files

Chart CSV is at:

`data/source/charts.csv`

Tournament logo is at:

`public/brand/tournament-logo.png`

## Security rules

Never expose service-role keys, secret keys, session secrets, or password hashes to browser code.

Never commit `.env`, `.env.local`, production secrets, Supabase service keys, Vercel tokens, or plaintext admin passwords.

All tournament-changing actions must go through server-side code.

Server/database state is authoritative.

Do not use browser randomness for tournament decisions.

## Visual rules

Use an original Doom-inspired industrial/rune theme.

Do not use official DOOM assets unless separately licensed or approved.

No reduced-motion toggle should be added.

Avoid extreme strobing and unreadable camera shake.

## Engineering rules

Work one phase at a time.

Do not implement future phases early unless the plan explicitly says to create placeholders.

After every phase, run all available checks:

- lint
- typecheck
- unit tests
- build
- e2e tests, once available

Release-blocking Playwright full-tournament evidence must start Round 1 with 48 active voting
players, remove exactly 12 voting players before each later round, and verify 36, 24, and 12 active
voting players for Rounds 2, 3, and 4.

If a check cannot run because the command does not exist yet, add a note explaining why.

Do not leave TypeScript errors, failing tests, or obvious TODO holes in core tournament logic.

## Mandatory phase workflow

For every code-change request covered by the active parent plan, work one phase at a time. For a
code-change request outside the active parent plan, first create a scoped parent or standalone
change plan and checklist instead of forcing unrelated work into a remediation phase. In either
case, Codex must automatically complete this entire loop:

1. Create a detailed phase-specific plan from the active parent plan, current checklist, product
   spec, validation checklist, security notes, and current repository state. Store it under
   `docs/phase-plans/` with the phase number, subject, and current date.
2. Review the phase plan for missing requirements, unsafe assumptions, tournament-rule conflicts,
   regression risks, security gaps, UX/UI gaps, migration ordering, rollback, and test coverage.
   Amend the plan before implementation.
3. Implement only that phase.
4. Run formatting where applicable, lint, typecheck, unit tests, build, relevant e2e tests, and any
   phase-specific hosted Supabase, load, visual, or accessibility checks.
5. Review the complete code diff for logic errors, race conditions, stale-state behavior, security
   boundary violations, data-loss risk, tournament-rule regressions, accessibility problems, and
   UX/UI regressions. Fix every actionable finding and rerun affected checks.
6. Update the active checklist and `docs/phase-status.md` with changed files, checks, evidence,
   risks, assumptions, and review findings.
7. Commit the intentional phase changes, push the branch, open or update a pull request, wait for
   required checks, address actionable review feedback, and merge automatically once all required
   checks pass and no unresolved blocking feedback remains. Do not merge a failing or incomplete
   phase.
8. After merge, synchronize the local default branch. If the merged phase contains Supabase
   migrations, verify the configured project target is the intended project, then automatically run
   the repository migration push and verify local/remote migration parity and database lint. Never
   guess a project target, expose secrets, or apply a migration to an ambiguous environment. If the
   configured target or credentials are unavailable, stop and report the deployment blocker.

Code that depends on a new migration must remain backward-compatible or disabled until the
post-merge migration succeeds. Each phase plan must document migration order and rollback when
database changes are possible.

## Review rules

Use single-agent manual reviews for this project unless the user explicitly gives different instructions.

When reviewing, compare against `docs/product-spec.md`, not memory.

## Done means

A phase is done only when:

- its acceptance criteria pass
- checks have been run
- changes are summarized
- risks or assumptions are documented
- the repository is ready for the next phase
- its pull request is merged
- required post-merge Supabase migrations, if any, are applied and verified
