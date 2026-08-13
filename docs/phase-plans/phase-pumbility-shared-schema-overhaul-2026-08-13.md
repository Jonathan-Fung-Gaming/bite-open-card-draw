# Pumbility shared-schema overhaul implementation plan

Date: 2026-08-13

Status: Phase 2 files implemented; executable local and hosted gates remain open

Schema owner: `Jonathan-Fung-Gaming/bite-open-card-draw`

Consuming application: `jfung9021/pumbility-farmer`

Supabase project: existing `bite-open-card-draw` project

## Objective

Add an isolated, private `pumbility` PostgreSQL schema and private `pumbility-artifacts` Storage
bucket to the existing shared Supabase project. The new model will become the typed source of truth
for Pumbility data, synchronization state, analysis lineage and results, recommendation state, and
atomic publication. The migration must preserve every existing Pumbility application, API,
analysis, synchronization, cache, job, local-development, and user-interface behavior.

This repository remains the sole canonical owner of Supabase migrations. The consuming
`pumbility-farmer` repository owns Python analysis, application adapters, backfill and reconciliation
tools, API behavior, frontend behavior, and application regression evidence.

The user subsequently authorized local Phase 2 SQL, database-test, CI-routing, and evidence-file
implementation only. Commits, pushes, pull requests, migration application, actual Storage creation,
and hosted mutation remain unauthorized.

## Fixed decisions

- Use a dedicated PostgreSQL schema named `pumbility`.
- Use ordinary lowercase table names such as `pumbility.players`; do not prefix tables with
  `PUMBILITY_` or `pumbility_`.
- Keep `pumbility` absent from Supabase Data API exposed schemas and request search paths.
- Keep the existing FastAPI application as the public boundary. Browser clients receive no direct
  access to base tables.
- Store structured operational and analytical records in PostgreSQL.
- Store large immutable NPZ/model binaries in a private Storage bucket named
  `pumbility-artifacts`; store checksums, sizes, schema versions, and object paths in PostgreSQL.
- Preserve the existing Python/Pandas/NumPy analysis implementation initially.
- Preserve Vercel Queue/Celery, cron, and current worker orchestration initially.
- Use Supavisor transaction pooling for normal runtime SQL. Disable prepared statements on pooled
  connections and keep transactions short.
- Use a direct or session connection for migrations, `COPY`, large backfills, dumps, restores, and
  operations that require session state.
- Do not partition tables initially. Add only evidence-backed indexes.
- Publish immutable analysis/model generations through atomic PostgreSQL pointers.
- Keep Vercel persistence authoritative until backfill, shadow, and canary gates pass.
- Make every database migration expand-only and deploy with application flags off.
- Do not remove legacy persistence in the cutover release.

## Authority and repository boundary

### `bite-open-card-draw` owns

- `supabase/migrations/**` and migration ordering.
- Creation and evolution of the `pumbility` schema.
- Tables, views, constraints, indexes, triggers, database functions, roles, grants, and RLS.
- The `pumbility-artifacts` bucket declaration and Storage policies.
- Database-only schema, security, integrity, concurrency, and rollback tests.
- Local and hosted migration runbooks and Pumbility-only dump/restore instructions.
- The CI routing needed to enforce Pumbility database-only PR checks.

### `pumbility-farmer` owns

- The current-state data and behavior contracts.
- Persistence interfaces and the Vercel and Supabase implementations.
- Synchronization, backfill, logical hashing, and reconciliation commands.
- Python analysis and recommendation algorithms.
- FastAPI contracts, frontend behavior, local/demo behavior, and job orchestration.
- Old-store-versus-new-store parity, golden API, UI, performance, and privacy tests.
- Feature flags, shadow reads/writes, canary selection, fallback, and cutover logic.

### Cross-repository dependency rule

1. The schema-owner repository merges and applies expand-only migrations first.
2. The consuming application records the exact required migration version.
3. Application code remains backward-compatible or disabled until migration parity is verified.
4. Destructive cleanup is a later, separately approved phase after the rollback window.

No Pumbility production DDL may be maintained in the consuming repository. No application behavior
may be implemented in this schema-owner repository.

## Frozen behavior contract

