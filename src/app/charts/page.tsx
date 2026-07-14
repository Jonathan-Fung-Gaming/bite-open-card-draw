import type { Metadata } from "next";
import { PublicResultSummary, RoundHeader } from "@/components";
import { PublicRouteFreshnessGuard } from "@/lib/client/PublicRouteFreshnessGuard";
import { buildPublicRouteFreshness } from "@/lib/server/public-route-freshness";
import { adminState } from "@/lib/server/admin-state";
import { getAuthoritativeNowMs } from "@/lib/server/authoritative-clock";
import { hydratePublicTournamentState } from "@/lib/server/persistence";
import { advanceVotingTimerIfDue, getVotingRoundSnapshot } from "@/lib/server/voting-round";
import { buildStageRoundView, stageShouldShowAllDrawCards } from "@/lib/stage/stage-view";
import { toPublicChartsSetViews } from "@/lib/charts/public-chart-view";
import { shouldShowFinalPhoneResults } from "@/lib/vote/phone-view";
import { ChartsAutoRefresh } from "./ChartsAutoRefresh";
import { ChartsSetNavigator } from "./ChartsSetNavigator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "View Charts",
};

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
          <RoundHeader title={`ROUND ${roundNumber} FINAL CHARTS`} mobileCompact />
          <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5">
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
        <RoundHeader title="Drawn Charts" mobileCompact />
        <ChartsSetNavigator
          sets={toPublicChartsSetViews(view.sets)}
          serverNowMs={nowMs}
          showAllDrawCards={stageShouldShowAllDrawCards(snapshot.status)}
        />
      </main>
    </PublicRouteFreshnessGuard>
  );
}
