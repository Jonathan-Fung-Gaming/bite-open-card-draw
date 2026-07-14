# Production Readiness Remediation Plan - 2026-07-13

Companion checklist:
`docs/production-readiness-remediation-checklist-2026-07-13.md`.

This is the active remediation plan for the issues reported in the July 13 manual smoke test. It
supersedes the older dated remediation, audit, review, and phase plans in `docs/archive/`.

This document is a planning and execution contract. Creating it does not authorize logic changes
outside the phase currently being executed.

## Authoritative References

Use these documents in this order:

1. `docs/product-spec.md`
2. `docs/pump_open_stage_repo_validation_checklist.md`
3. This plan
4. `docs/production-readiness-remediation-checklist-2026-07-13.md`
5. `docs/phase-gates.md`
6. `docs/security-notes.md`
7. `docs/admin-action-policy.md`

When current documents conflict, the product spec and validation checklist control tournament
behavior. Archived documents are historical evidence only.

## Locked Decisions

- The tiebreak reveal lasts 10 seconds.
- The backend commits the tiebreak winner before the animation starts.
- Active host ownership never expires automatically because of inactivity or a missing heartbeat.
- Heartbeat is a host-health signal only.
- Host ownership ends only through explicit release or a password-confirmed, warned, audited forced
  takeover.
- Missing heartbeat keeps forced takeover available from another authenticated device but never
  transfers ownership automatically.
- The original host must be recoverable on the same secured tournament laptop after
  reauthentication.
- Non-host and standby admin sessions may retain a 30-minute inactivity timeout.
- No application logic or database migration is changed in the documentation pre-step that creates
  this plan.

## Issue Register

| ID      | PDF item | Summary                                                      | Planned phase |
| ------- | -------- | ------------------------------------------------------------ | ------------: |
| PRR-001 | 1.1      | Two-column roster with inline username editing               |             4 |
| PRR-002 | 1.2      | Near-instant roster changes and connected-client propagation |             4 |
| PRR-003 | 2.1      | Logo must not stretch during initial load                    |             5 |
| PRR-004 | 2.2      | Remove redundant explanatory text                            |             5 |
| PRR-005 | 3.1      | Remove Previous/Next chart-set buttons                       |             5 |
| PRR-006 | 3.2      | Mobile `/charts` redesign                                    |             5 |
| PRR-007 | 4.1      | Mobile username dropdown-arrow alignment                     |             5 |
| PRR-008 | 4.2      | Reroll and voting restart freshness/RSC failure              |             1 |
| PRR-009 | 5.1      | Do not replay slow card reveal after voting begins           |             2 |
| PRR-010 | 6.1      | Smooth authoritative countdown on all devices                |             2 |
| PRR-011 | 7.1      | Non-expiring host and truthful recovery controls             |             3 |
| PRR-012 | 8.1      | No timer/card fallback around tiebreak or final confirmation |             1 |
| PRR-013 | 9.1      | Complete mobile results view fits a phone screen             |             6 |

## Mandatory Per-Phase Execution Loop

Codex must perform this loop automatically for every phase and every later code-change request:

1. Read the active parent phase, matching checklist rows, current source-of-truth documents, and
   the affected implementation/tests.
2. Create a detailed phase-specific plan under `docs/phase-plans/`, named with the production
   readiness phase number, subject, and current date.
3. Self-review that plan for missing acceptance criteria, hidden dependencies, logic regressions,
   security boundaries, concurrency, data loss, migration ordering, rollback, accessibility, and
   UX/UI regressions. Amend it before code changes.
4. Implement only the current phase.
5. Run formatting where applicable, lint, typecheck, unit tests, build, targeted e2e relevant to the
   phase, and all phase-specific hosted Supabase, load, visual, accessibility, or performance
   checks. Beginning with Phase 5, do not repeat the comprehensive default/full-tournament
   Playwright suite as a per-phase gate; reserve the end-to-end smoke for Phase 7 plan closeout.
