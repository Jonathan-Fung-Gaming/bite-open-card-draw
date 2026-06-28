import { ResultSetPanel, RoundHeader, StageDrawCard, StageSetPanel } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { buildStageRoundView } from "@/lib/stage/stage-view";

export const dynamic = "force-dynamic";

export default function ChartsPage() {
  const roundNumber = 1;
  const result = adminState.resultStore.getRoundResult(roundNumber);

  if (result?.revealPhase === "final") {
    return (
      <main className="min-h-screen">
        <RoundHeader title={`ROUND ${roundNumber} FINAL CHARTS`} status="View-only results" />
        <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            {result.sets.map((set, index) => (
              <StageDrawCard key={set.roundSetId} chart={set.selectedChart} index={index + 1} />
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {result.sets.map((set) => (
              <ResultSetPanel key={set.roundSetId} set={set} showWinner />
            ))}
          </div>
        </section>
      </main>
    );
  }

  const view = buildStageRoundView(adminState.drawStateStore, roundNumber);

  return (
    <main className="min-h-screen">
      <RoundHeader title="Drawn Charts" status="View-only chart display" />
      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-2">
        {view.sets.map(({ set, draw }) => (
          <StageSetPanel key={set.displayLabel} set={set} draw={draw} />
        ))}
      </section>
    </main>
  );
}
