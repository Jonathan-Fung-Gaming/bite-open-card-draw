# Phase 4 Supabase Emergency Admin Workflows Plan - 2026-07-03

Status: implemented and locally verified.

Parent plan: `docs/production-readiness-remediation-plan-2026-07-03.md`

Primary issue: PRC-004, Supabase production blocks required emergency admin
workflows.

Authoritative behavior sources:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Product Rule Being Protected

The admin route must support emergency tournament operations without exposing
secrets or allowing browser-side tournament decisions:

- Manual ballot entry and overwrite are dangerous actions and require password
  re-entry, an audit reason, active host control, and explicit replacement
  confirmation when replacing an existing ballot.
- Manual ballots are allowed while voting is open, and after voting closes but
  before result reveal starts.
- Post-close manual ballots are marked as manual overrides in private CSV data.
- A valid manual ballot after an unrevealed computed result invalidates that
  computed result so the host must recompute.
- Emergency reopen requires password re-entry, an audit reason, a duration, and
  active host control. It is allowed only after voting closes and before reveal
  starts.
- Emergency reset requires password re-entry, an audit reason, and active host
  control. It resets only intended round-scoped state and preserves audit
  history.

## Pre-Implementation Gap

The local memory workflow already implements the operator behavior in
`src/app/coolguy69/actions.ts`.

Supabase mode currently fail-closes before mutation:

- `manualBallotOverride`
- `reopenVotingWindow`
- `resetRound`

These names are listed in the blocked normalized runtime set, and the latest
SQL migration definitions intentionally return
`normalized_runtime_transaction_disabled`.

That fail-closed behavior prevents unsafe snapshot rewrites, but it also means
production Supabase cannot perform required emergency workflows. Phase 4 must
replace the disabled stubs with row-changing RPCs and wire admin actions to
those RPCs in Supabase mode.

Unblocking the TypeScript facade alone is not sufficient. If the admin actions
fall through to the existing memory mutation plus snapshot persistence path in
Supabase mode, this phase would reintroduce the production risk it is meant to
remove.

## Implementation Strategy

### Password Boundary

Keep password verification in server-side application code:

- Continue using `verifyDangerousActionPassword(getAdminPassword(formData))`.
- Do not pass `adminPassword` to any normalized RPC.
- Do not persist plaintext passwords in RPC payloads, audit rows, ballot
  revisions, result metadata, logs, or returned JSON.
- Add normalized RPC input schemas that omit `adminPassword` and include the
  verified `adminSessionId` for audit rows.

The shared form mutation contracts can continue to require `adminPassword` for
UI/server-action parsing. The normalized runtime payload contracts must be
separate from those public form contracts where needed.

### TypeScript Runtime Facade

Move only these operations from blocked to implemented:

- `manualBallotOverride`
- `reopenVotingWindow`
- `resetRound`

Keep all unrelated normalized runtime operations blocked unless their real RPCs
already exist in a prior phase.

Add focused wrappers, matching the existing `normalized-ballots.ts` and
`normalized-results.ts` pattern:

- `submitNormalizedManualBallotOverride`
- `reopenNormalizedVotingWindow`
- `resetNormalizedRound`

Each wrapper should:

- call `withNormalizedEventPersistenceLock`;
- call `executeNormalizedTransactionalMutation`;
- parse the RPC return shape with zod;
- expose only non-secret operation metadata.

### Admin Server Actions

Add Supabase-specific branches to:

- `manualBallotAction`
- `reopenVotingAction`
- `resetRoundAction`

For Supabase backend:

1. Require active admin session and active host control.
2. Verify the dangerous-action password in application code.
3. Parse the same form fields and reason currently used by memory mode.
4. Build a sanitized RPC payload with no plaintext password.
5. Call the normalized RPC wrapper.
6. Revalidate public/admin routes and return without calling
   `persistTournamentState()`.

For memory backend:

- Preserve the existing local behavior and tests.

### Supabase Migration

Add a new migration that replaces the latest disabled definitions with real
service-role RPCs:

- `public.normalized_manual_ballot_override(p_event_id text, p_payload jsonb)`
- `public.normalized_reopen_voting_window(p_event_id text, p_payload jsonb)`
- `public.normalized_reset_round(p_event_id text, p_payload jsonb)`

All three RPCs should:

- validate `p_event_id`;
- validate `roundNumber`;
- use `normalized_database_time()` for timestamps;
- execute inside the existing application-level normalized event lock and also
  take narrow transaction/advisory locks for round/player sensitive updates;
- insert append-only `admin_actions` rows;
- return row-change metadata rather than placeholder acknowledgements;
- revoke execute from `public`, `anon`, and `authenticated`;
- grant execute only to `service_role`.

### Manual Ballot Override RPC

The RPC must:

- require `adminSessionId`, `reason`, `playerId`, two completed choices, and
  `replaceExistingBallot`;
- call `normalized_apply_voting_deadline_locked` before deciding whether the
  manual ballot is allowed;
- allow statuses `voting_open`, `final_30_seconds`,
  `extension_1_minute`, `voting_closed`, and `results_computed`;
- reject missing window, paused voting, not-started voting, and reveal-started
  results;
- require the player to be in `round_player_eligibility` for the round;
- require existing ballots to have `replaceExistingBallot = true`;
- validate each choice against active draws and drawn charts;
- reject vague zero-selection choices unless `noBans` is true;
- preserve first submission time for existing ballots;
- increment `latest_revision_number`;
- replace `ballot_choices` atomically;
- insert a `ballot_revisions` row with `source = manual_admin`;
- set `manual_override = true` only for post-close or computed-result manual
  ballots;