The work is a persistence and processing-boundary migration, not a product or methodology change.
The baseline contract in `pumbility-farmer` must capture the exact pre-migration behavior. Until the
final acceptance gate is signed, the following remain unchanged:

- API routes, methods, parameters, authentication, status codes, headers, redirects, response
  schemas, nullable/omitted fields, and serialized precision.
- Frontend routes, ordering, filters, recommendations, progress ladders, limited-data displays,
  video links, rerate annotations, mobile behavior, local analysis, and demo mode.
- Public player keys, usernames/display names, player-list visibility, and forbidden private fields.
- Phoenix 1 archive rules and the separation of private evidence from the frozen public artifact.
- Phoenix 2 catalog allowlisting and Phoenix 2 precedence in combined analysis.
- Daily seven-day overlap, six upstream workers, the shared 125 ms request-start limiter,
  `Retry-After`, 24-hour empty-player rechecks, consent revocation, catalog pruning, full sync, and
  checkpoint/resume behavior.
- Interactive refresh's full-history fetch and existing deterministic best-row merge. Missing rows
  must not become deletion signals unless the existing implementation already treats them that way.
- Analysis eligibility, ranks 11-30 baselines, contribution selection, top-100 fallback,
  calibration, empirical-Bayes shrinkage, folder normalization, ranking, bands, and constants.
- Recommendation rating windows, mode eligibility, Phoenix 1 fallback, peer radii and minimum
  support, population fallback, score/grade/plate projections, top-50 rules, top-20 ordering, full
  filter-pool membership, and rollback/staleness semantics.
- Job deduplication, concurrency limits, cancellation, retry delays, heartbeat, error sanitization,
  stale-result behavior, and previous-result preservation after failure.
- Existing cache durations and refresh frequency.

Any behavior or methodology improvement discovered during this work is documented separately and
deferred unless it fixes a deterministic regression caused by the migration.

## Baseline and evidence model

Before schema implementation, `pumbility-farmer` must establish a source boundary `T0` and a
behavior contract. Evidence must not commit raw upstream player IDs, raw score histories, secrets,
or private artifacts.

The committed baseline manifest records safe metadata and logical hashes for:

- Phoenix 1 private snapshot and its distinct frozen public result.
- Phoenix 2 current snapshot.
- consented-player membership;
- each mix's current chart catalog and best-score winners;
- public player index;
- active analysis, combined-tier, and recommendation generations;
- model artifact checksum and schema version;
- retained generations and runs;
- rerates, video mappings, aliases, score overrides, grade/plate constants, and methodology inputs;
- representative redacted API golden responses, UI states, job outcomes, and performance baselines.

`T0` must be imported exactly. A later boundary `T1` is reconciled as:

```text
T1 expected state = imported T0 + identified accepted changes - identified removals/revocations
```

There is no percentage-based data tolerance. Every difference must be tied to a recorded upstream
change, sync run, revocation, catalog removal, or approved variance. Numeric analysis fields may use
only the current serialized precision or an explicitly approved absolute tolerance of `1e-6`.

Each checklist item requires an evidence ID, command or procedure, timestamp, result, artifact or CI
link, owner, and approved variance if applicable. Private evidence stays in secured operational
storage and is represented in Git only by a safe checksum or evidence reference.

## Planned relational model

The final column definitions will be reviewed against real `T0` data before DDL. External identifiers
remain `text` unless the source contract proves a stronger type. Timestamps that affect compatibility
retain both parsed `timestamptz` and original source text where needed. Pumbility and transformed
score values use `double precision` to preserve NumPy/Pandas behavior.

### Provenance, identity, and catalog

- `pumbility.data_sources`: upstream/source identity without credentials.
- `pumbility.consent_scopes`: named consent contract.
- `pumbility.mixes`: Phoenix version/API/archive metadata.
- `pumbility.players`: internal UUID, source player ID, stable legacy public key, display name, and
  lifecycle timestamps.
- `pumbility.player_consents`: temporal consent intervals and source-sync lineage.
- `pumbility.songs`: upstream song identity and normalized descriptive metadata.
- `pumbility.charts`: stable logical/external chart identity.
- `pumbility.chart_revisions`: mix-specific temporal chart metadata, validity sequence, and content
  hash.

