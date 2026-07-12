import type { DrawRecord, DrawStateStore } from "@/lib/draw/draw-state";
import { ROUND_SET_DEFINITIONS, type RoundSetDefinition } from "@/lib/tournament";
import type { VotingRoundStatus } from "@/lib/vote/voting-window";

export type StageSetView = {
  set: RoundSetDefinition;
  draw: DrawRecord | null;
  revealStartsAt: string | null;
};

export type StageRoundView = {
  roundNumber: 1 | 2 | 3 | 4;
  sets: StageSetView[];
  bothSetsDrawn: boolean;
};

export const STAGE_CHART_REVEAL_INTERVAL_MS = 1800;
export const STAGE_SET_REVEAL_GAP_MS = 900;

const STAGE_RESULT_STATUSES = new Set<VotingRoundStatus>([
  "voting_closed",
  "results_computed",
  "results_revealing",
  "results_revealed",
  "round_complete",
]);

export function stageShouldUseResultMode(status: VotingRoundStatus, hasResult: boolean) {
  return hasResult || STAGE_RESULT_STATUSES.has(status);
}

export function buildStageRoundView(
  drawStateStore: Pick<DrawStateStore, "getActiveDraw">,
  roundNumber: 1 | 2 | 3 | 4,
): StageRoundView {
  const setsWithoutReveal = ROUND_SET_DEFINITIONS.filter(
    (set) => set.roundNumber === roundNumber,
  ).map((set) => ({
    set,
    draw: drawStateStore.getActiveDraw(set.roundNumber, set.setOrder),
  }));
  let nextRevealStartMs: number | null = null;
  let blockedByMissingPriorSet = false;
  const sets = setsWithoutReveal.map((setView) => {
    if (!setView.draw) {
      blockedByMissingPriorSet = true;

      return {
        ...setView,
        revealStartsAt: null,
      };
    }

    if (blockedByMissingPriorSet) {
      return {
        ...setView,
        revealStartsAt: null,
      };
    }

    const drawCreatedAtMs = Date.parse(setView.draw.createdAt);
    const revealStartMs =
      nextRevealStartMs === null ? drawCreatedAtMs : Math.max(drawCreatedAtMs, nextRevealStartMs);

    nextRevealStartMs =
      revealStartMs +
      setView.draw.charts.length * STAGE_CHART_REVEAL_INTERVAL_MS +
      STAGE_SET_REVEAL_GAP_MS;

    return {
      ...setView,
      revealStartsAt: new Date(revealStartMs).toISOString(),
    };
  });

  return {
    roundNumber,
    sets,
    bothSetsDrawn: sets.every((set) => set.draw !== null),
  };
}
