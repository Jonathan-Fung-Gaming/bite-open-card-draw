# Production Readiness Phase 3 - Non-Expiring Host Ownership And Recovery - 2026-07-14

Parent plan: `docs/production-readiness-remediation-plan-2026-07-13.md`

Checklist: `docs/production-readiness-remediation-checklist-2026-07-13.md`

Issue: PRR-011.

## Goal

Make host ownership persistent until an explicit Release or a password-confirmed, warned, audited
forced takeover. Heartbeat becomes health telemetry only. The secured original host must keep
working past the 30-minute standby-session boundary and must have an explicit Restore path after
sleep, network loss, reauthentication, or rotation/loss of the primary host cookie. Every control
decision must require a currently verified admin session and the matching HttpOnly host credential.

This phase does not change tournament rounds, chart sets, voting, draws, rerolls, result selection,
tiebreaks, player identity, roster behavior, public-route behavior, or tournament timing.

## Sources Of Truth Read

- `docs/codex-current-brief.md`
- Phase 3 of `docs/production-readiness-remediation-plan-2026-07-13.md`
- Phase 3 rows in `docs/production-readiness-remediation-checklist-2026-07-13.md`
- `docs/product-spec.md` Admin and Host lock sections
- `docs/pump_open_stage_repo_validation_checklist.md` Admin and Host lock decisions/checks
- `docs/production-readiness-phase-0-prr-contract-report-2026-07-13.md` PRR-011 contract
- `docs/phase-gates.md`
- `docs/security-notes.md`
- `docs/admin-action-policy.md`
- Current host-lock, session, server-action, persistence, normalized transaction, admin UI, and
  Phase 0/Phase 9 test implementations

No archived planning document is used as current authority.

## Baseline Findings

Three delegated read-only audits independently inspected authoritative requirements, host/session
code, and test/gate coverage. They found:

1. `HostLockStore` treats `expiresAt` as authority. After 30 minutes, the owner disappears and a
   second admin can acquire normally without the password, warning, reason, or dangerous audit
   required for takeover.
2. Admin logout and inactivity cleanup automatically release the host lock, contrary to the rule
   that ownership ends only through explicit Release or forced takeover.
3. Host heartbeat updates only the lock lease. It does not renew the active host's verified admin
   session or primary HttpOnly host credential, both of which expire after 30 minutes.
4. `canControl` is derived from owner session id alone. A missing or rotated host token leaves the
   UI enabled even though server mutations reject it.
5. No recoverable-original-host state or Restore action exists. Reauthentication creates a new
   session id, while loss of the primary host cookie has no safe rotation path.
6. UI copy calls heartbeat a takeover/expiry window and promises ordinary takeover after expiry.
7. Take/Force/Release success is not visibly confirmed, and Release can silently record a no-op.
8. Supabase host changes and required audit rows are separate writes. Failure or concurrency can
   leave a takeover/release committed without exactly one matching audit row.
9. The reserved normalized host lifecycle RPCs are disabled placeholders. The remaining legacy
   close-voting RPC also checks `host_lock.expires_at`, despite the Phase 1 host assertion correctly
   treating expiry as non-authoritative.
10. Existing tests encode natural expiry and cover only immediate two-session forced takeover. They
    do not prove aged ownership, recovery, credential rotation, standby expiry, typed feedback, or
    the opt-in 35-minute soak.

## Locked Invariants

- An unreleased host row remains authoritative regardless of `heartbeat_at` or legacy
  `expires_at` values.
- Heartbeat may update health timestamps but cannot acquire, transfer, release, or expire
  ownership.
- Normal Take is allowed only when no unreleased owner exists. Any other device must use the
  explicit Force path, even after a long missing heartbeat.
- Force requires the shared password, a clear consequence/warning, a nonblank audit reason, and
  exactly one dangerous audit row.
- Explicit Release is credential-matched, visible, audited, and is the normal ownership-ending
  action. Logout, session inactivity, page close, sleep, and network loss do not release.
- `canControl` is true only when the current admin session is verified and both session ownership
  and the primary host credential match the authoritative lock.
