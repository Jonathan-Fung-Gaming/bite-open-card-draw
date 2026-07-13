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

export function resultModeHasStarted(freshness: PublicRouteFreshnessKey) {
  return (
    freshness.publicStateResultMode ||
    freshness.resultSnapshotId !== null ||
    freshness.resultRevealPhase !== null
  );
}

const RESULT_MODE_EXIT_TRANSITIONS = new Set([
  "reroll_one_chart",
  "reroll_round_set",
  "reroll_full_round",
  "reset_round",
  "round_reset",
  "reset_tournament",
  "reset_tournament_data",
  "start_rehearsal_mode",
  "reset_rehearsal_mode",
  "voting_restarted",
  "voting_opened",
  "set_current_round",
  "advance_current_round",
]);

export function explicitNewGenerationAllowsDrawMode(freshness: PublicRouteFreshnessKey) {
  return (
    !freshness.publicStateResultMode &&
    RESULT_MODE_EXIT_TRANSITIONS.has(freshness.publicStateTransitionKind)
  );
}

export function shouldHoldInsteadOfDraw(
  freshness: PublicRouteFreshnessKey,
  resultModeLocked: boolean,
) {
  return (
    resultModeLocked &&
    !explicitNewGenerationAllowsDrawMode(freshness) &&
    !resultModeHasStarted(freshness) &&
    (STAGE_RESULT_LOCK_STATUSES.has(freshness.votingStatus) || freshness.publicStateGeneration > 0)
  );
}

function StageResultModeStickyHolding() {
  return (
    <>
      <StageAutoRefresh intervalMs={STAGE_LIVE_REFRESH_INTERVAL_MS} jitterMs={0} leading />
      <main className="min-h-screen" data-testid="stage-result-mode-sticky-holding">
        <section className="grid min-h-screen place-items-center px-5 py-4 lg:px-8">
          <div
            className="metal-panel w-full max-w-3xl rounded-lg p-6 text-center"
            role="status"
            aria-busy="true"
            aria-live="polite"
          >
            <p className="text-xl font-semibold uppercase text-ember-300">
              Result reveal in progress
            </p>
            <h1 className="mt-3 text-6xl font-black uppercase text-white">Results Coming Up</h1>
            <p className="mt-3 text-2xl font-bold text-metal-300">
              Waiting for the next official reveal update before showing the next step.
            </p>
            <p className="mt-5 rounded border border-metal-700 bg-black/25 px-5 py-3 text-xl font-bold uppercase text-metal-300">
              Preparing reveal
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
  const [resultModeLocked, setResultModeLocked] = useState(() => readStageResultModeLock(lockKey));
  const resultModeStarted = resultModeHasStarted(freshness);

  useEffect(() => {
    if (explicitNewGenerationAllowsDrawMode(freshness)) {
      try {
        window.sessionStorage.removeItem(lockKey);
      } catch {
        // The accepted generation still authorizes the render without storage.
      }
      setResultModeLocked(false);
      return;
    }

    if (resultModeStarted) {
      writeStageResultModeLock(lockKey);
      setResultModeLocked(true);
      return;
    }

    setResultModeLocked(readStageResultModeLock(lockKey));
  }, [freshness, lockKey, resultModeStarted]);

  if (shouldHoldInsteadOfDraw(freshness, resultModeLocked || resultModeStarted)) {
    return <StageResultModeStickyHolding />;
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