6. Review the complete diff for logic defects, stale-state races, tournament-rule changes, data
   integrity, security leaks, accessibility, responsive layout, and operator/player UX. Fix every
   actionable finding and rerun affected checks.
7. Update the companion checklist and `docs/phase-status.md` with changed files, commands, results,
   evidence, risks, assumptions, and review findings.
8. Commit the phase, push its branch, open or update a pull request, wait for checks, address
   actionable review feedback, and merge automatically only when all required checks pass and no
   blocking feedback remains.
9. Synchronize the local default branch after merge.
10. If the merged phase contains Supabase migrations, verify the configured target, automatically
    push migrations, run database lint, and verify local/remote migration parity. Never guess or
    substitute a Supabase project. Missing or ambiguous credentials/target are a deployment blocker.

Code that depends on a migration must be backward-compatible or feature-disabled between merge and
the post-merge migration push. Each applicable phase plan must document rollout and rollback.

## Phase Gates Applied To Every Phase

Before moving to the next phase:

- all phase acceptance criteria pass;
- `npm run lint` passes;
- `npm run typecheck` passes;
- `npm run test` passes;
- `npm run build` passes;
- targeted browser/e2e coverage for the phase passes;
- beginning with Phase 5, the comprehensive default/full-tournament Playwright suite is not a
  per-phase gate and is deferred to the Phase 7 end-of-plan smoke;
- relevant hosted Supabase/database checks pass when persistence behavior changes;
- changed files, evidence, risks, assumptions, and self-review findings are recorded;
- the phase PR is merged;
- post-merge migrations are applied and verified when present.

Do not commit intentionally failing default-suite tests. A reproduction may be temporarily
quarantined while a phase is in progress, but the phase cannot close with that test failing or
silently skipped without an explicit accepted reason.

## Phase 0 - Reproduction, Contracts, And Diagnostics

Goal: turn every smoke-test report into a measurable, isolated reproduction before logic changes.

### Work

- Reproduce persistence-sensitive scenarios in a disposable hosted Supabase event namespace:
  - reroll after voting opens, then restart voting;
  - Set 1 and Set 2 tiebreak transitions;
  - `Confirm Stage Reveal Complete`;
  - 30 rapid roster state changes;
  - host operation and recovery beyond the old 30-minute boundary;
  - simultaneous stage and phone countdown sampling.
- Capture RSC digest, sanitized server logs, active draw ids/versions, voting status/deadline,
  result id/phase, freshness generation, and public route response ordering.
- Never log usernames, cookies, passwords, session secrets, host tokens, service keys, or hashes.
- Measure roster mutation p50/p95, 30-player workflow duration, and second-client propagation.
- Record early-frame logo/container geometry and layout-shift evidence on hard reload.
- Record `/charts`, username select, and `/results` geometry at 320, 360, and 390 pixels.
- Define the unit, integration, hosted Supabase, and Playwright tests that must become passing in
  later phases.

### Acceptance

- Every PRR item has a reproduction or a documented deterministic source trace.
- Every item has measurable closure criteria and planned evidence.
- Hosted diagnostics use disposable data and cannot mutate the real tournament event namespace.
- Current default checks remain green.

## Phase 1 - Atomic Reroll, Reveal, And Public State

Issues: PRR-008 and PRR-012.

Goal: eliminate mixed database states, stale replacement charts, RSC errors, and reveal fallback.

### Work

- Add service-role-only transactional Supabase operations for one-chart reroll, set reroll, full
  round reroll, result reveal advancement, and final public release.
- Validate the admin session and verified host credential inside each transaction.
- Use database time and compare expected draw version or reveal phase before mutation.
- Commit coupled draw, ballot invalidation, voting, result, phone-release, audit, and public-state
  generation changes atomically.
- Preserve draw history, round-wide ballot invalidation rules, and the backend-decided tiebreak
  winner.
- Revoke anonymous/authenticated mutation access and update server-only wrappers and generated DB
  types.
- Apply a migration-first, backward-compatible rollout. Verify the migration in disposable
  Supabase before callers use it.
