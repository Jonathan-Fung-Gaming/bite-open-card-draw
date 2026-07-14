# Production Readiness Phase 5 - Branding, Copy, Charts, And Mobile Selector - 2026-07-14

Parent plan: `docs/production-readiness-remediation-plan-2026-07-13.md`

Checklist: `docs/production-readiness-remediation-checklist-2026-07-13.md`

Issues: PRR-003 through PRR-007, plus the tournament owner's Phase 5 rune-wheel center-copy
requirement dated 2026-07-14.

## Goal

Close the shared logo, redundant-copy, view-only chart navigation/presentation, and native mobile
username-selector issues without changing tournament rules, ballot behavior, public-data privacy,
desktop presentation, or authoritative tiebreak behavior. During a valid rune-wheel spin, the
visual center will be blank rather than explaining that the visibly moving wheel is spinning;
the useful invalid-timing wait state and committed winner name remain.

This phase is UI-only. It adds no database migration, server mutation, tournament decision,
browser randomness, new secret, or new external dependency.

## Sources Of Truth Read

- `AGENTS.md` and `docs/codex-current-brief.md`
- Phase 5 of `docs/production-readiness-remediation-plan-2026-07-13.md`
- Phase 5 rows in `docs/production-readiness-remediation-checklist-2026-07-13.md`
- `docs/product-spec.md`, especially Routes, QR behavior, Player identity, Ballot behavior, Voting
  window, Results behavior, Rune-wheel tiebreak, Final reveal, and Visual direction
- `docs/pump_open_stage_repo_validation_checklist.md`, especially phone layout, identity, view-only,
  stage/results, tiebreak, visual-theme, and validation decisions
- `docs/production-readiness-phase-0-prr-contract-report-2026-07-13.md` PRR-003 through PRR-007
  baselines and closure criteria
- `docs/phase-gates.md`
- `docs/security-notes.md`
- Current shared logo/header, stage, charts, vote, results, rune-wheel, CSS, Vitest, and Playwright
  implementation and coverage
- Three independent read-only Phase 5 audits covering requirements, UI implementation surfaces,
  and browser/test risks

No document under `docs/archive/` is used as current authority. RTK is not used.

## Baseline Findings

1. `TournamentLogo` uses a CSS-sized relative wrapper and `next/image` `fill`. Its initial image
   markup has no intrinsic 512x339 dimensions even though the optimized web asset is exactly
   512x339. Phase 0 measured stable geometry on three routes but explicitly left broader consumer,
   cached/uncached, loading, and error coverage to Phase 5.
2. `RoundHeader.status` is required and always renders a paragraph. Passing an empty string would
   remove words but leave an empty layout row.
3. Stage voting still appends `One window covers both sets.` after the required turnout and total
   ban-selection counts. `/charts` still supplies `Chart display` as a header status.
4. Public result sections repeat `Full ban counts` next to `Ban counts`; a result set repeats the
   same words in a badge; a drawn `/charts` panel says `Charts ready` beside already-visible cards;
   and current final-result headers repeat final/revealed status already expressed by their titles.
5. `/charts` correctly provides two mobile set tabs, server-renders panels, reconciles stored tab
   state after hydration, and falls back to the drawn tab for a partial draw. It also renders a
   second redundant Previous/Next button row.
6. `/charts` cards are already noninteractive articles and its two-column grid already centers an
   odd seventh card. On mobile, however, metadata sits below a separate 16:9 image rather than
   overlaying the art like the voting cards. The generic mobile header is larger and centered.
7. Voting cards correctly own button semantics, `aria-pressed`, selection handlers, disabled state,
   and vote copy. Only their passive inner art/gradient/metadata treatment is shareable.
8. The username selector is correctly a native `<select>` with the exact required label, but it
   uses engine appearance, symmetric padding, and no fixed chevron or text reservation.
9. The rune wheel visibly says `Tiebreak selector is spinning.` during a valid authoritative spin.
   It separately has useful invalid-timing waiting copy and revealed-winner copy that must remain.
10. Existing broad mobile/e2e tests are useful reference evidence but are not a suitable Phase 5
    gate because some WebKit paths depend on Chromium-prepared state. Phase 5 needs independent,
    self-seeding Chromium/WebKit projects and only targeted browser coverage.
