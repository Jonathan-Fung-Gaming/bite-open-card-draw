# Pump Open Stage Vote

Tournament voting and stage visualization app for Pump It Up Open Stage.

## Current status

Phase 1 scaffold is in progress.

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
npm run build
```

End-to-end tests are not available yet. They will be added in a later phase when Playwright is
introduced.

Use the project command wrapper:

```bash
rtk npm run build
```