- Restore is not a quiet takeover shortcut. It requires a freshly verified admin session plus
  either continuity of the owning session id or a valid signed HttpOnly recovery cookie bound to
  the event, authoritative owner, and current host-credential generation. Restore atomically
  compares that generation, rebinds the owner, and rotates credentials, so concurrent use of one
  recovery proof has exactly one winner.
- A recovery cookie cannot perform tournament mutations, release, heartbeat, or takeover by
  itself. Forced takeover changes the owner and invalidates older recovery cookies.
- Non-host and standby sessions remain subject to the interaction-based 30-minute inactivity
  policy. Only an already verified active host heartbeat may renew an idle host session.
- All host lifecycle RPCs remain service-role-only. Raw session, host, and recovery credentials or
  their hashes never enter browser props, query strings, logs, evidence, or public responses.

## Detailed Implementation Plan

### 1. Non-expiring host state machine and persistence conflict rules

1. Replace lease-derived authority in `HostLockStore` with explicit `inactive`, `active`,
   `recoverable`, and `readonly` states.
2. Make active require matching owner session id and primary host token. Make recoverable require
   owner-session continuity or a verified recovery-cookie owner binding, while keeping mutations
   disabled until Restore rotates the primary credential.
3. Ignore legacy `expiresAt` when reading authority, acquiring, refreshing, releasing, restoring,
   and resolving persistence. Continue writing a far-future compatibility value so the application
   remains safe against the pre-migration close-voting predicate during rollout.
4. Add explicit Restore/rebind that preserves the acquisition epoch, updates owner session,
   rotates the host token, and refreshes health without creating a forced-takeover event.
5. Harden compare-and-swap behavior: first normal acquisition wins; stale normal acquisition cannot
   overwrite it; stale heartbeat/release/restore cannot defeat a newer takeover; concurrent forced
   takeovers resolve deterministically from the latest locked row.

### 2. Signed same-device recovery and session lifecycle

1. Add a signed recovery-token format bound to the authoritative owner session id, with a long
   event-device cookie lifetime, HMAC verification, HttpOnly, SameSite=Lax, Secure in production,
   and no browser-visible value.
2. Set/rotate persistent primary host and recovery cookies after Take, Restore, and Force, with a
   30-day secured-device lifetime. Clear both only after successful explicit Release. Heartbeat
   does not rewrite either host cookie, avoiding stale in-flight responses overwriting a concurrent
   Release or Restore; the primary credential still cannot authorize without the active verified
   admin session and matching owner.
3. Preserve recovery credentials across admin logout and inactivity cleanup. Revoke/clear only the
   admin session there; never release ownership automatically.
4. After a verified host heartbeat succeeds, rotate the signed admin session and normalized token
   row and publish the new expiry to the existing inactivity timer. This keeps the active host
   operational while standby refresh remains interaction-only.
5. Fail closed when session or primary host credential cannot be verified. The next server render
   exposes Restore only if owner-session continuity or signed recovery proof is valid.

### 3. Transactional Supabase host lifecycle and close-voting authorization

1. Add a forward migration implementing the reserved service-role-only acquire, heartbeat, and
   release RPCs. Acquire accepts explicit modes `take`, `restore`, or `force`, uses an event-scoped
   advisory lock and row lock, validates an active admin session, and compares the latest owner.
2. In `take` mode, reject any existing unreleased owner. In `restore` mode, require the
   server-verified recovery owner to match the locked owner. In `force` mode, require a nonblank
   reason and record a dangerous takeover audit.
3. Commit Take/Restore/Force/Release and exactly one matching admin audit row in the same database
   transaction. Heartbeat updates only health/compatibility fields and creates no audit row.
4. Return parsed, typed lifecycle outcomes and authoritative owner/heartbeat data. The application
   hydrates from the committed result instead of assuming an attempted action won a race.
5. Move the three host lifecycle mutations from the blocked normalized map to the implemented map,
   add strict Zod input/result contracts, and add a focused server wrapper.
