# Production Readiness Remediation Checklist - 2026-07-13

Companion plan: `docs/production-readiness-remediation-plan-2026-07-13.md`.

Do not check an item by intent alone. Closure requires code/evidence, all applicable phase gates,
self-review, merged PR evidence, and post-merge migration verification when applicable.

Beginning with Phase 5, phase gates use targeted browser/e2e coverage only. Do not repeat the
comprehensive default/full-tournament Playwright suite for each future phase. Record one
operator-run manual end-of-plan smoke test during Phase 7 instead.

## Authoritative Decisions

- [x] Tiebreak duration is locked at 10 seconds.
- [x] Tiebreak winner remains backend-decided before animation.
- [x] Active host ownership never expires automatically.
- [x] Heartbeat is health reporting only.
- [x] Host ownership ends only through explicit release or password-confirmed, audited forced
      takeover.
- [x] Missing heartbeat permits explicit forced takeover from another authenticated device but does
      not transfer ownership automatically.
- [x] Documentation pre-step changes no application logic or database schema.

## Phase 0 - Reproduction And Contracts

- [x] PRR-001 through PRR-013 each have reproduction/source evidence.
- [x] Hosted reproduction uses a disposable Supabase event id.
- [x] RSC diagnostics contain no usernames, cookies, passwords, tokens, hashes, or secrets.
- [x] Roster latency and 30-player workflow baseline recorded.
- [x] Stage/phone countdown baseline recorded.
- [x] Logo early-frame and layout-shift baseline recorded.
- [x] Mobile `/charts`, select, and `/results` geometry baseline recorded.
- [x] Phase-specific passing-test contracts are documented.
- [x] Default checks remain green.
- [x] Phase plan self-reviewed and amended.
- [x] Code/diff review completed with findings resolved.
- [x] Phase PR merged.
- [x] Post-merge migration step marked not applicable or completed.

## Phase 1 - Atomic State And Freshness

### PRR-008 - Reroll And Voting Restart

- [x] One-chart, set, and full-round post-vote rerolls use atomic server-side transactions.
- [x] Draw history is preserved.
- [x] Round ballots are invalidated according to the existing one-ballot/two-set rule.
- [x] Already-open desktop `/vote` receives replacement charts automatically.
- [x] Already-open participant phones receive replacement charts automatically.
- [x] Replaced chart and stale choices disappear without manual refresh.
- [x] Player identity remains selected.
- [x] Old-generation submissions are rejected server-side.
- [x] Out-of-order polling cannot restore old charts.
- [x] No RSC error, page error, 5xx response, or error overlay occurs.

### PRR-012 - Tiebreak/Final State Transitions

- [x] Reveal and public-release changes commit atomically.
- [x] Normalized reroll/reveal/release RPCs are real implementations, not placeholders.
- [x] RPC execution is service-role-only and verifies the active host.
- [x] Migration rollout and rollback are documented.
- [x] Public projection cannot expose a mixed draw/window/result generation.
- [x] Stage never shows timer/card draw before Set 1 tiebreak.
- [x] Stage never shows timer/card draw before Set 2 tiebreak.
- [x] Stage never shows timer/card draw after `Confirm Stage Reveal Complete`.
- [x] Stage cannot remain stuck and requires no manual refresh.
- [x] Mid-spinner reload resumes authoritative remaining time.
- [x] Post-duration reload shows the committed winner immediately.
- [x] Browser randomness never decides the winner.
- [x] Cache TTL zero/max and hosted concurrent-reader tests pass.

### Phase Gate

- [x] Phase plan self-reviewed and amended.
- [x] Lint, typecheck, unit, build, relevant e2e, and hosted Supabase checks pass.
- [x] Code/diff review completed with findings resolved.
- [x] Checklist/phase-status evidence recorded.
- [x] Phase PR merged.
- [x] Supabase migrations pushed after merge and parity/database lint verified.

## Phase 2 - Stage Reveal And Countdown

### PRR-009 - Stage Card Reveal Recovery

- [x] Voting-open reload shows all 14 charts immediately.
- [x] Paused/final-warning/extension reload shows all 14 charts immediately.
- [x] Cleared session storage does not replay the slow reveal after voting begins.
- [x] Brand-new stage tab does not replay the slow reveal after voting begins.
- [x] Result states continue to show result/holding UI.
- [x] Pre-vote reload resumes canonical reveal progress.
- [x] Set 1 then Set 2 reveal order remains correct.

### PRR-010 - Stable Countdown

- [x] Stage and phone use one shared authoritative countdown model.
- [x] Same-revision server samples do not reset the monotonic anchor.
- [x] Same-revision display never increases.
- [x] Timer does not visibly accelerate, decelerate, stutter, or jump.
- [x] Pause freezes exactly.
- [x] Resume/reopen/final-warning/extension require a newer authoritative revision.
- [x] Official one-minute extension is labelled.
- [x] Device wall-clock skew does not affect the timer.
- [x] Background/resume and out-of-order response tests pass.
- [x] Stage/phone skew remains within one second.
- [x] Visual ticks do not write to the database.

