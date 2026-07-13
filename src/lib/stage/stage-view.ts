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

const STAGE_IMMEDIATE_DRAW_STATUSES = new Set<VotingRoundStatus>([
  "voting_open",
  "voting_paused",
  "final_30_seconds",
  "extension_1_minute",
]);

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

export function stageShouldShowAllDrawCards(status: VotingRoundStatus) {
  return STAGE_IMMEDIATE_DRAW_STATUSES.has(status);
}

export function getStageVisibleCardCount(
  chartCount: number,
  revealStartsAt: string | null | undefined,
  nowMs: number,
) {
  const safeChartCount = Math.max(0, Math.trunc(chartCount));

  if (safeChartCount === 0) {
    return 0;
  }

  if (revealStartsAt === undefined) {
    return safeChartCount;
  }

  if (revealStartsAt === null) {
    return 0;
  }

  const revealStartsAtMs = Date.parse(revealStartsAt);

  if (!Number.isFinite(revealStartsAtMs) || !Number.isFinite(nowMs)) {
    return 0;
  }

  const elapsedMs = nowMs - revealStartsAtMs;

  if (elapsedMs < 0) {
    return 0;
  }

  return Math.min(safeChartCount, Math.floor(elapsedMs / STAGE_CHART_REVEAL_INTERVAL_MS) + 1);
}

export function buildStageRevealClockKey(
  sets: readonly StageSetView[],
  status: VotingRoundStatus,
  publicStateGeneration: number,
) {
  return [
    sets[0]?.set.roundNumber ?? "missing-round",
    publicStateGeneration,
    status,
    stageShouldShowAllDrawCards(status) ? "immediate" : "canonical",
    ...sets.map((setView) =>
      [
        setView.set.setOrder,
        setView.draw?.id ?? "missing",
        setView.draw?.version ?? 0,
        setView.revealStartsAt ?? "blocked",
      ].join(":"),
    ),
  ].join("|");
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
