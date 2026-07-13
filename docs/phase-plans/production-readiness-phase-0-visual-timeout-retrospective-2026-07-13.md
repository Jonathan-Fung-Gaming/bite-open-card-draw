# Phase 0 Visual Diagnostic Timeout Retrospective - 2026-07-13

Command: `rtk npm run test:phase0:memory`
Observed duration: 904 seconds
Outcome: command-level timeout; no valid Phase 0 visual evidence claimed

## Impact And Safety

- The run used the memory backend. It did not connect to or mutate hosted Supabase data.
- No complete JSON or screenshot set was promoted as evidence.
- The evidence-safety unit suite and TypeScript check had already passed independently.
- The timeout blocks the logo/CLS and 320/360/390 geometry checklist rows until a complete rerun
  succeeds in both Chromium and WebKit.

## Audit Findings

1. The shell command timeout and the Playwright per-test timeout were both 900 seconds. The shell
   terminated the parent command at the same boundary where Playwright needed to report its own
   timed-out step, so the failure output and trace were lost.
2. `visual-baseline.spec.ts` used the Phase 9 `AdminPage` object for deterministic memory setup.
   That page object is intentionally defensive for hosted Supabase and contains repeated route
   visits plus polling windows of up to 90 seconds. A single stale locator or navigation can consume
   several of those windows without identifying the specific visual-capture step.
3. The test was monolithic. Setup, nine route/width captures, result computation, reveal, and
   cleanup had no named `test.step` boundaries, so the list reporter could not identify the slow
   operation before the outer timeout.
4. The test compiled and visited all public/admin routes through `next dev`. Initial compilation is
   expected, but it was combined with hosted-oriented retry overhead and therefore could not be
   separated from an application stall.
5. Full-page screenshots, both browser engines, all three widths, early/loaded/settled logo boxes,
   layout-shift collection, native-select semantics, and complete-results geometry are required
   evidence. None should be removed to make the test faster.

## Optimization Before Rerun

- Replace hosted-oriented `AdminPage` setup/reveal calls with direct, named admin UI actions and
  explicit state assertions suitable for the deterministic memory backend.
- Add named Playwright steps for setup, every route/width capture, result reveal, evidence writing,
  and cleanup so a future timeout identifies the exact boundary.
- Keep the 900-second test ceiling as a safety net, but give the shell a larger ceiling so
  Playwright can emit its own failure and artifacts.
- Add separate Chromium and WebKit commands. Run them independently for diagnosis and require both
  to pass before closing Phase 0; this isolates engine-specific slowness without reducing coverage.
- Preserve all widths, routes, screenshots, early/loaded/settled geometry, layout-shift evidence,
  complete result state, and sanitizer enforcement.
- Do not start the hosted diagnostic until the optimized memory diagnostic is complete and its
  artifacts have been reviewed.

## Rerun Gate

The visual diagnostic may be rerun only after the direct-action refactor, named-step instrumentation,
formatting, TypeScript, focused evidence-safety tests, and Playwright list-only discovery pass.

## Resolution

The visual diagnostic was refactored into named steps, isolated from hosted work, and rerun one
engine at a time. Chromium passed in 54.3 seconds and WebKit passed in 1.1 minutes. Both runs
completed `/charts`, `/vote`, and `/results` measurements at 320, 360, and 390 pixels, preserved
the full authoritative two-set reveal timing, and wrote sanitizer-approved evidence.
