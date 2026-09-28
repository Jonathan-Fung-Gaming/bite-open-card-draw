# Crossplay private shared schema — 2026-09-28

This standalone additive phase implements Phase 2 of the consuming application's
`crossplay-tournaments/docs/implementation-plan.md`. The user accepted player submission with
opponent confirmation and completed overtime intervals (default 2 points per 10 seconds).

## Scope and reviewed plan

- Add only a private `crossplay` schema, dedicated runtime role, normalized tournament history,
  restricted query/command interface, and this migration's isolated tests.
- Require trusted, server-verified organizer identity or hashed entrant session credentials;
  unrelated shared Auth identities have no Crossplay authority.
- Keep all base tables under RLS with no runtime/browser direct access. Security-definer
  functions have an empty search path and explicit grants. No shared Data API or sibling grants
  change. Bootstrap organizer membership deliberately outside browser/runtime commands.
- Serialize tournament mutations with a row lock, enforce expected versions, and persist
  idempotency results. Freeze competitive settings on first publication; validate legal complete
  pairings, entrant scope, repeat opponents/byes, and unfinished-round advancement.
- Calculate official scores in PostgreSQL. Store proposals separately from append-only official
  result revisions. Exclude proposals from public state and standings.
- Issue hashed invitations, consume them explicitly, revoke associated sessions on regeneration,
  authorize match participants, and require exact proposal versions on confirmation/dispute.
- Run only this migration against minimal isolated prerequisites. Verify SQL constraints,
  permissions, scoring boundaries, lifecycle, history, replay/staleness, and player reporting.
  Do not run sibling app checks, full migration replay/reset, or schema-wide lint.

Plan review before implementation: the schema boundary alone is insufficient for isolation;
effective PUBLIC and role-membership grants must be inspected before provisioning credentials.
Runtime callers are trusted server code, never browser-supplied actor IDs. Unknown or stale states
fail closed. Entrant references include tournament identity. Public projections exclude proposals,
Auth IDs, credential hashes, and administrative reasons. The selected matching algorithm runs in
the consuming server; the database independently verifies publication legality.

## Migration order and rollback

Canonical owner is this repository. Read-only linked history inspection on 2026-09-28 found exact
local/remote parity through `20260927020000`; the linked target is `gsiyqhkcgegjrvqcqioc`.
The new migration is `20260928010000_crossplay_schema.sql`. Inspect a push dry-run containing only
this reviewed migration before application. The consuming application must check schema contract
readiness before use. Provision a dedicated runtime login and first organizer after migration via
an authorized administrative connection; do not commit secrets or reuse project postgres credentials.

After data exists, rollback disables/reverts the consuming app and preserves schema/history.
Do not drop the schema or reset the shared project. Any destructive removal is separately scoped.

## Finite exit gate

The new migration's tests pass in an isolated PostgreSQL-compatible database; the final diff gets
one manual review. Any proven regression receives one focused repair and affected rerun only.
Deployment is tracked separately and is not claimed until merge, target/dry-run inspection,
migration application, effective-privilege verification, and runtime smoke are complete.

Evidence is recorded in `docs/crossplay-shared-schema-checklist-2026-09-28.md`.
