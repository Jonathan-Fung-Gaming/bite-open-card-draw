# Pumbility shared-schema overhaul acceptance checklist

Date created: 2026-08-13

Status: local implementation/recovery verified; PR, hosted migration, and cutover evidence open

Plan: `docs/phase-plans/phase-pumbility-shared-schema-overhaul-2026-08-13.md`

## Evidence rules

No checkbox may be marked complete without an evidence ID. Each evidence record must include:

| Field           | Required content                                                              |
| --------------- | ----------------------------------------------------------------------------- |
| Evidence ID     | Stable identifier referenced by checklist item                                |
| Phase and owner | Responsible repository/person and phase                                       |
| Boundary        | Source/generation/migration/commit and UTC timestamp                          |
| Procedure       | Exact command or manual procedure                                             |
| Expected result | Acceptance condition established before execution                             |
| Actual result   | Pass/fail and safe counts/hashes/diff summary                                 |
| Artifact        | CI run, safe log, checksum, screenshot, report, or private evidence reference |
| Variance        | Explicit approval, rationale, and approver; otherwise `none`                  |

Private player IDs, raw scores, secrets, database credentials, and private model artifacts must not
be committed as evidence. A private artifact is referenced by safe location metadata and checksum.
An item with an unexplained mismatch, missing boundary, or unavailable evidence remains unchecked.

## Phase 0 - authority, inventory, and readiness

- [x] Confirm `Jonathan-Fung-Gaming/bite-open-card-draw` is the sole production migration owner.
      Evidence: PUM-S0-HOSTED-01.
- [x] Confirm `jfung9021/pumbility-farmer` contains no competing production DDL history. Evidence:
      PUM-S0-HOSTED-01.
- [x] Record both repository URLs, default branches, clean starting commits, and owners. Evidence:
      PUM-S0-HOSTED-01.
- [ ] Read and record the applicable `AGENTS.md`, current brief, security notes, and phase plan.
- [x] Record the live Supabase project reference without committing credentials. Evidence:
      PUM-S0-HOSTED-01 (secured operational evidence; no credential committed).
- [x] Verify the target project is the intended existing `bite-open-card-draw` project. Evidence:
      PUM-S0-HOSTED-01.
- [x] Record PostgreSQL major/minor version and required extensions. Evidence: PUM-S0-HOSTED-01.
- [x] Record the complete local and linked migration lists and prove parity before selecting a new
      timestamp. Evidence: PUM-S0-HOSTED-01.
- [x] Verify the new migration timestamp is collision-free immediately before merge. Evidence:
      PUM-S0-HOSTED-01; repeat immediately before merge.
- [ ] Inventory all schemas, relations, views, functions, triggers, extensions, roles, grants,
      default ACLs, RLS policies, Realtime publications, buckets, and Storage policies.
- [x] Prove there is no existing `pumbility` schema or case-insensitive naming collision. Evidence:
      PUM-S0-HOSTED-01.
- [ ] Record currently exposed Data API schemas and request search paths.
- [ ] Record pooler modes, connection limits, reserved sibling capacity, and runtime usage.
- [x] Record database size, disk headroom, WAL generation, backup status, and PITR status. Evidence:
      PUM-S0-HOSTED-01.
- [ ] Record Storage limits, current usage, object-size limits, and required Pumbility artifact sizes.
- [ ] Record expected Pumbility row counts, retained generations, growth, and retention.
- [ ] Record migration operator, maintenance window, RPO, RTO, and restore authority.
- [ ] Inventory authoritative Vercel Cache/Blob paths, objects, sizes, generations, and active jobs.
- [ ] Confirm no secrets or private records entered the committed inventory.
- [ ] Approve schema naming, private Storage, retention, consent erasure, capacity, and rollback
      decisions.

## Phase 1 - frozen data and behavior contract

