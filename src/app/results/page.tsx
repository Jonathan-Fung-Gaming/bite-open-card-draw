import { PublicResultSummary, RoundHeader } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { hydrateTournamentState } from "@/lib/server/persistence";
import { ResultsAutoRefresh } from "./ResultsAutoRefresh";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  await hydrateTournamentState();

  const { currentRound: roundNumber } = adminState.roundStateStore.getSnapshot();
  const result = adminState.resultStore.getRoundResult(roundNumber);

  if (!result || result.revealPhase !== "final") {
    return (
      <main className="min-h-screen">
        <ResultsAutoRefresh />
        <RoundHeader title={`Round ${roundNumber} Results`} status="Awaiting stage reveal" />
        <section className="mx-auto max-w-3xl px-5 py-5">
          <div className="metal-panel rounded-lg p-5 text-center text-lg font-bold text-metal-300">
            <p>Voting is closed.</p>
            <p>Results are being revealed on stage.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <RoundHeader title={`ROUND ${roundNumber} FINAL CHARTS`} status="Results revealed" />
      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-5">
        <PublicResultSummary result={result} />
      </section>
    </main>
  );
}
