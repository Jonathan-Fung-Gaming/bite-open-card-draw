# Pump Open Stage Vote

Tournament voting and stage visualization app for Pump It Up Open Stage.

## Current status

Phase 3 chart import, normalization, and fallback image cache tooling is complete.

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
- `docs/codex-execution-plan.md`
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

End-to-end tests are a placeholder until Playwright is introduced.

For a local fallback-only image manifest:

```bash
npm run cache:chart-images -- --fallback-only
```

Use the project command wrapper:

```bash
rtk npm run build
```
