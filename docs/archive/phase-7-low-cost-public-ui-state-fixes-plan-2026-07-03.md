# Phase 7 Low-Cost Public And UI State Fixes Plan - 2026-07-03

Status: executed, reviewed, and locally verified.

Parent plan: `docs/production-readiness-remediation-plan-2026-07-03.md`

Primary issues:

- PRC-019: results are sorted least-to-most but not progressively revealed chart-by-chart.
- PRC-021: admin live counts are hidden visually but present in initial admin DOM.
- PRC-023: post-complete missing-result phone state can fall through to generic pre-vote copy.
- PRC-024: no-vague-skip rule lacks a direct browser regression assertion.

Authoritative behavior sources:

- `docs/product-spec.md`
- `docs/pump_open_stage_repo_validation_checklist.md`
- `docs/phase-gates.md`
- `docs/security-notes.md`

## Product Rules Being Protected

Public and phone screens must not spoil chart-by-chart counts or selected charts before the stage
reveal permits them. Admin live counts are allowed on `/coolguy69`, but they are sensitive and must
require deliberate disclosure without another password. Players may complete zero bans only through
the explicit `No bans for this set` control; no vague skip action is allowed.

This phase does not change tournament structure, draw rules, result computation, backend tiebreak
selection, roster eligibility, dangerous-action password policy, or Supabase schema.

## Current Gaps

- The stage result count phase renders all seven sorted rows as soon as the host advances to
  `set_1_counts` or `set_2_counts`.
- `/coolguy69` renders chart names and live ban counts in the authenticated server HTML inside a
  closed `<details>` element.
- `/vote` handles `voting_closed`, `results_computed`, `results_revealing`, and
  `results_revealed` missing-result states, but `round_complete` with missing or non-final result
  data can still fall through to generic pre-vote copy.
- Browser tests exercise `No bans for this set`, but they do not directly fail if a future vague
  `Skip` button/link/text appears on `/vote`.

## Implementation Strategy

### Count Reveal Decision

Phase 0 locked the 5+ tiebreak fallback behavior and dangerous-action policy, but it did not choose
timed row-by-row count reveal. Phase 7's parent plan makes sequential chart-by-chart reveal
conditional on that Phase 0 choice. Therefore PRC-019 will be closed by documenting and testing the
current accepted behavior:

- the host advances to a set count phase deliberately;
- the stage shows that set's seven rows at once, already sorted least-to-most by ban count;
- selected/winner treatment remains hidden until the separate resolved phase;
- tiebreak winner reveal remains backend-committed and time-gated when applicable.

This avoids adding new timed behavior that the product spec does not require and keeps Playwright
evidence non-flaky. Add regression coverage around the accepted behavior instead of adding a row
timer.

### Admin Live Count Disclosure

Move live count row generation out of the initial `/coolguy69` server render:

- add a small server-only live count builder that returns only the current round rows after an
  authenticated request;
- add a server action that requires an admin session, hydrates state, and returns those rows;
- replace the `<details>` server-rendered row list with a client component that initially renders
  only warning copy and a `Show live counts` button;
- on click, fetch and render counts without an admin password field.

Add a source/HTML-oriented regression proving the warning remains present, no password field is
introduced, and chart-by-chart rows are not in the initial server-rendered page.

### Phone Missing-Result Holding State

Add a small helper in `src/lib/vote/phone-view.ts` for phone result holding states:

- closed/revealing states show `Voting is closed. Results are being revealed on stage.`;
- `results_revealed` or `round_complete` without a final result snapshot show a result-loading
  holding state;
- `results_revealed` or `round_complete` with `resultPhase === "final"` show final selected charts.

Refactor `/vote` branch ordering to use that helper so `round_complete` never falls through to
generic pre-vote draw copy.

Add unit coverage for `round_complete` plus missing/non-final result data.

### No-Vague-Skip Browser Assertion

Update the mobile route Playwright test to assert:

- `/vote` has no visible button/link/text matching `/skip/i`;
- `No bans for this set` remains visible and usable as the only zero-ban completion path.

## Review Of This Plan

- The plan follows the product spec: live counts remain admin-only behind a warning, with no extra
  password; phones still wait for final reveal before showing results.
- PRC-019 is handled according to the conditional wording in the parent plan: because Phase 0 did
  not choose timed row reveal, this phase documents all-at-once sorted count reveal as acceptable
  and protects it with tests.
- No Supabase migration is expected because all changes are UI, server action, and test coverage.
- The main risk is accidentally leaking sensitive admin count rows before disclosure; the client
  component/server-action split is designed to remove those rows from initial HTML.

## Focused Checks

Run these first:

```text
npm run test -- src/lib/results/result-engine.test.ts src/lib/vote/phone-view.test.ts src/lib/server/admin-actions.test.ts
npm run test:e2e:memory-dev-smoke
```

Then run the default phase gate:

```text
npm run lint
npm run typecheck
npm run test
npm run build
```

Run broader browser checks if the focused e2e pass is stable:

```text
npm run test:e2e
npm run test:phase9
```