- Migrate memory behavior to the same atomic contract.
- Only after durability/parity tests pass, remove redundant full-state persistence following narrow
  reveal/release persistence.
- Expose a coherent, generation-tagged public round projection covering draws, voting, result phase,
  tiebreak timing, and phone release.
- Add an authoritative active draw generation to vote live state. Refresh immediately on a newer
  generation, disable stale submission, clear/reconcile stale choices, preserve identity, and reject
  old-draw submissions server-side.
- Accept a newer audited post-vote reroll even though it temporarily lowers voting-status rank;
  reject late old-generation payloads after restart.
- Reconstruct count and tiebreak reveal progress from server timestamps. Reload resumes remaining
  time; completed reveal does not replay.
- Once result mode begins, inconsistent/delayed reads show a neutral reveal-holding state, never
  timer/card draw, unless a newer explicit reroll, reset, or round advance authorizes it.

### Acceptance

- Already-open desktop and phone vote pages replace the rerolled chart without manual refresh.
- Old chart and stale choices cannot be submitted; identity remains selected.
- No page error, Next error overlay, RSC 5xx, or manual refresh occurs.
- Stage never renders timer/card-draw DOM during either tiebreak, final transition, or stage reveal
  confirmation.
- Duplicate/concurrent actions produce one transition and one audit record.
- Public readers observe coherent before/after generations with cache TTL at zero and maximum.
- Representative browser reroll plus all reroll forms at integration level pass in memory and hosted
  Supabase.

## Phase 2 - Stage Reveal Recovery And Countdown Stability

Issues: PRR-009 and PRR-010.

Goal: reconstruct visual progress from authoritative lifecycle state and keep timers locally smooth.

### Work

- Pass voting lifecycle/revision into the stage draw view.
- Once voting has begun, hard reload, cleared storage, or a new stage tab shows all 14 charts
  immediately for open, paused, final-warning, and extension states.
- Result states continue to show result/holding UI, not charts.
- Before voting, derive visible cards from canonical reveal timestamps and preserve Set 1 then Set 2
  order. Session storage may smooth continuity but cannot restart an old reveal.
- Ensure route refresh cannot remount or restart an active card/tiebreak animation.
- Create one shared stage/phone authoritative countdown model keyed by round, status, deadline, and
  voting-window revision.
- Calibrate once per official revision, then use `performance.now()` locally.
- Ignore repeated or out-of-order same-revision server samples and clamp same-revision remaining
  time so it cannot increase.
- Pause freezes exactly. Resume, reopen, final warning, and extension require a newer revision.
- Label the rule-driven one-minute extension as an official state change.
- Separate route-state freshness polling from timer rendering. No database write or resync is
  required for each displayed second.

### Acceptance

- Voting-era reload/new tab shows 14 charts promptly without a slow replay.
- Pre-vote reload resumes canonical progress rather than restarting.
- Same-revision sampled countdown never increases, accelerates, or slows unpredictably.
- Stage/phone skew remains within one second and elapsed decrease stays within about one second of
  real elapsed time.
- Pause, resume, extension, background/resume, out-of-order response, and device wall-clock skew
  tests pass.
- All Phase 1 transition/tiebreak tests are rerun.

## Phase 3 - Non-Expiring Host Ownership And Recovery

Issue: PRR-011.

Goal: make non-expiring host ownership authoritative and every host control truthful.

### Work

- Remove inactivity/heartbeat-based automatic host expiration.
- Keep heartbeat as health reporting only.
- Persist host ownership until explicit release or successful forced takeover.
- When heartbeat is missing, expose the explicit forced-takeover path to another authenticated
  device without automatically granting it control.
- Renew/recover the active host's signed session and HttpOnly host credential as needed for the
  secured tournament laptop.
- Require verified session ownership and host credential for `canControl`.
- Add an explicit recoverable-original-host state after reauthentication or token rotation.
- Disable mutations immediately when ownership cannot be verified.
- Force takeover remains password-confirmed, clearly warned, and audit-reason required.
- Release returns visible typed success/failure and never silently no-ops.

### Acceptance