- [ ] Create and review the current-state document in `pumbility-farmer`.
- [ ] Create and review the source-to-target data contract.
- [ ] Create and review the full behavior contract.
- [ ] Create a safe baseline manifest and private evidence index.
- [ ] Select and record the `T0` source boundary.
- [ ] Record Phoenix 1 private snapshot path, size, checksum, schema version, and counts.
- [ ] Record the distinct Phoenix 1 frozen public artifact and manifest checksum.
- [ ] Prove Phoenix 1 private and public artifacts are not conflated.
- [ ] Record Phoenix 2 snapshot path, checksum, generation time, and counts.
- [ ] Record consented-player membership hash at `T0`.
- [ ] Record current chart-catalog hash for each mix at `T0`.
- [ ] Record current best-score logical hash for each mix at `T0`.
- [ ] Record public player-index hash at `T0`.
- [ ] Record active analysis, combined-tier, and recommendation generations.
- [ ] Record model artifact checksum, byte length, content type, and schema version.
- [ ] Record retained run/generation inventory and retention rules.
- [ ] Record rerate, video mapping, alias, score override, grade/plate, and methodology hashes.
- [ ] Inventory every expected source field and its destination type/nullability/provenance.
- [ ] Inventory every API route, method, parameter, authentication rule, response, error, header,
      redirect, and cache contract.
- [ ] Capture redacted golden responses for every representative API outcome.
- [ ] Inventory all frontend routes and primary desktop/mobile workflows.
- [ ] Capture safe UI reference evidence for primary, empty, limited, stale, loading, and error states.
- [ ] Inventory cron, operator, cancellation, deduplication, retry, rollback, and stale-result behavior.
- [ ] Inventory local-analysis and demo behavior.
- [ ] Record all methodology code/dependency/configuration hashes, constants, seeds, and serialized
      precision.
- [ ] Record baseline endpoint p50/p95/p99, global-run duration, player-refresh duration, connection
      usage, and storage/transfer volume.
- [ ] Define the post-`T0` change ledger and `T1` reconciliation procedure.
- [ ] Review and sign the complete data/behavior baseline before DDL merges.

## Phase 2 - CI routing

- [x] Define a narrowly reviewed Pumbility database change allowlist. Evidence: PUM-S2-STATIC-01.
- [x] Include only Pumbility migrations, SQL tests, focused database runner/rollback/plan/evidence
      documents, and the initial CI-routing file in the allowlist. Evidence: PUM-S2-STATIC-01.
- [x] Treat changes to application source, package manifests, generic scripts, unrelated docs,
      unrelated workflows, or non-Pumbility migrations as mixed. Evidence: PUM-S2-STATIC-01.
- [x] Detect `pumbility_changed` independently from `pumbility_only`. Evidence:
      PUM-S2-STATIC-01.
- [x] Prove a Pumbility-only PR runs the Supabase Pumbility database job. Evidence:
      PUM-S2-CI-01.
- [x] Prove a Pumbility-only PR skips lint, typecheck, application unit tests, build, Playwright,
      load, and all sibling application tests. Evidence: PUM-S2-CI-01.
- [ ] Prove a mixed Pumbility/application PR runs both Pumbility database checks and normal CI.
- [ ] Prove a non-Pumbility PR runs normal CI and skips the Pumbility database job.
- [ ] Prove pushes to `main` retain the intended existing normal CI behavior.
- [x] Pin or otherwise control the Supabase CLI version used by CI. Evidence: PUM-S2-STATIC-01.
- [x] Ensure the CI database target is a disposable local Supabase stack only. Evidence:
      PUM-S2-STATIC-01.
- [x] Ensure the database test runner refuses non-loopback/destructive hosted targets. Evidence:
      PUM-S2-STATIC-02.
- [ ] Ensure CI teardown does not persist local database secrets or artifacts.

## Phase 2 - migration and schema integrity

- [x] Create only a lowercase `pumbility` schema; no `PUMBILITY_`/`pumbility_` table prefixes exist.
      Evidence: PUM-S2-STATIC-03.
- [x] Keep `pumbility` out of Data API exposed schemas and extra search paths. Evidence:
      PUM-S2-STATIC-03.
- [x] Add only expand-only, flags-off database changes. Evidence: PUM-S2-STATIC-03.
- [x] Create every approved provenance, identity, catalog, sync, job, score, analysis,
      recommendation, artifact, publication, reconciliation, and reference table. Evidence:
      PUM-S2-STATIC-03.
