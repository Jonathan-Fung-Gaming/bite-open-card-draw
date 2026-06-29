# Release Closure Handover - 2026-06-29

Use this handover to start a new conversation focused only on the remaining release blockers after
Remediation Phase 8. The app is not event-ready until the final closure gate in
`docs/remediation-issue-checklist.md` passes.

## Starting Context

- Current merged baseline after Remediation Phase 8: PR #24,
  commit `89326838660d565664ab20d135c6bdb6f7615e40`.
- Product behavior sources of truth: `docs/product-spec.md` and
  `docs/pump_open_stage_repo_validation_checklist.md`.
- Required command rule: prefix shell commands with `rtk`.
- Do not change tournament rules unless the user explicitly asks.
- Do not close `RIC-020`, `RIC-021`, `RIC-022`, or `RIC-028` until real cached chart artwork is
  populated and verified.

## Remaining Release Blockers

- `RIC-020`: real cached chart image files exist in the deployed asset location or controlled
  storage.
- `RIC-021`: `public/chart-images/cache` or the chosen controlled image storage is populated before
  event use.
- `RIC-022`: `cache:chart-images` can produce non-fallback cached assets in normal event setup.
- `RIC-028`: real cached artwork rendering is verified with automated natural-width or screenshot
  checks.
- Final closure gate: a full four-round rehearsal has been completed with persistent state.
- Final closure gate: private CSV export has been verified after final reveal.

## New Conversation Prompt

```text
Please work on the release closure handover in
docs/release-closure-handover-2026-06-29.md.

Before making changes, read AGENTS.md, docs/product-spec.md,
docs/pump_open_stage_repo_validation_checklist.md,
docs/remediation-issue-checklist.md, docs/phase-status.md,
docs/deployment-readiness.md, docs/event-day-runbook.md,
docs/release-checklist.md, docs/phase-gates.md, and docs/security-notes.md.

Use rtk for all shell commands. Preserve the tournament rules from the product spec and validation
checklist. Do not mark RIC-020, RIC-021, RIC-022, or RIC-028 closed unless real cached chart artwork
files and real artwork rendering are verified. Do not treat the app as event-ready until the final
closure gate in docs/remediation-issue-checklist.md passes.

Implement the release closure plan, update docs/remediation-issue-checklist.md and
docs/phase-status.md with evidence, run required checks, then commit, push a PR branch, open a PR,
and merge it.
```

## Release Closure Plan

### 1. Resolve Real Chart Artwork

Inspect why the normal cache step still reports `0 cached`.

- Run `rtk npm run cache:chart-images` without `--fallback-only`.
- Inspect generated image metadata for representative `failureReason` values.
- Determine whether failures are caused by invalid source URLs, network restrictions, redirects,
  required headers, upstream blocking, or missing source files.
- Choose an event-safe source of real artwork:
  - fix the remote fetch path if it is reliable and reproducible, or
  - populate `public/chart-images/cache` from an approved controlled image pack or storage source.
- Verify `rtk npm run cache:chart-images` reports `N cached` where `N > 0`.
- Verify `public/chart-images/cache` or the chosen controlled storage contains real image files.

### 2. Harden Image Verification

Add a gate that prevents release closure when every chart image is fallback-only.

- Add or extend an automated check that fails if no non-fallback cached images exist.
- Extend Playwright or a focused verification script to prove at least one real cached image renders
  on `/stage`, `/vote`, `/charts`, and `/results`.
- Keep existing fallback rendering checks, but distinguish fallback rendering from real cached
  artwork rendering.
- Close `RIC-020`, `RIC-021`, `RIC-022`, and `RIC-028` only after the real-image evidence is
  recorded.

### 3. Run Persistent Four-Round Rehearsal

Use a production-like persistent setup.

- Configure `TOURNAMENT_STATE_BACKEND=supabase`.
- Confirm Supabase migrations are applied and connectivity works.
- Start rehearsal mode or use disposable event data.
- Run all four rounds:
  - draw both sets,
  - open voting,
  - submit and edit ballots,
  - close voting,
  - compute results,
  - run tiebreak reveal where applicable,
  - complete final reveal,
  - advance to the next round.
- Confirm selected songs from earlier rounds do not appear in later draws.
- Confirm state survives browser refresh and, where practical, a server restart or redeploy.

### 4. Verify Private CSV Export

Verify CSV behavior after final reveal.

- Confirm private CSV auto-download after final reveal.
- Confirm the manual `Download private ballot CSV` admin button works.
- Confirm CSV includes player ballots, manual override markers, selected charts, and tiebreak flags.
- Record filenames, round numbers, and verification evidence in `docs/phase-status.md`.

### 5. Final Docs And Checklist Closure

Update documentation only after evidence exists.

- Update `docs/remediation-issue-checklist.md` with evidence for every remaining open item.
- Update `docs/phase-status.md` with changed files, checks run, manual review, risks, and
  assumptions.
- Update `docs/release-checklist.md`, `docs/deployment-readiness.md`, or runbooks only if the
  rehearsal exposes a gap.
- Mark the final closure gate complete only when every checklist row is checked and release blockers
  are gone.

### 6. Final Required Checks

Run these before the PR is merged:

- `rtk npm run lint`
- `rtk npm run typecheck`
- `rtk npm run test`
- `rtk npm run import:charts`
- `rtk npm run cache:chart-images`
- `rtk npm audit --omit=dev`
- `rtk git diff --check`
- `rtk npm run build`
- `rtk npm run test:e2e`

## Acceptance Criteria

- Normal image cache generation produces non-fallback cached assets.
- Real cached image files are present in the deployed asset location or controlled storage.
- Automated checks verify real cached artwork rendering on public/player result surfaces.
- A full four-round rehearsal has been completed using persistent state.
- Private CSV auto-download and manual download are verified after final reveal.
- `docs/remediation-issue-checklist.md` has every row checked with evidence.
- `docs/phase-status.md` states that the final closure gate passed, with checks and residual risks
  documented.

## Execution Update - 2026-06-29

- Real artwork caching was repaired by running the cache script through Node with the system CA store:
  `node --use-system-ca --import tsx scripts/cache-chart-images.ts`.
- Repeated normal cache runs produced `639 cached, 0 using fallback`, and
  `public/chart-images/cache` contains 639 real PNG files.
- `rtk npm run verify:real-chart-images` verifies non-fallback cached assets and chart assignments.
- Playwright now requires real `/chart-images/cache/...` rendering, not `fallback-card.svg`, across
  `/stage`, `/vote`, `/charts`, and `/results`.
- An automated four-round repository-backed persistent rehearsal test now completes all rounds and
  verifies private CSV content after final reveal.
- A hosted Supabase rehearsal was not run in this pass. The runtime now uses normalized
  event-scoped Supabase tables, but the app still must not be treated as event-ready until hosted
  rehearsal is explicitly approved and completed against a non-production project/ref and disposable
  `TOURNAMENT_EVENT_ID`.

## Risks And Assumptions

- The largest unknown is artwork sourcing. If upstream image URLs remain unavailable, use an approved
  controlled image pack or storage source rather than weakening the release gate.
- The four-round rehearsal may require real Supabase credentials and local environment variables that
  must not be committed.
- Fallback artwork remains acceptable for resilience, but it is not enough to close the real cached
  artwork release blockers.
