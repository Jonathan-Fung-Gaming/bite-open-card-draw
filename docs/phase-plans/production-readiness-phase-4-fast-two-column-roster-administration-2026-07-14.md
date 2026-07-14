# Production Readiness Phase 4 - Fast Two-Column Roster Administration - 2026-07-14

Parent plan: `docs/production-readiness-remediation-plan-2026-07-13.md`

Checklist: `docs/production-readiness-remediation-checklist-2026-07-13.md`

Issues: PRR-001 and PRR-002.

## Goal

Make routine roster operation fast enough for tournament-floor elimination work while preserving
active-host authorization, audit integrity, current-round eligibility snapshots, and duplicate-name
rules. The roster must expose exactly two columns, keep usernames as text until explicit inline
editing begins, optimistically update status and counts, coalesce rapid desired-state changes, and
propagate a sanitized roster-version invalidation to another admin within two seconds.

This phase does not change the four-round structure, chart sets, voting duration, ban rules, draw or
tiebreak decisions, result reveal, player identity confirmation, emergency current-round
eligibility workflow, or dangerous-action policy.

## Sources Of Truth Read

- `docs/codex-current-brief.md`
- Phase 4 of `docs/production-readiness-remediation-plan-2026-07-13.md`
- Phase 4 rows in `docs/production-readiness-remediation-checklist-2026-07-13.md`
- `docs/product-spec.md` Player identity, Admin behavior, Roster behavior, and production-flow
  rehearsal sections
- `docs/pump_open_stage_repo_validation_checklist.md` roster, admin, Realtime/polling, security,
  and 48 -> 36 -> 24 -> 12 validation decisions
- `docs/production-readiness-phase-0-prr-contract-report-2026-07-13.md` PRR-001/PRR-002 evidence
- `docs/phase-gates.md`
- `docs/security-notes.md`
- `docs/admin-action-policy.md`
- Current roster store, admin actions, normalized persistence, database schema/types, admin UI,
  public polling, Phase 0 diagnostics, Phase 9 helpers, and Playwright coverage

No document under `docs/archive/` is used as current authority.

## Baseline Findings

Read-only backend, UI, and persistence audits found:

1. `AdminRosterPanel` renders three desktop headers (`Username`, `Active`, `Edit`), three row
   regions, a permanently mounted username input, and a permanent Save Name button.
2. Username text is not focusable or interactive. There is no double-click, touch, Enter/F2,
   Escape, edit-state, focus restoration, or inline validation behavior.
3. Status actions use red/green button styling and independent server forms. There is no optimistic
   state, batching, sequencing, row-scoped rollback, or accessible live feedback.
4. Status and rename actions call `persistTournamentState()`, which hydrates/merges/writes broad
   event state before revalidating the entire admin route. Phase 0 measured hosted p95 at 28.18
   seconds and only 25 of 30 confirmations before timeouts, while the direct database floor was
   about 205 ms p95.
5. The current five-second admin route refresh cannot meet the two-second second-admin target.
   Dirty-refresh protection applies only to forms explicitly marked as blocking, and the roster
   forms are not marked, so a blurred dirty edit can be replaced by refresh.
6. The normalized schema already has event-scoped players, immutable audit actions, active-name
   uniqueness, service-role clients, current-round eligibility snapshots, and transactional host
   assertions, but it has no roster-specific generation or targeted roster RPC.
7. The public generation key does not include roster changes, so cached public hydration can lag a
   future-round player-list change. Phones already use ordinary five-second/light polling and must
   stay off always-on Realtime.
8. Existing Phase 9 roster helpers reload and await every status form sequentially. They do not
   exercise rapid coalescing, and old visual tests assert green/red username classes that conflict
   with text-first state communication.

## Locked Invariants

- Only a currently verified admin session that owns the active host lock and presents the matching
  HttpOnly host credential may rename or change routine roster active state.
- Duplicate active normalized start.gg usernames remain forbidden. Empty names remain forbidden.
  Inactive duplicates remain allowed until a reactivation would create an active duplicate.
- Username history locking remains authoritative in the transaction, not only disabled in the UI.
- Desired active-state batches are all-or-none after validation, idempotent by request id, and
  optimistic-concurrency checked so stale responses cannot overwrite a newer row.
- A routine status change never rewrites or deletes `round_player_eligibility`. An already-open
  round keeps its snapshot; a later round uses the updated active roster.
- Targeted Supabase transactions may update only affected `players`, one immutable
  `admin_actions` audit record, and one roster-version row. They may read session, host, players,
  and eligibility state for validation but must not persist broad event snapshots.