### Synchronization and jobs

- `pumbility.schema_metadata`: the canonical migration contract checked before a consumer enables
  its Supabase backend.
- `pumbility.jobs`: durable idempotency, state, stage, attempt, progress, lease, heartbeat,
  cancellation, retry, safe error, and configuration hashes.
- `pumbility.job_heads`: durable named pointers used by the compatibility job/status contract.
- `pumbility.job_events`: append-only state/stage transitions and timing metrics.
- `pumbility.sync_runs`: full, incremental, or player sync boundaries and upstream metrics.
- `pumbility.sync_run_players`: per-player checkpoint and outcome without serializing a whole
  snapshot.
- `pumbility.player_mix_state`: mix-specific score/sync watermarks, empty-player recheck state, and
  full-reconciliation lineage.
- `pumbility.score_revisions`: temporal best-score facts and deterministic source-row hashes.
- `pumbility.current_best_scores`: open-revision view.

### Analysis and methodology

- `pumbility.methodologies`: immutable code, dependency, formula, constants, seed, and configuration
  identity.
- `pumbility.score_overrides`: versioned Phoenix 1 conversions/rebanding provenance.
- `pumbility.analysis_runs`: run state, methodology, job, timing, coverage, inputs, and hashes.
- `pumbility.analysis_run_inputs`: exact sync/import dependencies and precedence roles.
- `pumbility.analysis_mode_results`: calibration, shrinkage, eligibility, and coverage summaries.
- `pumbility.player_mode_features`: per-player/mode baselines, ratings, counts, and selection hashes.
- `pumbility.chart_contributions`: private selected contribution facts with controlled retention.
- `pumbility.chart_results`: typed per-chart estimates, intervals, ranks, bands, evidence, and counts.
- `pumbility.analysis_folder_results`: optional materialized folder summaries, created only if query
  evidence justifies persistence.

### Recommendation generations

- `pumbility.model_generations`: immutable building/ready/shadow/published/rolled-back/expired model
  generations and hashes.
- `pumbility.model_player_features`: frozen generation/player eligibility and rating features.
- `pumbility.recommendation_refreshes`: per-player generation/job lineage and execution state.
- `pumbility.recommendation_mode_results`: compact player/mode state and candidate counts.
- `pumbility.recommendation_candidates`: normalized player/chart candidate facts referencing shared
  chart records.
- `pumbility.player_recommendation_heads`: one atomic last-successful result pointer per player.

Daily work must build the global model once. It must not precompute every player's full candidate
pool. Candidate rows remain generated on player open/refresh so chart metadata and candidate pools
are not duplicated across all players.

### Publication, artifacts, reconciliation, and reference data

- `pumbility.artifacts`: immutable payload metadata, Storage path or compact JSON, checksum, size,
  content type, schema version, retention, and producing run/generation.
- `pumbility.publications`: singleton atomic pointers such as `phoenix2-analysis`, `combined-tier`,
  and `recommendation-model`.
- `pumbility.outbox_events`: transactional compatibility-mirror events while Blob fallback exists.
- `pumbility.reconciliation_runs`: boundaries, counts, hashes, parity state, and safe mismatch data.
- `pumbility.chart_rerates`: Phoenix 1-to-2 annotation changes and source-row provenance.
- `pumbility.chart_videos`: validated chart/video mappings and override provenance.
- `pumbility.song_aliases`: imported title aliases and provenance.
- Public-safe internal views such as `current_catalog`, `current_analysis`, `public_tier_list`,
  `public_players`, and `current_player_recommendations`, exposed only to the application server.

Static images, screenshots, logs, local CSV exports, synthetic fixtures, and test output do not
become production relational facts.

## Required database invariants

- One open consent interval per player and consent scope.
- One open chart revision per chart and mix.
- One open best-score revision per mix, player, and chart.
- Unique player identity per source and unique stable public player key.
- Unique job idempotency key and one active global refresh where applicable.
- Lease owner and unexpired lease required for job heartbeat, mutation, completion, cancellation,
  and publication.
- A cancelled or superseded job cannot publish.
- A publication can reference only a fully validated `ready` generation whose required relational
  rows and artifacts passed checksum/completeness checks.