### Phase Gate

- [x] Phase plan self-reviewed and amended.
- [x] Lint, typecheck, unit, build, relevant e2e, timer, and transition checks pass.
- [x] All Phase 1 tiebreak/transition tests rerun successfully.
- [x] Code/diff review completed with findings resolved.
- [x] Checklist/phase-status evidence recorded.
- [x] Phase PR merged.
- [x] Post-merge migration step marked not applicable or completed and verified.

## Phase 3 - Non-Expiring Host

### PRR-011 - Host Ownership And Recovery

- [x] Active host ownership has no automatic inactivity expiration.
- [x] Missing heartbeat does not release ownership.
- [x] Missing heartbeat keeps forced takeover available from another authenticated device.
- [x] Explicit Release is the normal ownership-ending action.
- [x] Forced takeover requires password, warning, and audit reason.
- [x] Original secured host can recover after reauthentication.
- [x] Recovery works after sleep/temporary network loss.
- [x] Recovery works after missing/rotated host credential.
- [x] `canControl` requires verified session and host credential.
- [x] Take/Restore, Release, and Force Takeover states are mutually consistent.
- [x] Every enabled host action produces visible success or typed error.
- [x] Non-host and standby sessions retain inactivity protection.
- [x] Accelerated recovery tests and opt-in 35-minute soak pass.

### Phase Gate

- [x] Phase plan self-reviewed and amended.
- [x] Lint, typecheck, unit, build, host e2e, and two-session tests pass.
- [x] Security and code/diff review completed with findings resolved.
- [x] Checklist/phase-status evidence recorded.
- [x] Phase PR merged.
- [x] Post-merge migration step marked not applicable or completed and verified.

## Phase 4 - Roster Administration

### PRR-001 - Inline Two-Column Roster

- [x] Exactly two visible columns: Username and Active/inactive control.
- [x] Separate Edit column removed.
- [x] Permanent username inputs removed.
- [x] Double-click starts in-cell username editing.
- [x] Touch and Enter/F2 alternatives start editing.
- [x] Enter saves and Escape cancels.
- [x] Focus behavior is predictable after save/cancel/error.
- [x] Empty and duplicate active usernames are rejected.
- [x] History-locked names remain non-editable with explanation.
- [x] Status button uses the neutral current Save Name styling.
- [x] Active state is communicated by text, not color alone.
- [x] Long-name and narrow-layout containment remains correct.

### PRR-002 - Fast And Propagated Roster Changes

- [x] Routine rename/status actions avoid full event persistence.
- [x] Targeted transaction updates only affected player/audit/version data.
- [x] Rapid consecutive row clicks remain usable and batch safely.
- [x] Optimistic row/count response occurs within one animation frame.
- [x] Hosted p95 confirmation is at or under one second.
- [x] Second-admin propagation is at or under two seconds.
- [x] Thirty rapid status changes commit in seconds, not minutes.
- [x] Canonical count and audit rows are exact.
- [x] Concurrent/out-of-order responses cause no lost update.
- [x] Failed row rolls back with accessible feedback.
- [x] Dirty inline edit survives remote refresh.
- [x] No sensitive roster payload is exposed through invalidation signalling.
- [x] Open-round eligibility snapshot is unchanged.
- [x] Next round uses updated active roster.
- [x] 48 -> 36 -> 24 -> 12 helper still removes exactly 12 each time.

### Phase Gate

- [x] Phase plan self-reviewed and amended.
- [x] Lint, typecheck, unit, build, e2e, hosted Supabase, and performance checks pass.
- [x] Logic/security/UX/UI diff review completed with findings resolved.
- [x] Checklist/phase-status evidence recorded.
- [x] Phase PR merged.
- [x] Supabase migrations pushed after merge and verified when present.

## Phase 5 - Branding, Copy, Charts, And Select

### PRR-003 - Logo Loading

- [X] Shared logo has intrinsic initial-HTML aspect protection.
- [X] No intermediate stretched frame on hard reload.
- [X] No logo-associated layout shift.
- [X] All required route/admin/loading/error consumers tested.
- [X] Optimized asset, alt text, priority behavior, and intended sizing preserved.

### PRR-004 - Redundant Copy

- [X] `One window covers both sets.` removed from Stage.
- [X] `Chart display` removed from `/charts`.
- [X] Before/after copy inventory reviewed.
- [X] Duplicate result/chart-ready descriptors removed where confirmed redundant.
- [X] Rune-wheel center has no visible text during a valid authoritative spin.
- [X] Authoritative-timing waiting copy and post-reveal winner copy remain correct.
- [X] Tiebreak duration, backend authority, slot population, and fallback regressions pass.
- [X] Identity/no-bans/previous-round/reveal/view-only/host/danger/error safety copy preserved.