6. Replace the remaining close-voting host-expiry/session-only predicate with the existing
   session-plus-host-token assertion. Add `hostTokenHash` to its server-only payload.
7. Revoke public/anon/authenticated execution and grant only service role for every new/replaced
   function. Keep the existing table shape and `expires_at` column for backward compatibility.

### 4. Server actions, truthful UI states, and feedback

1. Route Supabase Take/Restore/Force/heartbeat/Release through the new transactional RPCs. Keep the
   in-memory path behaviorally identical under the existing process write queue.
2. Verify dangerous password and reason before Force, while letting the transaction recheck the
   latest owner. Do not downgrade a racing Force to normal Take or Restore.
3. Add `restoreHostControlAction`; update action policy and source-boundary tests.
4. Make Take, Restore, Release, and Force mutually exclusive in the host panel. Show Restore only
   to a recoverable original host; show Force to a read-only admin; show Release only to the fully
   verified active host; show Take only when no owner exists.
5. Remove expiry/takeover-window wording. Display owner authority separately from heartbeat health,
   with stale/missing health explicitly saying ownership is retained and Force remains explicit.
6. Add visible success notices and visible typed error messages for every enabled host lifecycle
   action. Release no-op or stale-owner outcomes are errors, not silent redirects.
7. Keep warnings, password inputs, audit-reason inputs, keyboard operation, focus order, and text
   status accessible. No state is conveyed by color alone.

### 5. Unit, integration, browser, hosted, and soak evidence

1. Replace expiry-era host-lock tests with state-machine and race coverage for aged ownership,
   health-only heartbeat, explicit release, force, recovery, credential mismatch, first-writer-wins,
   and stale persistence operations.
2. Add signed recovery-token/cookie tests, active-host-only session renewal tests, and proof that
   standby/non-host sessions still expire after 30 minutes.
3. Add transaction contract/migration tests for implemented service-role-only host RPCs, atomic
   audit cardinality, no expiry ownership predicate, and close-voting host-token verification.
4. Add a Phase 3 memory Playwright profile for mutually exclusive Take/Restore/Release/Force UI,
   credential-aware control disabling, success/error banners, logout/reauth restore, heartbeat-loss
   authority, and two-context forced takeover.
5. Add a disposable hosted Phase 3 profile that creates a fresh event namespace distinct from the
   configured tournament id, ages heartbeat/legacy expiry timestamps, verifies the owner remains,
   exercises Restore/Force/Release, checks exact database owner/audit state, and tests stale races.
6. Add an opt-in 35-minute soak tag/script. It performs no user activity, retains active-host
   heartbeat/session renewal, proves the original host can still control after 35 minutes, proves a
   second admin remains read-only, then explicitly releases. The default gate lists/validates the
   test but runs the real wait only with an explicit soak opt-in.
7. Rerun default E2E plus Phase 1 transition/tiebreak and Phase 2 reveal/timer suites because every
   tournament mutation guard depends on host authorization.

## Required Checks

1. Prettier on every changed supported file.
2. `npm run lint`.
3. `npm run typecheck`.
4. `npm run test`.
5. `npm run build`.
6. Focused Phase 3 memory host/recovery Playwright suite.
7. Focused disposable hosted Phase 3 host/recovery/two-session suite.
8. Phase 3 soak suite in accelerated mode plus opt-in real 35-minute execution.
9. `npm run test:phase1:memory`.
10. `npm run test:phase2:memory`.
11. `npm run test:e2e`.
12. Linked Supabase migration list and database lint before merge; hosted Phase 3 evidence uses only
    the disposable namespace and explicit destructive-test attestation.
13. Negative runner-safety checks proving hosted tests reject the configured event namespace,
    missing non-production-project attestation, or missing destructive-reset opt-in.
14. `git diff --check`, secret/test-route hygiene searches, and a complete manual diff review
    against `docs/product-spec.md` and the security notes.

The local Docker-backed Supabase stack is currently unavailable. Linked migration parity and linked
database lint are available and must pass. Local database checks will be recorded as unavailable
only if Docker remains unavailable after implementation; this does not replace linked lint, hosted
disposable migration evidence, or post-merge migration verification.