- set `override_reason`, `override_admin_action_id`, and
  `replaced_existing_ballot`;
- mark the player as having tournament history;
- clear computed-but-unrevealed result rows, tiebreak rows, and result snapshot
  only after the ballot has validated successfully;
- return the ballot id, revision, manual override flag, replacement flag,
  invalidated-computed-result flag, and audit action id.

### Emergency Reopen RPC

The RPC must:

- require `adminSessionId`, `reason`, `roundNumber`, and `durationMinutes`;
- enforce the existing 1-10 minute duration rule;
- call `normalized_apply_voting_deadline_locked` so an expired but not yet
  durably closed window can be handled consistently;
- allow only `voting_closed` and `results_computed`;
- reject reveal-started result states;
- clear computed-but-unrevealed result rows, tiebreak rows, and result snapshot
  before reopening;
- update the voting window to `voting_open`, set `closes_at` to database time
  plus the selected duration, clear pause/final-warning/closed fields, and set
  `extension_used = true`;
- preserve existing ballots so players can edit after reopen;
- insert an audit row with the duration and computed-result invalidation flag.

### Reset Round RPC

The RPC must:

- require `adminSessionId`, `reason`, and `roundNumber`;
- insert an audit row before clearing state;
- clear only state scoped to the target round:
  - active voter presence for the round;
  - ballot revisions, choices, and ballots for the round;
  - result rows, tiebreaks, and result snapshot for the round;
  - voting window for the round;
  - round eligibility snapshot for the round;
  - active and superseded draws and drawn charts for round sets in that round;
- preserve:
  - `admin_actions`;
  - players and active/inactive roster state;
  - chart catalog and exclusions;
  - host lock;
  - other rounds;
  - historical ballot invalidation/audit rows unless a later product decision
    explicitly says reset should delete them.

## Tests

### Normalized Runtime Tests

Update `src/lib/server/transactions/normalized-runtime.test.ts`:

- the three Phase 4 mutations are implemented;
- the latest SQL definitions no longer contain disabled or placeholder
  transaction helpers;
- the latest definitions include `normalized_database_time`,
  `pg_advisory_xact_lock`, service-role grants, and row-change returns;
- RPC payload schemas reject missing reason/session/choice data;
- sanitized payload examples do not include `adminPassword`;
- unrelated blocked mutations remain blocked.

### Admin Action Source Tests

Update `src/lib/server/admin-actions.test.ts`:

- Supabase mode has explicit normalized RPC branches for manual ballot, reopen,
  and reset;
- app code still verifies dangerous-action password before calling the RPC;
- the RPC call payloads do not include `adminPassword`;
- memory-mode guard and local semantics are preserved.

### Private CSV and Local Semantics

Keep or extend existing local tests:

- manual override fields remain exported in private CSV;
- valid post-compute manual override clears unrevealed results before
  recompute;
- invalid manual override does not clear computed results;
- emergency reopen clears unrevealed computed results and reopens voting.

### SQL Source Behavior Tests

Add source assertions for the migration:

- manual override inserts `admin_actions`, `ballots`, `ballot_choices`, and
  `ballot_revisions`;
- manual override checks `replaceExistingBallot`;
- manual override deletes unrevealed result state only after validation logic;
- reopen deletes unrevealed result state and sets `status = 'voting_open'`;
- reset deletes only target-round state and never deletes `admin_actions` or
  `players`;
- all three functions are service-role only.

### Supabase / Hosted Evidence

Run local/source checks in this phase. Run
`npm run test:phase9:supabase-dev` only when disposable Supabase settings
are present:

- `E2E_TOURNAMENT_EVENT_ID`
- `E2E_ALLOW_DESTRUCTIVE_RESET=true`
- valid Supabase URL and service-role configuration

If those settings are absent, record the blocked hosted evidence in
`docs/phase-status.md`.

## Acceptance Mapping

| Acceptance criterion | Planned evidence |
| --- | --- |
| Supabase post-close manual ballot before reveal works | SQL source tests, runtime wrapper tests, optional Supabase-dev rehearsal |
| Overwrite requires explicit replace and records revision | SQL source tests and runtime payload tests |
| Reopen after close/computed allows valid edits and clears stale public result state | SQL source tests and existing browser/local reopen flow |
| Reset clears only intended round state and preserves audit rows | SQL source tests |
| RPC definitions are not disabled stubs and are callable only through service-role server code | normalized runtime tests and migration source assertions |

## Plan Review

- No tournament rules are changed.
- Password re-entry remains an application-server check and is not moved into
  SQL.
- Supabase emergency workflows use service-role server code only.
- Browser code receives no service-role keys, admin password hash, session
  secret, plaintext password, or tournament-changing RPC access.
- Manual ballot behavior remains limited to open voting or closed-before-reveal
  states.
- Computed results are invalidated only after a valid manual override or
  reopen, not after failed validation.
- Reset scope is round-limited and audit-preserving.
- No `.github/workflows/*` files are added.

Review result: pass. The plan is scoped to PRC-004 and can be implemented.

## Risks And Assumptions

- SQL source tests are not a substitute for a disposable Supabase rehearsal.
  Hosted evidence remains required before final event readiness.
- Existing production Supabase projects must apply the new migration before
  these workflows are available in Supabase mode.
- Manual ballot and reopen race with result computation must be serialized by
  the normalized event lock plus round/player transaction locks.
- Reset deletes current round eligibility snapshots in Supabase because they
  are round-scoped state. Memory mode currently preserves separate roster
  emergency-eligibility entries; this phase avoids changing memory behavior.
