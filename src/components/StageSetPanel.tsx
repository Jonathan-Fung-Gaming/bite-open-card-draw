"use client";

import { useEffect, useState } from "react";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { STAGE_CHART_REVEAL_INTERVAL_MS } from "@/lib/stage/stage-view";
import type { RoundSetDefinition } from "@/lib/tournament";
import { StageDrawCard } from "./StageDrawCard";

type StageSetPanelProps = {
  set: RoundSetDefinition;
  draw: DrawRecord | null;
  revealStartsAt?: string | null;
  serverNowMs?: number;
};

function visibleCardCount(
  draw: DrawRecord | null,
  revealStartsAt: string | null | undefined,
  nowMs: number,
) {
  if (!draw) {
    return 0;
  }

  if (revealStartsAt === undefined) {
    return draw.charts.length;
  }

  if (revealStartsAt === null) {
    return 0;
  }

  const elapsedMs = nowMs - Date.parse(revealStartsAt);

  if (elapsedMs < 0) {
    return 0;
  }

  return Math.min(draw.charts.length, Math.floor(elapsedMs / STAGE_CHART_REVEAL_INTERVAL_MS) + 1);
}

export function StageSetPanel({ set, draw, revealStartsAt, serverNowMs }: StageSetPanelProps) {
  const [nowMs, setNowMs] = useState(serverNowMs ?? Date.now());
  const revealedCount = visibleCardCount(draw, revealStartsAt, nowMs);
  const cards = Array.from({ length: set.drawCount }, (_, index) =>
    draw && revealedCount > index ? (draw.charts[index] ?? null) : null,
  );
  const status = draw
    ? revealStartsAt === null
      ? "Drawn - waiting for prior row"
      : revealedCount >= set.drawCount
        ? `Version ${draw.version} / Pool ${draw.eligiblePoolCount}`
        : `Version ${draw.version} / Revealing ${revealedCount} / ${set.drawCount}`
    : "Awaiting host draw";

  useEffect(() => {
    if (!draw || !revealStartsAt || revealedCount >= set.drawCount) {
      return;
    }

    const baseNowMs = serverNowMs ?? Date.now();
    const basePerformanceMs = window.performance.now();
    const updateNow = () => setNowMs(baseNowMs + window.performance.now() - basePerformanceMs);
    const intervalId = window.setInterval(updateNow, 250);

    updateNow();

    return () => window.clearInterval(intervalId);
  }, [draw, revealStartsAt, revealedCount, serverNowMs, set.drawCount]);

  return (
    <section
      className="metal-panel rounded-lg p-1.5 2xl:p-4"
      data-set-order={set.setOrder}
      data-testid="stage-set-row"
    >
      <div className="mb-1 flex flex-wrap items-end justify-between gap-2 2xl:mb-4 2xl:gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
            Set {set.setOrder} / {set.drawCount} charts
          </p>
          <h2 className="mt-0.5 text-base font-black uppercase text-white lg:text-lg 2xl:text-3xl">
            Round {set.roundNumber} - {set.displayLabel}
          </h2>
        </div>
        <p className="text-xs text-metal-300 2xl:text-sm">{status}</p>
      </div>
      <div className="grid grid-cols-7 gap-1 lg:gap-2 2xl:gap-3" data-testid="stage-set-card-row">
        {cards.map((chart, index) => (
          <StageDrawCard
            key={`stage-${set.roundNumber}-${set.setOrder}-${index}`}
            chart={chart ?? undefined}
            index={index + 1}
          />
        ))}
      </div>
    </section>
  );
}