- The invalidation signal contains only event scope, literal `roster` scope, and a monotonic
  version. It contains no usernames, ballots, session ids, tokens, password data, or hashes.
- Player phones retain normal/light polling. A roster-version change invalidates the public read
  cache so the next normal refresh sees canonical player state; no phone Realtime subscription is
  added.
- The UI renders exactly two semantic column headers. State and failure are communicated in text,
  not by color alone.

## Detailed Implementation Plan

### 1. Roster transaction contracts and memory parity

1. Define strict server-only input/result contracts for rename, one-or-many desired active states,
   and roster-version reads. Bound batch size and username length, reject duplicate player ids,
   and validate UUID/request/version/timestamp fields.
2. Add a roster mutation service that selects the backend explicitly. Supabase calls only the new
   service-role RPCs. Memory uses the existing process write queue plus a roster-scoped repository
   persist method that merges affected players and audit state without invoking broad event
   persistence.
3. In memory, validate the latest persisted host owner/credential inside the same serialized
   callback as the roster mutation, apply all batch validation before changing any row, preserve
   round-eligibility entries, record exactly one audit for each committed request, and maintain a
   monotonic in-process roster version.
4. Make request replay idempotent and return the already committed canonical result without an
   extra version or audit row. Treat a new request whose desired state already equals canonical as
   a safe no-op: do not increment the version, and record one non-changing request audit so that
   the request remains replayable and auditable.
5. Return typed canonical affected rows, active count, version, and request id. On validation or
   concurrency failure, return a bounded typed failure for UI reconciliation without exposing
   credentials or raw database errors.

### 2. Service-role-only Supabase roster transactions

1. Add a forward migration after `20260714010000` creating one sanitized event/scope invalidation
   row with a monotonic version and updated timestamp. Enable RLS; allow anon/authenticated SELECT
   of only this data-free event/scope/version/time table; revoke every browser write; grant service
   role mutation access; and add the table idempotently to the Supabase Realtime publication.
2. Add service-role-only RPCs for roster-version read, username rename, and desired active-state
   batch mutation. Revoke public/anon/authenticated execution and grant service role only.
3. Make each roster RPC participate in the existing normalized event-persistence lease inside its
   own transaction so it cannot race a legacy broad save without paying separate acquire/release
   network round trips. In each mutation transaction, also acquire an event-scoped advisory lock,
   use database time, validate
   the admin session and exact active host credential through the non-expiring host assertion, and
   enforce request-id idempotency.
4. Rename locks the player row, checks expected version/updated timestamp, rejects blank or
   history-locked changes, applies the same normalized-name contract as application code, and
   relies on/explicitly checks the event-scoped active-name uniqueness rule.
5. Batch status validates the complete unique player-id set and every expected row timestamp before
   writing. It validates the final desired active-name set, including swaps/deactivation plus
   reactivation within one batch, before applying any update.
6. Commit affected player updates, one exact immutable audit row, and one version increment in the
   same transaction. Store a payload fingerprint plus enough non-secret result metadata for exact
   idempotent replay; return the prior result for the same request/payload and reject reuse of the
   request id with a different payload.
7. Include the roster version in `normalized_read_public_generation_key` so the existing cached
   public hydration is invalidated without adding roster payload to the key or a phone Realtime
   connection.
8. Update generated database types, capability/source-contract tests, server-only boundaries, and
   safe-read retry configuration for the roster-version read RPC.

### 3. Typed server mutations and sanitized propagation

1. Replace the form-only rename/status implementations with typed server mutations that receive a
   request id, expected roster version, expected player timestamp, and desired change payload.
   Carry browser mutations through a bounded, same-origin, no-store JSON route so Next RSC response
   serialization and unrelated route refreshes are not on the confirmation latency path.
2. Do not call `persistTournamentState()` or broad `revalidatePath()` for successful routine row
   mutations. Invalidate server read caches and let the local client reconcile the canonical result.
3. Read only `{ event_id, scope: "roster", version }` from the sanitized browser-readable
   invalidation table. The polling component is mounted only after admin authentication, while the
   table remains safe for anon reads because it contains no roster or credential data.
4. Pass event scope, backend selection, and initial version to `AdminLiveRefresh`. On Supabase only,
   subscribe with the browser-safe anon client to UPDATE events for that exact event and `roster`
   scope. Use the direct sanitized read at no more than a one-second cadence as a fallback, and
   retain the existing slower full-route safety refresh for unrelated state.
