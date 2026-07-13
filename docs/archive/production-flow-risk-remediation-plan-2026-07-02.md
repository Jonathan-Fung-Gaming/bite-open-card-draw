# Production Flow Risk Remediation Plan - 2026-07-02

This plan accompanies `docs/production-flow-risk-checklist-2026-07-02.md`.
Use the checklist as the issue catalog and this document as the execution order.

Creating or updating this plan does not close any checklist item. Leave every checklist item
unchecked until the issue is fixed, verified, and linked to evidence.

## Source Of Truth

- Product behavior: `docs/product-spec.md`
- Repo validation behavior: `docs/pump_open_stage_repo_validation_checklist.md`
- Phase gates: `docs/phase-gates.md`
- Security requirements: `docs/security-notes.md`
- Older execution context: `docs/codex-execution-plan.md`
- Issue catalog: `docs/production-flow-risk-checklist-2026-07-02.md`

If older execution-plan text conflicts with the product spec or validation checklist, follow the
product spec and validation checklist.

## Closeout Rules

- Do not check off a checklist item without evidence.
- Evidence must include the date, commit or branch, environment, backend, commands or manual steps,
  result, and artifact paths when artifacts exist.
- A passing implementation without recorded evidence is not enough to close an item.
- A planned test is not evidence.
- A targeted reproduction is useful during development, but closure requires the evidence named for
  that item or phase.
- Existing "Already Verified During Review" notes in the checklist are context only. They do not
  close remediation items unless repeated or linked to dated evidence after the relevant fixes.
- If an item is intentionally accepted as event-day risk instead of fixed, record the acceptance
  decision, approver, date, scope, and rollback or operator instruction before checking it off.

Recommended evidence log format, either under each checklist item or in a linked evidence note:

| Field | Required content |
| --- | --- |
| Issue IDs | `PFR-###` identifiers from this plan |
| Evidence type | Unit, integration, SQL, manual, Playwright, load, security, or docs |
| Environment | Memory or Supabase, local or hosted, production build or dev server |
| Commands or steps | Exact commands or manual steps run |
| Artifacts | Log files, screenshots, traces, CSV samples, SQL output, or doc links |
| Result | Pass, fail, accepted risk, or blocked |
| Reviewer | Person or agent, date, and commit |

## Playwright Consolidation Policy

Playwright is expensive and should be run as a grouped browser verification window, not piecemeal
after every individual code edit.

1. Use unit, integration, SQL, component, and command-level tests for Phases 1 through 6.
2. Do not mark Playwright-dependent items complete during those phases. Mark their implementation
   complete only, then defer closure evidence to Phase 7.
3. Fix the e2e command ergonomics before the grouped run so the release command clearly uses:
   production build, Supabase backend, explicit disposable event id, production-like heartbeat,
   host-lock, polling, and public route refresh behavior.
4. Target one full Playwright evidence window after all earlier implementation phases pass.
5. If the grouped run fails, fix with the narrowest non-Playwright reproduction possible, then rerun
   the failed Playwright project or spec once for debugging. Run one final full Playwright evidence
   window before closing any Playwright-dependent item.
6. Current `npm run test:e2e`, `npm run test:diagnostic:supabase-dev-full`, and `npm run test:load` commands are not
   closure evidence for production flow until the PFR-004 runner/env issue is fixed or the run is
   explicitly shown to use the required production-like configuration.

The target end state is a single release browser command, for example:

```bash
npm run test:e2e:production-flow
```

That command should start from a production build, run the full production-flow browser suite and
100-player load evidence against a disposable Supabase event, and preserve screenshots/traces/logs.
If the repository keeps separate Playwright configs, run them in one scheduled evidence session after
one build and record the exact commands as one grouped Playwright window.

## Issue Index

Stable IDs below refer to unchecked items in
`docs/production-flow-risk-checklist-2026-07-02.md`.

