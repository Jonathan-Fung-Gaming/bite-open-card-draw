# Production Readiness Phase 1 - Atomic Reroll, Reveal, And Public State - 2026-07-13

Parent plan: `docs/production-readiness-remediation-plan-2026-07-13.md`

Checklist: `docs/production-readiness-remediation-checklist-2026-07-13.md`

Issues: PRR-008 and PRR-012.

## Goal

Make rerolls, reveal advancement, and final public release single authoritative transitions in
memory and Supabase; give public readers a coherent monotonic generation; and make already-mounted
vote/stage clients recover from newer generations without stale submissions, reveal replay, or
timer/card fallback.

This phase does not change tournament structure, ballot rules, least-ban selection, tiebreak
authority, the 10-second tiebreak duration, host ownership policy, or result ordering.

## Sources Of Truth Read

- `docs/codex-current-brief.md`
- Phase 1 of `docs/production-readiness-remediation-plan-2026-07-13.md`
- Phase 1 rows in `docs/production-readiness-remediation-checklist-2026-07-13.md`
- `docs/product-spec.md` sections for voting, results, tiebreak, final reveal, admin, and host lock
- `docs/pump_open_stage_repo_validation_checklist.md` sections 7, 8, 13, 14, 16, and 21
- `docs/security-notes.md`
- `docs/admin-action-policy.md`
- `docs/phase-gates.md`
- Phase 0 PRR-008/PRR-012 contracts in
  `docs/production-readiness-phase-0-prr-contract-report-2026-07-13.md`

No archived planning document is used as current authority.

## Baseline Findings

Three delegated audits independently inspected database/server state, public/client state, and
tests/evidence. They found:

1. `normalized_reroll_one_chart`, `normalized_reroll_round_set`,
   `normalized_reroll_full_round`, `normalized_advance_result_reveal`, and
   `normalized_mark_results_revealed` are deliberately disabled placeholder RPCs.
2. Current rerolls mutate in-memory draw, ballot, voting, result, and audit stores, then persist the
   full snapshot later. Reveal/release similarly use narrow persistence followed by a redundant
   broad save.
3. Normalized state hydration performs independent table reads, so it is not a single database
   snapshot. The public cache is process-local and can retain a coherent but older state for up to
   five seconds.
4. Vote live state has no draw/public generation. Open vote routes disable route auto-refresh, and
   overlapping live polls have no generation ordering.
5. Active-draw validation rejects replaced draw ids, but a normalized resubmission does not clear
   prior ballot invalidation fields.
6. Stage tiebreak and count animations restart from mount time instead of authoritative phase
   timestamps.
7. The stage holding UI exists, but a fresh client can still receive a mixed/stale pre-result view
   because result mode is not an authoritative projection field.

## Locked Invariants

- Four rounds, two sets per round, and seven charts per set remain unchanged.
- A reroll creates a new complete draw version and preserves every superseded draw/history row.
- Any post-vote reroll invalidates the whole round ballot because one ballot covers both sets.
- The backend-selected tiebreak winner is never recomputed by reveal code or browser code.
- The tiebreak reveal lasts exactly 10 seconds from its stored server timestamp.
- Phones remain held until the host explicitly confirms final public release.
- Dangerous rerolls still require password re-entry, a reason, active host ownership, and audit.
- Host ownership checks use unreleased ownership plus credential match. Heartbeat age does not
  expire, release, or transfer the host.
- Service-role keys, host credentials/hashes, session data, ballot edit hashes, and audit reasons
  never enter browser props or public projection payloads.

## Detailed Implementation Plan

### 1. Additive migration and database transaction contract

Add one forward migration after `20260713010000_event_scoped_voter_device_binding.sql` that:

1. Adds an event/round public-state row with a monotonic integer generation, transition kind,
   result-mode flag, draw ids/versions, voting status/deadline, result id/phase/start timestamp,
   tiebreak start timestamps, phone-release state/time, and database update time.
2. Enables RLS, revokes table/function access from `public`, `anon`, and `authenticated`, and grants
   only the minimum service-role access.
