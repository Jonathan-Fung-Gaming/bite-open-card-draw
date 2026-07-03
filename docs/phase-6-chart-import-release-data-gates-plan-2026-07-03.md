# Phase 6 Chart Import And Release Data Gates Plan - 2026-07-03

Status: reviewed and ready for implementation.

Parent plan: `docs/production-readiness-remediation-plan-2026-07-03.md`

Primary issues:

- PRC-025: final chart import is not strict or review-signed.
- PRC-026: CSV header validation allows trailing schema drift.
- PRC-027: Unicode-only song/artist keys could collapse to `unknown`.
- PRC-028: image verification is not part of default quality gates.

Authoritative behavior sources:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Product Rule Being Protected

The event chart pool is tournament-critical data. Draws must use the approved
CSV at `data/source/charts.csv`, only the required S16, S17, S18, S19, S20,
S21, S22, and D23 pools matter for tournament draws, and chart images must be
cached or fall back safely before the event. This phase does not change draw,
voting, result, tiebreak, roster, or admin rules.

## Current Gaps

The existing import pipeline already parses the source CSV, records checksums,
reports repaired/skipped rows, validates required pool counts, writes generated
artifacts under `data/generated`, caches images, and has a
`verify:real-chart-images` script.

Phase 6 still needs release hardening:

- `validateChartCsvHeader` only checks expected names at expected indexes. It
  can miss extra trailing headers.
- Row repair accepts any row longer than seven columns by reconstructing from
  the last four fields. That intentionally supports known unquoted-comma title
  rows, but it can also hide unexpected columns after `bg_img`.
- `normalizeKeyPart` returns `unknown` when a value contains no ASCII
  alphanumeric characters. Korean-only title and artist values can therefore
  collapse into the same `unknown__unknown` song key and chart key.
- Strict import fails on repaired/skipped diagnostics, but there is no named
  release data gate that combines strict import evidence, signed review
  metadata, source/report SHA values, fixture-mode rejection, required pool
  counts, duplicate checks, image manifest identity, and runtime image
  verification.
- `verify:real-chart-images` exists, but the default project-wide quality gates
  do not require the chart/image release evidence.

## Implementation Strategy

### Exact CSV Schema Validation

Update chart CSV parsing so header validation is exact:

- the header must contain exactly `name,name_kr,artist,label,type,level,bg_img`;
- columns must be in that order;
- missing, misordered, renamed, or extra headers fail with a clear error.

Keep the current known row repair path only for the existing 9-cell mirrored-title
comma shape whose final four columns still look like the expected
`label,type,level,bg_img` tail and whose leading columns can reconstruct
matching non-empty `name` and `name_kr` plus non-empty `artist`.

Reject unexpected trailing row columns after `bg_img`. The repair helper should
not reinterpret a trailing `bg_img` drift cell as the image URL merely because
it is the last column.

### Unicode-Safe Key Fallback

Keep the existing ASCII-friendly key format for ordinary rows. Add a narrow
fallback only when the sanitized key part would otherwise become `unknown`:

- derive a stable hash from the original normalized Unicode value;
- prefix it with `unicode-` or another explicit marker;
- keep it deterministic so chart IDs remain stable for the same source row;
- do not migrate or rewrite non-`unknown` key behavior.

Add tests for Korean-only title/artist rows and mixed Unicode/ASCII rows. The
tests should prove distinct Unicode-only songs do not collapse to the same
song key, while existing ASCII normalization behavior remains unchanged.

### Release Data Gate

Add a named script, `verify:release-data`, that fails unless release chart data
is certifiable. The gate should:

- run or validate strict import artifacts from `data/source/charts.csv`;
- reject fixture mode;
- verify a source CSV SHA is present;
- verify required pool counts have no underfilled pool;
- fail on duplicate chart keys;
- fail on repaired or skipped diagnostics unless a reviewer/date/commit
  signature is present;
- verify import report SHA integrity;
- verify `data/generated/image-assets.json` and
  `data/generated/charts-with-images.json` identities;
- invoke or share the same checks as `verify:real-chart-images` so runtime
  image cache readiness is part of the release data gate.

The signed-review path is a release control, not a way to make broken data
silently pass. The gate should print the specific unresolved diagnostics and
the required reviewer metadata when it fails.

