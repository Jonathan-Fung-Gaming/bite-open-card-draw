# Reveal, Device Identity, And Admin Roster Remediation Plan - 2026-07-13

## Scope

This focused remediation addresses three repeat event-day issues without changing tournament rules:

1. `/stage` can briefly return to the voting timer and drawn-card screen when the host starts the
   result flow.
2. A browser device can refresh and attempt to vote as a second player.
3. The player roster is buried in the collapsed setup/recovery panel and uses more table width than
   its event-day task needs.

The authoritative requirements remain `docs/product-spec.md`, especially player identity, voting
window, final reveal, admin behavior, and roster behavior.

## Root-Cause Review

### Stage reveal transition

- `stageShouldUseResultMode` treats `results_computed` and later statuses as result mode but excludes
  `voting_closed`.
- The first stage refresh after voting closes can therefore render the draw/timer branch while the
  result computation mutation or the following public hydration is still in flight.
- `StageResultPhaseGuard` has a session-sticky result lock, but it is established only after a result
  snapshot has already rendered. It cannot protect the first `voting_closed -> results_computed`
  transition.
- Public route freshness ordering already rejects backwards result phases after a snapshot is
  accepted. The missing boundary is the initial closed-without-result state.

### Device identity

- Browser storage remembers the chosen username, but the selector is still usable after refresh
  unless the current render restores a saved ballot.
- The server tracks `(round, player, device)` presence only to warn about the same player on another
  device. It does not reject one device claiming or submitting for a different player.
- Normalized ballot submission does not currently receive a device id, so Supabase cannot enforce
  the rule atomically.

### Admin roster

- The roster is inside the left-column `Setup & Recovery` collapsed panel rather than the operator
  sidebar.
- Its desktop grid gives the username an unbounded fractional column, then spends a separate column
  on text status even though the adjacent action already communicates the state transition.

## Reviewed Implementation Plan

### 1. Make closed voting an irreversible stage result-holding boundary

- Include `voting_closed` in the stage result-mode statuses.
- Render the existing neutral result-holding screen when no result snapshot exists.
- Keep the freshness guard and result-phase lock in place for stale payload protection after reveal
  starts.
- Add unit coverage proving `voting_closed` cannot select draw mode and browser coverage proving the
  timer/card screen never reappears between close, compute, and first reveal.

### 2. Bind each voting device to one player for the event

- Add an event-scoped persisted device binding keyed by device id and player id.
- For memory state, bind the device on the first successful player ballot, reject later claims or
  submissions for a different player, preserve the binding across rounds, and clear it only with a
  full tournament reset.
- For Supabase, add a migration that wraps the existing presence and ballot RPCs:
  - presence checks an existing binding for early feedback;
  - ballot submission inserts/checks the binding in the same transaction as the existing ballot
    mutation, so a failed ballot does not lock a device and concurrent different-player submissions
    cannot both succeed.
- Pass `deviceId` through the normalized ballot contract and synthetic e2e ballot path.
- Mark the remembered browser identity as locked only after a successful ballot. On refresh, show
  only that identity; if the player is not eligible in a later round, show a blocked explanation
  instead of another username selector.
- Preserve the product-spec behavior that a second device may use the same player identity with a
  warning and the latest valid ballot wins.

### 3. Move and simplify the roster panel

- Move the roster out of `Setup & Recovery` and make it the first panel in the right-side admin
  sidebar.
- Cap the username column at approximately 15 characters on wide layouts.
- Replace the text status column with the `Mark Inactive` / `Reactivate` control.
- Render active usernames in green and inactive usernames in red; retain `data-active` metadata and
  history-lock guidance for accessibility and automated checks.
- Keep typo editing in the remaining action column and preserve all existing server actions and host
  lock gating.

### 4. Verification and evidence

- Focused unit tests:
  - stage result-mode boundary;
  - memory device binding, same-player multi-device behavior, persistence, and reset behavior;
  - normalized mutation payload/device contract and migration source checks.
- Focused Playwright checks:
  - no stage voting band after voting closes through result reveal start;
  - refresh after a submitted ballot cannot expose a different-player selector;
  - roster is above support panels in the right sidebar, uses the active-state color, and places the
    active toggle in the former status column.
- Required gates: lint, typecheck, unit tests, build, full e2e, and `git diff --check`.
- Record changed files, checks, evidence, assumptions, risks, and manual product-spec review in
  `docs/phase-status.md` after all gates pass.

## Plan Review

- Merely increasing polling frequency would not remove the closed-without-result render branch, so
  the stage boundary is fixed in the state-to-view decision instead.
- A browser-storage-only identity lock would be bypassable by cleared or unavailable storage, so the
  server binding is authoritative and the client lock is only immediate UX feedback.
- Binding occurs on successful ballot submission, not first username confirmation, preserving the
  existing wrong-name correction path before a player's first submitted ballot.
- The binding is device-to-player, not player-to-device, so same-player second-device recovery remains
  valid.
- The Supabase binding and ballot commit share one database transaction; this avoids both premature
  locks after failed submissions and concurrent double-identity races.
- The roster change is presentation-only. It does not change active-player snapshots, elimination
  rules, reactivation authority, or dangerous current-round eligibility controls.
- No reveal cadence, result selection, timer duration, turnout rule, or tiebreak authority changes.

## Acceptance Criteria

- From the moment voting is closed, `/stage` never renders `stage-voting-band` unless an explicit,
  newer emergency reopen or reset is committed.
- Refreshing a device after its first successful ballot does not allow selecting or submitting as a
  different player.
- Server-side memory and Supabase paths reject a different-player claim/submission for an already
  bound device while still allowing another device for the same player.
- The roster is the first right-sidebar panel, outside collapsed panels.
- Active usernames are green, inactive usernames are red, and the middle roster column contains the
  inactive/reactivate action instead of status text.
- All required checks pass and the final manual review finds no product-spec or security regression.