3. Adds a private host assertion helper that verifies, inside the same SQL transaction:
   - event-scoped active admin session;
   - unreleased host ownership by that session;
   - constant-value host-token-hash equality;
   - no heartbeat/expiry-based ownership transfer.
4. Adds a shared event/round advisory transaction lock and deterministic row locking.
5. Replaces the three reroll placeholder RPCs with real operations that compare expected public
   generation and expected active draw id/version, validate the complete replacement draw payload,
   supersede old draws, insert new draw/chart rows, invalidate all active round ballots, clear only
   a still-unrevealed computed result, reset the voting window/eligibility/presence, insert exactly
   one audit row, update the public-state projection, and increment generation once.
6. Replaces reveal advancement with a real operation that compares expected generation, result id,
   and reveal phase; uses database time; preserves the committed tiebreak winner; starts stored
   winner-reveal timing when entering a resolved phase; blocks advancement until the 10-second
   reveal completes; updates voting/phone holding state, audit, projection, and generation once.
7. Replaces final public release with a real operation that requires final phase, updates the
   public-release state and audit, and increments generation once.
8. Wraps normalized ballot submission with an expected-generation check and clears
   `invalidated_at`, `invalidated_by_admin_action_id`, and `invalidation_reason` on a valid
   post-reroll resubmission.
9. Adds a service-role-only coherent read RPC that returns all normalized state rows used by the
   server from one PostgreSQL statement/snapshot, including public generations.
10. Adds a cheap service-role generation-key read used to prevent cross-instance reuse of cache
    entries after a transition.

All compare/host validation happens before audit or row mutation. Duplicate concurrent requests
therefore yield one committed transition, audit, and generation increment; the loser fails with a
stale expected-state error.

### 2. Generated types, server-only wrappers, and capability boundary

1. Add the public-state table and coherent/generation RPCs to `src/lib/db/database.types.ts`.
2. Move the five implemented transition names out of `NORMALIZED_BLOCKED_*` into typed implemented
   schemas.
3. Use exact Zod payloads for host context, expected generation/draw/result state, replacement draw
   records, and action request ids.
4. Export the existing SHA-256 host-token hashing helper for server-only transaction payloads; pass
   only the hash into SQL and never expose it to browser code or audit metadata.
5. Preserve fail-closed behavior during the merge-to-migration window: if the new RPC/projection
   capability is absent, Supabase-backed dangerous transitions report that the migration is
   pending. They do not fall back to legacy multi-write persistence.
6. Coherent reads may temporarily fall back to the current loader only when the read RPC is absent,
   so read-only routes remain backward compatible while the post-merge migration is pending.

### 3. Memory atomic parity

1. Add a public-state generation store to the operational snapshot with backward-compatible
   restore defaults.
2. Merge generations monotonically by round.
3. Run memory reroll/reveal/release mutations inside the existing serialized, rollback-capable
   persisted-state coordinator.
4. Validate the same expected draw/result generation and host ownership inside the coordinated
   callback.
5. Increment generation and projection exactly once with the coupled draw, ballot, voting, result,
   phone, and audit changes.
6. On callback or persistence failure, restore every affected store and leave audit/generation
   unchanged.

### 4. Convert admin actions

1. Factor one preparation path per reroll form that uses the existing draw engine so chart pool,
   exclusions, selected-song blocking, same-round duplicate-song rules, and server randomness stay
   unchanged.
2. For Supabase, send the prepared complete draw plus expected state to the corresponding atomic
   RPC. Reload canonical state only after commit.
3. For memory, apply the same prepared mutation inside the atomic coordinator.
4. Convert reveal advancement and final release to the equivalent backend-specific atomic
   operations.
5. Keep password re-entry and clear action summaries in the server action/UI.
6. Remove redundant broad `persistTournamentState()` calls only after parity, rollback, and
   durability tests pass.

### 5. Coherent public state and freshness ordering

1. Hydrate normalized state from the coherent read RPC and store the round projection/generation in
   operational state.
2. Key public hydration cache entries by event plus current generation key. An older generation may
   remain cached but cannot be reused after the generation-key check observes a newer commit.