- [ ] Document any planned table intentionally deferred and provide the evidence-based reason.
- [x] Create the approved current/public-safe internal views without exposing them to browsers.
      Evidence: PUM-S2-STATIC-03.
- [x] Verify every table has a primary key. Evidence: PUM-S2-STATIC-03.
- [ ] Verify every relationship has the intended foreign key and delete/update behavior.
- [ ] Verify every source/natural key has the intended uniqueness constraint.
- [x] Enforce one open consent interval per player/scope. Evidence: PUM-S2-STATIC-03.
- [x] Enforce one open chart revision per chart/mix. Evidence: PUM-S2-STATIC-03.
- [x] Enforce one open score revision per mix/player/chart. Evidence: PUM-S2-STATIC-03.
- [x] Enforce unique source player identity and stable legacy public key. Evidence:
      PUM-S2-STATIC-03.
- [x] Enforce job idempotency and approved active-job uniqueness. Evidence: PUM-S2-STATIC-03.
- [ ] Enforce valid mode, mix, status, evidence, job, run, and generation states.
- [x] Enforce lease owner/expiry fencing on job mutations and publication. Evidence:
      PUM-S2-STATIC-03.
- [x] Enforce ready/validated generation state before publication. Evidence: PUM-S2-STATIC-03.
- [x] Enforce one active publication pointer per publication key. Evidence: PUM-S2-STATIC-03.
- [x] Enforce one last-successful recommendation head per player. Evidence: PUM-S2-STATIC-03.
- [x] Enforce artifact checksum, size, schema version, and object-path requirements. Evidence:
      PUM-S2-STATIC-03.
- [x] Preserve external identifiers as `text` unless the source contract proves a stronger type.
      Evidence: PUM-S2-STATIC-03.
- [x] Preserve raw timestamp text where compatibility requires it and store parsed `timestamptz`.
      Evidence: PUM-S2-STATIC-03.
- [x] Use `double precision` where NumPy/Pandas numeric parity requires it. Evidence:
      PUM-S2-STATIC-03.
- [x] Create ranking, chart aggregation, lease/status, publication, and recommendation-filter indexes.
      Evidence: PUM-S2-STATIC-03.
- [ ] Capture and approve query plans for dominant read/write paths.
- [x] Prove no unjustified partitioning was introduced. Evidence: PUM-S2-STATIC-03.
- [x] Prove no default-privilege changes were introduced. Evidence: PUM-S2-STATIC-03.
- [x] Prove no project-wide Auth changes were introduced. Evidence: PUM-S2-STATIC-03.
- [x] Prove no unrelated Realtime publication changes were introduced. Evidence:
      PUM-S2-STATIC-03.
- [x] Prove no unrelated schema/table/function/trigger/index/policy was altered. Evidence:
      PUM-S2-STATIC-03.

## Phase 2 - database functions and concurrency

- [x] Create reviewed job-claim, heartbeat, completion, cancellation, and retry functions. Evidence:
      PUM-S2-STATIC-03 and PUM-S2-REVIEW-01.
- [x] Create reviewed generation validation and atomic publication function(s). Evidence:
      PUM-S2-STATIC-03 and PUM-S2-REVIEW-01.
- [x] Create reviewed player-head update function that preserves the previous success on failure.
      Evidence: PUM-S2-STATIC-03 and PUM-S2-REVIEW-01.
- [x] Use database time for leases and state fencing. Evidence: PUM-S2-STATIC-03.
- [x] Use transaction-scoped locking or compare-and-swap fencing as designed. Evidence:
      PUM-S2-STATIC-03.
- [x] Qualify every object reference inside elevated functions. Evidence: PUM-S2-REVIEW-01.
- [x] Set elevated functions to `SECURITY DEFINER SET search_path = ''`. Evidence:
      PUM-S2-STATIC-03.
- [x] Revoke function execution from `PUBLIC`, `anon`, and `authenticated`. Evidence:
      PUM-S2-STATIC-03.
