import "server-only";

import { z } from "zod";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { ResultRevealPhase } from "@/lib/results/result-engine";
import { withNormalizedEventPersistenceLock } from "@/lib/server/normalized-operational-state";
import { executeNormalizedTransactionalMutation } from "@/lib/server/transactions/normalized-runtime";

const activeDrawResultSchema = z.object({
  roundSetId: z.string().uuid(),
  setOrder: z.union([z.literal(1), z.literal(2)]),
  drawId: z.string().uuid(),
  drawVersion: z.number().int().positive(),
});

const rerollResultSchema = z.object({
  committed: z.literal(true),
  requestId: z.string().uuid(),
  roundNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  generation: z.number().int().nonnegative(),
  transitionKind: z.enum(["reroll_one_chart", "reroll_round_set", "reroll_full_round"]),
  adminActionId: z.string().uuid(),
  invalidationId: z.string().uuid().nullable(),
  invalidatedBallotIds: z.array(z.string().uuid()),
  replacedDrawIds: z.array(z.string().uuid()),
  activeDraws: z.array(activeDrawResultSchema),
});

const revealResultSchema = z.object({
  committed: z.literal(true),
  requestId: z.string().uuid(),
  roundNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  generation: z.number().int().nonnegative(),
  transitionKind: z.literal("result_reveal_advanced"),
  adminActionId: z.string().uuid(),
  resultId: z.string().uuid(),
  previousRevealPhase: z.string(),
  revealPhase: z.string(),
  revealPhaseStartedAt: z.string(),
});

const releaseResultSchema = z.object({
  committed: z.literal(true),
  requestId: z.string().uuid(),
  roundNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  generation: z.number().int().nonnegative(),
  transitionKind: z.literal("results_released"),
  adminActionId: z.string().uuid(),
  resultId: z.string().uuid(),
  revealPhase: z.literal("final"),
  phoneReleasedAt: z.string(),
});

const openVotingResultSchema = z.object({
  committed: z.literal(true),
  requestId: z.string().uuid(),
  roundNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  generation: z.number().int().nonnegative(),
  transitionKind: z.literal("voting_opened"),
  status: z.literal("voting_open"),
  openedAt: z.string(),
  closesAt: z.string(),
  eligibleCount: z.number().int().positive(),
  adminActionId: z.string().uuid(),
});

const pauseVotingResultSchema = z.object({
  committed: z.literal(true),
  requestId: z.string().uuid(),
  roundNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  generation: z.number().int().nonnegative(),
  transitionKind: z.literal("voting_paused"),
  status: z.literal("voting_paused"),
  pausedAt: z.string(),
  pausedFromStatus: z.enum(["voting_open", "final_30_seconds", "extension_1_minute"]),
  remainingMsWhenPaused: z.number().int().nonnegative(),
  adminActionId: z.string().uuid(),
});

const resumeVotingResultSchema = z.object({
  committed: z.literal(true),
  requestId: z.string().uuid(),
  roundNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  generation: z.number().int().nonnegative(),
  transitionKind: z.literal("voting_resumed"),
  status: z.enum(["voting_open", "final_30_seconds", "extension_1_minute"]),
  closesAt: z.string(),
  adminActionId: z.string().uuid(),
});

export type NormalizedAdminTransitionContext = {
  requestId: string;
  roundNumber: 1 | 2 | 3 | 4;
  adminSessionId: string;
  hostTokenHash: string;
  expectedGeneration: number;
};

export type NormalizedRerollDraw = {
  expectedDrawId: string;
  expectedDrawVersion: number;
  nextDraw: DrawRecord;
};

function serializeRerollDraw(draw: NormalizedRerollDraw) {
  return {
    expectedDrawId: draw.expectedDrawId,
    expectedDrawVersion: draw.expectedDrawVersion,
    nextDraw: {
      id: draw.nextDraw.id,
      roundSetId: draw.nextDraw.roundSetId,
      version: draw.nextDraw.version,
      eligiblePoolCount: draw.nextDraw.eligiblePoolCount,
      eligibleChartIds: draw.nextDraw.eligibleChartIds ?? [],
      excludedChartKeysSnapshot: draw.nextDraw.excludedChartKeysSnapshot ?? [],
      selectedSongKeysSnapshot: draw.nextDraw.selectedSongKeysSnapshot ?? [],
      sameRoundBlockedSongKeysSnapshot: draw.nextDraw.sameRoundBlockedSongKeysSnapshot ?? [],
      charts: draw.nextDraw.charts.map((chart) => ({
        id: chart.id,
        name: chart.name,
        artist: chart.artist,
        displayDifficulty: chart.displayDifficulty,
        songKey: chart.songKey,
        chartKey: chart.chartKey,
        sourceBgImg: chart.sourceBgImg,
        localImagePath: chart.localImagePath,
      })),
    },
  };
}

export async function rerollNormalizedOneChart(
  input: NormalizedAdminTransitionContext & {
    reason: string;
    targetChartId: string;
    draw: NormalizedRerollDraw;
  },
) {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("rerollOneChart", {
      ...input,
      draws: [serializeRerollDraw(input.draw)],
    }),
  );

  return rerollResultSchema.parse(result);
}

export async function rerollNormalizedRoundSet(
  input: NormalizedAdminTransitionContext & {
    reason: string;
    draw: NormalizedRerollDraw;
  },
) {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("rerollRoundSet", {
      ...input,
      draws: [serializeRerollDraw(input.draw)],
    }),
  );

  return rerollResultSchema.parse(result);
}

export async function rerollNormalizedFullRound(
  input: NormalizedAdminTransitionContext & {
    reason: string;
    draws: [NormalizedRerollDraw, NormalizedRerollDraw];
  },
) {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("rerollFullRound", {
      ...input,
      draws: input.draws.map(serializeRerollDraw) as [
        ReturnType<typeof serializeRerollDraw>,
        ReturnType<typeof serializeRerollDraw>,
      ],
    }),
  );

  return rerollResultSchema.parse(result);
}

export async function advanceNormalizedResultReveal(
  input: NormalizedAdminTransitionContext & {
    expectedResultId: string;
    expectedRevealPhase: Exclude<ResultRevealPhase, "final">;
  },
) {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("advanceResultReveal", input),
  );

  return revealResultSchema.parse(result);
}

export async function releaseNormalizedFinalResults(
  input: NormalizedAdminTransitionContext & {
    expectedResultId: string;
    expectedRevealPhase: "final";
  },
) {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("markResultsRevealed", input),
  );

  return releaseResultSchema.parse(result);
}

export async function openNormalizedVotingWindow(input: NormalizedAdminTransitionContext) {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("openVotingWindow", input),
  );

  return openVotingResultSchema.parse(result);
}

export async function pauseNormalizedVotingWindow(input: NormalizedAdminTransitionContext) {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("pauseVotingWindow", input),
  );

  return pauseVotingResultSchema.parse(result);
}

export async function resumeNormalizedVotingWindow(input: NormalizedAdminTransitionContext) {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("resumeVotingWindow", input),
  );

  return resumeVotingResultSchema.parse(result);
}