11. The original checkout contained unrelated uncommitted post-Phase-4 CSV/rehearsal edits. With
    the owner's approval they were discarded, the original checkout returned to clean `main`, and
    this phase continues in an isolated worktree/branch from `origin/main`.

## Locked Invariants

- The tournament remains four rounds with the exact two-set mapping and seven charts per set.
- Voting remains one 10-minute window for both sets, up to two bans per set, explicit no-bans, one
  final ballot, server-authoritative timing, and latest-valid-ballot behavior.
- `/charts` remains view-only. Its chart cards cannot submit, mutate, affect turnout, receive vote
  handlers, expose `aria-pressed`, or become focusable controls.
- The exact label `Select your start.gg username` and confirmation `Are you sure you are voting as
[start.gg username]?` remain. The selector remains a native keyboard/AT-operable `<select>`.
- Public screens keep aggregate turnout and total ban selections but never show chart-by-chart live
  counts during voting.
- Identity, no-bans, previous-round, reveal-holding, view-only, host-recovery, dangerous-action,
  and error-recovery copy remains unless an exact duplicate decision below says otherwise.
- The backend-decided tiebreak winner remains committed before animation. The wheel remains only a
  10-second reveal, with 12 slots for supported 2-4 way ties and the existing safe 5+ fallback.
- Invalid authoritative timing keeps a useful visible waiting message. A completed reveal shows the
  committed winner name. A valid in-progress spin exposes no winner and shows no visible center text.
- Mobile `/charts` remains a two-column grid with the seventh card centered. Server-visible panels,
  partial-draw fallback, and both tabs remain.
- Desktop `/charts` geometry/presentation remains stable except the explicit copy removals. The new
  compact header and over-art metadata are mobile-only and opt-in to `/charts`.
- The original industrial/rune theme, optimized original assets, no reduced-motion toggle, and
  avoidance of strobing/camera shake remain.
- No service key, password hash, session secret, or mutation capability is added to browser code.

## Reviewed Before/After Copy Inventory

### Remove as confirmed redundant

1. Stage voting suffix `One window covers both sets.`. Keep `Ballots submitted: X / Y` and `Ban
selections cast across both sets: Z`, plus pause/extension/final-change explanations.
2. `/charts` header status `Chart display`. Omit the status node entirely so it consumes no space.
3. `/charts` drawn-panel status `Charts ready` when chart cards are visible. Keep `Awaiting host
draw` for an undrawn panel. Keep Stage's separate `Charts ready` reveal-completion signal because
   that copy communicates animation state rather than duplicating visible static cards.
4. `Full ban counts` eyebrow immediately above the `Ban counts` heading. Keep the heading and each
   set's disclosure label.
5. The result-set badge repeating `Ban counts`/`Full ban counts` beside the `Ban Counts` heading.
6. Current-result header statuses `Final results`, `Results revealed`, and Stage `Final charts
selected` when the adjacent title already says `ROUND X FINAL CHARTS`. Preserve the explicit
   `Previous round results` status and notice because it prevents stale-round confusion.
7. `/charts` final-status heading `Final charts revealed` directly below the final-charts page title.
   Keep `View charts only - no votes recorded` and `Selected charts are shown first.`
8. Valid mid-spin visual text `Tiebreak selector is spinning.`. Keep invalid-timing waiting copy and
   the post-reveal winner name.

### Preserve as required or useful

- Exact player identity label and confirmation.
- Explicit `No bans for this set` and no vague skip.
- View-only/no-vote warning and voting/reveal state explanations.
- Previous-round notice and current-round replacement explanation.
- `Voting is closed.` / `Results are being revealed on stage.` holding copy.
- Host recovery, forced-takeover, dangerous-action summaries, validation errors, retry/error copy.
- Aggregate turnout and total ban-selection text.
- Undrawn-set `Awaiting host draw` and authoritative-timing waiting copy.

## Detailed Implementation Plan

### 1. Shared logo intrinsic geometry and consumer contract

1. Change only the shared `TournamentLogo` image from `fill` to explicit `width={512}` and
   `height={339}` while retaining the existing fixed wrapper sizes, responsive `sizes`, optimized
   `/brand/tournament-logo-web.png`, exact alt text, priority prop, object containment, pointer
   behavior, and drop shadow.