| ID | Checklist item | Phase |
| --- | --- | --- |
| PFR-001 | Production persistence uses incompatible locking paths for ballots, results, and snapshot-style admin mutations | 1 |
| PFR-002 | Supabase host-lock persistence is not compare-and-swap protected | 1 |
| PFR-003 | Hosted rehearsal design is not production-like enough to prove event safety | 6, 7 |
| PFR-004 | Default e2e gate command is misaligned with production backend requirements | 6 |
| PFR-005 | Load rehearsal design is below expected scale and bypasses the real player UI | 6, 7 |
| PFR-006 | Current-round changes can move all public routes mid-round without dangerous confirmation or guard | 2 |
| PFR-007 | Mutable current-round routing can split public screens or hide just-finished results | 2 |
| PFR-008 | Rehearsal reset controls are visible in production admin UX and lack deployment guard | 3 |
| PFR-009 | Current-round eligibility can change after results are computed or reveal has started | 2 |
| PFR-010 | Emergency current-round eligibility does not recalculate all-submitted final-warning timing | 2 |
| PFR-011 | Voting-admin partial hydration can advance deadlines with an empty ballot store | 1 |
| PFR-012 | Post-close manual ballots and emergency reopens after computed results are snapshot rewrites | 1 |
| PFR-013 | Result counting trusts stored ballots instead of authoritative eligibility snapshot | 2 |
| PFR-014 | Player history lock is not clearly set after ballot submission | 2 |
| PFR-015 | Earlier-round result overrides can invalidate future selected-song constraints | 2 |
| PFR-016 | Normalized transaction facade lists core RPCs that migrations still disable | 1 |
| PFR-017 | Production test flag weakens admin/host cookie transport and public URL guards | 2 |
| PFR-018 | Private CSV download is admin-session gated but not host-lock gated | 3 |
| PFR-019 | Timer rules are not fully covered by browser-rehearsal design | 7 |
| PFR-020 | Critical negative ballot cases are not fully rehearsed | 4, 7 |
| PFR-021 | Same-username, latest-valid-ballot, and failed-edit preservation need full coverage | 4, 7 |
| PFR-022 | Anti-spoiler and live-count privacy are under-tested across public routes | 7 |
| PFR-023 | Tiebreak edge cases are not fully rehearsed through browser-visible states | 7 |
| PFR-024 | Admin roster, manual ballot, dangerous action, and audit workflows lack full coverage | 3, 7 |
| PFR-025 | First-time save failure message falsely says a previous server-confirmed ballot remains valid | 4 |
| PFR-026 | Player cannot clearly change selected username after confirmation but before first submit | 4 |
| PFR-027 | Pause can discard an in-progress first-time ballot instead of freezing it | 4, 7 |
| PFR-028 | Active duplicate-device warning appears only after confirmation/presence claim | 4, 7 |
| PFR-029 | Post-vote reroll invalidation lacks player-facing recovery copy | 4, 7 |
| PFR-030 | Public polling cadence may exceed the light-polling production target | 4, 6, 7 |
| PFR-031 | Stage card readability may be brittle on common projector sizes | 7 |
| PFR-032 | Projector QR is a live link that can navigate the stage away from `/stage` | 4, 7 |
| PFR-033 | Final/public auto-refresh can disturb expanded details, scroll, or focus | 4, 7 |
| PFR-034 | Private CSV is spreadsheet-formula injectable | 5 |
| PFR-035 | Private CSV marks every row as active at round start | 5 |
| PFR-036 | Private CSV cannot distinguish original submission time from latest revision time | 5 |
| PFR-037 | Private CSV chart identity can be ambiguous for duplicate/remix names | 5 |
| PFR-038 | Private CSV export is not host-only, audited, or collision-resistant | 3, 5 |
| PFR-039 | Chart CSV normalization is too permissive for level values | 5 |
| PFR-040 | CSV import can silently repair or skip malformed event data | 5 |
| PFR-041 | Release docs do not freeze the exact event chart/artifact set | 5, 8 |
| PFR-042 | Runtime image evidence and runtime image source can diverge | 5 |
| PFR-043 | Tournament logo asset readiness is treated as visual-only | 5 |
| PFR-044 | Non-host release-host action can create misleading audit history | 1 |
| PFR-045 | Some admin actions still parse critical scalars by hand instead of shared mutation contracts | 1 |
| PFR-046 | Private CSV auto-download may be blocked by browsers | 5, 7 |
| PFR-047 | Chart exclusion audit can lose clarity if source CSV later removes or renames a chart | 5 |
| PFR-048 | Rehearsal reset UI copy understates persistence risk | 3 |
| PFR-049 | Release checklist mixes stale checked evidence with current unchecked gates | 8 |

## Phase 0 - Evidence Setup And Baseline

Goal: prepare to close items rigorously without changing tournament behavior.

Primary work:

- Add the `PFR-###` IDs to local tracking notes, issue branches, or evidence logs.
- Decide where evidence will be recorded: directly in the checklist, in this plan under a new
  evidence section, or in a separate linked evidence document.
