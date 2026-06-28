# Phase 0 Manual Review

Phase 0 review was performed manually because this project is using single-agent review only.

## Product-Spec Review

### Blockers

- None.

### Warnings

- The Phase 1+ execution plan says public screens must not show live chart-by-chart counts before voting closes. The product spec is stricter: phones must not spoil results before the stage reveal finishes. The execution plan also covers that later in result reveal behavior, so this is not a contradiction, but Phase 8/9 implementation should preserve the stricter product-spec rule.

### Fixes Applied

- Updated `docs/decision-log.md` to use the exact confirmation text `Are you sure you are voting as [start.gg username]?`.
- Removed parallel-agent review wording from `docs/codex-execution-plan.md` and replaced it with manual review requirements.

## Security Review

### Blockers

- None.

### Warnings

- `.env.example` and `docs/codex-execution-plan.md` contain empty secret placeholders. This is expected and safe.
- Supabase CLI is not installed locally. This does not block Phase 0, but Phase 2 local database work will need either Supabase CLI installation or a documented remote-only workflow.

### Checks

- `.gitignore` ignores `.env`, `.env.*`, `.vercel/`, build outputs, dependencies, logs, and local Supabase runtime folders.
- `.env.example` contains placeholders only.
- `AGENTS.md` and `docs/security-notes.md` state that service-role keys, session secrets, password hashes, and plaintext admin passwords must not be exposed to browser code or committed.
- Dangerous admin actions and host lock requirements are documented.

## Data Review

### Blockers

- None for Phase 0.

### Warnings

- `docs/data-audit.md` found 9 rows with non-canonical type/level values around `Simon Says / Jehezukiel...`. Phase 3 ingestion should either repair these from a better CSV export or fail clearly with row-level diagnostics.
- Chart image URLs are populated but point to external sources. Phase 3 must cache or move them to controlled storage before event day.

### Checks

- Required pool counts match the Phase 0 guide:
  - S16: 188
  - S17: 196
  - S18: 188
  - S19: 167
  - S20: 134
  - S21: 150
  - S22: 97
  - D23: 125
- Every required pool has at least 7 charts.
- `bg_img` is populated for all 4,571 rows.

## Workflow Review

### Blockers

- None.

### Warnings

- The tournament logo is usable but very large: 86,520,785 bytes, 14777x9799. Phase 1 or Phase 3 should create optimized web renditions and avoid loading the full source image on phones.
- App commands such as lint, typecheck, test, build, import, and image caching are expected to be introduced during Phase 1 and later.

### Checks

- `docs/phase-gates.md` requires phase-by-phase execution and manual review against `docs/product-spec.md`.
- `docs/codex-execution-plan.md` explicitly contains no Phase 0 and begins implementation at Phase 1.
- The execution plan says GitHub Actions should not be created until Phase 12.
- The repo is ready for Phase 1 after Phase 0 is committed.
