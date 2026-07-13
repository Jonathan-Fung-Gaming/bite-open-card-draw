"use client";

import { useEffect, useState } from "react";
import { StageSetPanel } from "@/components";
import {
  buildStageRevealClockKey,
  stageShouldShowAllDrawCards,
  type StageSetView,
} from "@/lib/stage/stage-view";
import type { VotingRoundStatus } from "@/lib/vote/voting-window";

type StageDrawRowsProps = {
  publicStateGeneration: number;
  serverNowMs: number;
  sets: StageSetView[];
  votingStatus: VotingRoundStatus;
};

type StageRevealClockSample = {
  key: string;
  serverNowMs: number;
};

export function StageDrawRows({
  publicStateGeneration,
  serverNowMs,
  sets,
  votingStatus,
}: StageDrawRowsProps) {
  const showAllDrawCards = stageShouldShowAllDrawCards(votingStatus);
  const revealClockKey = buildStageRevealClockKey(sets, votingStatus, publicStateGeneration);
  const [acceptedClockSample, setAcceptedClockSample] = useState<StageRevealClockSample>(() => ({
    key: revealClockKey,
    serverNowMs,
  }));
  const effectiveClockSample =
    acceptedClockSample.key === revealClockKey
      ? acceptedClockSample
      : { key: revealClockKey, serverNowMs };

  useEffect(() => {
    setAcceptedClockSample((current) =>
      current.key === revealClockKey ? current : { key: revealClockKey, serverNowMs },
    );
  }, [revealClockKey, serverNowMs]);

  return (
    <div
      className="grid gap-1"
      data-public-state-generation={publicStateGeneration}
      data-reveal-visibility={showAllDrawCards ? "immediate" : "canonical"}
      data-testid="stage-chart-rows"
    >
      {sets.map((setView) => (
        <StageSetPanel
          key={setView.set.displayLabel}
          set={setView.set}
          draw={setView.draw}
          revealStartsAt={showAllDrawCards ? undefined : setView.revealStartsAt}
          serverNowMs={effectiveClockSample.serverNowMs}
        />
      ))}
    </div>
  );
}