The signed-review metadata format is stored in
`data/generated/chart-import-report.json`:

- `reviewedBy`: non-empty reviewer/operator name.
- `reviewedAt`: ISO-parseable review timestamp.
- `reviewedCommit`: 7-40 character Git commit SHA for the source/code state
  used to review the diagnostics.

### Documentation And Status

Update release/data documentation so operators know the new release data gate
is required before event use. Update `docs/phase-status.md` with:

- changed files;
- focused and full checks run;
- any unavailable Supabase/deployed evidence;
- manual review against product/security rules;
- risks and assumptions.

No Supabase migration is expected in this phase because the changes are local
import, generated artifact, and verification-gate behavior.

## Test Plan

Focused unit tests:

- `src/lib/charts/importer.test.ts`
  - rejects extra headers;
  - rejects misordered headers;
  - rejects unexpected trailing columns after `bg_img`;
  - keeps known malformed title-row repair working;
  - reports strict failures and signed-review metadata clearly.
- `src/lib/charts/normalize.test.ts`
  - preserves existing ASCII key behavior;
  - gives Korean-only title/artist rows stable non-`unknown` keys;
  - keeps mixed Unicode/ASCII rows readable and deterministic.
- `src/lib/charts/runtime-catalog.test.ts`
  - existing runtime cache fallback behavior remains unchanged.
- `src/lib/charts/image-cache.test.ts`
  - existing cache planning behavior remains unchanged.

Release/script tests:

- Add release-gate unit coverage for:
  - strict clean reports;
  - unsigned repaired/skipped diagnostics;
  - signed reviewer/date/commit diagnostics;
  - fixture-mode reports;
  - duplicate chart keys;
  - underfilled required pools;
  - stale source CSV SHA;
  - stale import report SHA;
  - missing or empty image asset manifest;
  - missing or empty runtime catalog.
- Run the actual commands:
  - `rtk npm run import:charts -- --strict`
  - `rtk npm run cache:chart-images`
  - `rtk npm run verify:real-chart-images`
  - `rtk npm run verify:release-data`

Project-wide checks:

- `rtk npm run lint`
- `rtk npm run typecheck`
- `rtk npm run test`
- `rtk npm run build`
- `rtk npm run test:e2e`
- `rtk git diff --check`

Browser-visible behavior is not intentionally changed, but
`docs/phase-gates.md` requires e2e checks once available. Run
`rtk npm run test:e2e` and stop if it fails.

## Acceptance Mapping

| Acceptance criterion | Planned evidence |
| --- | --- |
| Tests reject extra headers, misordered headers, and unexpected trailing columns | Importer unit tests |
| Tests cover Korean-only and mixed-Unicode title/artist keys | Normalize unit tests |
| `rtk npm run import:charts -- --strict` passes or signed-review path is explicit | Import command output and release gate behavior |
| `rtk npm run verify:real-chart-images` passes against final artifacts | Runtime image verification command |
| Current cached/controlled image artifacts are regenerated or explicitly verified | `cache:chart-images`, runtime catalog/image manifest SHAs, and `verify:real-chart-images` |
| Release data gate fails on unsigned repaired/skipped diagnostics | Release gate unit/script tests |

## Plan Review

- No tournament behavior changes are proposed.
- The CSV schema becomes stricter without removing the known current repair for
  intentional malformed title rows.
- Unicode key fallback is limited to the current `unknown` collapse case, so
  existing ASCII chart IDs are preserved.
- The release gate validates artifacts and image readiness; it does not expose
  secrets or add browser-side tournament-changing behavior.
- No `.github/workflows/*` files are added.
- No Supabase schema changes are planned.

Review result: pass after independent review corrections. The implementation is
scoped to PRC-025 through PRC-028 and can proceed.

## Risks And Assumptions

- If the real CSV still contains repaired rows, strict import may intentionally
  fail until the CSV is cleaned or the signed-review metadata is supplied.
- Generated `data/generated/*.json` and `*.sha256` files are ignored by git, so
  final release artifacts still need to be archived or attached outside normal
  source tracking.
- The Unicode fallback may create new keys only for rows that previously
  collapsed to `unknown`; this is intentional and should reduce collision risk.
