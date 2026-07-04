# AGENTS.md - Codex Instructions

## Project

This project is a tournament voting and stage-visualization app for Pump It Up Open Stage.

Read this file before task work:

1. `docs/codex-current-brief.md`

Then follow its read-routing rules. Do not load every long historical planning document by default.

Current active remediation work is in:

1. `docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`
2. `docs/ux-ui-tournament-readiness-checklist-2026-07-05.md`

The product spec and repo validation checklist are still the source of truth for final tournament
behavior. If they conflict with older execution-plan text, follow `docs/product-spec.md` and
`docs/pump_open_stage_repo_validation_checklist.md`. Do not change tournament rules unless
explicitly asked.

Treat `docs/codex-execution-plan.md`, older phase plans, and older remediation/audit docs as
historical unless the user explicitly references them or `docs/codex-current-brief.md` routes there.

## Local command rule

Prefix shell commands with `rtk`.

Examples:

```bash
rtk git status
rtk npm run build
```

Use `rtk proxy <cmd>` when raw command output is needed.

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

Ties for fewest bans are resolved by a server-decided tiebreak, revealed by a 5-second rune-wheel animation.

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
