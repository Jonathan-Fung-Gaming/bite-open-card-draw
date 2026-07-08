"use client";

import { type ReactNode, useRef } from "react";
import {
  shouldAcceptPublicRoutePayload,
  type PublicRouteFreshnessKey,
} from "@/lib/round/public-route-freshness";

type PublicRouteFreshnessGuardProps = {
  children: ReactNode;
  freshness: PublicRouteFreshnessKey;
  resultPhaseTestId?: string;
  testId?: string;
};

export function PublicRouteFreshnessGuard({
  children,
  freshness,
  resultPhaseTestId,
  testId = "public-route-freshness-guard",
}: PublicRouteFreshnessGuardProps) {
  const accepted = useRef({
    children,
    freshness,
    rejectedStalePayloads: 0,
  });

  if (shouldAcceptPublicRoutePayload(freshness, accepted.current.freshness)) {
    accepted.current = {
      children,
      freshness,
      rejectedStalePayloads: accepted.current.rejectedStalePayloads,
    };
  } else {
    accepted.current.rejectedStalePayloads += 1;
  }

  const acceptedFreshness = accepted.current.freshness;
  const acceptedResultPhase = acceptedFreshness.resultRevealPhase ?? "none";

  return (
    <>
      <span
        aria-hidden="true"
        data-accepted-current-round={acceptedFreshness.currentRound}
        data-accepted-public-route-epoch-ms={acceptedFreshness.epochMs}
        data-accepted-result-phase={acceptedResultPhase}
        data-accepted-result-snapshot={acceptedFreshness.resultSnapshotId ?? "none"}
        data-accepted-route={acceptedFreshness.route}
        data-accepted-route-round={acceptedFreshness.routeRoundNumber}
        data-accepted-route-source={acceptedFreshness.routeSource}
        data-accepted-voting-status={acceptedFreshness.votingStatus}
        data-rejected-stale-payloads={accepted.current.rejectedStalePayloads}
        data-testid={testId}
        hidden
      />
      {resultPhaseTestId && acceptedFreshness.resultRevealPhase ? (
        <span
          aria-hidden="true"
          data-accepted-result-phase={acceptedFreshness.resultRevealPhase}
          data-testid={resultPhaseTestId}
          hidden
        />
      ) : null}
      {accepted.current.children}
    </>
  );
}
