# Phase 8 Focused Phone And Roster Browser Regressions Plan - 2026-07-03

Status: executed, reviewed, and locally verified.

Parent plan: `docs/production-readiness-remediation-plan-2026-07-03.md`

Primary issues:

- PRC-013: roster selectors/helpers are brittle for attrition tests.
- PRC-015: same-username second-device replacement is not proven end-to-end.
- PRC-016: save-failure UX lacks browser-level proof.
- PRC-017: inactive-player hiding needs phone e2e coverage.

Authoritative behavior sources:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Product Rules Being Protected

The voting dropdown must show only active eligible start.gg usernames before voting opens, while an
already-open round must keep its eligibility snapshot unless an admin deliberately performs the
dangerous emergency current-round add workflow. Same-username second-device use must warn the user
and still allow the latest valid submitted ballot to count. Failed ballot edits must leave the
previous server-confirmed ballot valid.

This phase does not change tournament structure, draw eligibility, result selection, tiebreak
behavior, dangerous-action policy, admin password storage, or Supabase schema.

## Current Gaps

- Admin roster browser helpers do not have stable row/count selectors for attrition work.
- Vote page helpers can see the username selector but cannot assert dropdown count, order, or
  membership.
- `/room -> /vote` browser ballot submission exists only as local test code in older flows and is
  not reusable for later production-flow rehearsal work.
- Same-username replacement is covered by unit behavior and warning text, but not by two browser
  contexts submitting different valid ballots and verifying the newer ballot in final export.
- Save-failure behavior is covered below the browser layer, but no browser test forces a failed edit
  and then verifies the original timestamp, choices, and revision after reload.
- Inactive-player hiding, current-round snapshot stability, emergency add, and next-round routine
  roster behavior lack focused phone e2e coverage.

## Implementation Strategy

### Stable Selectors

Add narrowly scoped test markers without changing visible behavior:

- `admin-active-player-count` with a `data-count` value.
- `admin-roster-row` rows with username and active-state data attributes.
- `admin-voting-eligible-count` for the current round voting denominator.
- `ballot-chart-card` chart IDs/names as data attributes so browser tests can compare chosen cards
  against private CSV output without relying on visual text parsing.

### Page Helpers

Extend the existing Phase 9 page object style:

- `AdminPage.markPlayersInactive(names)` to deactivate named active players through the UI.
- `AdminPage.expectActiveCount(count)` to assert the roster count marker.
- `AdminPage.expectVotingEligibleCount(count)` to assert the current-round voting snapshot
  denominator.
- `AdminPage.addInactivePlayerToCurrentRound(name, reason)` to exercise the dangerous emergency
  add workflow, including password re-entry and action summary.
- `VotePage.expectEligiblePlayers(names)` to assert dropdown membership, count, and alphabetical
  order.
- `VotePage.submitBallot(...)` as a reusable `/room -> /vote` submitter with deterministic per-set
  ban plans.
- `VotePage.expectSavedBallot(...)` and a forced-submit-failure helper for the save-failure
  regression.

### Focused Browser Regression

Add a focused Phase 9 smoke spec that starts a 12-player rehearsal and proves:

1. A player marked inactive before voting opens is hidden from the phone dropdown.
2. A player marked inactive after voting opens does not silently leave the current-round snapshot.
3. The emergency current-round add workflow requires dangerous-action confirmation and adds the
   inactive player to the current round only.
4. Two browser contexts can use the same username; the second context sees the active-device
   warning, submits a different valid ballot after the first device, and the final private CSV
   contains only the second ballot choices/revision.
5. A forced edit save failure displays the previous-server-confirmed-ballot reassurance, and reload
   shows the original timestamp, original choices, and no extra revision.
6. The next round dropdown reflects routine roster changes and excludes players that remain inactive
   outside the emergency current-round snapshot.

## Review Of This Plan

- The plan follows the product spec and checklist: it adds evidence and stable helpers around
  existing tournament behavior, not new rules.
- The test remains intentionally smaller than the later 48 -> 36 -> 24 -> 12 production-flow
  rehearsal. It validates the helper primitives before Phase 10/11 scale them up.
- No Supabase migration is expected because the work is browser selectors, helper code, docs, and
  Playwright coverage.
- The main risk is brittle save-failure interception for Next server actions. Keep the interception
  scoped to the single submit click and assert the server state after reload so a false positive is
  unlikely.

## Focused Checks

Run these first:

```text
npm run test:phase9
```

Then run the default phase gate:

```text
npm run lint
npm run typecheck
npm run test
npm run build
```

Run broader browser checks after the focused pass:

```text
npm run test:e2e
npm run test:e2e:production-flow:validate
```
