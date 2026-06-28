import { CountdownTimer, QRPanel, RoundHeader, StageSetPanel } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { buildStageRoundView } from "@/lib/stage/stage-view";

export const dynamic = "force-dynamic";

export default function StagePage() {
  const view = buildStageRoundView(adminState.drawStateStore, 1);

  return (
    <main className="min-h-screen">
      <RoundHeader
        title={`Round ${view.roundNumber} Draw`}
        status={view.bothSetsDrawn ? "Both sets drawn - ready to vote" : "Awaiting host draw"}
      />
      <section className="grid gap-5 px-5 py-5 lg:grid-cols-[1fr_280px] lg:px-8">
        <div className="grid gap-5">
          {view.sets.map(({ set, draw }) => (
            <StageSetPanel key={set.displayLabel} set={set} draw={draw} />
          ))}
        </div>
        <aside className="grid content-start gap-5">
          <CountdownTimer
            label={view.bothSetsDrawn ? "Voting Window" : "Draw Status"}
            minutes={view.bothSetsDrawn ? "10:00" : "--:--"}
            caption={view.bothSetsDrawn ? "One window covers both sets." : "Draw both sets before voting."}
          />
          <QRPanel />
        </aside>
      </section>
    </main>
  );
}