## Migration, Rollout, Rollback, And Compatibility

- Add one forward migration after `20260713020000` that implements the host lifecycle RPCs and
  replaces close-voting authorization. No table column is removed and existing host rows remain
  readable.
- The application continues writing the existing non-null `expires_at` column with a far-future
  compatibility value. Before migration push, the deployed old close-voting predicate therefore
  remains satisfied for host rows written by the new application.
- Host-changing actions detect the implemented RPC contract on Supabase. They must fail closed with
  a visible migration-required error if the RPC is still the disabled placeholder; Force/Restore/
  Release must not fall back to split non-atomic writes.
- Deployment order is merge/deploy application, verify the configured linked Supabase target, push
  the migration immediately, verify local/remote parity and linked database lint, then rerun hosted
  Phase 3 evidence. Phase 3 is not complete until that post-merge sequence succeeds.
- The migration retains the table shape and RPC signatures, but the corrected close-voting payload
  requires `hostTokenHash`; the pre-Phase-3 application does not send it. Rolling the application
  back after migration is therefore unsupported. Recovery requires a forward patch; automatic
  ownership expiry must not be restored as a rollback strategy.
- If the new application must be rolled back before migration, no database rollback is needed. If
  it must be rolled back after migration, keep the migration applied and deploy a forward patch;
  do not delete authoritative owner or audit rows.
- Hosted tests use a generated disposable event id, delete only that namespace, and never target the
  real tournament event. No migration is applied to an ambiguous target.

## Security, Concurrency, Accessibility, UX, And Performance Review

- Recovery requires device-bound signed proof or same-owner session continuity in addition to a
  valid current admin session; the shared password alone remains the explicit Force path.
- All comparisons and mutations happen on the server. Host/recovery cookies are HttpOnly and Secure
  under production semantics. Only hashes reach persistence.
- Database advisory/row locking makes normal Take first-writer-wins and couples lifecycle/audit
  state. Application persistence conflict logic independently prevents stale memory/backend writes.
- Active-host renewal happens only after session and host credential both verify. Standby clients
  cannot keep themselves alive with passive host heartbeat calls.
- A stale UI cannot authorize a mutation: every server action and normalized tournament RPC still
  checks the current verified session and current host credential.
- Heartbeat remains a five-second health signal. Its writes are host-lock/session scoped and cannot
  overwrite draws, votes, results, or roster state.
- Host action notices are text-visible and announced in the normal document flow. Warning dialogs,
  reason/password fields, buttons, and details/summary controls remain keyboard and screen-reader
  operable.
- No reduced-motion option or unrelated visual/tournament behavior is added.

## Self-Review Findings And Amendments

The initial plan was reviewed before implementation for missing acceptance criteria, unsafe
assumptions, tournament-rule conflicts, security gaps, race behavior, data loss, migration order,
rollback, accessibility, operator UX, and test coverage. The following amendments were incorporated:

1. **Do not use the shared password as Restore identity.** That would make Restore an unaudited
   forced takeover. A signed HttpOnly recovery cookie bound to the authoritative owner is required.
2. **Do not keep `canControl` session-only.** Page state and every server mutation must require the
   matching primary host token as well as the verified session owner.
3. **Do not release on logout or inactivity.** Recovery credentials survive those session lifecycle
   events; only explicit Release or Force changes ownership.
4. **Do not merely ignore expiry in the UI.** Persistence conflict logic, the normalized close RPC,
   lifecycle RPCs, tests, and operator copy all remove expiry from authority.
5. **Make lifecycle and audit atomic.** The earlier split REST write can commit takeover/release
   without its required audit. The reserved host RPCs are implemented transactionally in this phase.
6. **Close the first-acquire race.** Two normal Takes that both observed no baseline cannot overwrite
   each other. Only an explicit Force may replace the latest owner.
7. **Keep rollout fail-closed and backward-compatible.** Far-future legacy expiry protects the old
   close predicate, while host-changing Supabase actions refuse split-write fallback until the new
   RPC is applied.
