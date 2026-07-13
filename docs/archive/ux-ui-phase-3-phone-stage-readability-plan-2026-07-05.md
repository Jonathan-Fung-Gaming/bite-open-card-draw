# UX/UI Phase 3 Phone And Stage Chart Readability Plan - 2026-07-05

## Scope

Phase 3 covers `UXR-002`, `UXR-003`, `UXR-004`, `UXR-010`, `UXR-013`,
`UXR-014`, `UXR-015`, `UXR-016`, and `UXR-022` from
`docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`.

The goal is to make chart cards readable and inspectable on phones and 1280x720
projectors without changing voting rules, tournament decisions, result
selection, chart eligibility, or admin security boundaries.

## Source Review

- `docs/product-spec.md` requires each round to keep one ballot across both
  chart sets, with each set completed only by 1-2 bans or the explicit
  `No bans for this set` choice.
- `docs/product-spec.md` also requires missing chart artwork to fall back to a
  title card instead of breaking the app.
- `docs/product-spec.md` requires failed edits to leave the previous
  server-confirmed ballot valid.
- `docs/product-spec.md` allows same-username second-device voting, but requires
  a warning and keeps the latest valid submitted ballot authoritative.
- `docs/pump_open_stage_repo_validation_checklist.md` requires the stage draw
  layout to remain two horizontal rows of 7 charts. Phone cards can keep the
  existing two-column layout with the seventh card centered.
- `docs/phase-gates.md` requires lint, typecheck, unit tests, build, e2e, phase
  status, risks/assumptions, and manual product-spec review before closure.

## Current Code Surface

- Shared chart visuals:
  - `src/components/StageDrawCard.tsx`
  - `src/components/PublicDrawSetPanel.tsx`
  - `src/components/PublicResultSummary.tsx`
  - `src/components/ResultSetPanel.tsx`
- Phone voting flow:
  - `src/app/vote/BallotFlow.tsx`
  - `src/app/vote/page.tsx`
  - `src/app/vote/actions.ts`
  - `src/lib/vote/phone-view.ts`
- Stage layout:
  - `src/app/stage/page.tsx`
  - `src/components/StageSetPanel.tsx`
  - `src/components/RoundHeader.tsx`
  - `src/components/CountdownTimer.tsx`
  - `src/components/QRPanel.tsx`
- Evidence/tests:
  - `tests/e2e/full-flow.spec.ts`
  - `tests/e2e/mobile-routes.spec.ts`
  - `tests/e2e/projector-mobile-evidence.spec.ts`
  - `tests/phase9/phase8-phone-roster-regressions.spec.ts`
  - `src/lib/vote/phone-view.test.ts`

## Reviewed Plan

1. Add a render-time chart-art fallback primitive.
   - Create a small client component for chart art image rendering.
   - Accept a preferred local image path and switch to
     `/chart-images/fallback-card.svg` on image load failure.
   - Expose non-visible test attributes for the active image path and fallback
     state.
   - Use the primitive wherever Phase 3 chart cards depend on an `img` or CSS
     background image: stage draw cards, public chart cards, selected result
     cards, result rows, and ballot cards.
   - Keep existing local cached image paths as the first choice so Phase 0's
     deployment/cache evidence remains meaningful.

2. Improve mobile chart cards without changing ballot mechanics.
   - Replace dim full-card background art on `/vote` with a clearer image band
     plus a separate text area.
   - Preserve two columns with the seventh card centered.
   - Keep the card as the ban button and keep `aria-pressed` selected state.
   - Make difficulty, tap/selected state, chart name, and artist readable at
     390px-wide phone viewports.
   - Increase secondary controls and review/edit buttons to comfortable touch
     targets.

3. Make the explicit no-ban path prominent and rule-compliant.
   - Move the `No bans for this set` control above or alongside the card grid
     so it is seen before scrolling through all seven cards.
   - Present it as an explicit checkbox/choice, not a vague skip path.
   - Preserve the validation rule: a zero-ban set is complete only when this
     exact choice is selected, and selecting bans clears it.

4. Clarify saved, draft-editing, failed-save, and server-confirmed states.
   - Saved state should state that the ballot is server-confirmed and remains
     editable only while voting is open.
   - When editing a saved ballot, show a clear draft/editing banner that the
     server-confirmed ballot remains valid until the next save succeeds.
   - Failed edit messages should keep the previous server-confirmed reassurance
     only when a server-confirmed ballot exists.
   - Browser evidence should cover saved ballot, edit draft, forced save
     failure, and reload showing the previous server-confirmed ballot.

5. Move duplicate-device/duplicate-ballot warnings earlier without blocking
   valid replacement voting.
   - Keep the required selector label and confirmation text unchanged.
   - Continue checking existing ballots as soon as a username is selected.
   - Claim voter presence at the required confirmation step, after the user
     confirms the selected username and before ballot cards render, so a
     second active device warning can appear before ballot entry without
     writing presence for unconfirmed dropdown browsing. If another active
     device exists, keep the user on the identity screen for one explicit
     continue click before showing ballot content.
   - Reuse the existing server action / Supabase RPC presence boundary; do not
     add browser Supabase writes, client Supabase keys, or new persisted schema.
   - Do not block valid same-player replacement submissions; keep the latest
     valid submitted ballot behavior.

