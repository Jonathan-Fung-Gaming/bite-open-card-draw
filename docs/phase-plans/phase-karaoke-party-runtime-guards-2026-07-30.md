# Karaoke Party runtime-guard correction plan

Date: 2026-07-30
Status: implementation and local validation complete; release pending
Scope: additive provider-quota guard for the shared Karaoke Party schema
Consuming application: `jfung9021/karaoke-party`

## Objective

Correct the production YouTube quota reservation boundary without changing tournament, Protein
Tracker, Auth, default-privilege, or browser-access behavior. The provider resets daily allocations
at midnight in `America/Los_Angeles`; the existing generic limiter uses Unix-aligned windows and
cannot safely represent that boundary.

## Deliverables

1. One additive migration after `20260729020000` that creates a service-role-only
   `karaoke_reserve_youtube_quota` RPC.
2. An atomic reservation of the granular `search.list` bucket and the combined non-search bucket,
   aligned to successive Pacific midnights with daylight-saving transitions handled by PostgreSQL.
3. Executable assertions for allowance, rejection without partial consumption, Pacific/UTC date
   boundaries, and 23/25-hour daylight-saving provider days.
4. Updated Karaoke Party service-role grant inventory and phase evidence.

## Safety and rollout

- The migration creates/replaces only `public.karaoke_*` objects and touches only
  `karaoke_rate_limit_buckets` rows with fixed quota keys.
- Browser roles retain no table or function access; only `service_role` receives execute.
- The consuming application keeps YouTube search disabled until the migration is merged, applied,
  and verified. Paste validation also remains disabled operationally while room creation is off.
- Rollback is forward-only after use: disable YouTube search and deploy a corrective migration.
  Before use, the new function may be dropped explicitly after revoking its grant; no `CASCADE`.

## Validation

- Reset the complete local migration chain and run local database lint.
- Run the Karaoke schema/security/queue/concurrency harness, including new quota-boundary tests.
- Run relevant sibling repository lint, typecheck, tests, and build.
- Review the final diff for prefix isolation, SQL injection/search-path safety, privilege changes,
  atomicity, DST arithmetic, migration order, and destructive behavior.
- Commit, push, open a PR, wait for required checks, merge, synchronize `main`, verify the linked
  project identity, dry-run the migration push, apply only the intended migration, and verify exact
  parity plus linked lint.

## Plan review

Reviewed before implementation. A generic fixed-window offset, application-clock key, or pair of
independent reservations can split one provider day or partially consume one bucket, so the RPC
computes both boundaries from database time and reserves both buckets under deterministic advisory
locks in one transaction. The design is additive, fail-closed, previous-application compatible,
and does not broaden the shared schema blast radius.