2. Add `h-full w-full` so the intrinsic image continues to fit the same standard and compact
   wrappers. Confirm the generated initial HTML contains intrinsic dimensions before CSS/image load.
3. Add a route-opted mobile-responsive logo size for the `/charts` header only: smaller at the base
   breakpoint and restored to the existing standard wrapper at `sm` and above.
4. Add static render contracts for intrinsic dimensions/aspect, optimized source, alt, sizes,
   standard/compact/mobile-responsive sizing, and priority/non-priority behavior.
5. Inventory and test direct consumers: `RoundHeader`, `AdminLayout`, `/room`, both `/vote` header
   implementations, unauthenticated `/coolguy69`, authenticated admin layout, Stage loading, and
   Stage error. Route coverage of `RoundHeader` includes `/stage`, `/charts`, and `/results`.

### 2. Optional header status and exact copy cleanup

1. Make `RoundHeader.status` optional and render no status paragraph when absent. Preserve the
   existing status typography/layout on every caller that supplies useful copy.
2. Remove the exact Stage voting suffix while preserving aggregate counts and special-state text.
3. Omit `/charts` `Chart display` and current-result duplicate statuses listed in the reviewed copy
   inventory. Keep the previous-round status/notice.
4. In `PublicDrawSetPanel`, render the status only for an undrawn set. Do not remove Stage's
   animation-completion status.
5. Remove the confirmed result-heading/badge duplicates without changing result order, selected
   labels, least-ban labels, disclosures, rows, or reveal behavior.
6. During a valid authoritative rune-wheel spin, render no visible center content. Preserve the
   same center/status container for stable geometry, render invalid-timing waiting copy when needed,
   and render the backend-committed winner name after reveal.
7. Update focused render and later regression assertions from old removed copy to the new exact
   keep/remove contract.

### 3. `/charts` tabs, pre-hydration behavior, and passive mobile chart visuals

1. Delete only the mobile Previous/Next button block and its now-unused `activeSet`. Leave tab
   anchors, session storage, hydration flag, bounded index, partial-draw availability, and fallback
   logic unchanged.
2. Add an opt-in `mobileCompact` `RoundHeader` presentation. On mobile align the smaller logo,
   `Pump It Up Open Stage`, and `Drawn Charts` near the upper-left with compact readable typography,
   `min-width: 0`, and contained spacing. At `sm` and above restore the current layout, logo,
   alignment, gaps, padding, and heading sizes.
3. Extract one passive inner chart visual component containing art, gradient, title, and artist.
   It must contain no button, link, handler, focusability, vote wording, or `aria-pressed` state.
4. Keep the voting outer `<button>` and all existing selection semantics/state around the shared
   inner visual. Pass its vote badge/selection overlay as presentation-only content without moving
   behavior into the shared component.
5. Keep `/charts` outer `<article>` and data/evidence attributes. On mobile show full-cover art,
   gradient, and over-image metadata. At `md` restore the current separate 16:9 contained-art block
   and metadata area so desktop presentation remains stable.
6. Preserve `.public-chart-grid`, two columns, centered odd seventh card, partial/empty states, and
   the server-rendered panels visible before hydration.

### 4. Native username selector and custom chevron

1. Wrap the existing native select in a relative container without changing its id, label, options,
   value, change handler, disabled logic, alphabetical data, or identity flow.
2. Add `appearance-none`, a minimum 44px target, sufficient fixed right padding, long-text
   containment, and an explicit visible focus treatment.
3. Add a fixed chevron within the wrapper at a stable right inset. Mark it `aria-hidden="true"`,
   `pointer-events-none`, and expose only a test id/data hook for geometry evidence.
4. Verify pointer input still reaches the select beneath the icon; keyboard selection, focus,
   disabled identity lock, and long selected names remain correct in Chromium and WebKit.

### 5. Targeted unit, browser, visual, and accessibility evidence

1. Add `playwright.phase5.config.ts` with independently seeded desktop Chromium, mobile Chromium,
   and mobile WebKit projects. Do not make one browser depend on state prepared by another.
2. Add a guarded `phase5-memory` profile and package scripts for list, Chromium, WebKit, and the
   combined targeted suite. Keep the memory-backend/test-route restrictions used by earlier phases.
3. Add static/Vitest coverage for logo markup and loading/error consumers, optional status markup,
   public-article versus ballot-button semantics, copy keep/remove decisions, and rune-wheel active,
   invalid-timing, and revealed states.
