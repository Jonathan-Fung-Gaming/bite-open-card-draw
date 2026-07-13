"use client";

import clsx from "clsx";
import { useEffect, useState, type CSSProperties } from "react";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import {
  TIEBREAK_REVEAL_DURATION_MS,
  getTiebreakRevealProgress,
} from "@/lib/results/reveal-timing";
import { ChartArtImage } from "./ChartArtImage";
import { getRuneWheelFinalRotation, getRuneWheelRadialImageRotation } from "./rune-wheel-rotation";

type RuneWheelProps = {
  slots: DrawnChartSummary[];
  winnerChartId: string;
  winnerRevealed: boolean;
  compact?: boolean;
  revealStartedAt?: string | null;
  serverNowMs?: number;
  stageMode?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

export function RuneWheel({
  slots,
  winnerChartId,
  winnerRevealed,
  compact = false,
  revealStartedAt,
  serverNowMs,
  stageMode = false,
}: RuneWheelProps) {
  const winner = slots.find((slot) => slot.id === winnerChartId);
  const winnerSlotIndex = slots.findIndex((slot) => slot.id === winnerChartId);
  const finalRotation = getRuneWheelFinalRotation(slots.length, winnerSlotIndex);
  const revealTimingValid = getTiebreakRevealProgress(
    revealStartedAt,
    serverNowMs ?? Date.now(),
  ).hasValidStart;
  const [animationProgress, setAnimationProgress] = useState(() =>
    winnerRevealed
      ? 1
      : getTiebreakRevealProgress(revealStartedAt, serverNowMs ?? Date.now()).progress,
  );
  const progress = winnerRevealed ? 1 : easeOutCubic(animationProgress);
  const wheelStyle = {
    transform: `rotate(${progress * finalRotation}deg)`,
    "--rune-wheel-duration": `${TIEBREAK_REVEAL_DURATION_MS}ms`,
  } as CSSProperties;

  useEffect(() => {
    if (winnerRevealed) {
      setAnimationProgress(1);
      return undefined;
    }

    const baseNowMs = serverNowMs ?? Date.now();
    const initialProgress = getTiebreakRevealProgress(revealStartedAt, baseNowMs);

    setAnimationProgress(initialProgress.progress);

    if (!initialProgress.hasValidStart || initialProgress.complete) {
      return undefined;
    }

    let animationFrame = 0;
    const basePerformanceMs = window.performance.now();

    const tick = () => {
      const nextNowMs = baseNowMs + window.performance.now() - basePerformanceMs;
      const nextProgress = getTiebreakRevealProgress(revealStartedAt, nextNowMs);

      setAnimationProgress(nextProgress.progress);

      if (!nextProgress.complete) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    animationFrame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [revealStartedAt, serverNowMs, slots.length, winnerChartId, winnerRevealed]);

  return (
    <div
      className={clsx(
        "relative overflow-visible bg-transparent",
        stageMode && "w-full max-w-[54rem]",
        stageMode ? "px-2 py-3" : compact ? "p-1" : "p-2",
      )}
      data-authoritative-reveal-progress={clamp(animationProgress, 0, 1).toFixed(4)}
      data-reveal-timing-valid={revealTimingValid ? "true" : "false"}
      data-testid="rune-wheel"
      data-winner-revealed={winnerRevealed ? "true" : "false"}
      data-winner-slot-index={winnerSlotIndex}
    >
      <div className={clsx("flex justify-center", stageMode ? "p-3" : compact ? "p-1" : "p-2")}>
        <div
          className={clsx(
            "rune-wheel-shell",
            compact && !stageMode && "rune-wheel-shell-compact",
            stageMode && "rune-wheel-shell-stage",
          )}
        >
          <div className="rune-wheel-pointer" aria-hidden="true" />
          <div className="rune-wheel-selector" aria-hidden="true" />
          <div className="rune-wheel-circle" style={wheelStyle}>
            {slots.map((slot, index) => {
              const selectedSlot = winnerRevealed && index === winnerSlotIndex;
              const slotRotation = getRuneWheelRadialImageRotation(slots.length, index);

              return (
                <div
                  key={`${slot.id}-${index}`}
                  style={
                    {
                      "--rune-slot-angle": `${slotRotation}deg`,
                    } as CSSProperties
                  }
                  aria-label={slot.name}
                  data-chart-id={slot.id}
                  data-image-bottom-faces-center="true"
                  data-slot-winner={selectedSlot ? "true" : "false"}
                  data-slot-radial-image-rotation-deg={slotRotation}
                  data-testid="rune-wheel-slot"
                  className={clsx("rune-wheel-slot", selectedSlot && "rune-wheel-slot-selected")}
                >
                  <div className="rune-wheel-slot-frame">
                    <ChartArtImage
                      src={slot.localImagePath ?? FALLBACK_CHART_IMAGE_PATH}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rune-wheel-center" data-testid="rune-wheel-center">
            <p
              className={clsx(
                "rune-wheel-status font-bold text-white",
                stageMode
                  ? winnerRevealed
                    ? "text-4xl"
                    : "text-3xl"
                  : compact
                    ? "text-xs"
                    : "text-sm",
              )}
              data-testid="rune-wheel-status"
            >
              {winnerRevealed ? (
                <span className="text-ember-300">{winner?.name ?? winnerChartId}</span>
              ) : !revealTimingValid ? (
                "Waiting for authoritative reveal timing."
              ) : (
                "Tiebreak selector is spinning."
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
