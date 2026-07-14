# Roster Active Control UI Follow-Up Checklist - 2026-07-15

Companion plan: `docs/phase-plans/roster-active-control-ui-follow-up-2026-07-15.md`.

## Scope

- [x] Roster header changed to `Active Control`.
- [x] Visible `Active`/`Inactive` status text removed from the active-control column.
- [x] Active usernames render green.
- [x] Inactive/deactivated usernames render red.
- [x] `Mark Inactive` / `Reactivate` action text remains as the non-color state cue.
- [x] Existing two-column roster structure is preserved.
- [x] View-only `/charts` artist metadata renders at the existing 12px minimum.
- [x] Featured final-chart titles satisfy the existing projector long-title wrapping contract.
- [x] Roster mutation, active-host, eligibility, voting, draw, result, and Supabase schema behavior
      are unchanged.

## Validation

- [x] Phase plan self-reviewed and amended.
- [x] Formatting run for changed supported files.
- [x] `npm run lint` passes.
- [x] `npm run typecheck` passes.
- [x] `npm run test` passes.
- [x] `npm run build` passes.
- [x] Focused roster/browser coverage passes.
- [x] `git diff --check` passes.
- [x] Manual diff review completed against `docs/product-spec.md` and `docs/security-notes.md`.
- [x] `docs/phase-status.md` updated with changed files, checks, evidence, risks, and assumptions.
- [x] Pull request merged.
- [x] Post-merge migration step marked not applicable.
