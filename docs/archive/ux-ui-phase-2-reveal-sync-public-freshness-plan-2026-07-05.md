# UX/UI Phase 2 Reveal Sync And Public Freshness Plan - 2026-07-05

## Scope

Phase 2 covers `UXR-007`, `UXR-008`, and `UXR-009` from
`docs/ux-ui-tournament-readiness-remediation-plan-2026-07-05.md`.

The goal is to remove reveal race conditions and stale already-open public pages without changing
tournament rules, result selection, tiebreak decision authority, or chart eligibility.

## Source Review

- `docs/product-spec.md` requires phones to hold on `Voting is closed. Results are being revealed
on stage.` until the stage reveal finishes.
- Existing phone display gating used both `result.revealPhase === "final"` and voting status
  `results_revealed` / `round_complete`, but the admin action set both values in one click.
- Existing final `/stage`, `/vote`, `/charts`, and `/results` branches stopped mounting their
  refresh components, so already-open final tabs could miss corrections, resets, or round advances.
- Existing stage polling used the same 5-second cadence as the tiebreak animation, so a refresh
  could land mid-animation.

## Reviewed Plan

1. Split stage-final display from public phone/result release.
   - Keep `result.revealPhase === "final"` as the state that lets `/stage` show the two final
     charts.
   - Keep phones, `/charts`, and `/results` in the holding state while voting status remains
     `results_revealing`.
   - Add a separate host action that confirms the stage final reveal is complete and then commits
     `results_revealed`.

2. Keep final public pages fresh.
   - Mount auto-refresh components in final branches for `/stage`, `/vote`, `/charts`, and
     `/results`.
   - Expose hidden refresh markers for Playwright assertions without adding visible UI.

3. Defer stage refresh during active tiebreak animation.
   - Add a stage reveal cadence separate from ordinary public refresh.
   - Skip `router.refresh()` while a rune-wheel or fallback tiebreak panel is still unrevealed.

4. Cover memory and Supabase-derived state.
   - Use the existing voting-window status as the durable public-release boundary.
   - Update normalized hydration so final result snapshots do not derive a revealed phone status
     unless the voting window is also `results_revealed` or `round_complete`.
   - No schema migration should be needed because no new persisted column or RPC contract is
     introduced.

5. Add browser evidence.
   - Keep `/stage`, `/vote`, `/charts`, and `/results` tabs open through reveal, public release,
     result correction, reset, and round advance.
   - Avoid manual reloads for Phase 2 freshness assertions.

## Plan Review Notes

The initial plan to simply slow polling was rejected because it did not prove phones could not beat
the projector to final results. The revised plan uses an explicit host release action after the
stage final screen is visible, and it suppresses stage refreshes during unrevealed tiebreaks.

## Acceptance Evidence Target

- Unit tests prove phones hold when the result is final but public release is not committed.
- Normalized persistence tests prove Supabase-derived phone status uses the same release boundary.
- Playwright evidence proves:
  - stage reveal refresh is tiebreak-aware,
  - phones/results hold before final public release,
  - already-open public tabs update after release,
  - already-open public tabs update after result correction, reset, and round advance.