- Publication pointer updates are atomic and cannot expose partial generations.
- A failed player refresh cannot replace the last successful recommendation head.
- Score winner ordering exactly preserves the current Pumbility, score, raw timestamp, metadata
  completeness, and chart-ID ordering contract.
- Incremental seven-day fetches never infer deletions or downward corrections from absence.
- Full reconciliation and explicit consent/catalog events are the only approved closing signals.
- All external/natural identifiers and hashes have explicit uniqueness constraints where the source
  contract requires them.
- Dominant player-ranking, chart-analysis, recommendation-filter, lease, status, and publication
  reads have evidence-backed indexes and reviewed query plans.

## Security and privacy design

- `supabase/config.toml` continues to expose only `public` and `graphql_public`; `pumbility` is not
  added to `api.schemas` or `api.extra_search_path`.
- Base relations are private, RLS is enabled and forced on every Pumbility application table, and
  browser roles receive no grants or policies. Any exception requires an explicit reviewed
  variance before migration merge.
- Revoke schema, relation, sequence, and function privileges from `PUBLIC`, `anon`, and
  `authenticated` before adding exact grants.
- Use narrow NOLOGIN group roles for runtime write and server-read capabilities. Provision any
  login credential out of band; never commit passwords. Do not alter project-wide default
  privileges.
- Application functions that require elevated rights use `SECURITY DEFINER SET search_path = ''`,
  fully qualified names, exact parameter signatures, and explicit execute grants.
- Do not store PIU Scores credentials, Supabase credentials, cron/operator secrets, raw IP
  addresses, or other application secrets in PostgreSQL.
- Public-safe projections exclude upstream player IDs, raw score histories, database UUIDs, cohort
  identifiers, internal errors, and credentials.
- Logs, job events, reconciliation output, and evidence use safe identifiers and sanitized errors.
- Consent revocation removes the player from current public/operational state according to the
  frozen behavior while retaining only data permitted by the approved retention contract.
- Storage bucket objects remain private; upload/download use server-side credentials or signed
  short-lived access only where required.
- Verify artifact content type, schema version, length, and checksum before marking a generation
  ready or switching a publication pointer.
- Storage backup and restore are separate from PostgreSQL backup and restore.

## Connection and transaction design

- Normal API/worker traffic uses the transaction-pooler URL, prepared statements disabled, explicit
  statement timeouts, bounded connection counts, and short transactions.
- Network/API fetches, Python analysis, model fitting, and Storage transfer occur outside database
  transactions.
- Each player's synchronization diff is committed in a short transaction with its checkpoint.
- Job leases are claimed and renewed using database time and fenced updates/functions.
- Long-running Python work heartbeats continuously, including analysis and model-fitting stages.
- Migration, bulk import/export, `COPY`, schema dump, and restore use direct/session connections and
  never transaction pooling.
- Backfills are idempotent, bounded, restartable, hash-verified, and do not hold locks across the
  complete import.
- Runtime and migration connection limits reserve capacity for the existing applications sharing
  the project.

## Processing and publication sequence

### Daily synchronization

1. Create/reuse an idempotent job and acquire the global lease.
2. Fetch consent, songs, and charts once using existing upstream behavior.
3. Process players outside long database transactions.
4. Persist each player's deterministic diff and checkpoint atomically.
5. Avoid rewrites for unchanged content hashes.
6. Apply explicit revocation/catalog behavior and mark dependency dirtiness.
7. Complete the sync boundary only after count/hash/integrity gates pass.

### Analysis/model generation

1. Pin completed sync/import inputs and one immutable methodology.
2. Extract deterministic inputs with a server-side cursor or `COPY`.
3. Run existing Python analysis unchanged.
4. Persist typed results under a building run/generation.
5. Upload immutable binary artifacts.
6. Verify coverage, counts, privacy, checksums, and parity.
7. Mark the generation ready and atomically switch related publication pointers.

Global calibration, shrinkage, folder ranking, score surfaces, and plate priors remain full daily
recomputations until a later separately approved methodology change proves incremental equivalence.

### Player refresh

