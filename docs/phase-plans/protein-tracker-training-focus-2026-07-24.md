# Protein Tracker training-focus schema plan

Date: 2026-07-24
Status: merged and deployed; linked migration parity and lint verified
Scope: additive Protein Tracker profile field and versioned goal-calculation RPCs

## Objective

Add an independent training-focus choice without overloading Cut, Maintain, or Bulk. General users
keep the existing 1.2-1.6 g/kg/day protein target; adults who report resistance training at least
two days per week receive 1.6-2.0 g/kg/day. Existing profiles and historical `protein-v1` goals
remain unchanged.

## Contract

- Add `protein_profiles.training_focus text not null default 'general'` with values `general` and
  `resistance_training`. Existing rows backfill to `general`.
- Add authenticated, security-definer `protein_complete_onboarding_v3` and
  `protein_update_profile_and_propose_goal_v2` RPCs that accept the independent training focus.
- Keep the existing onboarding and settings RPCs executable so already-deployed clients remain
  compatible.
- Write `protein-v2` only from the new RPCs. Preserve every existing `protein-v1` goal rather than
  rewriting current or historical rows.
- Keep calorie calculations and safety gates unchanged. Use actual body weight as the protein
  reference weight, with multipliers 1.2-1.6 for `general` and 1.6-2.0 for
  `resistance_training`.
- Include training focus, reference-weight value and method, and selected multipliers in the
  calculation snapshots.
- Preserve per-user advisory locking, idempotency, RLS, least-privilege grants, and goal-period
  acknowledgment behavior.

## Validation

- Reset the full local migration history and run existing Protein Tracker integration suites.
- Add focused Data API coverage for backfill/default behavior; direction-by-focus calculations;
  both new RPCs; invalid focus; idempotency; snapshot contents; historical `protein-v1`
  preservation; owner isolation; and legacy RPC compatibility.
- Run database lint, repository formatting, lint, typecheck, unit tests, and build.
- Perform one bounded diff/security review against this contract and `docs/security-notes.md`.

## Migration order and rollback

Deploy this additive migration before any consumer release that calls the new RPCs or reads
`training_focus`. The existing app continues using the old RPCs during deployment. Before the new
consumer is active, rollback may drop the new RPCs, constraint, and column. After `protein-v2`
goals exist, rollback is app feature disablement plus an additive correction; do not delete or
rewrite goal history.

## Plan review

Reviewed before implementation. A separate profile field avoids conflating energy direction with
exercise behavior. Versioned RPC names and a new policy version preserve replay semantics and
permit schema-first rollout. The two-day definition is product copy only; the database stores the
selected category and does not infer exercise behavior. No new credential, public write path, or
tournament behavior is introduced.