- Capture current branch, commit, and relevant environment settings before remediation begins.
- Confirm no checklist item is checked off by this planning work.

Exit evidence:

- Evidence log location exists or is documented.
- `git diff --check` passes for documentation edits.

## Phase 1 - Authoritative Persistence And Mutation Boundaries

Addresses: PFR-001, PFR-002, PFR-011, PFR-012, PFR-016, PFR-044, PFR-045.

Goal: remove the highest-risk split between normalized SQL transactions and snapshot persistence.
This phase should make tournament-changing persistence paths explicit and transactionally safe
before UI and rehearsal work builds on them.

Primary work:

- Replace or wrap snapshot-style admin mutations that can race with normalized ballot/result RPCs.
- Ensure ballot submission, manual ballot, reopen, compute, reveal, reset, and admin snapshot
  mutations use one authoritative transaction path or are explicitly blocked until converted.
- Implement compare-and-swap semantics for host lock acquire, heartbeat refresh, takeover, and
  release.
- Make stale host release and heartbeat attempts fail or audit as no-ops without altering the active
  lock.
- Align `normalized-runtime.ts`, migrations, and server actions so the advertised transaction
  facade matches deployed RPCs.
- Move critical admin action scalar parsing into shared mutation contracts where practical.

Evidence required before closure:

- Supabase integration test showing a concurrent ballot submit, result compute, and admin mutation
  cannot omit or overwrite the valid ballot. Final ballot table, result snapshot, public result, and
  private CSV must agree.
- Two-session Supabase test showing session B takeover is not overwritten by delayed session A
  heartbeat or release.
- Partial-hydration test showing pause/close/timer transitions use authoritative ballot and
  eligibility state, not an empty local ballot store.
- Interleaving tests for manual ballot after compute and reopen after compute.
- Schema or migration audit showing every production mutation has a real transaction or is blocked
  and documented.
- Two-admin release-host evidence with clear success, failure, and audit behavior.

Checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Do not run Playwright in this phase unless a lower-level reproduction is impossible.

## Phase 2 - Voting State, Eligibility, And Route Consistency

Addresses: PFR-006, PFR-007, PFR-009, PFR-010, PFR-013, PFR-014, PFR-015, PFR-017.

Goal: make round state transitions, eligibility, and result inputs deterministic before browser
rehearsal.

Primary work:

- Guard `Set Current Round` and `Advance Round` during active voting, results computed, revealing,
  and other non-complete states. Treat exceptional active-round changes as dangerous actions with
  password re-entry, clear public consequences, and audit reason.
- Define a route-state matrix for `/stage`, `/vote`, `/charts`, and `/results`, including previous
  round result access after advancement.
- Block emergency eligibility changes after compute/reveal starts, or force a documented
  recompute/reset workflow before reveal continues.
- Recompute all-submitted final-warning state when an emergency player is added during open voting.
- Filter counted ballots through the authoritative round eligibility snapshot in memory and SQL
  result paths.
- Set and persist tournament history after player ballot and manual ballot submission, then block
  username edits except through an explicit correction workflow.
- Block or invalidate future affected draw/result state if an earlier-round selected result is
  overridden.
- Fail closed when production-only test flags would weaken cookie security or public URL validation.

Evidence required before closure:

- State-machine tests for guarded round changes and route pinning.
- Route-state matrix with expected behavior before, during, and after advancement.
- Emergency add tests for open voting, final-warning active, results computed, and results revealing.
- SQL and memory result tests with an injected non-eligible submitted ballot excluded from counts
  and export context.
- Player and manual ballot tests proving `players.has_tournament_history` is set and username edits
  fail afterward.
- Cross-round result override test where affected later state is blocked or invalidated.
- Environment validation test showing dangerous production test flags cannot be enabled for the
  real event deployment.

Checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Do not close browser-visible route items until Phase 7 provides route evidence.

## Phase 3 - Admin Event Safety And Private Export Authority

Addresses: PFR-008, PFR-018, PFR-024 implementation portions, PFR-038 policy portions, PFR-048.

Goal: make dangerous admin capabilities unavailable or clearly controlled in production/event mode.

Primary work:

- Add server-side deployment guards for rehearsal start, reset, and seed actions.
- Hide or disable rehearsal controls in production/event mode.
- Update reset copy so it accurately states whether state is memory-only or persistent Supabase
  event data.
- Decide and document private CSV export authority. If the host computer is the only intended
  exporter, require active host lock for export.