1. Deduplicate the player job and fetch the existing full-history input contract.
2. Pin the active global model generation.
3. Merge deterministic score winners without absence-based deletion.
4. Compute with the existing Python model.
5. Persist compact mode results and normalized candidates.
6. Update the player's successful head atomically.
7. Preserve and serve the previous result with the existing stale warning on failure.

## Pumbility-only pull-request CI routing

The user's explicit test policy for this schema-owner repository overrides the repository's normal
all-checks phase rule for Pumbility-only database PRs.

The CI implementation must classify two independent facts for pull requests:

- `pumbility_changed`: at least one Pumbility migration, database test/runner, rollback/plan/evidence
  document, or dedicated Pumbility CI-routing file changed.
- `pumbility_only`: every changed file is in a tightly reviewed Pumbility database allowlist.

Routing behavior:

| Pull-request contents                     | Supabase Pumbility checks | Existing app quality gates |
| ----------------------------------------- | ------------------------- | -------------------------- |
| Pumbility-only allowlisted changes        | run                       | skip                       |
| Pumbility plus any non-allowlisted change | run                       | run                        |
| No Pumbility database change              | skip                      | run                        |

On pushes to `main`, retain existing normal CI unless a later explicit decision changes it. The
initial CI-routing change must be included in the narrowly reviewed allowlist. Future changes to
unrelated workflows, package files, application source, generic scripts, or non-Pumbility migrations
make the PR mixed and therefore retain normal CI.

The Pumbility database job runs only:

1. A clean local Supabase start and complete migration reset with `--no-seed`.
2. Local database lint at error/fail-on-error level.
3. Pumbility catalog, constraint, index, RLS, grants, function, lease, idempotency, atomic
   publication, Storage policy, and sibling-isolation SQL tests.
4. Focused two-session concurrency tests where database serialization is part of the contract.
5. A guarded dependency-ordered rollback rehearsal inside a transaction, followed by a complete
   forward reset and rerun of the database checks.

It must not run npm lint, TypeScript typecheck, application unit tests, Next.js build, Playwright,
load tests, Protein Tracker application tests, tournament application tests, or Karaoke Party
application tests. Database-level sibling isolation assertions remain required because the project
is shared.

## Phased delivery and gates

### Phase 0 - live-project and repository discovery

- Recheck the local/linked migration list and choose a collision-free timestamp.
- Inventory PostgreSQL version, extensions, schemas, roles, grants, RLS, default ACLs, publications,
  buckets, policies, project exposure, pooler/connection limits, disk/WAL, backups/PITR, and sibling
  load.
- Inventory the authoritative Vercel artifacts and retained generation sizes without copying private
  data into Git.
- Confirm Storage object-size requirements against the configured limits.
- Record migration owner, target verification, maintenance window, connection reserve, RPO/RTO,
  and restore authority.

Gate: inventory and naming/security/retention/capacity/rollback decisions have evidence and owner
approval.

### Phase 1 - current-state data and behavior baseline

Implemented primarily in `pumbility-farmer`, with safe schema dependency references recorded here.

- Create current-state, data-contract, behavior-contract, safe manifest, acceptance checklist, and
  evidence index artifacts.
- Establish `T0`, collect logical hashes/counts, redacted goldens, UI states, job/concurrency cases,
  methodology identity, and performance baselines.
- Inventory every expected source field and every target table/column mapping.
- Approve the exact reconciliation treatment for data arriving after `T0`.

Gate: all expected data and functionality are documented before DDL merges.

### Phase 2 - CI routing and expand-only schema

Implemented in this repository.

- Add scoped Pumbility PR classification and the database-only job.
- Add migrations for the private schema, tables, views, indexes, functions, roles/grants/RLS, bucket,
  and Storage policies.
- Add no public application dependency and keep all consuming flags off.
- Add database tests, rollback rehearsal, and Pumbility-only dump/restore runbook.
- Make no Auth, Realtime publication, sibling schema, default-privilege, or public API exposure
  changes.

Gate: Pumbility-only CI passes against an empty/full local migration chain and a production-shaped
schema snapshot; Pumbility-only dump/restore succeeds; schema diff is isolated.

### Phase 3 - consumer adapters and backfill tooling