6. Improve 1280x720 stage readability while preserving two rows of 7 charts.
   - Increase standard stage card usable image/text area at 720p.
   - Tighten the stage draw page spacing where needed so the voting band,
     QR/timer, and two chart rows fit without vertical overflow.
   - Keep `data-testid="stage-set-row"` rows with 7 cards each for existing
     evidence.

7. Improve primary public selected-result cards.
   - Remove identity-critical truncation from selected final chart names and
     artists on `/results`, `/charts`, and post-reveal `/vote`.
   - Keep full ban-count rows compact, but ensure selected cards show enough
     title/artist text to identify long chart names.

8. Add focused automated evidence.
   - Add a route-level Playwright image fallback check by forcing cache image
     requests to fail and verifying visible fallback art appears.
   - Add `/vote` waiting-state evidence for chart sets not drawn, both sets
     drawn but voting not opened, voting paused, voting closed, and results
     revealing.
   - Strengthen mobile route evidence for `/vote`, `/charts`, and `/results`
     screenshots/readability, including visible art, title, artist, difficulty,
     no horizontal overflow, and touch target assertions for prominent controls.
   - Strengthen 1280x720 `/stage` evidence for readable card height/title
     sizing, no overlap, and no vertical overflow.
   - Reuse existing Phase 8/Phase 9 failure-routing helper patterns for forced
     submit failure.
   - Prove no-ban rule compliance: empty selection cannot advance, the exact
     `No bans for this set` control advances, no vague skip action exists, and
     selecting a ban clears the no-ban choice.

9. Update closure docs only for items actually proven.
   - Check the Phase 3 `UXR-*` rows only after tests/screenshots provide the
     evidence named in the checklist.
   - Add a Phase 3 entry to `docs/phase-status.md` with changed files, checks,
     evidence, manual review, risks, and migration applicability.

## Non-Goals

- Do not alter tournament rounds, chart set definitions, draw counts, result
  computation, tiebreak selection, or voting-window timing.
- Do not address Phase 4 spectator copy issues except where a small text change
  is necessary to support Phase 3 waiting guidance on `/vote`.
- Do not add a reduced-motion toggle.
- Do not add browser-side randomness or client-side tournament decisions.
- Do not add or change Supabase schema/RPC unless implementation unexpectedly
  needs persisted state, which this plan does not expect.

## Plan Review Notes

- A CSS-only fallback is insufficient because broken cache URLs can fail after
  render. The implementation must react to the actual image error event.
- Keeping CSS background images as the only visible art is risky because the
  browser has no React-visible load failure hook. Cards that previously used
  `backgroundImage` should render an actual image layer.
- Moving the no-ban control earlier is acceptable only if it remains the exact
  explicit zero-ban completion path and no `skip` language is introduced.
- Duplicate-device presence claims must run only after the required
  `Are you sure you are voting as [start.gg username]?` confirmation step.
- Duplicate-device presence claims are server-state writes through the existing
  server-side presence API. They must not add direct browser database mutation
  paths, write presence while the user is only browsing dropdown options, or
  expose Supabase service keys.
- Stage readability work must not regress the validation checklist requirement
  that stage draw cards are exactly two horizontal rows of 7.

## Acceptance Evidence Target

- Unit/source tests prove failed-save copy only claims a previous
  server-confirmed ballot when one exists.
- Playwright evidence proves:
  - broken chart-image URLs visibly fall back to fallback art,
  - `/vote` waiting states explain whether charts are not drawn, drawn but not
    opened, paused, closed, or being revealed,
  - mobile `/vote` card art, title, artist, difficulty, selected state, no-ban
    control, and buttons are readable/tappable,
  - zero-ban completion works only through the exact `No bans for this set`
    choice, and selecting a ban clears that choice,
  - mobile `/charts` and post-reveal `/results` show readable card art and
    identity-preserving selected chart names, artists, and difficulties,
  - 1280x720 `/stage` still shows two horizontal rows of 7 readable chart
    cards without overlap or vertical overflow,
  - saved ballot, unsaved edit draft, forced failed save, and previous
    server-confirmed ballot state are covered,
  - duplicate-device and already-submitted-ballot warnings appear before ballot
    cards are shown on the second device.

## Planned Checks

Run after implementation:

- `npm run lint`
- `npm run typecheck`
- `npm run test -- src/lib/vote/phone-view.test.ts`
- `npm run test`
- `npm run build`
- `git diff --check`
- `npm run test:e2e`

Supabase migration commands are not expected for this phase because the planned
changes are UI, client fallback behavior, browser evidence, and docs only.
