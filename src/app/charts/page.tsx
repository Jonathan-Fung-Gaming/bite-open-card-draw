import type { Metadata } from "next";
import { PublicResultSummary, RoundHeader } from "@/components";
import { PublicRouteFreshnessGuard } from "@/lib/client/PublicRouteFreshnessGuard";
import { buildPublicRouteFreshness } from "@/lib/server/public-route-freshness";
import { adminState } from "@/lib/server/admin-state";
import { getAuthoritativeNowMs } from "@/lib/server/authoritative-clock";
import { hydratePublicTournamentState } from "@/lib/server/persistence";
import { advanceVotingTimerIfDue, getVotingRoundSnapshot } from "@/lib/server/voting-round";
import { buildStageRoundView } from "@/lib/stage/stage-view";
import {
  formatVotingStatusLabel,
  formatVotingTime,
  type VotingRoundSnapshot,
} from "@/lib/vote/voting-window";
import { toPublicChartsSetViews } from "@/lib/charts/public-chart-view";
import { shouldShowFinalPhoneResults } from "@/lib/vote/phone-view";
import { ChartsAutoRefresh } from "./ChartsAutoRefresh";
import { ChartsSetNavigator } from "./ChartsSetNavigator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "View Charts",
};

function chartsStatus(snapshot: VotingRoundSnapshot, drawnSetCount: number) {
  if (drawnSetCount === 0) {
    return {
      label: "Awaiting first chart set",
      detail: "Chart sets will appear here as the host draws them. This view cannot submit votes.",
      timerText: null,
    };
  }

  if (drawnSetCount === 1) {
    return {
      label: "One chart set drawn",
      detail:
        "The drawn chart set is visible now. The second set will appear when the host finishes the draw. This view cannot submit votes.",
      timerText: null,
    };
  }

  if (
    snapshot.status === "voting_open" ||
    snapshot.status === "final_30_seconds" ||
    snapshot.status === "extension_1_minute"
  ) {
    return {
      label: formatVotingStatusLabel(snapshot.status),
      detail:
        "View-only mode. Use this page to inspect charts without selecting a username or affecting turnout.",
      timerText: formatVotingTime(snapshot.remainingMs),
    };
  }

  if (snapshot.status === "ready_to_vote") {
    return {
      label: formatVotingStatusLabel(snapshot.status),
      detail:
        "Both chart sets are drawn. Waiting for the host to open voting. This view stays read-only.",
      timerText: null,
    };
  }

  if (
    snapshot.status === "voting_closed" ||
    snapshot.status === "results_computed" ||
    snapshot.status === "results_revealing"
  ) {
    return {
      label: "Results being revealed",
      detail:
        "Voting is closed. Results are being revealed on stage before final charts appear here.",
      timerText: null,
    };
  }

  return {
    label: formatVotingStatusLabel(snapshot.status),
    detail: "View-only mode. This page never submits votes or changes turnout.",
    timerText: snapshot.canSubmit ? formatVotingTime(snapshot.remainingMs) : null,
  };
}

export default async function ChartsPage() {
  await hydratePublicTournamentState();

  const { currentRound: roundNumber } = adminState.roundStateStore.getSnapshot();
  const nowMs = await getAuthoritativeNowMs();
  await advanceVotingTimerIfDue(roundNumber, nowMs);
  const result = adminState.resultStore.getRoundResult(roundNumber);
  const snapshot = getVotingRoundSnapshot(roundNumber, nowMs);
  const freshness = buildPublicRouteFreshness({
    currentRound: roundNumber,
    result,
    route: "/charts",
    routeRoundNumber: roundNumber,
    routeSource: "current_round",
    votingSnapshot: snapshot,
  });
  const showFinalResults = shouldShowFinalPhoneResults(snapshot.status, result?.revealPhase);

  if (showFinalResults && result) {
    return (
      <PublicRouteFreshnessGuard freshness={freshness} testId="charts-route-freshness-guard">
        <main className="min-h-screen">
          <ChartsAutoRefresh />
          <RoundHeader title={`ROUND ${roundNumber} FINAL CHARTS`} status="View-only results" />
          <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5">
            <div className="metal-panel rounded-lg p-4" data-testid="view-only-status">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                View only
              </p>
              <h2 className="mt-1 text-xl font-black uppercase text-white">
                Final charts revealed
              </h2>
              <p className="mt-2 text-sm text-metal-300">
                Selected charts are shown first. This page cannot submit votes or affect turnout.
              </p>
            </div>
            <PublicResultSummary result={result} />
          </section>
        </main>
      </PublicRouteFreshnessGuard>
    );
  }

  const view = buildStageRoundView(adminState.drawStateStore, roundNumber);

  return (
    <PublicRouteFreshnessGuard freshness={freshness} testId="charts-route-freshness-guard">
      <main className="min-h-screen">
        <ChartsAutoRefresh />
        <RoundHeader title="Drawn Charts" status="View-only chart display" />
        <ChartsSetNavigator
          sets={toPublicChartsSetViews(view.sets)}
          status={chartsStatus(snapshot, snapshot.drawnSetCount)}
        />
      </main>
    </PublicRouteFreshnessGuard>
  );
}
