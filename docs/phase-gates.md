# Phase Gates

## Supabase migration-only changes

Run only the new migration's focused tests. Do not run application suites, older migration tests, sibling regressions, application builds/lint/typecheck, full database resets/replays, or schema-wide lint for a migration-only change. New migration test files, generated types, and supporting documentation remain within this exception.

Target verification, migration history/parity and dry-run inspection remain required. Release depends on the new migration's own acceptance checks, not unrelated failures. This rule overrides the general gates below; see `AGENTS.md`.

Codex must work phase by phase.

A phase is not complete until:

1. All acceptance criteria for the phase are met.
2. Lint passes, if available.
3. Typecheck passes, if available.
4. Unit tests pass, if available.
5. Build passes, if available.
6. E2E tests pass, once they exist.
7. The phase summary lists changed files.
8. The phase summary lists risks and assumptions.
9. A manual review has checked the phase against `docs/product-spec.md`.

For release-blocking Playwright evidence, the full-tournament rehearsal must verify the active
voting-player progression of 48 in Round 1, 36 in Round 2, 24 in Round 3, and 12 in Round 4 after
removing exactly 12 voting players before each later round.

If any required check fails, Codex must stop and report the failure instead of continuing to later phases.

If a command does not exist yet, Codex must say so and explain when it will be added.