- The original host operates past 30 minutes without input and without losing ownership.
- Missing heartbeat leaves the current owner authoritative while another authenticated device can
  complete the explicit forced-takeover flow.
- Recovery works after sleep, temporary network loss, reauthentication, and missing/rotated host
  credential.
- Take/Restore, Release, and Force Takeover states are mutually consistent.
- Every enabled control has an observable success or error.
- Two-admin read-only and forced takeover coverage remains passing.
- Accelerated inactivity, heartbeat-loss, and recovery coverage plus an opt-in 35-minute soak pass.

## Phase 4 - Fast Two-Column Roster Administration

Issues: PRR-001 and PRR-002.

Goal: make the roster fast, directly editable, and safe under rapid tournament-floor operation.

### Work

- Add targeted service-role-only transactions for username rename and one-or-many desired active
  state changes. Update only affected player/audit/version rows.
- Enforce active-host authorization, duplicate-active usernames, empty-name rejection, history
  locking, idempotency, and all-or-none batch validation.
- Do not use full event persistence for routine roster changes.
- Provide a real rapid UI workflow: consecutive row toggles remain usable and coalesce into one or
  a few safe batch requests.
- Publish only a sanitized event/scope/version invalidation to other admin clients. Do not expose
  usernames, ballots, secrets, or service credentials.
- Keep phones on normal/light polling; refresh player state on a newer roster generation.
- Preserve current-round eligibility snapshots. Routine changes affect future rounds only.
- Render exactly two roster columns: Username and Active Control.
- Username displays as text until double-click, touch activation, or Enter/F2 starts in-cell editing.
- Enter saves, Escape cancels, focus is restored predictably, and Save/Cancel remain inside the
  username cell without recreating an Edit column.
- History-locked rows explain why they cannot be edited.
- Reuse the neutral current Save Name visual style for Mark Inactive/Reactivate; communicate state
  with text, not color alone.
- Optimistically update row/count, keep unrelated rows usable, reconcile canonical responses, and
  roll back only a failed row with `aria-live` feedback.
- Defer remote refresh while an inline edit is dirty.

### Acceptance

- Exactly two visible headers; no permanent rename input or Edit column.
- Double-click, touch, keyboard save/cancel, duplicate/empty validation, history lock, focus, and
  rollback tests pass.
- Optimistic response occurs within one animation frame.
- Hosted mutation confirmation target is p95 at or under one second.
- Second admin propagation target is at or under two seconds.
- Thirty rapid changes commit in seconds with exact count/audit state and no lost updates.
- Open-round eligibility is unchanged while the next round uses the updated roster.
- The 48 -> 36 -> 24 -> 12 rehearsal helper still removes exactly 12 players each time.

## Phase 5 - Branding, Copy, Charts, And Mobile Selector

Issues: PRR-003 through PRR-007.

Goal: close the shared branding, copy, view-only chart, and selector issues without desktop or ballot
regressions.

### Work

- Give the shared logo intrinsic 512x339 dimensions or equivalent initial-HTML aspect protection.
  Preserve the optimized asset, alt text, priority behavior, drop shadow, and intended sizes.
- Remove exact Stage text `One window covers both sets.` while preserving turnout and ban totals.
- Remove `/charts` descriptor `Chart display` and make optional header status consume no empty space.
- Create a before/after copy inventory. Review duplicate `Full ban counts`/`Ban counts`, `Charts
ready` beside visible cards, and repeated final-result descriptors.
- During a valid authoritative rune-wheel spin, show no visible status text in the wheel center.
  Preserve the useful authoritative-timing waiting message before a valid spin and the committed
  winner name after reveal. This presentation change must not alter winner authority, duration,
  slot population, or fallback behavior.
- Preserve identity, no-bans, previous-round, reveal-holding, view-only, host recovery, dangerous
  action, and error-recovery copy.
- Remove only Previous/Next Chart Set buttons. Retain the two set tabs required for view-only
  movement, including partial-draw and pre-hydration behavior.
