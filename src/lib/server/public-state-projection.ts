import "server-only";

import type { PublicStateGenerationRecord } from "@/lib/round/public-state-generation";
import type { RoundNumber } from "@/lib/round/round-state";
import { adminState } from "@/lib/server/admin-state";
import { stageShouldUseResultMode } from "@/lib/stage/stage-view";
import { getVotingRoundSnapshot } from "@/lib/server/voting-round";

export function buildPublicStateGenerationRecord(
  roundNumber: RoundNumber,
  overrides: {
    generation: number;
    transitionKind: string;
    updatedAt: string;
  },
): PublicStateGenerationRecord {
  const nowMs = Date.parse(overrides.updatedAt);
  const snapshot = getVotingRoundSnapshot(roundNumber, Number.isFinite(nowMs) ? nowMs : Date.now());
  const result = adminState.resultStore.getRoundResult(roundNumber);
  const previous = adminState.publicStateGenerationStore.getRound(roundNumber);
  const phoneStatus = adminState.ballotStore.getPhoneStatus(roundNumber);
  const phoneReleased = phoneStatus.phase === "revealed";

  return {
    roundNumber,
    generation: overrides.generation,
    transitionKind: overrides.transitionKind,
    resultMode: stageShouldUseResultMode(snapshot.status, Boolean(result)),
    updatedAt: overrides.updatedAt,
    activeDraws: adminState.drawStateStore
      .getRoundDraws(roundNumber)
      .filter((draw): draw is NonNullable<typeof draw> => draw !== null)
      .map((draw) => ({
        drawId: draw.id,
        roundSetId: draw.roundSetId,
        version: draw.version,
      })),
    votingStatus: snapshot.status,
    votingDeadline: snapshot.closesAt,
    resultId: result?.id ?? null,
    resultPhase: result?.revealPhase ?? null,
    resultPhaseStartedAt: result?.revealPhaseStartedAt ?? null,
    tiebreakStarts:
      result?.sets.flatMap((set) =>
        set.winnerRevealStartedAt
          ? [{ setOrder: set.setOrder, startedAt: set.winnerRevealStartedAt }]
          : [],
      ) ?? [],
    phoneReleaseStatus: phoneReleased ? "released" : "held",
    phoneReleasedAt: phoneReleased ? (previous.phoneReleasedAt ?? overrides.updatedAt) : null,
  };
}

export function advancePublicStateGeneration(input: {
  expectedGeneration: number;
  roundNumber: RoundNumber;
  transitionKind: string;
  updatedAt: string;
}) {
  const next = buildPublicStateGenerationRecord(input.roundNumber, {
    generation: input.expectedGeneration + 1,
    transitionKind: input.transitionKind,
    updatedAt: input.updatedAt,
  });

  return adminState.publicStateGenerationStore.advance({
    ...next,
    expectedGeneration: input.expectedGeneration,
    updatedAt: input.updatedAt,
  });
}
