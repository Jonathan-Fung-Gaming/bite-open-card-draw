# Protein Tracker shared-schema phase plan

Date: 2026-07-23
Status: implemented and validated locally; awaiting PR merge and post-merge deployment
Scope: additive shared Supabase schema required by Protein Tracker Phase 2

## Objective

Add the complete prefixed Protein Tracker persistence contract to this repository, which is the confirmed canonical migration owner for the shared Supabase project. The change must not alter tournament behavior, existing tables, default privileges, or the global Auth signup lifecycle.

## Preconditions and evidence

- The user selected documented defaults for unresolved design choices; the documented default assigns canonical migration ownership to this repository.
- The repository and linked project are clean and unambiguous.
- `supabase migration list --linked` reports all 25 existing migrations paired through `20260714020000`.
- Linked database lint reports no schema errors.
- The local Supabase stack is available for destructive reset and isolation tests.

## Deliverables

1. One additive migration named `20260723010000_protein_tracker_schema_rls.sql`.
2. Lowercase `protein_` tables for profiles, preferences, goal periods, food, weight, coaching, push subscriptions, notification jobs/deliveries, and security events.
3. A security-invoker daily-totals view; fixed-search-path trigger/RPC functions; explicit indexes, checks, grants, and row-level security.
4. An authenticated goal-confirmation RPC and a service-role-only erase-tracking-data RPC.
5. Automated schema/RLS tests covering anonymous denial, two-user isolation, spoofed ownership, server-only objects, view isolation, RPC isolation, erase scope, constraints, and sibling non-regression.
6. Generated database types consumed from a reset local database by the Protein Tracker repository.

## Security and ownership design

- No unprefixed app-owned object is introduced.
- No trigger is added to `auth.users`.
- All exposed tables enable RLS before browser grants.
- `anon` receives no Protein Tracker privileges.
- Authenticated users can read their profiles/goals/coaching, manage their preferences and food/weight entries, and read their daily totals.
- Push endpoints/key material, reminder processing, and security events remain server-only.
- Every security-definer function uses `set search_path = ''`, schema-qualified references, an explicit caller contract, and explicit execute grants.
- New objects receive explicit `service_role` privileges; project-wide default privileges remain unchanged.

## Schema contract

All IDs are UUIDs generated with `gen_random_uuid()` unless the primary key is the owning `user_id`. Timestamps are `timestamptz` with `now()` defaults. User-owned rows reference `auth.users(id) on delete cascade`; security-event users use `on delete set null`. Text enums use named check constraints instead of PostgreSQL enum types. JSON snapshots must be objects. No extension is expected; adding one requires a separate plan review.

| Object                            | Required contract                                                                                                                                                                                                                                                                                                                                                                                                        | Authenticated operations                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `protein_profiles`                | `user_id uuid` PK; `birth_month smallint`, `birth_year smallint`, enum texts, `height_inches numeric(5,2)`, zone/version texts, and attestation time are NOT NULL; onboarding time nullable; created/updated NOT NULL defaults. Static height 36–96 inches, year 1900–2100, enum, length, and object checks.                                                                                                             | SELECT only                                       |
| `protein_preferences`             | `user_id uuid` PK; default Food-action text nullable; `notifications_enabled boolean not null default false`; created/updated NOT NULL defaults. This is the sole authority for the Food default and survives erase.                                                                                                                                                                                                     | SELECT, INSERT, UPDATE                            |
| `protein_goal_periods`            | UUID ID/user/direction; `date` start NOT NULL and exclusive end nullable; calorie/protein bounds `integer not null`; input/output `jsonb not null`; policy/attestation/reason texts NOT NULL; proposed/created NOT NULL defaults; acknowledged/superseded nullable. Bounds: calories 0–10000, protein 0–1000, lower <= upper, end > start.                                                                               | SELECT only; confirmation through RPC             |
| `protein_food_entries`            | UUID ID/user/source batch (`default gen_random_uuid()`); logged moment/local date/zone/item/input NOT NULL; `protein_grams numeric(8,2)` 0–10000 and `calories integer` 0–100000; confidence nullable; timestamps NOT NULL defaults. Client inserts exclude ID/system timestamps; updates are limited to item, protein, calories, and confidence. Database triggers own timestamps.                                      | SELECT, INSERT, UPDATE, DELETE with column grants |
| `protein_weight_entries`          | UUID ID/user; measured moment/local date/zone NOT NULL; `pounds numeric(6,2)` between 50 and 1500; timestamps NOT NULL defaults. Client inserts exclude ID/system timestamps and updates are limited to pounds; stable provenance/ownership are immutable and database triggers own timestamps.                                                                                                                          | SELECT, INSERT, UPDATE, DELETE with column grants |
| `protein_coaching_events`         | UUID ID/user; event/state/fingerprint NOT NULL; at least three distinct, existing, same-owner `uuid[]` evidence entries; `weekly_percent_change numeric(7,4) not null`; proposed-goal UUID nullable UNIQUE FK `on delete set null`; created NOT NULL default and acknowledged nullable.                                                                                                                                  | SELECT only                                       |
| `protein_push_subscriptions`      | UUID ID/user; endpoint text NOT NULL UNIQUE max 2048; p256dh/auth texts NOT NULL max 512; expiration nullable; last-seen/created/updated NOT NULL defaults; `platform_metadata jsonb not null default '{}'` and object-only.                                                                                                                                                                                             | None; server only                                 |
| `protein_notification_jobs`       | UUID ID/user; reminder text and source-weight UUID FK `on delete cascade`; due date/zone/time plus validated absolute `due_at` NOT NULL; lifecycle status NOT NULL default pending; claim token/time, retry and invalidation nullable; attempts integer NOT NULL default 0; created/updated defaults; unique user/kind/source dedupe.                                                                                    | None; server only                                 |
| `protein_notification_deliveries` | UUID ID/user; job UUID FK `on delete cascade`; subscription UUID nullable FK `on delete set null`; stable SHA-256 destination fingerprint, reminder/due date/status NOT NULL; strict attempt/delivery/error lifecycle checks; sanitized `error_code text` nullable max 128 (never provider text, endpoint, or key material); created NOT NULL default; unique job/fingerprint dedupe survives subscription-row deletion. | None; server only                                 |
| `protein_security_events`         | UUID ID; user UUID nullable FK `on delete set null`; event/request texts NOT NULL and bounded; `metadata jsonb not null default '{}'` object-only and sanitized; created NOT NULL default.                                                                                                                                                                                                                               | None; server only                                 |
| `protein_daily_totals`            | Security-invoker aggregation by user and stable local date: protein, calories, entry count.                                                                                                                                                                                                                                                                                                                              | SELECT                                            |

