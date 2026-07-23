# Protein Tracker Phase 3 atomic-onboarding database plan

Date: 2026-07-23
Status: implemented and validated locally
Scope: one additive authenticated RPC and focused local integration evidence

## Objective

Provide the canonical shared Supabase transaction boundary needed by Protein Tracker Phase 3. One
authenticated call must create or update only the caller's incomplete profile, record the first
weight, and create one pending onboarding goal. Nutrition formulas remain in the consuming app;
SQL accepts already-calculated ranges and generic JSON snapshots.

## Contract

- Add one `security definer`, fixed-search-path RPC prefixed with `protein_`.
- Derive ownership exclusively from `auth.uid()`; accept no user-id parameter.
- Acquire the existing per-user advisory lock before inspecting or mutating tracking rows.
- Permit an absent profile or a profile whose `onboarding_completed_at` is null. Reject a different
  request after onboarding is complete.
- Mark the profile complete before child inserts so existing tracking-integrity triggers accept the
  weight and goal; PostgreSQL transaction rollback must restore the prior incomplete state if a
  later insert fails.
- Use caller-generated weight and goal UUIDs as the replay keys. An exact retry returns the existing
  pending goal without creating rows; a retry whose IDs or payload differ is rejected.
- Store the same explicit policy and eligibility-attestation versions on profile and goal. Accept
  generic object-shaped input/output snapshots without implementing health formulas in SQL.
- Insert the initial goal as `reason = 'onboarding'`, unacknowledged, unsuperseded, and open-ended.
- Revoke default/public/anonymous execute; grant execute only to `authenticated` and
  `service_role`, matching the existing RPC grant convention.

## Validation

- Reset the complete local Supabase history and run database lint.
- Through local PostgREST with real Auth JWTs, prove anonymous denial, authenticated success,
  incomplete-profile update, caller ownership, exact replay idempotence, conflicting-replay
  rejection, and full rollback after a forced goal-constraint failure.
- Recheck local/linked migration ordering and run the focused test command.
- Perform one complete diff review for ownership, grants, search path, transactionality, replay
  behavior, and sibling-schema isolation; make at most one focused repair for a proven issue.

## Migration order and rollback

The migration depends on `20260723010000_protein_tracker_schema_rls.sql` and creates only a
function plus explicit grants. The consuming app must not call it before deployment. Before use,
rollback may drop the exact function signature after verifying no dependent app is deployed.
After use, roll back the app first and use an additive corrective migration instead of rewriting
canonical history.

## Plan review

Reviewed before implementation. The contract does not add formulas, tables, columns, policies,
extensions, Auth triggers, default-privilege changes, or tournament behavior. Existing constraints
and triggers remain authoritative for profile values, local-date/time-zone integrity, goal ranges,
and one-pending-goal enforcement.
