"use client";

import type { ReactNode } from "react";
import { PublicRouteFreshnessGuard } from "@/lib/client/PublicRouteFreshnessGuard";
import type { PublicRouteFreshnessKey } from "@/lib/round/public-route-freshness";

type StageResultPhaseGuardProps = {
  children: ReactNode;
  freshness: PublicRouteFreshnessKey;
};

export function StageResultPhaseGuard({ children, freshness }: StageResultPhaseGuardProps) {
  return (
    <PublicRouteFreshnessGuard
      freshness={freshness}
      resultPhaseTestId="stage-result-phase-guard"
      testId="stage-route-freshness-guard"
    >
      {children}
    </PublicRouteFreshnessGuard>
  );
}