5. On a newer generation, fetch a lightweight authenticated roster snapshot whose version is read
   both before and after its player rows; retry if the generation changes mid-read. Dispatch that
   canonical snapshot to the roster model instead of serializing the full admin route. If this
   focused read fails, fall back to the full protected route refresh.
6. If an inline edit is dirty, defer the newer-version snapshot/route refresh and issue it as soon
   as the dirty edit saves or cancels. Never overwrite a dirty draft merely because remote props
   change.
7. Keep add and bulk-import behavior outside this phase's transaction rewrite unless a required
   compatibility adjustment is necessary; do not expand into future phase work.

### 4. Exact two-column inline-edit and rapid status UI

1. Convert the roster table body to a client component with a semantic fixed-layout table and
   exactly two `th[scope=col]` headers: Username and Active/inactive control. Each row has exactly
   two cells and a stable player-id key.
2. At rest render username text only. A mouse double-click, touch activation, Enter, or F2 enters
   edit mode for an unlocked row. A normal mouse single-click does not edit.
3. Keep the input, Save, Cancel, validation copy, and history explanation inside the username cell.
   Focus/select the input on entry; Enter saves; Escape cancels; save/cancel restores focus to the
   same display trigger; errors keep focus in the input and are announced.
4. Do not render an edit trigger for a history-locked row. Show the complete explanation that the
   username cannot be edited because tournament history exists.
5. Use a pure tested optimistic state/queue model. Status clicks update the row and active count
   synchronously, collapse repeated same-row clicks to the final desired state, coalesce distinct
   rapid clicks into one or a few batches, and serialize batches around canonical version replies.
6. Keep unrelated controls enabled while requests are in flight. Reconcile successful affected
   rows, ignore stale/out-of-order replies, schedule clicks made during an in-flight request as the
   next batch, and roll back only rows in a failed request that have no newer local intent.
7. Use neutral metal button styling for status, Save, and Cancel. Show explicit `Active` or
   `Inactive` state plus `Mark Inactive` or `Reactivate` action text. Expose pending state, announce
   count changes politely, and report row-scoped failures through accessible alerts.
8. Use fixed/minmax widths, `min-width: 0`, wrapping controls, and anywhere word breaking so long
   usernames and edit controls remain contained at 320, 360, and 390 pixels.

### 5. Unit, integration, browser, hosted, and performance evidence

1. Extend roster-store tests for empty names, inactive duplicate/reactivation conflict, all-or-none
   batches, no-op/idempotency, history lock, open-round snapshot isolation, and next-round state.
2. Add pure optimistic queue/reducer tests for one-frame local state, 30-click coalescing,
   repeated-row collapse, in-flight follow-up, stale response rejection, canonical reconcile,
   row-scoped rollback, dirty draft preservation, and remote generation merge.
3. Add transaction wrapper/migration source tests proving host/session/credential checks, service
   role only, exact table mutation scope, request idempotency, final-set duplicate validation,
   one audit/version increment, no eligibility write, and roster version in the public cache key.
4. Add Phase 4 memory Playwright coverage for exact headers/cells, no at-rest input/Edit column,
   mouse/touch/keyboard edit entry, Enter/Escape, focus, duplicate/empty/history failures,
   neutral/text state, optimistic count, request failure rollback/live feedback, unrelated-row
   usability, dirty-refresh deferral, long names, and 320/360/390 containment.
5. Add a disposable hosted Phase 4 runner/profile that refuses the configured tournament event,
   requires explicit destructive-reset and non-production-project attestations, creates its own
   event id, and cleans only that namespace.
6. Hosted evidence seeds an authenticated active host and 48 players, measures 30 rapid status
   changes, calculates p50/p95/total, verifies p95 at or under one second, exact player/audit/version
   state, no lost update, and second-admin sanitized propagation at or under two seconds.
7. Hosted eligibility evidence opens/snapshots a round, changes routine active state, proves the
   open-round eligibility rows/denominator remain unchanged, and proves the next round sees the
   updated active roster.
8. Update the Phase 9 admin helper to click exactly 12 intended player rows rapidly and wait once.
   Rerun the production-flow helper/test contract proving 48 -> 36 -> 24 -> 12 with exactly 12
   removals before each later round.

## Required Checks

1. Prettier on every changed supported file.
2. Focused roster/UI/transaction/database source Vitest suites.
3. `npm run lint`.
4. `npm run typecheck`.
5. `npm run test`.
6. `npm run build`.
7. Phase 4 memory Chromium and touch/mobile Playwright suites.
8. Disposable hosted Phase 4 Supabase transaction, performance, propagation, and snapshot suite.
9. Hosted-runner negative safety checks/list validation.
10. `npm run test:e2e`.
11. Relevant Phase 9 rehearsal helper/unit coverage and production-flow validation. Run the full
    hosted production-flow rehearsal if the disposable environment is configured and safe.
