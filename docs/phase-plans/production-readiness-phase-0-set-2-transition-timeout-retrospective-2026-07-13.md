# Phase 0 Set 2 Transition Timeout Retrospective - 2026-07-13

Command: `npm run test:phase0:memory:chromium`
Observed duration: 150.7 seconds
Outcome: Playwright locator timeout in the named `Reveal Set 2 selected chart` step; no complete
visual evidence claimed

## What Completed

- Memory rehearsal setup: 7.5 seconds.
- `/charts` and `/vote` at 320, 360, and 390 pixels: all six geometry/screenshot steps completed.
- Voting close, result computation, Set 1 counts, and Set 1 resolved actions completed.
- Cleanup released the memory host.

## Root Cause

The failure snapshot showed that the previous `Advance to Set 2 counts` action was submitted while
the authoritative Set 1 tiebreak still had nine seconds remaining. The server correctly rejected
that transition and kept the result in `set_1_resolved`. The generic admin click helper did not make
the rejected transition visible to this diagnostic, so the next named step searched for the Set 2
resolved button while the page still offered `Advance to Set 2 counts`. That impossible locator then
consumed its full 120-second wait.

This is a test sequencing defect. It does not justify shortening or bypassing the product's
10-second tiebreak reveal.

## Optimization Before Rerun

- Drive reveal actions as `(button, expected phase)` pairs and assert the authoritative phase after
  every transition.
- After entering `set_1_resolved` or `set_2_resolved`, wait the exported
  `TIEBREAK_REVEAL_DURATION_MS` plus a small scheduling margin before requesting the next server
  transition.
- Keep the full 10-second duration; do not mock the clock, call internal stores, or use a test-only
  state shortcut.
- Fail immediately on a phase mismatch so a rejected action cannot cascade into a later locator
  timeout.
- Preserve the same complete-results route evidence, both browser engines, all widths, screenshots,
  logo geometry, CLS, and sanitizer checks.

## Rerun Gate

Rerun only after the state-aware reveal sequence is implemented and formatting, TypeScript,
evidence-safety unit tests, and Chromium/WebKit list discovery pass.

## Isolation Incident After Remediation

The first state-aware Chromium rerun exited after Set 2 counts without a Playwright failure artifact.
A process audit found that an earlier subagent command had started the hosted Phase 0 suite at the
same time on a second Playwright/Next tree. That violated the memory-before-hosted gate and created
workspace/process contention. The exact hosted test tree was stopped before it could be accepted as
evidence; no production event id was used because the hosted runner generated a guarded `phase0-`
namespace.

Before another rerun, the process audit must show no Phase 0 Playwright or Next process. Memory
Chromium and WebKit must run one at a time, and the hosted suite may start only after both pass and
their artifacts are reviewed.

### Confirmed Contamination Mechanism

A later ancestor-process audit found a second stale subagent PowerShell launcher. It deleted the
shared `test-results/phase0` directory and started a second `next dev` instance for a targeted hosted
transition test while the Chromium memory run was active. The memory server then emitted
`Invariant: missing bootstrap script`, consistent with concurrent Next development servers writing
the same `.next` cache. The contaminated memory run was deliberately terminated after 424.8 seconds;
it is not a product timeout and none of its partial output is evidence.

The verified root launchers and their child trees were terminated. Before the clean rerun, remove
only the workspace `.next` cache after resolving and checking its absolute path, verify there are no
Phase 0/Next processes for this repository, and recreate evidence from an empty Phase 0 output
directory.

A final isolation gate caught a queued subagent command that intended to run hosted Playwright with
`--list`. `scripts/run-phase0-diagnostics.mjs` did not forward CLI arguments, so it launched the
hosted test instead. The root shell was terminated before the clean visual rerun. The runner now
forwards Playwright arguments and exposes an explicit hosted list script, so list-only validation
cannot silently become an executing hosted test.

## Resolution

- The state-aware reveal sequence now waits the authoritative 10-second tiebreak duration before
  advancing each resolved phase.
- Phase 0 uses the isolated `.next-phase0` build directory and engine-specific Playwright output
  directories.
- The clean canonical Chromium rerun passed in 54.3 seconds and the WebKit rerun passed in 1.1
  minutes, including all nine geometry samples and the complete two-set reveal.
- The hosted transition diagnostic then ran separately and passed in 2.2 minutes.