- Add compact upper-left mobile `/charts` header with smaller logo and headings.
- Share only the inner chart visual. Voting remains a button with selection behavior; `/charts`
  remains a noninteractive article with no click handler, focusability, `aria-pressed`, or vote copy.
- Preserve the two-column mobile grid and centered seventh card.
- Keep the native username select and exact label. Use `appearance-none`, sufficient right padding,
  and a fixed, aria-hidden, pointer-events-free custom chevron.

### Acceptance

- Early-frame hard reload evidence shows no logo stretching or logo layout shift on every required
  route.
- Mandatory removed text is absent; protected safety/identity copy remains.
- Mid-spin evidence shows a visually blank rune-wheel center with no winner leakage, while waiting,
  revealed-winner, 10-second timing, backend authority, slot, and fallback behavior remain correct.
- Previous/Next buttons are absent and tabs still work before/after hydration.
- Mobile `/charts` cards visually overlay metadata and art but cannot affect ballot state.
- Centered seventh card, partial-draw behavior, and desktop presentation remain correct.
- Chromium/WebKit select-arrow geometry, long-name, focus, disabled, and 44px target tests pass.
- No horizontal overflow at 320, 360, or 390 pixels.

## Phase 6 - Mobile Results Viewport

Issue: PRR-013.

Goal: show both selected charts and the ban-count disclosure within the normal phone viewport while
preserving desktop presentation.

### Work

- Add a `/results`-only compact-mobile result variant. Do not change default `/vote`, `/charts`, or
  desktop result presentation.
- Show both winner cards in two mobile columns with visible artwork and reduced gaps/padding/type.
- Keep full chart and artist names wrapped without ellipsis or line clamps.
- Add compact results-specific mobile header.
- Add one native details control labelled `Show Ban Counts` immediately below winners; expanded
  content contains both complete seven-row result lists.
- Preserve existing desktop count presentation and mobile disclosure open state across refresh.
- Do not clip the page or disable accessibility scrolling.

### Acceptance

- At scrollY 0, both complete cards and the full `Show Ban Counts` control end within
  `visualViewport.height` for the normal current-round final state.
- The disclosure is at least 44 pixels high and keyboard/touch/AT operable.
- Titles, artists, and difficulties remain readable and untruncated.
- No horizontal overflow or zoom is required.
- Previous-round safety notice may add height.
- Mobile Chromium and WebKit pass at 320, 360, and 390 pixel widths.
- Desktop 1280/1440 geometry and typography are unchanged.

## Phase 7 - Full Regression And Release Closure

Goal: prove the completed application is safe for tournament use and close every checklist item.

### Required Evidence

- lint, typecheck, all unit tests, and build;
- targeted automated browser evidence accumulated by the relevant remediation phases;
- hosted Supabase transition/concurrency coverage;
- mobile Chromium and WebKit evidence;
- logo early-frame evidence;
- cache TTL zero/max state-transition evidence;
- 30-player roster latency and propagation evidence;
- host recovery and soak evidence;
- load and player-route coverage where affected;
- migration list and database lint;
- one operator-run end-of-plan smoke test covering the full tournament rehearsal. This may be
  performed manually; a comprehensive automated Playwright end-to-end run is not required.

The manual end-of-plan smoke rehearsal must:

- start Round 1 with 48 active voting players;
- remove exactly 12 before Round 2 and verify 36;
- remove exactly 12 more before Round 3 and verify 24;
- remove exactly 12 more before Round 4 and verify 12;
- verify active count, eligibility snapshot, turnout denominator, ballot/export rows, and private CSV
  rows for every round.

### Closure

- Every PRR checklist row is checked with dated evidence or explicitly accepted by the tournament
  owner.
- `docs/phase-status.md`, `docs/release-checklist.md`, deployment notes, and runbooks reflect the
  current release commit and applied migrations.
- No archived plan is used as a current gate.
- The final phase PR is merged and any migrations are pushed and verified after merge.

## Current Pre-Step Status

As of 2026-07-13, this plan and its checklist are documentation only. No tournament logic, UI logic,
database schema, migration, deployment, or external service state is changed by this pre-step.