- Audit private CSV export attempts and include unique filenames with event, round, and timestamp
  context.
- Confirm dangerous admin actions use password re-entry, reason where required, action summary, and
  audit rows.

Evidence required before closure:

- Server-action tests proving rehearsal reset/seed actions are unavailable in production/event mode.
- Admin rendering or component evidence showing production/event mode does not expose reset controls.
- Two-admin export test for allowed and denied export paths.
- Audit rows for export, reset denial, dangerous confirmation success, and dangerous confirmation
  failure.
- Copy review for memory and Supabase reset modes.

Checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Full admin UI browser coverage is deferred to Phase 7.

## Phase 4 - Player And Public UX Resilience

Addresses: PFR-020 server-side portions, PFR-021 server-side portions, PFR-025, PFR-026, PFR-027,
PFR-028, PFR-029, PFR-030, PFR-032, PFR-033.

Goal: fix user-facing ambiguity and public route safety before the grouped browser run.

Primary work:

- Make first-submit failure copy distinct from failed-edit copy. Mention a previous
  server-confirmed ballot only when one exists.
- Add an explicit pre-submit "change username" path after identity confirmation.
- Preserve in-progress first-time ballot choices across pause/resume, or document and present clear
  copy that unsaved selections must be re-entered after pause.
- Surface active duplicate-device warning early enough that a player does not invest time in the
  wrong device flow without warning.
- Add player-facing recovery copy when a post-vote reroll invalidates ballots and requires voting
  again.
- Reassess public polling cadence for 100 eligible players plus spectators and reduce, back off, or
  cache where needed.
- Make the stage QR non-navigating or otherwise prevent accidental projector navigation away from
  `/stage`.
- Stop, slow, or preserve state for final auto-refresh so expanded details, scroll, and focus remain
  stable.
- Ensure server-side negative ballot validation rejects incomplete ballots, third bans, wrong draw
  IDs, stale chart IDs, and no-bans-plus-bans combinations.
- Ensure failed edit attempts preserve the prior valid ballot.

Evidence required before closure:

- Unit or component tests for first-submit failure copy versus failed-edit copy.
- UI/component evidence for changing username before first submit.
- Pause/resume test or accepted-risk decision with explicit player copy.
- Two-session lower-level test for latest valid ballot and failed-edit preservation.
- Server-side invalid ballot matrix.
- Request-rate estimate for 100 voters plus spectators, including route polling intervals and
  expected Supabase/API calls per minute.
- Render or component evidence that stage QR does not navigate the projector.
- Final-state refresh evidence that user inspection state is preserved or refresh stops.

Checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Browser confirmation for these flows is grouped into Phase 7.

## Phase 5 - Data, CSV, Assets, And Release Artifacts

Addresses: PFR-034, PFR-035, PFR-036, PFR-037, PFR-038 implementation portions, PFR-039, PFR-040,
PFR-041, PFR-042, PFR-043, PFR-046 non-browser portions, PFR-047, PFR-049 documentation portions.

Goal: make exported and imported event data unambiguous, auditable, and tied to the exact release
artifacts used on event day.

Primary work:

- Neutralize spreadsheet formula injection for user-provided and chart-provided CSV cells.
- Export accurate `player_active_at_round_start` values, distinguishing original snapshot players
  from emergency-added eligible players.
- Preserve original submission time separately from latest revision/manual override time.
- Include stable chart IDs and display difficulty for selected and banned chart columns where
  needed to disambiguate duplicate names or remixes.
- Make private export filenames collision-resistant and tied to event, round, and timestamp.
- Tighten chart level parsing to strict positive integers and required tournament pools.
- Add strict final-event import mode or a signed import report for reviewed repairs/skips.
- Add release checklist sections for chart CSV checksum, row count, import report hash, image cache
  manifest, deployed commit, and runtime catalog identity.
- Verify real chart images against the same source of truth and public cache paths the deployed app
  uses.
- Add logo size/performance targets and evidence for phone and projector routes.
- Preserve chart exclusion audit display metadata across catalog rename/removal cases.
- Clean release docs so historical evidence is separate from current release-blocking gates.

Evidence required before closure:

