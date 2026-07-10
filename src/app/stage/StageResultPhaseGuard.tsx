"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PublicRouteFreshnessGuard } from "@/lib/client/PublicRouteFreshnessGuard";
import type { PublicRouteFreshnessKey } from "@/lib/round/public-route-freshness";
import { STAGE_LIVE_REFRESH_INTERVAL_MS } from "@/lib/vote/phone-view";
import { StageAutoRefresh } from "./StageAutoRefresh";

type StageResultPhaseGuardProps = {
  children: ReactNode;
  freshness: PublicRouteFreshnessKey;
};

const STAGE_RESULT_LOCK_STATUSES = new Set([
  "voting_closed",
  "results_computed",
  "results_revealing",
  "results_revealed",
  "round_complete",
]);

function stageResultLockKey(freshness: PublicRouteFreshnessKey) {
  return ["stage-result-mode", freshness.route, freshness.currentRound].join(":");
}

function readStageResultModeLock(key: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(key) === "locked";
  } catch {
    return false;
  }
}

function writeStageResultModeLock(key: string) {
  try {
    window.sessionStorage.setItem(key, "locked");
  } catch {
    // The in-memory render state still protects the current client session.
  }
}

function resultModeHasStarted(freshness: PublicRouteFreshnessKey) {
  return freshness.resultSnapshotId !== null || freshness.resultRevealPhase !== null;
}

function shouldHoldInsteadOfDraw(freshness: PublicRouteFreshnessKey, resultModeLocked: boolean) {
  return (
    resultModeLocked &&
    !resultModeHasStarted(freshness) &&
    STAGE_RESULT_LOCK_STATUSES.has(freshness.votingStatus)
  );
}

function StageResultModeStickyHolding({ freshness }: { freshness: PublicRouteFreshnessKey }) {
  return (
    <>
      <StageAutoRefresh intervalMs={STAGE_LIVE_REFRESH_INTERVAL_MS} jitterMs={0} leading />
      <main className="min-h-screen" data-testid="stage-result-mode-sticky-holding">
        <section className="grid min-h-screen place-items-center px-5 py-4 lg:px-8">
          <div className="metal-panel w-full max-w-3xl rounded-lg p-6 text-center">
            <p className="text-xl font-semibold uppercase text-ember-300">
              Result reveal in progress
            </p>
            <h1 className="mt-3 text-6xl font-black uppercase text-white">Holding Stage Screen</h1>
            <p className="mt-3 text-2xl font-bold text-metal-300">
              Waiting for the latest result snapshot before showing the next reveal step.
            </p>
            <p className="mt-5 rounded border border-metal-700 bg-black/25 px-5 py-3 text-xl font-bold uppercase text-metal-300">
              {freshness.votingStatus.replaceAll("_", " ")}
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

function StageResultModeStickyGate({
  children,
  freshness,
}: {
  children: ReactNode;
  freshness: PublicRouteFreshnessKey;
}) {
  const lockKey = stageResultLockKey(freshness);
  const [resultModeLocked, setResultModeLocked] = useState(() =>
    readStageResultModeLock(lockKey),
  );
  const resultModeStarted = resultModeHasStarted(freshness);

  useEffect(() => {
    if (resultModeStarted) {
      writeStageResultModeLock(lockKey);
      setResultModeLocked(true);
      return;
    }

    setResultModeLocked(readStageResultModeLock(lockKey));
  }, [freshness.sequence, lockKey, resultModeStarted]);

  if (shouldHoldInsteadOfDraw(freshness, resultModeLocked || resultModeStarted)) {
    return <StageResultModeStickyHolding freshness={freshness} />;
  }

  return children;
}

export function StageResultPhaseGuard({ children, freshness }: StageResultPhaseGuardProps) {
  return (
    <PublicRouteFreshnessGuard
      freshness={freshness}
      resultPhaseTestId="stage-result-phase-guard"
      testId="stage-route-freshness-guard"
    >
      <StageResultModeStickyGate freshness={freshness}>{children}</StageResultModeStickyGate>
    </PublicRouteFreshnessGuard>
  );
}
