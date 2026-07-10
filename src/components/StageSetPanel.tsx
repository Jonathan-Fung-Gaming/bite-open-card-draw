"use client";

import { useEffect, useState } from "react";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { STAGE_CHART_REVEAL_INTERVAL_MS } from "@/lib/stage/stage-view";
import type { RoundSetDefinition } from "@/lib/tournament";
import { StageDrawCard } from "./StageDrawCard";

const STAGE_CHART_REVEAL_ANIMATION_GUARD_MS = 700;

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

function cardRevealAnimationActive(
  draw: DrawRecord | null,
  revealStartsAt: string | null | undefined,
  nowMs: number,
) {
  if (!draw || !revealStartsAt) {
    return false;
  }

  const elapsedMs = nowMs - Date.parse(revealStartsAt);

  if (elapsedMs < 0) {
    return false;
  }

  const activeRevealIndex = Math.floor(elapsedMs / STAGE_CHART_REVEAL_INTERVAL_MS);

  if (activeRevealIndex >= draw.charts.length) {
    return false;
  }

  return (
    elapsedMs - activeRevealIndex * STAGE_CHART_REVEAL_INTERVAL_MS <=
    STAGE_CHART_REVEAL_ANIMATION_GUARD_MS
  );
}

export function StageSetPanel({ set, draw, revealStartsAt, serverNowMs }: StageSetPanelProps) {
  const drawId = draw?.id ?? null;
  const [nowMs, setNowMs] = useState(serverNowMs ?? Date.now());
  const revealedCount = visibleCardCount(draw, revealStartsAt, nowMs);
  const revealAnimationActive = cardRevealAnimationActive(draw, revealStartsAt, nowMs);
  const cards = Array.from({ length: set.drawCount }, (_, index) =>
    draw && revealedCount > index ? (draw.charts[index] ?? null) : null,
  );
  const status = draw
    ? revealStartsAt === null
      ? "Queued for reveal"
      : revealedCount >= set.drawCount
        ? "Charts ready"
        : `Revealing ${revealedCount} / ${set.drawCount}`
    : "Awaiting host draw";

  useEffect(() => {
    if (!drawId || !revealStartsAt) {
      setNowMs(serverNowMs ?? Date.now());

      return;
    }

    const baseNowMs = serverNowMs ?? Date.now();
    const basePerformanceMs = window.performance.now();
    const updateNow = () => setNowMs(baseNowMs + window.performance.now() - basePerformanceMs);
    const intervalId = window.setInterval(updateNow, 250);

    updateNow();

    return () => window.clearInterval(intervalId);
  }, [drawId, revealStartsAt, serverNowMs]);

  return (
    <section
      className="metal-panel rounded-lg p-1.5 2xl:p-4"
      data-reveal-complete={
        !draw || revealStartsAt === undefined || revealedCount >= set.drawCount ? "true" : "false"
      }
      data-reveal-transition-active={revealAnimationActive ? "true" : "false"}
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
          />
        ))}
      </div>
    </section>
  );
}