12. Linked Supabase migration list and database lint before merge.
13. `git diff --check`, browser-bundle secret searches, invalidation-payload source assertions, and
    a complete single-agent manual diff review against the product spec and security notes.

## Migration, Rollout, Rollback, And Compatibility

- Add one forward migration after `20260714010000`. It adds a roster-version table and targeted
  service-role functions; it removes no player, eligibility, ballot, host, audit, or public-state
  column and does not rewrite tournament data.
- The new application must fail closed with a typed migration-required roster error if Supabase is
  selected but the targeted RPC capability is absent. It must never fall back to broad
  application-side persistence or split player/audit writes.
- Old application builds remain able to read and broadly persist state after the migration because
  existing table shapes and RPCs remain. The new roster version is additive; old builds simply do
  not use it.
- Deployment order is merge/deploy application, verify the configured linked Supabase target, push
  the migration immediately, verify local/remote migration parity and linked database lint, then
  rerun disposable hosted Phase 4 evidence. Phase 4 is not complete until this post-merge sequence
  succeeds.
- If application deployment must be rolled back, keep the additive migration applied and deploy
  the prior application. Do not delete roster generations, players, audits, or eligibility rows.
  A later forward deployment can resume from the existing version.
- If the application is deployed before migration, rename/status actions are visibly disabled by
  typed failure while reads and all unrelated tournament controls continue. No mutation uses an
  ambiguous or guessed Supabase target.

## Security, Concurrency, Accessibility, UX, And Performance Review

- All roster writes remain server-only and active-host gated. Browser code receives no service key,
  session/host credential, password hash, or audit internals.
- Database advisory and row locks plus expected version/timestamps prevent broad last-writer-wins
  overwrites. The client serializes its batches, collapses repeated intent, and ignores stale replies.
- Batch validation completes before writes, so an invalid player, duplicate id, stale row, active
  duplicate, or history-locked rename commits no player/audit/version change.
- The invalidation signal is data-free beyond event/scope/version and is safe for a standby admin.
  It is advisory only; canonical roster contents arrive through a protected, no-store snapshot
  endpoint that verifies one stable version around its row read.
- Current-round eligibility remains a separate dangerous workflow. Routine roster RPCs have no
  eligibility update permission or SQL statement.
- Keyboard, touch, focus, visible explanations, action/state text, live regions, and contained
  narrow layout are phase acceptance requirements, not optional polish.
- The one-second sanitized invalidation poll is mounted only on authenticated admin screens. Phones remain on
  their existing five-second or slower jittered ordinary requests.

## Self-Review Findings And Amendments

The initial plan was reviewed before implementation for missing acceptance criteria, unsafe
assumptions, tournament-rule conflicts, regression and data-loss risk, security boundaries,
concurrency, migration ordering, rollback, accessibility, UX/UI behavior, and test coverage. The
following amendments were incorporated:

1. **Do not use global full-state persistence as a memory shortcut.** Memory parity gets a
   roster-scoped repository path so tests exercise the same mutation boundary as Supabase.
2. **Validate host ownership inside the transaction.** A server-action precheck alone leaves a race
   with Release/Force. The database and memory serialized callback both recheck session plus exact
   host credential immediately before mutation.
3. **Use desired state, not blind toggles.** Blind toggles are not idempotent and delayed responses
   can reverse later intent. Batches carry final desired booleans and expected canonical timestamps.
4. **Make the complete batch all-or-none.** Per-row writes before validation could leave a partial
   elimination set. Validation locks every row and checks the final duplicate-name set first.
5. **Keep row-scoped UX rollback without weakening transaction atomicity.** The client rolls back
   only rows belonging to a failed batch and never unrelated rows; rapid success batches remain
   coalesced and atomic.
6. **Do not put roster contents in the browser-readable signal.** Only event/scope/version metadata
   is published and polled. Canonical usernames and state arrive through an authenticated,
   no-store roster snapshot rather than the public invalidation channel.
7. **Preserve dirty edits across both polling and prop reconciliation.** Refresh is deferred while
   dirty, and the client model refuses to replace the active draft even if a parent render races.
8. **Do not add phone Realtime.** Roster version joins the existing public cache key; phones learn
   newer future-round state through normal/light polling.
9. **Keep routine changes out of current-round eligibility.** The RPC has no eligibility write;
   hosted evidence compares the exact snapshot before and after status batches.
