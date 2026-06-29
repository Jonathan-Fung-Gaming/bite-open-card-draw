import { PublicDrawSetPanel, PublicResultSummary, RoundHeader } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { hydrateTournamentState } from "@/lib/server/persistence";
import { buildStageRoundView } from "@/lib/stage/stage-view";
import { ChartsAutoRefresh } from "./ChartsAutoRefresh";

export const dynamic = "force-dynamic";

export default async function ChartsPage() {
  await hydrateTournamentState();

  const { currentRound: roundNumber } = adminState.roundStateStore.getSnapshot();
  const result = adminState.resultStore.getRoundResult(roundNumber);

  if (result?.revealPhase === "final") {
    return (
      <main className="min-h-screen">
        <ChartsAutoRefresh />
        <RoundHeader title={`ROUND ${roundNumber} FINAL CHARTS`} status="View-only results" />
        <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5">
          <PublicResultSummary result={result} />
        </section>
      </main>
    );
  }

  const view = buildStageRoundView(adminState.drawStateStore, roundNumber);

  return (
    <main className="min-h-screen">
      <ChartsAutoRefresh />
      <RoundHeader title="Drawn Charts" status="View-only chart display" />
      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-2">
        {view.sets.map(({ set, draw }) => (
          <PublicDrawSetPanel key={set.displayLabel} set={set} draw={draw} />
        ))}
      </section>
    </main>
  );
}