- CSV fixture with leading `=`, `+`, `-`, and `@` values showing neutralized output.
- Emergency-add export fixture showing correct active-at-round-start values.
- Submit-at-`t1`, edit-at-`t2` export fixture with original and latest revision timestamps.
- Duplicate-name chart export fixture proving banned and selected charts are unambiguous.
- Strict import fixtures for `16x`, ` 16 `, empty level, decimal level, and wrong type/level.
- Final event import report or strict-mode failure evidence.
- Release checklist with checksums, manifest identity, import report hash, and commit.
- Runtime image verification tied to deployed runtime catalog and public cache files.
- Logo asset size/performance evidence.
- Chart exclusion audit test after catalog rename/removal.
- Target browser CSV auto-download is deferred to Phase 7 unless verified manually here with dated
  evidence.

Checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run import:charts
npm run cache:chart-images
npm run verify:real-chart-images
npm run build
```

If chart image caching needs network access, record whether the command used cached artifacts or an
approved network run.

## Phase 6 - Rehearsal Command And Load Design

Addresses: PFR-003, PFR-004, PFR-005, PFR-019 through PFR-024 planning portions, and PFR-030 load
design portions.

Goal: prepare one production-like browser evidence window without running Playwright repeatedly.

Primary work:

- Add explicit script names for memory/dev smoke testing and production/Supabase release evidence.
- Ensure the production-flow command does not silently default to `backend=memory` or disabled
  heartbeat, host heartbeat, vote polling, or public refresh behavior.
- Ensure hosted rehearsal uses a production build and real admin actions after disposable event
  setup.
- Limit direct Supabase fixture writes to setup/teardown or deterministic data seeding that cannot
  replace admin action coverage.
- Update load rehearsal design to cover at least 100 eligible players, real player-route behavior,
  spectators/view-only traffic, roster selection, duplicate username behavior, edits, and route
  polling. Keep synthetic `/api/e2e/load-ballot` injection only as a separate focused API load tool.
- Define the Phase 7 browser matrix before running it: timer rules, negative ballots,
  same-username, anti-spoiler, tiebreaks, admin workflows, projector screenshots, mobile voting, CSV
  download, and 100-player load.

Evidence required before closure:

- Command/runbook review proving which script is memory/dev and which script is production/Supabase
  release evidence.
- Environment validation output for the production-flow command, including backend, server mode,
  event id, heartbeat flags, polling flags, and base URL.
- Load-design document or test plan that separates real player-route coverage from synthetic API
  injection.
- Browser matrix ready for Phase 7 with issue IDs mapped to specs and artifacts.

Checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Do not run the full Playwright window until Phases 1 through 6 are implemented and passing.

## Phase 7 - Grouped Playwright And Browser Evidence Window

Addresses browser evidence for: PFR-003, PFR-005, PFR-019, PFR-020, PFR-021, PFR-022, PFR-023,
PFR-024, PFR-027, PFR-028, PFR-029, PFR-030, PFR-031, PFR-032, PFR-033, PFR-046, plus browser
confirmation for PFR-008, PFR-018, PFR-025, and PFR-026.

Goal: produce the smallest practical number of Playwright runs that still proves the production
flow. Under normal circumstances this should be one grouped run and one final rerun only if the
first grouped run finds defects.

Required production-like conditions:

- Production build, not `next dev`.
- Supabase backend, not memory backend.
- Explicit disposable `TOURNAMENT_EVENT_ID` such as `rehearsal-...`, `phase9-...`, `load-...`, or
  `e2e-...`.
- Real admin session heartbeat, host heartbeat, vote live polling, and public route refresh enabled.
- Real admin actions for draw, open, pause/resume, close, compute, reveal, dangerous actions,
  manual ballots, and export.
- Direct database fixture writes only for disposable setup, teardown, or deterministic catalog/roster
  preparation.
- Traces, screenshots, videos where useful, downloaded CSV files, and logs preserved as evidence.

Grouped browser matrix:

| Area | Evidence to collect | Issue IDs |
| --- | --- | --- |
| Full four-round production flow | Draw both sets, open voting, submit/edit ballots, close/compute, tiebreak reveal, final two-chart reveal, and verify 48 -> 36 -> 24 -> 12 active voting-player attrition | PFR-003, PFR-019 |
| Route state and anti-spoiler | `/stage`, `/room`, `/vote`, `/charts`, `/results`, `/coolguy69` across pre-draw, voting, closed, computed, revealing, revealed, complete | PFR-007, PFR-022 |
| Timer transitions | 10-minute window, below-75 extension, at/above-75 close, all-submitted final warning with edit, pause/resume, manual close, emergency reopen | PFR-019 |
| Ballot negatives | Incomplete ballot, third ban, wrong draw ID, stale chart ID, no-bans-plus-bans, voting-before-both-sets-drawn | PFR-020 |
| Identity and revision | duplicate active username, second device warning, latest valid revision wins, failed edit preserves previous ballot, pre-submit username change | PFR-021, PFR-026, PFR-028 |
| Tiebreak states | 2-, 3-, 4-, and 5-plus-way minimum ties, zero-ballot ties, non-minimum ties, alphabetized reveal, 5-second hidden-winner period | PFR-023 |
| Admin workflows | roster active/inactive/reactivate, emergency add, manual overwrite, reset, reroll, reopen, result override, password re-entry, summaries, audit rows | PFR-008, PFR-024 |
| Public UX recovery | pause with in-progress ballot, post-vote reroll invalidation copy, final auto-refresh stability | PFR-027, PFR-029, PFR-033 |
| Projector and mobile visuals | `/stage` at 1280x720, 1366x768, 1920x1080, narrow fallback; mobile `/vote`; no overlap; QR target `/room`; QR does not navigate stage | PFR-031, PFR-032 |
| Load and polling | 100 eligible players, multiple edits, spectators/view-only traffic, request-rate evidence, no reliance solely on synthetic injection | PFR-005, PFR-030 |
| Private CSV browser behavior | event-day target browser downloads CSV with expected unique filename and content | PFR-046 |

As of 2026-07-03, the grouped Playwright closure evidence must start Round 1 with 48 active voting
players, mark exactly 12 voting players inactive/eliminated before Round 2, exactly 12 more before
Round 3, and exactly 12 more before Round 4. It must assert active roster counts, `/vote`
eligibility, public turnout denominators, submitted ballot counts, round eligibility snapshots, and
private CSV row counts of 48, 36, 24, and 12.

Closure rules for this phase:

- A failed grouped run closes nothing, even if some specs pass.
- A targeted rerun can prove a specific fix during debugging, but final closure needs the grouped
  browser evidence after all related fixes are in place.
- If a browser issue is accepted manually instead of automated, attach screenshots, route URLs,
  viewport sizes, data fixture, and reviewer/date.

## Phase 8 - Release Evidence And Checklist Closure

Addresses: PFR-041 final release evidence, PFR-049, the Production Readiness Evidence Checklist,
and final closeout for all PFR items.

Goal: update release artifacts and close checklist items only where evidence exists.

Primary work:

- Update `docs/release-checklist.md` so historical evidence is clearly separated from current
  release-blocking gates.
- Add dates, commit IDs, environment/backend details, and artifact links for completed evidence.
- Update the risk checklist items one by one only after their evidence is recorded.
- Confirm no item is checked off merely because the code changed.
- Confirm any accepted event-day risk has an explicit acceptance note.
- Record final risks, assumptions, and readiness status for the next operator.

Final gate commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run import:charts
npm run cache:chart-images
npm run verify:real-chart-images
npm run build
npm run test:e2e:production-flow
git diff --check
```