4. Chromium logo/copy evidence hard-reloads `/stage`, `/room`, `/vote`, `/charts`, `/results`, and
   unauthenticated/authenticated `/coolguy69`. Capture uncached/delayed and cached states, intrinsic
   attributes, earliest/loaded/settled geometry, object containment, optimized request path, and
   logo-attributable `PerformanceObserver` layout shifts. Always release delayed routes in `finally`.
5. Cover Stage loading and error consumers with deterministic static render tests because Next's
   special route states are not reliably browser-routable.
6. Assert Stage voting lacks the removed suffix but retains aggregate counts. Assert `/charts`
   lacks `Chart display`, drawn-card duplicate copy, and an empty status spacer.
7. Add a focused seeded-tiebreak browser assertion/screenshot when practical: valid mid-spin center
   is visually empty and leaks no winner; completion shows the committed winner. Unit/timing
   regressions also prove invalid-timing wait, duration, slots, and fallback remain.
8. In Chromium and WebKit, test `/charts` at 320, 360, and 390 pixels for compact upper-left header,
   two columns, art/metadata overlap, centered seventh card, noninteractive article semantics, tabs,
   no Previous/Next controls, and no horizontal overflow. Use JavaScript-disabled contexts for real
   pre-hydration fragment navigation/panel evidence and normal contexts for hydrated switching and
   stored selection.
9. Test partial draw independently in each browser project: drawn tab is the fallback, undrawn tab
   is disabled, undrawn explanation remains, and the server markup remains useful.
10. Capture desktop `/charts` evidence at 1280 and 1440 pixels and compare structural geometry to
    the stable two-panel, separate-image/metadata presentation.
11. In Chromium and WebKit at 320/360/390, assert native `SELECT`, exact label, 44px minimum height,
    `appearance: none`, right text reservation, fixed/centered chevron inset, hidden/pointer-free
    icon, long-name containment, focus, Arrow-key selection, pointer click-through, and disabled
    locked-identity behavior.
12. Accessibility evidence uses native roles/labels, keyboard interaction, focus visibility,
    noninteractive public-card tab order, hidden decorative chevron, and semantic headings. Do not
    add an axe dependency solely for this phase.
13. Wait for fonts, image decode/natural dimensions, and two animation frames before settled
    screenshots/geometry. Complete samples before ordinary auto-refresh or explicitly use the
    existing test-only public-refresh control.

## Required Checks Before Commit And PR

1. Prettier on every changed supported file and `git diff --check`.
2. Focused Phase 5 component/copy/rune tests.
3. `npm run lint`.
4. `npm run typecheck`.
5. `npm run test` (all unit tests).
6. `npm run build`.
7. Phase 5 test listing/guard validation.
8. Targeted Phase 5 Chromium suite.
9. Targeted Phase 5 WebKit suite.
10. Combined targeted Phase 5 suite when it adds evidence beyond the project-specific runs.
11. Tracked environment/secret scan and confirmation that no migration or server mutation entered
    the diff.
12. Do not run the comprehensive default/full-tournament Playwright suite; the parent plan and
    owner defer that operator smoke to Phase 7.

## Complete Diff Review Checklist

- Compare the full diff against `docs/product-spec.md`, not memory.
- Confirm no tournament, ballot, draw, result, privacy, timing, or tiebreak authority logic changed.
- Confirm `RoundHeader` callers with useful statuses retain them and absent statuses leave no gap.
- Confirm protected copy remains and every removed phrase matches the reviewed inventory.
- Confirm Stage reveal-completion `Charts ready` remains even though the static `/charts` duplicate
  is removed.
- Confirm the shared chart visual has no interaction and creates no nested interactive elements.
- Confirm ballot buttons retain handlers, selection state, disabled state, `aria-pressed`, and vote
  instructions; `/charts` articles acquire none of them.
- Confirm hydration, stored-tab reconciliation, partial-draw fallback, and server-visible panels
  remain race-safe.
- Confirm mobile and desktop breakpoint classes cannot create overflow or unintended desktop drift.
- Confirm the chevron cannot intercept input and its text reservation works with a 100-character
  username in both engines.
- Confirm the blank mid-spin center reveals no winner, does not disturb wheel geometry, and does not
  remove invalid-timing or completed-winner information.
