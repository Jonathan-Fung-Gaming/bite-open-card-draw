"use client";

import { type ReactNode, useRef } from "react";
import type { ResultRevealPhase } from "@/lib/results/reveal-phase-order";
import { resultRevealPhaseRank } from "@/lib/results/reveal-phase-order";

type StageResultPhaseGuardProps = {
  children: ReactNode;
  phase: ResultRevealPhase;
  roundNumber: 1 | 2 | 3 | 4;
};

export function StageResultPhaseGuard({
  children,
  phase,
  roundNumber,
}: StageResultPhaseGuardProps) {
  const accepted = useRef({
    children,
    phase,
    rank: resultRevealPhaseRank(phase),
    roundNumber,
  });
  const nextRank = resultRevealPhaseRank(phase);

  if (accepted.current.roundNumber !== roundNumber || nextRank >= accepted.current.rank) {
    accepted.current = {
      children,
      phase,
      rank: nextRank,
      roundNumber,
    };
  }

  return (
    <>
      <span
        aria-hidden="true"
        data-accepted-result-phase={accepted.current.phase}
        data-testid="stage-result-phase-guard"
        hidden
      />
      {accepted.current.children}
    </>
  );
}