If `test:e2e:production-flow` has not been added, use the explicit production-like Playwright
commands defined in Phase 6 and record them exactly. Do not substitute the current default
`npm run test:e2e` unless PFR-004 evidence proves it now runs the intended production-like gate.

## Phase Handoff Template

Use this after each phase:

```markdown
## Phase N Handoff - YYYY-MM-DD

- Status:
- Changed files:
- Issue IDs addressed:
- Evidence recorded:
- Commands run:
- Playwright status:
- Product spec review:
- Security review:
- Risks and assumptions:
- Deferred items:
```

## Minimum Closure Evidence Summary

Before production use, the evidence set must prove:

- One authoritative Supabase-backed path for ballots, results, host lock, manual corrections,
  reopens, and reveal state.
- Public routes cannot silently jump rounds or reveal selected charts/counts early.
- Ballots count only for authoritative eligible players.
- Latest valid submitted ballot wins and failed saves preserve prior valid state.
- Dangerous admin actions require password re-entry, summary, reason where required, and audit.
- Rehearsal/reset actions cannot affect production/event mode unexpectedly.
- Private CSV is accurate, unambiguous, formula-safe, audited according to policy, and downloaded by
  the intended host browser.
- Event chart CSV, import report, image cache, runtime catalog, logo asset, and deployed commit are
  frozen in release evidence.
- One grouped production-like Playwright evidence window covers browser, route, admin, tiebreak,
  visual, CSV download, the 48 -> 36 -> 24 -> 12 voting-player attrition flow, and 100-player load
  behavior.