### PRR-005 - Chart Navigation Buttons

- [X] Previous Chart Set button absent.
- [X] Next Chart Set button absent.
- [X] Both required set tabs remain.
- [X] Tabs work before and after hydration.
- [X] Partial-draw disabled/fallback behavior remains correct.

### PRR-006 - Mobile View Charts

- [X] Smaller mobile logo.
- [X] `Pump It Up Open Stage` and `Drawn Charts` appear near upper-left.
- [X] Mobile heading sizes are appropriate.
- [X] Cards visually match voting image/gradient/metadata treatment.
- [X] Chart information overlaps the image.
- [X] Cards remain noninteractive articles with no vote state or focusability.
- [X] Centered seventh card preserved.
- [X] Server-visible pre-hydration panels preserved.
- [X] Desktop presentation remains stable except intentional copy changes.

### PRR-007 - Dropdown Arrow

- [X] Native select and exact label preserved.
- [X] Custom chevron remains inside select with stable right inset.
- [X] Chevron is aria-hidden and pointer-events-free.
- [X] Long username does not overlap chevron.
- [X] Chromium/WebKit, focus, disabled, keyboard, and 44px target tests pass.

### Phase Gate

- [X] No horizontal overflow at 320/360/390 pixels.
- [X] Phase plan self-reviewed and amended.
- [X] Lint, typecheck, unit, build, Chromium/WebKit e2e, visual, and accessibility checks pass.
- [X] UX/UI and code/diff review completed with findings resolved.
- [X] Checklist/phase-status evidence recorded.
- [X] Phase PR merged.
- [X] Post-merge migration step marked not applicable or completed and verified.

## Phase 6 - Mobile Results

### PRR-013 - Results Fit

- [ ] `/results` uses route-only compact mobile presentation.
- [ ] Both complete winner cards are visible together at scrollY 0.
- [ ] `Show Ban Counts` is visible and fully within the viewport at scrollY 0.
- [ ] Text is smaller but readable and at least the accepted minimum size.
- [ ] Titles/artists wrap without ellipsis or line clamps.
- [ ] Artwork remains visible.
- [ ] Disclosure is at least 44px and keyboard/touch/AT operable.
- [ ] Both complete seven-row result lists are available when expanded.
- [ ] Disclosure state survives auto-refresh.
- [ ] No horizontal overflow or zoom is required.
- [ ] Previous-round safety notice remains intact.
- [ ] Desktop 1280/1440 geometry and typography remain unchanged.
- [ ] Mobile Chromium and WebKit pass at 320/360/390 widths.

### Phase Gate

- [ ] Phase plan self-reviewed and amended.
- [ ] Lint, typecheck, unit, build, mobile e2e, visual, and accessibility checks pass.
- [ ] UX/UI and code/diff review completed with findings resolved.
- [ ] Checklist/phase-status evidence recorded.
- [ ] Phase PR merged.
- [ ] Post-merge migration step marked not applicable or completed and verified.

## Phase 7 - Release Closure

- [ ] Every PRR-001 through PRR-013 row above is checked with dated evidence or explicitly accepted.
- [ ] Lint passes.
- [ ] Typecheck passes.
- [ ] Full unit suite passes.
- [ ] Build passes.
- [ ] Targeted automated browser evidence from the applicable remediation phases passes.
- [ ] Operator-run manual end-of-plan smoke test is completed and recorded; a comprehensive
      automated Playwright end-to-end run is not required.
- [ ] Hosted Supabase transition/concurrency suite passes.
- [ ] Mobile Chromium and WebKit evidence passes.
- [ ] Logo early-frame evidence passes.
- [ ] Cache TTL zero/max evidence passes.
- [ ] Roster performance/propagation evidence passes.
- [ ] Host recovery/soak evidence passes.
- [ ] Relevant load/player-route evidence passes.
- [ ] Database lint passes.
- [ ] Local/remote migration lists match.
- [ ] Full tournament starts Round 1 with 48 active voting players.
- [ ] Exactly 12 removed before Round 2; 36 verified.
- [ ] Exactly 12 more removed before Round 3; 24 verified.
- [ ] Exactly 12 more removed before Round 4; 12 verified.
- [ ] Active counts, eligibility snapshots, turnout denominators, ballot/export rows, and private CSV
      rows match every round.
- [ ] `docs/phase-status.md` records every phase, check, evidence artifact, risk, and assumption.
- [ ] `docs/release-checklist.md`, deployment notes, and runbooks reference this active checklist.
- [ ] No archived plan is treated as a release gate.
- [ ] Final phase plan self-reviewed and amended.
- [ ] Final code/diff review completed with all findings resolved.
- [ ] Final phase PR merged.
- [ ] Required Supabase migrations pushed after merge and verified.
- [ ] Repository and deployed release are ready for tournament use.