- [x] Grant only exact reviewed function signatures to the intended server role. Evidence:
      PUM-S2-STATIC-03.
- [x] Prove duplicate global job delivery is idempotent. Evidence: PUM-S2-LOCAL-01.
- [x] Prove same-player refresh delivery deduplicates. Evidence: PUM-S2-LOCAL-01.
- [ ] Prove different-player jobs retain the configured concurrency limit in the application layer.
- [ ] Prove an expired lease cannot allow two publishers.
- [ ] Prove a superseded or cancelled job cannot publish.
- [ ] Prove continuous heartbeat is supported during sync, analysis, and model fitting.
- [ ] Prove a worker crash before publication leaves active pointers unchanged.
- [ ] Prove an artifact-uploaded-but-unpublished crash leaves only reclaimable orphan state.
- [ ] Prove concurrent publication exposes either the old complete generation or the new complete
      generation, never a mixture.
- [ ] Prove a failed player refresh leaves the prior recommendation head active.
- [ ] Prove checkpoint resume produces the same database state as uninterrupted work.

## Phase 2 - roles, RLS, privacy, and Storage

- [x] Create reviewed narrow NOLOGIN group roles without committed passwords. Evidence:
      PUM-S2-STATIC-03.
- [x] Revoke schema usage from `PUBLIC`, `anon`, and `authenticated`. Evidence:
      PUM-S2-STATIC-03.
- [x] Revoke all base relation/sequence/function privileges from browser roles. Evidence:
      PUM-S2-STATIC-03.
- [x] Enable RLS on every Pumbility base table. Evidence: PUM-S2-STATIC-03.
- [x] Force RLS on every Pumbility application table; record and approve any exception as a
      variance before migration merge. Evidence: PUM-S2-STATIC-03.
- [x] Verify browser roles have zero policies granting Pumbility base access. Evidence:
      PUM-S2-STATIC-03.
- [ ] Grant runtime writer and server reader only the documented minimum privileges.
- [ ] Verify the runtime reader cannot access upstream player IDs or raw score/contribution facts not
      needed for serving.
- [ ] Verify migration credentials and runtime credentials are separate.
- [ ] Verify prepared statements are disabled on transaction-pooled connections.
- [ ] Verify runtime code uses transaction pooling and bounded connections.
- [ ] Verify migrations, `COPY`, dumps, and restore use direct/session connections.
- [x] Create a private `pumbility-artifacts` bucket. Evidence: PUM-S2-LOCAL-01.
- [x] Verify the bucket is not public and has no browser upload/read/delete path. Evidence:
      PUM-S2-LOCAL-01.
- [x] Verify exact server-only Storage policies. Evidence: PUM-S2-LOCAL-01.
- [x] Verify object-size and MIME-type limits support actual model artifacts. Evidence:
      PUM-S2-LOCAL-01.
- [x] Verify artifact checksum/length/schema validation is mandatory before ready/publication.
      Evidence: PUM-S2-LOCAL-01.
- [ ] Verify PostgreSQL records contain no PIU Scores, Supabase, cron, or operator credentials.
- [ ] Verify public-safe views/payload fixtures contain no upstream IDs, raw scores, UUIDs, cohort
      identifiers, secrets, or internal errors.
- [ ] Verify logs, job events, and reconciliation output are sanitized.
- [ ] Verify consent revocation behavior matches the approved retention and public-removal contract.

## Phase 2 - local database verification and recovery

- [x] Apply the full migration history to a clean local Supabase database with `--no-seed`.
      Evidence: PUM-S2-LOCAL-01.
- [ ] Apply the migration to a production-shaped schema snapshot.
- [x] Run local database lint with error/fail-on-error settings. Evidence: PUM-S2-LOCAL-01.
- [x] Run complete Pumbility catalog/type/constraint/index assertions. Evidence:
      PUM-S2-LOCAL-01.
- [x] Run complete Pumbility RLS/grant/function/security assertions. Evidence:
      PUM-S2-LOCAL-01.
