# Phase Gates

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

If any required check fails, Codex must stop and report the failure instead of continuing to later phases.

If a command does not exist yet, Codex must say so and explain when it will be added.
