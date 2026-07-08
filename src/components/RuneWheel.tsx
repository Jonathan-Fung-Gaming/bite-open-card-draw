"use client";

import clsx from "clsx";
import { useEffect, useState, type CSSProperties } from "react";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import { TIEBREAK_REVEAL_DURATION_MS } from "@/lib/results/reveal-timing";
import { ChartArtImage } from "./ChartArtImage";
import { getRuneWheelFinalRotation } from "./rune-wheel-rotation";

type RuneWheelProps = {
  slots: DrawnChartSummary[];
  winnerChartId: string;
  winnerRevealed: boolean;
  compact?: boolean;
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
  stageMode = false,
}: RuneWheelProps) {
  const winner = slots.find((slot) => slot.id === winnerChartId);
  const slotAngle = slots.length > 0 ? 360 / slots.length : 0;
  const winnerSlotIndex = slots.findIndex((slot) => slot.id === winnerChartId);
  const finalRotation = getRuneWheelFinalRotation(slots.length, winnerSlotIndex);
  const [animationProgress, setAnimationProgress] = useState(winnerRevealed ? 1 : 0);
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

    let animationFrame = 0;
    const startedAt = window.performance.now();

    setAnimationProgress(0);

    const tick = () => {
      const elapsedMs = window.performance.now() - startedAt;
      const nextProgress = clamp(elapsedMs / TIEBREAK_REVEAL_DURATION_MS, 0, 1);

      setAnimationProgress(nextProgress);

      if (nextProgress < 1) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    animationFrame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [slots.length, winnerChartId, winnerRevealed]);

  return (
    <div
      className={clsx(
        "overflow-hidden rounded border border-ember-300/35 bg-black/30",
        stageMode && "w-full max-w-[42rem]",
        stageMode ? "p-4" : compact ? "p-2" : "p-3",
      )}
      data-testid="rune-wheel"
      data-winner-revealed={winnerRevealed ? "true" : "false"}
      data-winner-slot-index={winnerSlotIndex}
    >
      <p
        className={clsx(
          "font-bold uppercase tracking-[0.18em] text-ember-300",
          stageMode ? "text-2xl" : "text-xs",
        )}
      >
        Rune-wheel tiebreak
      </p>
      <div
        className={clsx(
          "flex justify-center rounded border border-metal-700 bg-furnace-900",
          stageMode ? "mt-3 p-3" : compact ? "mt-2 p-2" : "mt-3 p-3",
        )}
      >
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
            <div className="rune-wheel-hub" aria-hidden="true" />
            {slots.map((slot, index) => {
              const selectedSlot = winnerRevealed && index === winnerSlotIndex;

              return (
                <div
                  key={`${slot.id}-${index}`}
                  style={
                    {
                      "--rune-slot-angle": `${index * slotAngle}deg`,
                      "--rune-slot-counter-angle": `${index * -slotAngle}deg`,
                    } as CSSProperties
                  }
                  aria-label={slot.name}
                  data-chart-id={slot.id}
                  data-slot-winner={selectedSlot ? "true" : "false"}
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
        </div>
      </div>
      <p
        className={clsx("mt-3 font-bold text-white", stageMode ? "text-3xl" : "text-sm")}
        data-testid="rune-wheel-status"
      >
        {winnerRevealed ? (
          <>
            Selected chart:{" "}
            <span className="text-ember-300">{winner?.name ?? winnerChartId}</span>
          </>
        ) : (
          "Selector locking onto the sealed chart."
        )}
      </p>
    </div>
  );
}
