"use client";

import { useState } from "react";
import clsx from "clsx";
import { PublicDrawSetPanel } from "@/components";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { RoundSetDefinition } from "@/lib/tournament";

type ChartsSetNavigatorProps = {
  sets: {
    set: RoundSetDefinition;
    draw: DrawRecord | null;
  }[];
  status: {
    label: string;
    detail: string;
    timerText?: string | null;
  };
};

export function ChartsSetNavigator({ sets, status }: ChartsSetNavigatorProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSet = sets[activeIndex];

  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5">
      <div
        className="metal-panel rounded-lg p-4"
        data-testid="view-only-status"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
              View only
            </p>
            <h2 className="mt-1 text-xl font-black uppercase text-white">{status.label}</h2>
          </div>
          {status.timerText ? (
            <p className="font-mono text-3xl font-black tabular-nums text-white">
              {status.timerText}
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-metal-300">{status.detail}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:hidden" role="tablist" aria-label="Chart sets">
        {sets.map(({ set }, index) => (
          <button
            key={set.displayLabel}
            aria-controls={`view-only-set-${set.setOrder}`}
            aria-selected={activeIndex === index}
            className={clsx(
              "rounded border px-3 py-3 text-sm font-black uppercase",
              activeIndex === index
                ? "border-ember-300 bg-ember-900/35 text-white"
                : "border-metal-700 bg-black/25 text-metal-300",
            )}
            onClick={() => setActiveIndex(index)}
            role="tab"
            type="button"
          >
            Set {set.setOrder}
            <span className="block font-mono text-xs">{set.displayLabel}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {sets.map(({ set, draw }, index) => (
          <div
            key={set.displayLabel}
            className={clsx(index === activeIndex ? "block" : "hidden", "md:block")}
            id={`view-only-set-${set.setOrder}`}
            role="tabpanel"
          >
            <PublicDrawSetPanel set={set} draw={draw} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <button
          className="rounded border border-metal-700 px-4 py-3 font-bold uppercase text-metal-300 disabled:opacity-40"
          disabled={activeIndex === 0}
          onClick={() => setActiveIndex((current) => Math.max(0, current - 1))}
          type="button"
        >
          Back
        </button>
        <button
          className="button-metal rounded px-4 py-3 font-black uppercase disabled:opacity-40"
          disabled={!activeSet || activeIndex === sets.length - 1}
          onClick={() => setActiveIndex((current) => Math.min(sets.length - 1, current + 1))}
          type="button"
        >
          Next
        </button>
      </div>
    </section>
  );
}
