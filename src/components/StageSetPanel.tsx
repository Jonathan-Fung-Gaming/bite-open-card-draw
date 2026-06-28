import type { DrawRecord } from "@/lib/draw/draw-state";
import type { RoundSetDefinition } from "@/lib/tournament";
import { StageDrawCard } from "./StageDrawCard";

type StageSetPanelProps = {
  set: RoundSetDefinition;
  draw: DrawRecord | null;
};

export function StageSetPanel({ set, draw }: StageSetPanelProps) {
  const cards = draw?.charts ?? Array.from({ length: set.drawCount }, () => null);
  const firstRow = cards.slice(0, 4);
  const secondRow = cards.slice(4, 7);

  return (
    <section className="metal-panel rounded-lg p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
            Round {set.roundNumber} - Set {set.setOrder}
          </p>
          <h2 className="mt-1 text-3xl font-black uppercase text-white">{set.displayLabel}</h2>
        </div>
        <p className="text-sm text-metal-300">
          {draw ? `Version ${draw.version} / Pool ${draw.eligiblePoolCount}` : "Awaiting host draw"}
        </p>
      </div>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {firstRow.map((chart, index) => (
            <StageDrawCard
              key={chart?.id ?? `placeholder-top-${index}`}
              chart={chart ?? undefined}
              index={index + 1}
              revealDelayMs={index * 130}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:px-[12.5%]">
          {secondRow.map((chart, index) => (
            <StageDrawCard
              key={chart?.id ?? `placeholder-bottom-${index}`}
              chart={chart ?? undefined}
              index={index + 5}
              revealDelayMs={(index + 4) * 130}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
