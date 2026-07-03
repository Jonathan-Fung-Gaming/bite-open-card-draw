# Phase 3 Durable Timer Transitions Plan - 2026-07-03

Status: implemented and locally verified.

Parent plan: `docs/production-readiness-remediation-plan-2026-07-03.md`

Primary issue: PRC-010, deadline transitions may be derived on read but not
durably persisted.

Authoritative behavior sources:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Product Rule Being Protected

Voting uses one 10-minute server-authoritative window for both chart sets in a
round. Timer transitions must happen even if no player submits after a
deadline:

- Below 75 percent turnout at normal expiration extends once by 1 minute.
- After the one-minute extension, voting closes regardless of turnout.
- If every eligible player submits before the active deadline, the round enters
  a 30-second final-change warning and still accepts edits.
- Host pause freezes both timer and submissions.
- Client timers and public page refreshes may display state, but the server and
  database state remain authoritative.

## Pre-Implementation Gap

The TypeScript `VotingWindowStore` already has the correct timer transition
logic and separates pure snapshot derivation from persisted advancement:

- `getSnapshot()` clones the record and derives effective state for display.
- `advanceVoting()` mutates the stored record when explicitly called.

That preserved pure reads, but left a production gap: public and admin
polling paths can show a derived expired or extended state without persisting
it when no post-deadline ballot or admin mutation happens.

Before this phase, the Supabase side already had
`normalized_apply_voting_deadline_locked()`, used by ballot submission and
result computation. However, the public `normalized_advance_voting_timer` RPC
remained a disabled placeholder in the latest migration chain and the
TypeScript transaction facade still marked `advanceVotingTimer` as blocked.

## Implementation Strategy

Use the existing timer model and make advancement explicit, idempotent, and
request-scoped. Do not move tournament timing to browser code and do not make
every snapshot read write to storage.

### Server Helper

Add a server-only helper near `src/lib/server/voting-round.ts`:

- Inspect the currently hydrated voting-window record for a round.
- Determine whether a real transition is due before writing:
  - active deadline has expired;
  - or all eligible players have submitted before the current deadline.
- Do nothing for missing windows, paused windows, closed/result states, and
  non-due active windows.
- For memory backend, persist through `withPersistedVotingState()` only when a
  transition is due.
- For Supabase backend, call `advanceVotingTimer` through the normalized
  transactional facade only when a transition is due, then rehydrate the current
  state so the same request renders the persisted result.

### Polling and Snapshot Call Sites

Call the helper before public/admin snapshots on routes that poll or refresh:

- `/stage`
- `/vote`
- `/charts`
- `/results`
- `/coolguy69`
- `getVoteLiveStateAction`
- voter presence claims, so duplicate-device checks do not keep a stale open
  window after the deadline.

Do not add client-side writes or background loops. The helper is request-driven
and no-ops unless state is actually due to advance.

### Transaction Facade

Move only `advanceVotingTimer` from the blocked normalized mutation set to the
implemented mutation set:

- Keep all unrelated emergency workflows blocked until their later phases.
- Preserve input validation for `roundNumber`.
- Continue rejecting placeholder RPC acknowledgements without row-change
  evidence.

### Supabase Migration

Add a new migration that replaces `normalized_advance_voting_timer` with a real
service-role-only RPC:

- Validate `p_event_id` and `roundNumber`.
- Use `normalized_database_time()` as the official clock.
- Take an advisory transaction lock for the event/round timer advancement.
- Call `normalized_apply_voting_deadline_locked()`.
- Return `committed`, `changed`, `rows_changed`, `status`, `closesAt`,
  `closedAt`, and `serverNow`.
- Remain idempotent when no transition is due.

The existing `normalized_apply_voting_deadline_locked()` behavior remains the
single source for deadline rules so ballot submission, result computation, and
poll-triggered advancement do not diverge.

## Tests

### Timer Store Tests

Extend `src/lib/vote/voting-window.test.ts` to keep fake-clock coverage for:

- deadline expiration persists the one-minute extension with no post-deadline
  submission when `advanceVoting()` is called;
- the extension closes at its stored deadline, not at late request time;
- paused windows do not advance while paused.

### Server Helper Tests

Add focused coverage in `src/lib/server/voting-round.test.ts`:

- a hydrated open round below 75 percent is persisted to extension when polled
  at the normal deadline;
- polling again before the extension deadline does not write again;
- polling at the extension deadline persists closed state;
- all-submitted active windows persist the 30-second warning;
- paused windows do not persist advancement.

### Transaction and SQL Source Tests

Update `src/lib/server/transactions/normalized-runtime.test.ts`:

- `advanceVotingTimer` is implemented and calls
  `normalized_advance_voting_timer`.
- The latest RPC definition no longer contains
  `normalized_runtime_transaction_disabled`.
- The latest RPC uses `normalized_database_time`,
  `pg_advisory_xact_lock`, and `normalized_apply_voting_deadline_locked`.
- It returns row-change evidence so the TypeScript facade does not treat it as
  a placeholder acknowledgement.

Update schema/source tests if needed to assert service-role-only execute grants
remain in place.

## Acceptance Mapping

| Acceptance criterion | Planned evidence |
| --- | --- |
| Expiration persists extension and closed states with no post-deadline submission | `voting-window.test.ts`, `voting-round.test.ts` |
| Supabase/source tests prove the timer RPC is implemented and calls the locked deadline helper | `normalized-runtime.test.ts`, migration source |
| Polling `/stage`, `/vote`, or `/coolguy69` after expiration durably updates authoritative state | helper call-site tests plus route source review |
| No write loop is introduced on every page render | helper tests assert no writes when no transition is due |

## Plan Review

- No tournament rule changes: the plan reuses the existing deadline rules.
- No client-side tournament mutation path is added.
- Public polling can trigger only a server-side, event-scoped, idempotent timer
  advancement.
- Supabase uses database time, not app-server or browser time.
- Paused windows remain frozen.
- Unrelated blocked Supabase emergency workflows stay blocked for later phases.
- No `.github/workflows/*` files are added.

Review result: pass. The plan is scoped to PRC-010 and can be implemented.

## Risks And Assumptions

- Poll-triggered writes are intentional only when a real transition is due.
  Helper tests must catch accidental writes for ordinary active pages.
- SQL source tests do not replace disposable Supabase rehearsal, but this phase
  can prove the migration source and facade wiring before later hosted evidence
  phases.
- If a public poll and a ballot submission race at the deadline, the existing
  row lock and idempotent deadline helper must make the final window state
  deterministic.