3. Add generation, transition kind, result-mode flag, and active draw ids/versions to
   `PublicRouteFreshnessKey`.
4. Make payload acceptance generation-first:
   - higher generation is accepted, including an audited reroll that lowers voting status;
   - lower generation is rejected;
   - equal generation uses existing consistency/rank checks.
5. Once result mode begins, hold through incomplete detail reads. Only a higher-generation explicit
   reroll, reset, or round advance may authorize returning to draw mode.

### 6. Vote live-state reconciliation

1. Pass the authoritative generation and active draw ids/versions from `/vote` server props and
   `getVoteLiveStateAction`.
2. Order overlapping polls by generation and request sequence so an old response cannot restore
   stale status, ballots, charts, or choices.
3. When live state reports a newer generation than rendered props:
   - disable submission immediately;
   - show neutral updating copy;
   - clear/reconcile draft choices against replacement draw ids;
   - preserve selected/confirmed start.gg identity and device binding;
   - request a route refresh once;
   - re-enable only after rendered props reach the accepted generation.
4. Keep unchanged-set choices only when their draw id remains active. Clear every choice for set or
   full-round replacement.
5. Treat stale-generation/draw submission failures as a refresh/reconciliation event, not a generic
   save failure.
6. Include expected generation in memory and normalized submit validation.

### 7. Authoritative stage reveal recovery

1. Add pure helpers for visible count-row progress and tiebreak elapsed/remaining progress from
   stored start timestamps and authoritative server-now.
2. Initialize stage count reveals from elapsed server time so a reload resumes rather than restarts.
3. Initialize rune-wheel/fallback reveal with elapsed progress and only the remaining timeout.
4. If 10 seconds already elapsed, show the committed winner immediately without replay.
5. Keep route refresh deferred only while the authoritative remaining tiebreak time is positive.
6. Assert that timer, stage draw rows, and card-draw DOM are absent throughout both tiebreaks, final
   transition, and post-confirmation release.

### 8. Automated and hosted evidence

Add focused tests before closing any checklist row:

- Unit:
  - public generation store/merge and generation-first comparator;
  - open generation N -> reroll/ready N+1 -> restart N+2, with late N/N+1 rejected;
  - vote poll ordering and one/set/full choice reconciliation;
  - tiebreak/count progress at start, mid-duration, and completed timestamps;
  - SQL source/permission/host/expected-state assertions;
  - normalized ballot invalidation-field reset.
- Memory integration:
  - all reroll forms preserve history and invalidate the whole round ballot;
  - failure rollback and stale expected-state rejection;
  - duplicate/concurrent reroll/reveal/release produces one transition/audit;
  - reveal/release projection and phone-spoiler state remain coupled.
- Playwright memory:
  - already-open saved and unsaved desktop/mobile vote clients replace charts automatically,
    preserve identity, clear stale choices, and show no RSC/page/overlay failure;
  - Set 1 and Set 2 mid/post-duration reload recovery;
  - continuous forbidden stage fallback-DOM assertions.
- Disposable hosted Supabase:
  - migration applied to a confirmed non-production project/branch;
  - one/set/full reroll transaction invariants and rollback;
  - stale submit and submit-versus-reroll race;
  - concurrent duplicate transitions and exactly one audit/generation;
  - anon/authenticated/wrong-host/neighbor-event denial;
  - concurrent coherent reads at cache TTL 0 and 5000;
  - mounted vote-client and both-tiebreak browser evidence with live polling enabled.

## Validation Commands

Run commands directly because the former repository command wrapper has been removed.

Required local gates:

```bash
npx prettier --write <changed supported files>
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
git diff --check
```

Add and run explicit Phase 1 scripts/configuration for:

```bash
npm run test:phase1:memory
npm run test:phase1:hosted
npm run test:phase1:hosted:cache-zero
npm run test:phase1:hosted:cache-max
```

Also rerun relevant existing Phase 9 tiebreak/invariant coverage and the production-flow
48 -> 36 -> 24 -> 12 rehearsal when the configured disposable hosted environment is available.

Supabase CLI commands must run serially because concurrent CLI processes can collide on a global
telemetry file. Never print credentials or environment values.