- Confirm logo intrinsic attributes, optimized source, priority, sizes, shadow, and wrappers remain.
- Confirm no secret, server-only key, browser mutation, data loss, migration, or external asset was
  introduced.
- Fix every actionable finding and rerun every affected check before updating closure evidence.

## Migration, Rollout, And Rollback

- Migration order: not applicable. This phase must not add or modify `supabase/migrations`.
- Pre-merge deployment compatibility: all changes are presentation-only and compatible with the
  current database and server state.
- Rollout: deploy the merged application normally after required GitHub checks pass.
- Rollback: revert the application commit with a forward PR if a UI regression is found. No data or
  schema rollback is needed or permitted.
- Before marking the migration gate complete, inspect the merged diff and local/remote commit to
  verify no migration is present; record the post-merge migration step as not applicable.

## Phase Gate And Delivery Workflow

1. Implement only this Phase 5 plan.
2. Run all required pre-PR checks and collect targeted screenshots/geometry evidence.
3. Perform the complete single-agent manual diff review; delegated audits supplement but do not
   replace it.
4. Update the active checklist only for evidence-backed completed rows. Update `docs/phase-status.md`
   with files, checks, evidence, copy inventory, risks, assumptions, and review findings.
5. Commit intentional Phase 5 files only, push the Phase 5 branch, and open a draft PR with scope,
   rationale, impact, checks, and migration-not-applicable notes.
6. Mark ready when local gates pass, wait for required GitHub checks, inspect unresolved review
   threads, address actionable feedback, rerun affected checks, and merge only when green.
7. After merge, synchronize the clean local `main` checkout to `origin/main`.
8. Run the full Phase 5 gate again from the merged `main` tree: formatting/diff cleanliness as
   applicable, lint, typecheck, all unit tests, build, and targeted Chromium/WebKit Phase 5 e2e.
9. Verify the merged commit contains no Supabase migration and mark the post-merge migration row not
   applicable. Record merged PR/commit and post-merge results in the checklist and phase status.

## Pre-Implementation Self-Review And Amendments

The plan was reviewed before code changes for missing requirements, unsafe assumptions, tournament
conflicts, regressions, security, accessibility, migration ordering, rollback, and test coverage.
The following amendments were incorporated:

1. Added the owner's spinner requirement to both the active parent plan and checklist rather than
   leaving it only in this phase-specific plan.
2. Chose a visually blank valid-spin center, not replacement prose. Kept invalid-timing waiting and
   completed-winner states explicitly.
3. Added explicit tiebreak non-regression evidence for backend authority, ten-second timing, slots,
   fallback, and winner non-leakage.
4. Made the copy inventory decisions exact before implementation, including the distinction between
   redundant static `/charts` `Charts ready` and useful Stage reveal-completion `Charts ready`.
5. Protected previous-round status while removing only current-result duplicates.
6. Required absent header status to omit the DOM/layout row, avoiding an empty-string spacer.
7. Limited the compact header to an opt-in `/charts` mobile variant and required the old desktop
   presentation at `sm` and above.
8. Required sharing only a passive inner chart visual, avoiding nested controls and accidental vote
   semantics on `/charts`.
9. Added explicit noninteractive card/tab-order assertions, not only screenshots.
10. Added genuine JavaScript-disabled pre-hydration evidence instead of relying on timing races.
11. Required independent browser state setup so Chromium/WebKit selection and retries cannot depend
    on execution order.
12. Added cached and deliberately uncached/delayed logo evidence plus deterministic loading/error
    static contracts.
13. Required long-name text reservation, pointer click-through, disabled identity lock, keyboard
    selection, and focus evidence for the native select.
14. Preserved the two-column centered-seventh CSS and added exact geometry assertions at all three
    required widths plus desktop baselines.
15. Added refresh/font/image synchronization controls to reduce visual-test flakes.
16. Explicitly deferred the comprehensive tournament rehearsal to Phase 7 as required by the active
    plan, while keeping only targeted Phase 5 browser evidence.
17. Declared migration order/rollback as not applicable and required both pre- and post-merge diff
    verification so the migration gate can be closed honestly.
18. Added a complete post-merge merged-tree rerun because the owner requested the phase gate before
    and after merge where applicable.

The reviewed plan is now approved for implementation.
