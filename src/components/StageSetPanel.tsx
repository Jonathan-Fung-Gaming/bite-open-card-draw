"use client";

import { useEffect, useRef, useState } from "react";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { getStageVisibleCardCount, STAGE_CHART_REVEAL_INTERVAL_MS } from "@/lib/stage/stage-view";
import type { RoundSetDefinition } from "@/lib/tournament";
import { StageDrawCard } from "./StageDrawCard";

const STAGE_CHART_REVEAL_ANIMATION_GUARD_MS = 700;

type StageSetPanelProps = {
  set: RoundSetDefinition;
  draw: DrawRecord | null;
  revealStartsAt?: string | null;
  serverNowMs?: number;
};

function activeCardRevealIndex(
  draw: DrawRecord | null,
  revealStartsAt: string | null | undefined,
  nowMs: number,
) {
  if (!draw || !revealStartsAt) {
    return null;
  }

  const elapsedMs = nowMs - Date.parse(revealStartsAt);

  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return null;
  }

  const activeRevealIndex = Math.floor(elapsedMs / STAGE_CHART_REVEAL_INTERVAL_MS);

  if (activeRevealIndex >= draw.charts.length) {
    return null;
  }

  return elapsedMs - activeRevealIndex * STAGE_CHART_REVEAL_INTERVAL_MS <=
    STAGE_CHART_REVEAL_ANIMATION_GUARD_MS
    ? activeRevealIndex
    : null;
}

export function StageSetPanel({ set, draw, revealStartsAt, serverNowMs }: StageSetPanelProps) {
  const drawId = draw?.id ?? null;
  const drawIdentity = draw ? `${draw.id}:${draw.version}` : null;
  const [nowMs, setNowMs] = useState(serverNowMs ?? Date.now());
  const revealedCount = getStageVisibleCardCount(draw?.charts.length ?? 0, revealStartsAt, nowMs);
  const canonicalActiveRevealIndex = activeCardRevealIndex(draw, revealStartsAt, nowMs);
  const previousRevealRef = useRef({ drawIdentity, revealedCount });
  const [enteringCardIndex, setEnteringCardIndex] = useState<number | null>(null);
  const revealAnimationActive =
    enteringCardIndex !== null && enteringCardIndex === canonicalActiveRevealIndex;
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

  useEffect(() => {
    const previous = previousRevealRef.current;
    const drawChanged = previous.drawIdentity !== drawIdentity;
    const revealedMoreCards = revealedCount > previous.revealedCount;
    const newlyEnteringCard = canonicalActiveRevealIndex === revealedCount - 1;

    setEnteringCardIndex((current) => {
      if ((drawChanged || revealedMoreCards) && newlyEnteringCard) {
        return canonicalActiveRevealIndex;
      }

      return current === canonicalActiveRevealIndex ? current : null;
    });
    previousRevealRef.current = { drawIdentity, revealedCount };
  }, [canonicalActiveRevealIndex, drawIdentity, revealedCount]);

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
            animateReveal={revealAnimationActive && enteringCardIndex === index}
            chart={chart ?? undefined}
          />
        ))}
      </div>
    </section>
  );
}