Valid values are: sex `female|male`; activity `inactive|low_active|active|very_active`; direction `cut|maintain|bulk`; Food action/input `take_photo|photo_library|nutrition_label|manual_entry`; confidence `confident|uncertain`; goal reason `onboarding|profile_change|trend_adjustment`; coaching event `cut_too_fast|bulk_too_fast`; coaching state `pending|acknowledged|superseded`; reminder kind `weigh_in_due`; bounded job/delivery lifecycle values defined in the migration.

Every local date is checked by a trigger against `(logged_at or measured_at) at time zone time_zone`; every zone is validated through `pg_catalog.pg_timezone_names`. Notification jobs likewise require `due_at` to equal their local date/time interpreted in the stored zone. The application may not later move a historical row to another local day. Required indexes cover each `user_id`, `(user_id, local_date)`, goal effective dates, evidence fingerprints, push endpoint, absolute due claims, and durable reminder/delivery dedupe keys.

## Goal and erase invariants

- Partial unique indexes permit at most one unacknowledged pending goal and one acknowledged current goal per user.
- A fixed-search-path goal-integrity trigger takes a user-scoped transaction advisory lock on insert/update, rejects overlap between every acknowledged `[start,end)` interval, and makes acknowledged ownership, direction, start, ranges, snapshots, versions, reason, proposal time, acknowledgment time, and creation time immutable. Only the controlled end/superseded fields may close history. This provides concurrency safety without an extension and also blocks ordinary `service_role` update mistakes.
- `protein_confirm_goal_period(uuid)` is authenticated-only, derives the caller from `auth.uid()`, locks that user's goal rows, rejects another user's/nonpending proposal, is replay-idempotent for the already-current target, closes the previous period with an exclusive end equal to the target start, and acknowledges the target atomically. Concurrent confirmations cannot leave two current periods.
- Goal snapshots and acknowledged historical periods are not directly mutable by authenticated clients.
- `protein_erase_tracking_data(uuid)` is executable only by `service_role`. Its trusted server caller must freshly verify the user session before passing the target user ID. It transactionally deletes that user's delivery, job, coaching, food, weight, and goal rows and clears profile onboarding completion; it retains the Auth user, profile fields, preferences, push subscriptions, and security audit rows. Tests inject a mid-operation failure and prove full rollback. Authenticated/anonymous execute is denied.

## Privilege and RLS matrix

Before allowlisting, revoke all privileges from `public`, `anon`, and `authenticated` on every new table, sequence, view, and function, including default PUBLIC function execute. Grant `service_role` the required per-object privileges. Owner policies use `(select auth.uid()) = user_id`; inserts use `with check`, updates use both `using` and `with check`, and column grants prevent ownership/system/provenance changes. Catalog and `has_*_privilege` assertions accompany behavioral tests.

## Migration order

1. Confirm no extension is needed; stop for separate review if that changes.
2. Create tables and constraints.
3. Create indexes.
4. Create trigger/RPC functions and triggers.
5. Enable RLS and install ownership policies.
6. Create the security-invoker view.
7. Revoke broad privileges, then grant the explicit allowlist.

