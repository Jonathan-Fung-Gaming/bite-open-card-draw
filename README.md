# Pump Open Stage Vote

Tournament voting and stage visualization app for Pump It Up Open Stage.

## Current status

The 2026-07-13 production-readiness remediation plan is the active workstream.

## Source files

Chart CSV:

```text
data/source/charts.csv
```

Tournament logo:

```text
public/brand/tournament-logo.png
```

## Important docs

- `docs/product-spec.md`
- `docs/codex-current-brief.md`
- `docs/production-readiness-remediation-plan-2026-07-13.md`
- `docs/production-readiness-remediation-checklist-2026-07-13.md`
- `docs/decision-log.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Development

Development commands:

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run import:charts
npm run cache:chart-images
```

Playwright end-to-end and production-flow suites are available through the scripts above.

For a local fallback-only image manifest:

```bash
npm run cache:chart-images -- --fallback-only
```

Use the project command wrapper:

```bash
rtk npm run build
```
