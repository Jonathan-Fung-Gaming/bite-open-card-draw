# Phase 0 Readiness Report

## File Checklist

| Item | Status | Notes |
|---|---|---|
| `AGENTS.md` | PASS | Repository instructions exist. |
| `README.md` | PASS | Phase 0 project README exists. |
| `docs/product-spec.md` | PASS | Product spec exists and is the source of truth. |
| `docs/codex-execution-plan.md` | PASS | Copied from `codex_pump_open_stage_execution_plan_phase12_ci.md`; contains no Phase 0 implementation phase and starts implementation at Phase 1. |
| `docs/decision-log.md` | PASS | Locked decisions exist and match the product spec after confirmation-text cleanup. |
| `docs/phase-gates.md` | PASS | Phase gates require manual review and checks. |
| `docs/security-notes.md` | PASS | Secret handling and admin security notes exist. |
| `docs/event-day-runbook.md` | PASS | Placeholder runbook exists for later expansion. |
| `docs/testing-checklist.md` | PASS | Baseline testing checklist exists. |
| `docs/data-audit.md` | PASS | Data audit exists. |
| `docs/asset-audit.md` | PASS | Asset audit exists. |
| `docs/phase-0-manual-review.md` | PASS | Manual Phase 0 review exists. |
| `docs/phase-0-cloud-projects.md` | PASS | Optional 0.21 cloud project prep status exists. |
| `.env.example` | PASS | Placeholder environment file exists. |
| `.gitignore` | PASS | Ignores env files, build outputs, dependencies, logs, editor files, and local runtime folders. |
| `data/source/charts.csv` | PASS | Copied from `C:\Users\jfung\Downloads\charts (1).csv`; hash verified after copy. |
| `public/brand/tournament-logo.png` | PASS | Copied from `C:\Users\jfung\Downloads\final_lorge_9.png`; hash verified after copy. |

## Data Readiness

| Check | Status | Notes |
|---|---|---|
| Required columns detected | PASS | `name`, `name_kr`, `artist`, `label`, `type`, `level`, `bg_img`. |
| Total rows reported | PASS | 4,571 rows. |
| Required pools have at least 7 charts | PASS | S16 188, S17 196, S18 188, S19 167, S20 134, S21 150, S22 97, D23 125. |
| `bg_img` populated | PASS | 4,571 populated, 0 missing. |
| Duplicate/malformed risks documented | PASS | See `docs/data-audit.md`. |

## Asset Readiness

| Check | Status | Notes |
|---|---|---|
| Logo exists | PASS | `public/brand/tournament-logo.png`. |
| Dimensions detected | PASS | 14777x9799. |
| File size detected | PASS | 86,520,785 bytes. |
| Usable as main tournament logo | PASS | Usable source asset, but needs optimized web renditions later. |

## Security Checks

| Check | Status | Notes |
|---|---|---|
| No `.env` file present | PASS | `Test-Path .env` returned false. |
| No `.env.local` file present | PASS | `Test-Path .env.local` returned false. |
| No `.vercel` directory present | PASS | `Test-Path .vercel` returned false. |
| No files staged accidentally | PASS | `git diff --cached --name-only` returned no files. |
| Secret placeholder scan | PASS | Empty placeholders appear only in `.env.example` and the execution plan. |
| JWT-looking token scan | PASS | No `eyJ` matches found. |
| Plain `ADMIN_PASSWORD=` scan | PASS | No matches found. |

## Tool Checks

| Tool | Status | Version/Notes |
|---|---|---|
| Git | PASS | `git version 2.54.0.windows.1`. |
| Node.js | PASS | `v24.17.0`. |
| npm | PASS | `11.13.0`. |
| Vercel CLI | PASS | `54.14.2`. |
| Supabase CLI | WARNING | Not installed locally; needed for local Supabase work in later phases unless a remote-only workflow is chosen. |

## Optional Cloud Project Prep

| Item | Status | Notes |
|---|---|---|
| Vercel project shell | PASS | Created `jonathansminigameparty/bite-open-card-draw`. |
| Supabase account access | PASS | `npx supabase projects list` can access the account. |
| Supabase project shell | PASS | Observed active healthy project `bite-open-card-draw` in `us-east-2`. |

## Phase 0 Checks Run

- `rtk git status --short --branch`
- `rtk git diff --cached --name-only`
- `rtk git --version`
- `rtk node --version`
- `rtk npm --version`
- `rtk powershell ... supabase --version`
- `rtk powershell ... vercel --version`
- `rtk powershell -NoProfile -ExecutionPolicy Bypass -File scripts/write-data-audit.ps1`
- `rtk powershell -NoProfile -ExecutionPolicy Bypass -File scripts/write-asset-audit.ps1`
- `rtk rg -n "SUPABASE_SERVICE_ROLE_KEY=" .`
- `rtk rg -n "SESSION_SECRET=" .`
- `rtk rg -n "ADMIN_PASSWORD=" .`
- `rtk rg -n "eyJ" .`

## Blockers

- None.

## Warnings

- The source tournament logo is large. Create optimized renditions during Phase 1 or Phase 3.
- The CSV has a small number of malformed-looking rows documented in `docs/data-audit.md`; Phase 3 ingestion should handle them explicitly.
- Supabase CLI is not installed globally, but it works through `npx supabase`.
- App commands do not exist yet because Phase 1 has not scaffolded the app.

## Recommended Next Action

Commit Phase 0, then begin Phase 1 from `docs/codex-execution-plan.md`.