10. **Treat neutral styling and text state as accessibility.** Status remains understandable when
    color perception, forced colors, or CSS is unavailable.
11. **Make rollout additive and fail closed.** Missing RPCs cannot silently fall back to the slow,
    broad persistence path that Phase 4 is removing.
12. **Use a generated disposable hosted namespace.** The runner rejects the configured event id and
    missing non-production/destructive attestations before any cleanup or seed operation.
13. **Retain the release-blocking attrition contract.** Fast helpers still remove exactly 12 of the
    active voting players before each later round and verify 48, 36, 24, and 12.
14. **Measure confirmation separately from optimism.** Browser evidence proves the local row/count
    changes by the next animation frame; hosted evidence separately records server confirmation
    p95 and total duration.
15. **Reject stale rename ids instead of creating players.** The existing generic store helper
    treats an unknown `playerId` as a create. Targeted rename contracts require the player to exist
    and preserve its id, so a stale/tampered edit can never become an audited add.
16. **Use Realtime only for sanitized admin invalidation.** The published table contains no roster
    payload and is browser-read-only. A one-second direct scoped select remains the fallback on the
    authenticated admin screen; player phones do not subscribe.
17. **Serialize against legacy event persistence inside the RPC.** RPC advisory locks alone do not
    coordinate with the repository's external event-persistence lease. The first hosted performance
    run measured 3.83 seconds at p95 with separate acquire/mutate/release calls, so the amended roster
    transaction now acquires and releases that same lease internally. This preserves coordination
    until broad roster writes are retired while keeping one network transaction per mutation.
18. **Audit new no-op requests once.** Idempotent replay needs a durable response keyed by request
    id. A new already-canonical request therefore records one `tournamentChanging: false` audit but
    does not bump the roster version; replay of that request adds neither audit nor version.
19. **Keep RSC serialization off the confirmation path.** Early hosted tracing showed that Next
    server-action responses and concurrent admin route refreshes dominated otherwise fast RPCs.
    Routine status/rename calls therefore use a bounded same-origin JSON endpoint with strict
    request/result schemas, Fetch Metadata/origin checks, and no-store responses.
20. **Avoid redundant normalized-session touches without weakening authorization.** The mutation
    path verifies the signed, unexpired HttpOnly admin cookie locally, while the immediately invoked
    database transaction atomically revalidates session revocation/expiry and exact host ownership.
    The memory backend continues to use the full server-side session validation path.
21. **Do not refresh the originating admin for its own confirmed version.** Successful local
    mutations publish only their confirmed numeric version to the live-refresh coordinator. The
    roster model already has the canonical affected rows, so this suppresses self-refresh storms
    without suppressing a genuinely newer remote generation.
22. **Use a lightweight protected snapshot for standby propagation.** A full admin RSC refresh was
    too expensive for the two-second target. The newer-version path now loads only authorized
    roster fields, validates a strict response, and merges it into the client model. The snapshot
    supports up to 1,000 rows so bulk-imported inactive history is not arbitrarily truncated.
23. **Prove that snapshot rows and version are one stable generation.** Reading rows and version in
    parallel could label old rows with a newer version and then suppress correction. The endpoint
    reads version/rows/version, retries a changing generation three times, and fails safely rather
    than returning an inconsistent snapshot.
24. **Measure browser performance without Playwright polling backoff.** Confirmation and propagation
    evidence uses in-page `MutationObserver` timestamps so the reported p50/p95 and second-admin
    delay reflect application behavior rather than test-runner polling intervals.
25. **Make next-round evidence independent of preloaded catalog data.** Disposable no-data Supabase
    branches may contain no tournament charts. Hosted evidence seeds seven uniquely event-prefixed
    chart fixtures per required set and deletes only those exact fixtures during cleanup.
26. **Keep session refresh from contending with the first roster click.** The first qualifying admin
    activity still schedules a session refresh, but it runs 2.5 seconds later and remains
    60-second debounced. Database authorization stays atomic while the latency-sensitive roster
    request gets the connection first.
27. **Sanitize rejected mutation envelopes as well as thrown errors.** Known roster conflicts map to
    fixed actionable messages, including the explicit pre-migration unavailable state; unknown RPC,
    relation, or constraint details collapse to a generic failure at both action and JSON-route
    boundaries.
28. **Keep memory and Supabase read paths isolated.** Browser invalidation polling is enabled only
    when the selected backend is Supabase, and the protected snapshot route reads the memory store
    when memory is selected. A memory-mode admin can never hydrate roster rows from an otherwise
    configured Supabase project.