- [x] Run job lease/idempotency/atomic publication behavior assertions. Evidence:
      PUM-S2-LOCAL-01.
- [x] Run required two-session concurrency races. Evidence: PUM-S2-LOCAL-01.
- [x] Run Storage bucket/policy catalog assertions. Evidence: PUM-S2-LOCAL-01.
- [ ] Snapshot sibling catalogs before/after and prove isolation.
- [x] Prove representative tournament, Protein Tracker, and Karaoke Party database objects remain
      present without running their application tests. Evidence: PUM-S2-LOCAL-01. Full catalog
      fingerprint comparison remains a separate unchecked gate above.
- [ ] Generate and review a schema diff limited to intended Pumbility/Storage objects.
- [x] Create a Pumbility-only logical dump. Evidence: PUM-S2-RESTORE-01.
- [x] Restore that dump into a clean compatible database and verify hashes/counts. Evidence:
      PUM-S2-RESTORE-01.
- [x] Back up and restore a representative private Storage artifact independently. Evidence:
      PUM-S2-RESTORE-01.
- [x] Rehearse the dependency-ordered compensating rollback inside a local transaction. Evidence:
      PUM-S2-RESTORE-01.
- [x] Prove rollback refuses nonempty Pumbility data. Evidence: PUM-S2-RESTORE-01.
- [x] Prove rollback names objects explicitly and uses no `CASCADE`. Evidence:
      PUM-S2-STATIC-03 and PUM-S2-RESTORE-01.
- [ ] Prove rollback leaves all sibling catalog fingerprints unchanged.
- [x] Roll back the rehearsal transaction, rebuild forward, and rerun database tests and lint.
      Evidence: PUM-S2-RESTORE-01.

## Phase 3 - consumer adapters with flags off

- [ ] Record the deployed schema migration version in `pumbility-farmer`.
- [ ] Preserve the Vercel persistence implementations.
- [ ] Add Supabase persistence through interfaces rather than analysis-code coupling.
- [ ] Add canonical deterministic logical hashing.
- [ ] Add restartable/idempotent backfill and reconciliation commands.
- [ ] Add generation/publication/job lease adapters.
- [ ] Add continuous heartbeat through synchronization, analysis, and model fitting.
- [ ] Keep all Supabase read/write feature flags off in production.
- [ ] Prove existing production reads, writes, outputs, and schedules are unchanged.
- [ ] Run the complete `pumbility-farmer` application verification suite.

## Phase 4 - `T0` backfill and `T1` reconciliation

- [ ] Import Phoenix 1 private evidence with checksum and source provenance.
- [ ] Import the distinct frozen Phoenix 1 public artifact as an immutable imported analysis run.
- [ ] Import Phoenix 2 current snapshot.
- [ ] Import retained analysis and combined-tier generations.
- [ ] Import recommendation generations, binary artifacts, player state, and cached results.
- [ ] Import rerates, video mappings/overrides, aliases, score overrides, and methodology constants.
- [ ] Verify exact `T0` player, chart, score, consent, run, generation, candidate, and artifact counts.
- [ ] Verify exact `T0` natural-key and logical hashes.
- [ ] Verify deterministic best-score winner identity for every player/chart.
- [ ] Verify no duplicate natural keys.
- [ ] Verify no foreign-key orphans.
- [ ] Verify all active pointers resolve to complete imported generations.
- [ ] Verify every imported artifact checksum, size, content type, and schema version.
- [ ] Apply each recorded post-`T0` change through `T1`.
- [ ] Verify every `T1` mismatch maps to a specific accepted change/removal/revocation ledger entry.
- [ ] Verify zero unexplained `T1` differences.
- [ ] Verify no private data appears in public relations or committed evidence.

## Phase 5 - synchronization parity

