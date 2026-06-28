import { RoundHeader, StageSetPanel } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { buildStageRoundView } from "@/lib/stage/stage-view";

export const dynamic = "force-dynamic";

export default function ChartsPage() {
  const view = buildStageRoundView(adminState.drawStateStore, 1);

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