Implemented in `pumbility-farmer` after Phase 2 is deployed.

- Add persistence interfaces, preserve Vercel implementations, add Supabase implementations,
  logical hashing, idempotent backfill, reconciliation, generation, publication, job lease, and
  continuous heartbeat support.
- Keep production reads/writes and all public output unchanged.

Gate: complete application checks and adapter integration tests pass with flags off.

### Phase 4 - authoritative baseline backfill

- Import `T0` immutable data with source/checksum provenance.
- Apply documented post-`T0` changes through `T1`.
- Verify exact natural keys, hashes, current pointers, FKs, privacy, and Storage artifacts.

Gate: exact `T0` parity and zero unexplained `T1` mismatches.

### Phase 5 - shadow writes and shadow analysis

- Keep Vercel authoritative and mirror successful operations.
- Run both input paths through the same Python algorithms for at least two daily runs and one full
  operator sync.
- Compare all players/charts/generations, not a sample.
- Exercise duplicate delivery, lease expiry, cancellation, worker crash, revocation, generation
  race, rollback, and database/Storage failure.

Gate: zero unexplained contract mismatches at approved precision and no security/performance
regression.

### Phase 6 - endpoint-level canary reads

- Enable Supabase reads behind independently reversible flags, starting with internal comparison
  paths and ending with job/rollback behavior.
- Compare safe payload hashes live and retain immediate Blob fallback.

Gate: zero unexplained mismatch throughout the agreed canary period.

### Phase 7 - Supabase write authority and cutover

- Drain active jobs, freeze a final source boundary, and reconcile both stores.
- Switch PostgreSQL to authoritative writes while keeping Blob mirroring and read fallback.
- Run a normal scheduled cycle, full operator sync, representative player refreshes, rollback,
  forward restoration, and database/pooler/Storage failure drills.

Gate: complete cutover evidence passes and fallback remains available.

### Phase 8 - stabilization and later retirement

- Observe the approved stabilization window and complete every acceptance checklist item with
  evidence.
- Stop dual writes only after explicit signoff.
- Keep Blob read-only through the rollback window.
- Retire legacy persistence only through a later separately reviewed PR.

Gate: final owner signoff, no unexplained mismatch, successful restore/rollback evidence, and no
remaining required work.

## Rollback strategy

- Before application dependency or data: rehearse an explicit dependency-ordered compensating
  rollback inside a local transaction. It must verify Pumbility tables are empty, name every object,
  avoid `CASCADE`, preserve sibling objects, and finish with `ROLLBACK` during rehearsal.
- After application dependency or data: disable feature flags, restore Blob reads/writes as
  authority, point publications to the previous ready generation, and ship additive fixes. Do not
  destructively reverse hosted schema.
- A failed artifact upload, validation, backfill, model run, or player refresh never advances the
  active pointer.
- PostgreSQL and Storage recovery are separate procedures and both must be exercised.
- A whole-project restore is not the normal Pumbility recovery path because it affects unrelated
  applications. Maintain and test Pumbility-only logical export/import.

## Implementation review boundary

Each implementation phase gets one general diff review. A proven regression caused by the change
may receive one focused repair and affected-check rerun. Do not start recursive review/repair cycles
or expand scope for hypothetical improvements. Unrelated or pre-existing findings are reported but
not fixed.

## Definition of complete

The overhaul is complete only when PostgreSQL is authoritative, every checklist item has linked
evidence or an explicit approved variance, frozen-boundary data has exact parity, post-boundary
differences are fully explained, existing behavior remains intact, rollback and restore have been
exercised, both repositories record the same production migration version, and no legacy
persistence is removed in the cutover release.

## Plan self-review

This plan was reviewed once before implementation against `AGENTS.md`,
`docs/codex-current-brief.md`, and `docs/security-notes.md`. The review must verify repository
ownership, shared-project isolation, no product-rule change, secrets handling, migration order,
feature-flag safety, RLS/grants, Storage privacy, transaction pooling, exact parity, CI routing,
rollback/restore, evidence quality, and stopping rules. That review made FORCE RLS the default for
every Pumbility application table and found no remaining deterministic planning defect. Phase 2
receives one separate complete-diff self-review after its static checks.