- [ ] Verify consented-player discovery and revocation removal match.
- [ ] Verify seven-day incremental overlap matches.
- [ ] Verify six upstream workers and 125 ms shared request-start limiting match.
- [ ] Verify `Retry-After` behavior matches.
- [ ] Verify 24-hour empty-player rechecks match.
- [ ] Verify chart-catalog pruning matches.
- [ ] Verify full-sync behavior matches.
- [ ] Verify per-player checkpoint/resume semantics match without whole-snapshot checkpoint writes.
- [ ] Verify best-row ordering matches for every tie dimension.
- [ ] Verify missing interactive full-fetch rows do not introduce new deletions.
- [ ] Verify only approved full reconciliation/explicit events close missing/downward revisions.
- [ ] Verify content hashing prevents unchanged rewrites without changing observable data.
- [ ] Verify at least two scheduled shadow runs and one full operator sync.

## Phase 5 - statistical analysis parity

- [ ] Verify exact methodology, code, dependency, seed, configuration, and constants identity.
- [ ] Verify eligible Singles players match.
- [ ] Verify eligible Doubles players match.
- [ ] Verify positive/non-broken filtering matches.
- [ ] Verify ranks 11-30 baseline membership/count/value matches.
- [ ] Verify top-Pumbility and recency contribution selections match.
- [ ] Verify deduplicated contribution union and top-100 fallback match.
- [ ] Verify mode separation matches.
- [ ] Verify Pumbility-per-level calibration matches.
- [ ] Verify empirical-Bayes shrinkage parameters/results match.
- [ ] Verify folder medians and range compression match.
- [ ] Verify chart contributor/source counts match.
- [ ] Verify estimates, confidence intervals, evidence, bands, relative groups, mode ranks, and level
      ranks match at serialized precision or approved `1e-6` tolerance.
- [ ] Verify Phoenix 1 score conversions/rebanding match.
- [ ] Verify Phoenix 2 catalog allowlist matches.
- [ ] Verify Phoenix 2 precedence over Phoenix 1 matches.
- [ ] Verify combined chart results and public tier payloads match.

## Phase 5 - recommendation parity

- [ ] Verify generation and eligible-player membership match.
- [ ] Verify public player keys and display names remain unchanged.
- [ ] Verify mode eligibility and rating-source selection match.
- [ ] Verify top-20 rating and ranks 11-30 projection windows match.
- [ ] Verify Phoenix 1 fallback and Phoenix 2 threshold behavior match.
- [ ] Verify current per-mode top 50 matches.
- [ ] Verify overall shared Singles+Doubles top 50 matches.
- [ ] Verify played state and existing Pumbility match.
- [ ] Verify peer cohort, selected-player exclusion, radius search, and 20/10/5 support thresholds
      match.
- [ ] Verify population fallback matches.
- [ ] Verify projected scores, grades, plates/probabilities, expected Pumbility, gains, confidence,
      source, and support match.
- [ ] Verify tie ordering, full filter-pool membership, and top-20 order match.
- [ ] Verify daily work does not precompute every player's candidate pool.
- [ ] Verify model binary is loaded once per generation per warm worker.
- [ ] Verify stale-generation, failed-refresh, and rollback behavior match.

## Phase 5 - application/API/UI/job parity

- [ ] Verify every existing route, method, parameter/default, authentication rule, status code,
      header, redirect, and JSON shape matches.
- [ ] Verify nullable versus omitted fields match.
- [ ] Verify cache-control behavior matches the recorded baseline.
- [ ] Verify Phoenix 1 refresh rejection and analyze redirect match.
- [ ] Verify Phoenix 2 remains the default mix.
- [ ] Verify signed deployment webhook no-op behavior matches.
- [ ] Verify operator incremental/full refresh behavior matches.
- [ ] Verify player/global job polling, deduplication, concurrency, cancellation, retry, and safe
      errors match.
- [ ] Verify failed/stale results preserve the same prior data and warnings.
- [ ] Verify all frontend workflows, ordering, filters, ladders, limited-data displays, projections,
      annotations, video links, and operator views match.
- [ ] Verify local-analysis and demo modes remain functional.
- [ ] Verify desktop/mobile/accessibility behavior has no material regression.
- [ ] Verify public endpoints expose no new private/internal fields.
- [ ] Run API goldens, complete unit/integration tests, typecheck, build, and relevant UI/e2e tests in
      `pumbility-farmer`.

## Phase 5 - failure, privacy, and performance evidence

