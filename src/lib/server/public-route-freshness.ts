import "server-only";

import type { RoundResultSnapshot } from "@/lib/results/result-engine";
import {
  createPublicRouteFreshnessKey,
  type PublicRouteFreshnessKey,
} from "@/lib/round/public-route-freshness";
import type { PublicRouteState, PublicTournamentRoute } from "@/lib/round/round-state";
import { adminState } from "@/lib/server/admin-state";
import type { VotingRoundSnapshot } from "@/lib/vote/voting-window";

type TournamentActionRecord = {
  createdAt: string;
};

function latestIso(values: readonly (string | null | undefined)[]) {
  return (
    values
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null
  );
}

function latestTournamentAction(
  records: readonly TournamentActionRecord[],
): { createdAt: string | null; sequence: number } {
  const latest = records.reduce<{ createdAt: string; index: number } | null>(
    (selected, record, index) => {
      if (selected === null) {
        return { createdAt: record.createdAt, index };
      }

      const recordEpoch = Date.parse(record.createdAt);
      const selectedEpoch = Date.parse(selected.createdAt);

      if (recordEpoch > selectedEpoch || (recordEpoch === selectedEpoch && index < selected.index)) {
        return { createdAt: record.createdAt, index };
      }

      return selected;
    },
    null,
  );

  return latest === null
    ? { createdAt: null, sequence: 0 }
    : { createdAt: latest.createdAt, sequence: records.length - latest.index };
}

export function buildPublicRouteFreshness(input: {
  currentRound: PublicRouteState["roundNumber"];
  result: RoundResultSnapshot | null;
  route: PublicTournamentRoute;
  routeRoundNumber: PublicRouteState["roundNumber"];
  routeSource: PublicRouteState["source"];
  votingSnapshot: VotingRoundSnapshot;
}): PublicRouteFreshnessKey {
  const activeDraws = adminState.drawStateStore
    .getRoundDraws(input.routeRoundNumber)
    .filter((draw): draw is NonNullable<typeof draw> => draw !== null)
    .map((draw) => ({
      createdAt: draw.createdAt,
      drawId: draw.id,
      roundSetId: draw.roundSetId,
      version: draw.version,
    }));
  const votingWindow =
    adminState.votingWindowStore
      .exportSnapshot()
      .windows.find((window) => window.roundNumber === input.routeRoundNumber) ?? null;
  const latestBallotRevisionAt = latestIso(
    adminState.ballotStore
      .listForRound(input.routeRoundNumber)
      .map((ballot) => ballot.lastRevisionAt ?? ballot.submittedAt),
  );
  const tournamentChangingAuditRecords = adminState.auditStore
    .exportSnapshot()
    .records.filter((record) => record.tournamentChanging);
  const tournamentAction = latestTournamentAction(tournamentChangingAuditRecords);

  return createPublicRouteFreshnessKey({
    activeDrawVersions: activeDraws,
    currentRound: input.currentRound,
    latestBallotRevisionAt,
    latestTournamentActionAt: tournamentAction.createdAt,
    latestTournamentActionSequence: tournamentAction.sequence,
    resultComputedAt: input.result?.computedAt ?? null,
    resultFinalRevealedAt: input.result?.finalRevealedAt ?? null,
    resultRevealPhase: input.result?.revealPhase ?? null,
    resultRevealPhaseStartedAt: input.result?.revealPhaseStartedAt ?? null,
    resultSnapshotId: input.result?.id ?? null,
    route: input.route,
    routeRoundNumber: input.routeRoundNumber,
    routeSource: input.routeSource,
    votingStatus: input.votingSnapshot.status,
    votingWindowClosedAt: votingWindow?.closedAt ?? input.votingSnapshot.closedAt,
    votingWindowOpenedAt: votingWindow?.openedAt ?? input.votingSnapshot.openedAt,
    votingWindowUpdatedAt: votingWindow?.updatedAt ?? input.votingSnapshot.updatedAt,
  });
}