8. **Separate authority from health.** Heartbeat timestamps and stale warnings never determine
   control, button state, normal Take availability, or release.
9. **Prove the non-host timeout.** Active-host renewal is narrowly credential-gated; accelerated
   browser/unit coverage explicitly verifies standby sessions still expire.
10. **Use a disposable hosted namespace.** The ambient E2E event currently matches the configured
    event, so Phase 3 hosted runs generate and attest a distinct namespace before destructive setup.
11. **Keep the real soak opt-in but required for closure.** Accelerated coverage runs routinely; the
    actual 35-minute no-input run is executed and recorded before checking the phase gate.
12. **Keep owner identifiers server-only.** The initial heartbeat component received the complete
    owner session UUID, and an intermediate revision shortened it. The final UI uses only semantic
    `this browser` / `another browser` labels, and a source-boundary test prevents any
    session-derived owner identifier from returning to client props.
13. **Report committed lifecycle outcomes truthfully.** A successful transactional Take, Restore,
    Force, or Release is not followed by a fallible hydration that could turn a committed action
    into a false failure. Cookie-side-effect failures after commit report the committed ownership
    state and the exact recovery step.
14. **Never downgrade Force during a race.** Force requires a different current owner when the
    transaction locks the row. If that owner released first, the action fails visibly and the
    operator must use normal Take rather than creating a misleading dangerous takeover audit.
15. **Bind recovery to the current credential generation.** The first recovery design proved only
    event and owner identity, allowing two concurrent Restore calls to rotate different winning
    tokens. Recovery proof now includes the current host-token hash, SQL compares and rotates it
    atomically, stale proof is cleared visibly, and hosted concurrency coverage requires one winner.
16. **Make normalized host ownership single-writer.** Generic operational persistence no longer
    writes or deletes host rows. Only the locked lifecycle RPCs may mutate normalized ownership, so
    an unrelated stale snapshot cannot resurrect or overwrite a release, restore, or takeover.
17. **Keep audit rows immutable.** Generic persistence inserts audit ids with conflict-ignore and
    never rewrites existing rows. This preserves the richer request, mode, outcome, owner, and
    source metadata written transactionally by lifecycle RPCs.
18. **Prevent response-order cookie rollback.** Primary and recovery host cookies use a secured
    30-day lifetime and heartbeat never rewrites them. A delayed heartbeat response therefore
    cannot restore credentials cleared by Release or overwrite credentials rotated by Restore.
19. **Prevent revoked-session resurrection.** Normalized session touch and revoke use conditional
    updates instead of upsert. A heartbeat racing logout cannot recreate a revoked session row.
20. **Redact nested operational evidence and production test switches.** Debug export redacts
    credential/session/secret keys recursively, and production environment validation rejects both
    public heartbeat-disable test flags.
21. **Make takeover epochs strictly monotonic.** A forced takeover could otherwise reuse the prior
    acquisition timestamp when two serialized operations observed the same clock tick, making the
    persistence classifier mistake takeover for Restore. Memory and SQL paths now advance the epoch
    by at least one millisecond or microsecond respectively, with focused regression coverage.
22. **Keep projector titles inside their rows.** The complete visual gate exposed overflow from a
    60-character unbroken chart title at 1080p. Result titles now allow word breaking, and the
    focused projector regression plus the full visual suite cover the fix.
23. **Hydrate release from audit-only events.** Disposable hosted evidence found that a successful
    release in an otherwise empty event left only immutable audit rows. The normalized loader
    incorrectly treated that as no snapshot and retained the process's prior host owner. Audit rows
    now establish an authoritative event snapshot, so the empty host state replaces stale memory;
    coherent-read regression coverage locks the behavior.
24. **Wait for both concurrent browser navigations.** Hosted evidence proved the database accepted
    exactly one racing normal Take, but the test sampled both pages before their server-action
    navigations settled. The assertion now polls until exactly one page exposes Release, then
    compares that browser's session with the single authoritative database owner.
