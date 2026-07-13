import type { DrawRecord } from "@/lib/draw/draw-state";
import type { BallotSetChoice } from "@/lib/vote/ballot";

export type ActiveDrawGeneration = {
  drawId: string;
  roundSetId: string;
  version: number;
};

export type VoteLiveGeneration = {
  activeDraws: ActiveDrawGeneration[];
  generation: number;
};

export type VoteRouteRefreshAttempt = {
  attemptedAtMs: number;
  targetGeneration: number;
};

function sortActiveDraws(draws: readonly ActiveDrawGeneration[]) {
  return [...draws].sort((left, right) => left.roundSetId.localeCompare(right.roundSetId));
}

export function activeDrawGenerationFromDraws(
  draws: readonly Pick<DrawRecord, "id" | "roundSetId" | "version">[],
): ActiveDrawGeneration[] {
  return sortActiveDraws(
    draws.map((draw) => ({
      drawId: draw.id,
      roundSetId: draw.roundSetId,
      version: draw.version,
    })),
  );
}

export function activeDrawGenerationKey(draws: readonly ActiveDrawGeneration[]) {
  return sortActiveDraws(draws)
    .map((draw) => `${draw.roundSetId}:${draw.drawId}:${draw.version}`)
    .join("|");
}

export function compareVoteLiveGeneration(next: VoteLiveGeneration, accepted: VoteLiveGeneration) {
  if (next.generation !== accepted.generation) {
    return Math.sign(next.generation - accepted.generation);
  }

  const nextKey = activeDrawGenerationKey(next.activeDraws);
  const acceptedKey = activeDrawGenerationKey(accepted.activeDraws);

  return nextKey === acceptedKey ? 0 : nextKey.localeCompare(acceptedKey);
}

export function voteLiveGenerationIsNewer(next: VoteLiveGeneration, accepted: VoteLiveGeneration) {
  return compareVoteLiveGeneration(next, accepted) > 0;
}

export function classifyVoteLiveProjectionChange(
  rendered: VoteLiveGeneration,
  live: VoteLiveGeneration,
): "none" | "generation" | "draws" {
  if (activeDrawGenerationKey(rendered.activeDraws) !== activeDrawGenerationKey(live.activeDraws)) {
    return "draws";
  }

  return rendered.generation === live.generation ? "none" : "generation";
}

export function shouldRequestVoteRouteRefresh(input: {
  lastAttempt: VoteRouteRefreshAttempt | null;
  nowMs: number;
  retryAfterMs: number;
  targetGeneration: number;
}) {
  return (
    !input.lastAttempt ||
    input.lastAttempt.targetGeneration !== input.targetGeneration ||
    input.nowMs - input.lastAttempt.attemptedAtMs >= input.retryAfterMs
  );
}

export function isStaleBallotStateError(message: string) {
  return /public state changed|ballot draw changed|expected generation|expected active draw|active draw.*(changed|missing)|superseded/i.test(
    message,
  );
}

export function reconcileChoicesForActiveDraws(
  choices: readonly BallotSetChoice[],
  draws: readonly ActiveDrawGeneration[],
) {
  const activeBySet = new Map(draws.map((draw) => [draw.roundSetId, draw]));

  return choices.flatMap((choice): BallotSetChoice[] => {
    const active = activeBySet.get(choice.roundSetId);

    if (!active) {
      return [];
    }

    if (active.drawId === choice.drawId) {
      return [{ ...choice, bannedChartIds: [...choice.bannedChartIds] }];
    }

    return [
      {
        ...choice,
        drawId: active.drawId,
        noBans: false,
        bannedChartIds: [],
      },
    ];
  });
}

export function shouldAcceptVoteLivePoll(input: {
  acceptedGeneration: VoteLiveGeneration;
  acceptedRequestSequence: number;
  nextGeneration: VoteLiveGeneration;
  nextRequestSequence: number;
}) {
  const generationComparison = compareVoteLiveGeneration(
    input.nextGeneration,
    input.acceptedGeneration,
  );

  if (generationComparison !== 0) {
    return generationComparison > 0;
  }

  return input.nextRequestSequence >= input.acceptedRequestSequence;
}