- [ ] Test duplicate queue delivery.
- [ ] Test lease expiry and competing-worker prevention.
- [ ] Test cancellation during sync, analysis, model fitting, artifact upload, and pre-publication.
- [ ] Test worker crash before/after artifact upload and before/after relational writes.
- [ ] Test consent revocation during a running job.
- [ ] Test active generation change during player refresh.
- [ ] Test PostgreSQL, pooler, and Storage unavailability.
- [ ] Test previous-generation and Blob fallback.
- [ ] Run public-payload and evidence privacy scans.
- [ ] Verify no credentials, raw IDs/scores, or SQL parameters leak to logs/errors.
- [ ] Compare endpoint p50/p95/p99 against baseline and approve thresholds.
- [ ] Compare global and player-refresh runtime against baseline and existing deadlines.
- [ ] Verify connection pool stays below reserved capacity.
- [ ] Verify database CPU, IO, WAL, disk, and Storage transfer remain within approved budgets.
- [ ] Verify no repeated whole-snapshot checkpoint serialization remains.
- [ ] Verify orphan artifact cleanup and existing retention behavior.
- [ ] Verify freshness, generation failure, reconciliation mismatch, pool exhaustion, and disk alerts.

## Phase 6 - canary reads

- [ ] Enable internal comparison reads first behind reversible flags.
- [ ] Canary analysis reads.
- [ ] Canary tier-list reads.
- [ ] Canary public player-list reads.
- [ ] Canary cached player recommendation reads.
- [ ] Canary player refresh/status reads.
- [ ] Canary global refresh/job-status reads.
- [ ] Canary rollback behavior last.
- [ ] Compare safe old/new payload hashes during the full canary window.
- [ ] Verify immediate Blob fallback for each endpoint group.
- [ ] Record zero unexplained canary mismatches before proceeding.

## Phase 7 - write authority and cutover

- [ ] Drain all active global and player jobs.
- [ ] Record the final pre-cutover source boundary.
- [ ] Reconcile both stores with zero unexplained differences.
- [ ] Verify every active Supabase publication points to a complete ready generation.
- [ ] Switch authoritative writes through reviewed flags.
- [ ] Keep Blob outbox mirroring and read fallback enabled.
- [ ] Complete one normal scheduled production cycle.
- [ ] Complete one full operator sync.
- [ ] Complete representative eligible, ineligible, limited-data, and fallback player refreshes.
- [ ] Exercise recommendation/analysis publication rollback.
- [ ] Exercise forward restoration.
- [ ] Exercise database/pooler outage fallback.
- [ ] Exercise Storage artifact failure and prove the prior generation remains active.
- [ ] Verify all security, parity, performance, and operational alerts during cutover.

## Phase 8 - final acceptance and retirement guard

- [ ] Complete the approved stabilization window.
- [ ] Resolve or explicitly approve every variance.
- [ ] Verify every checked item has a complete evidence record.
- [ ] Verify both repositories record the exact production migration version.
- [ ] Verify PostgreSQL and Storage backup/restore evidence remains current.
- [ ] Verify Pumbility-only recovery does not require a shared-project restore.
- [ ] Verify rollback remains available throughout the agreed window.
- [ ] Obtain explicit schema-owner, application-owner, privacy, and operations signoff.
- [ ] Stop dual writes only after signoff.
- [ ] Keep legacy Blob data read-only for the full rollback retention window.
- [ ] Do not remove legacy persistence in the cutover release.
- [ ] Require a separately scoped plan/PR/evidence set for legacy retirement.

## Delivery controls

- [ ] No migration or application implementation starts before the plan self-review passes.
- [ ] No commit, push, PR, merge, or hosted mutation occurs without explicit authorization.
- [ ] No hosted migration runs before exact target verification and reviewed dry-run evidence.
- [ ] Each phase receives at most one general review and one focused repair for a proven regression.
- [ ] Unrelated/pre-existing issues are reported without expanding this migration's scope.
- [ ] Correct and verified acceptance criteria end the phase; hypothetical hardening does not extend
      it.
