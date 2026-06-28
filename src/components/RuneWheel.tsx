"use client";

import clsx from "clsx";
import type { CSSProperties } from "react";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import { TIEBREAK_REVEAL_DURATION_MS } from "@/lib/results/reveal-timing";

type RuneWheelProps = {
  slots: DrawnChartSummary[];
  winnerChartId: string;
  winnerRevealed: boolean;
};

export function RuneWheel({ slots, winnerChartId, winnerRevealed }: RuneWheelProps) {
  const winner = slots.find((slot) => slot.id === winnerChartId);

  return (
    <div
      className="overflow-hidden rounded border border-ember-300/35 bg-black/30 p-3"
      data-testid="rune-wheel"
      data-winner-revealed={winnerRevealed ? "true" : "false"}
    >
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ember-300">Rune-wheel tiebreak</p>
      <div className="mt-3 overflow-hidden rounded border border-metal-700 bg-furnace-900">
        <div
          className="rune-wheel-track grid w-[240%] grid-cols-12 gap-2 p-2"
          style={{ "--rune-wheel-duration": `${TIEBREAK_REVEAL_DURATION_MS}ms` } as CSSProperties}
        >
          {slots.map((slot, index) => (
            <div
              key={`${slot.id}-${index}`}
              className={clsx(
                "min-h-20 rounded border bg-black/35 p-2 text-center text-xs font-black uppercase text-white",
                winnerRevealed && slot.id === winnerChartId
                  ? "border-ember-300 shadow-ember-tight"
                  : "border-metal-700",
              )}
            >
              <p className="font-mono text-ember-300">{String(index + 1).padStart(2, "0")}</p>
              <p className="mt-2 line-clamp-2">{slot.name}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm font-bold text-white" data-testid="rune-wheel-status">
        {winnerRevealed ? (
          <>
            Backend winner revealed:{" "}
            <span className="text-ember-300">{winner?.name ?? winnerChartId}</span>
          </>
        ) : (
          "Backend winner sealed. Reveal in progress."
        )}
      </p>
    </div>
  );
}