Application code remains configuration-gated until this migration is merged and applied. The Protein Tracker PR may be prepared in parallel but cannot merge first.

## Validation

- Immediately before naming the file and again before merge, re-run linked migration parity and confirm no newer canonical migration claimed the timestamp.
- Confirm the exact non-secret linked project reference `gsiyqhkcgegjrvqcqioc` before any linked operation.
- Reset the complete canonical history locally.
- Prove the configured seed path permits a clean reset; add an intentionally empty seed file if the missing path blocks reset.
- Run local database lint and migration parity inspection.
- Run an A/B/anonymous/service-role matrix through PostgREST with real local Auth JWTs for every exposed verb, ownership spoof, read-only/server-only object, view, RPC, replay/concurrency case, and erase boundary.
- Assert the post-migration Protein Tracker RLS, policy, table/column grant, function-execute, and default-PUBLIC boundaries from the catalog. Snapshot all non-`protein_` public relations, functions, policies, triggers, constraints, table/column grants, every default ACL, and representative sibling row counts before and after the destructive integration harness to prove the harness cleans up after itself. Migration non-regression is established separately by additive SQL scope review plus the sibling lint/typecheck/unit/build checks; do not describe the harness snapshot as a pre/post-migration diff.
- Run sibling formatting/lint, typecheck, unit tests, build, and relevant existing Supabase regressions.
- Review the final SQL for unsafe search paths, missing RLS/grants, ownership spoofing, data-loss behavior, sibling-object changes, and rollback risk.
- Generate types from the successful local reset and commit that handoff only in the dependent Protein Tracker repository.

## Local implementation evidence

- The canonical migration creates only reviewed `protein_` objects and adds no extension, global
  Auth trigger, default-privilege change, or tournament-object mutation.
- A complete local Supabase reset applied the canonical history through
  `20260723010000_protein_tracker_schema_rls.sql`; local database lint passed.
- `npm run test:supabase:local` in the Protein Tracker repository passed all 18 integration tests.
  The harness used real local anonymous, authenticated-A, authenticated-B, and service-role clients
  and covered ownership spoofing, operation grants, server-only objects, timestamp ownership,
  local-day/time-zone checks, daily totals, goal concurrency/replay/immutability, both-order erase
  races with food/weight inserts and profile onboarding updates, coaching evidence racing with
  erase and referenced-weight deletion, push/delivery serialization, erase retention, and exact
  post-migration policy/table/column-grant allowlists. Its
  before/after snapshot proves that the harness itself preserves non-Protein catalog/security state,
  every default ACL, and representative sibling rows. It is not a pre/post-migration snapshot;
  additive migration scope review and the sibling checks provide migration non-regression evidence.
- Local generated database types include the new Protein Tracker tables, view, relationships, and
  RPCs in the consuming repository.
- Sibling `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` passed. The default
  memory Playwright baseline was also attempted and failed in an unrelated pre-existing stale
  memory E2E flow; no failure involved a Protein Tracker route, migration, Supabase query, or
  changed tournament application code.
- Final independent SQL review resolved client-forgeable timestamps/columns, absolute notification
  due-time integrity, durable delivery deduplication, minimum coaching evidence, and delivery
  lifecycle consistency before approval.
- The compensating rollback was rehearsed against the verified local
  `supabase_db_bite-open-card-draw` database on 2026-07-23. Explicit dependency-ordered drops used
  no `CASCADE`: counts moved from 43 prefixed relations, 11 functions, 21 triggers, and 14 policies
  to zero inside one transaction, then `ROLLBACK` restored the exact 43/11/21/14 counts.

## Rollback

Before user data exists, rollback is a reviewed compensating migration that verifies every Protein Tracker table is empty and no dependent app is deployed, then drops only the view, triggers, functions, and tables in dependency order. Rehearse it in a disposable reset and prove the sibling catalog/data snapshot is unchanged. After user data or a deployed dependency exists, do not destructively reverse this migration; disable dependent features, roll back the app, and use an additive corrective migration.

## Merge and deployment order

1. Merge the green schema PR.
2. Re-verify the exact project reference and remote migration head.
3. Run `supabase db push --dry-run` and confirm only this migration is pending.
4. Push it, then verify parity and linked lint.
5. Run a hosted sibling smoke/non-regression check.
6. Only then merge or enable the dependent Protein Tracker PR.

## External configuration kept out of SQL

Shared Auth email-confirmation, templates, password policy, SMTP, and redirect allowlists are project-level settings. Audit and update them separately with preserved sibling behavior; no migration should silently mutate them.

## Plan review

Reviewed for scope, migration ownership, shared-project blast radius, RLS completeness, server-only data, search-path safety, migration ordering, app backward compatibility, rollback, and two-user test coverage. No tournament rule or sibling object requires modification.