## Migration Order, Rollout, And Rollback

### Pre-merge verification

1. Verify the disposable Supabase project/branch identity from existing configuration without
   printing secrets.
2. Refuse schema application if the target is missing, ambiguous, or the real tournament project.
3. Apply the additive migration to the confirmed disposable target.
4. Run database lint, migration parity, permission negatives, transaction invariants, coherent
   reader tests, and hosted browsers.

### Production rollout

1. Merge code with Supabase transition calls fail-closed if the migration capability is absent.
2. Synchronize local default branch.
3. Reconfirm the configured linked target is the intended production project.
4. Push the repository migration.
5. Verify local/remote migration parity and database lint.
6. Verify the new RPC capability and service-role-only permissions.

### Forward-only rollback

If a blocking defect is discovered, deploy a compensating migration that redefines the five
mutation RPCs to fail closed and revokes execution if necessary. Keep the additive public-state
table, generation rows, audit rows, and draw history. Do not delete or rewind tournament data.
Application rollback must keep dangerous actions disabled until compatible RPCs are restored.

The migration preserves the immediately previous application's submit-ballot, compute-results,
emergency-reopen, and round-reset payload contracts through service-role-only compatibility
branches. Those branches run under the same Phase 1 event/round lock, verify that the supplied active
admin session still owns the unreleased host lock inside the transaction, and refresh the public
projection before returning the legacy response. They do not require a host-token-hash field that
the previous payload contract did not send. Therefore an application rollback after migration does
not disable normal ballots or result administration. New code performs a read-only Phase 1
capability preflight before every upgraded RPC, so code deployed before the migration fails closed
without invoking an older row-changing function. A compensating rollback migration must retain the
legacy compatibility branches and the submit/timer/manual/close/pause/resume voting-window
projection wrappers while disabling only the new reroll/reveal/release paths.

## Diff Review Checklist

Before checklist closure, review the full diff for:

- partial writes, wrong event/round scope, lock ordering, stale expected state, duplicate audits,
  and failure rollback;
- host/session credential leakage, heartbeat-based expiry, public projection privacy, unsafe RPC
  grants, and browser imports of server-only modules;
- draw eligibility/history, whole-round ballot invalidation, valid post-reroll resubmission,
  backend winner provenance, phone spoiler protection, and final two-chart behavior;
- out-of-order polls/RSC payloads, stale drafts, identity loss, stuck updating state, replayed
  animations, and forbidden stage fallback DOM;
- migration compatibility, fail-closed pre-migration behavior, target ambiguity, and forward-only
  rollback;
- accessibility of updating/holding/error copy and no unintended Phase 2+ UI work.

## Plan Self-Review And Amendments

The initial implementation outline was amended after the three audits:

1. Added a monotonic integer generation; timestamps and status ranks alone are insufficient.
2. Added a coherent single-statement state read plus generation-keyed cache reuse; merely adding a
   generation to the existing 18 independent reads would still permit mixed payloads.
3. Added transition kind and result-mode state so a higher-generation reroll is accepted while an
   old pre-result payload cannot unlock stage draw mode.
4. Added expected generation to ballot submission and explicit invalidation-field clearing; active
   draw-id validation alone leaves a restarted ballot excluded from counts.
5. Added deterministic event/round lock ordering and compare-before-audit for duplicate/concurrent
   actions.
6. Added projection privacy tests; a coherent server snapshot must not become a browser data leak.
7. Added explicit fail-closed capability behavior and forward-only rollback for the mandatory
   merge-before-production-migration window.
8. Corrected host verification to avoid heartbeat/expiry ownership transfer, consistent with the
   locked non-expiring-host decision.
9. Added both Set 1 and Set 2 mid/post-duration recovery plus continuous forbidden-DOM checks; the
   existing happy-path evidence is not sufficient.
10. Added a dedicated live-polling-enabled Phase 1 Playwright profile because current hosted/Phase 0
    profiles disable vote live polling.

The amended plan covers every Phase 1 acceptance criterion, checklist row, security boundary,
migration order, rollback requirement, and required evidence class without implementing later
remediation phases.
