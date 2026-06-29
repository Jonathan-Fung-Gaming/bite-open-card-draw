"use client";

import clsx from "clsx";
import type { CSSProperties } from "react";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import { TIEBREAK_REVEAL_DURATION_MS } from "@/lib/results/reveal-timing";
import { getRuneWheelFinalRotation } from "./rune-wheel-rotation";

type RuneWheelProps = {
  slots: DrawnChartSummary[];
  winnerChartId: string;
  winnerRevealed: boolean;
  winnerRevealStartedAt: string | null;
  nowMs: number;
  compact?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function revealProgress(startedAt: string | null, nowMs: number) {
  if (!startedAt) {
    return 0;
  }

  return clamp((nowMs - Date.parse(startedAt)) / TIEBREAK_REVEAL_DURATION_MS, 0, 1);
}

export function RuneWheel({
  slots,
  winnerChartId,
  winnerRevealed,
  winnerRevealStartedAt,
  nowMs,
  compact = false,
}: RuneWheelProps) {
  const winner = slots.find((slot) => slot.id === winnerChartId);
  const progress = revealProgress(winnerRevealStartedAt, nowMs);
  const slotAngle = slots.length > 0 ? 360 / slots.length : 0;
  const winnerSlotIndex = slots.findIndex((slot) => slot.id === winnerChartId);
  const finalRotation = getRuneWheelFinalRotation(slots.length, winnerSlotIndex);
  const wheelStyle = {
    transform: `rotate(${progress * finalRotation}deg)`,
    "--rune-wheel-duration": `${TIEBREAK_REVEAL_DURATION_MS}ms`,
  } as CSSProperties;

  return (
    <div
      className={clsx("overflow-hidden rounded border border-ember-300/35 bg-black/30", compact ? "p-2" : "p-3")}
      data-testid="rune-wheel"
      data-winner-revealed={winnerRevealed ? "true" : "false"}
    >
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ember-300">Rune-wheel tiebreak</p>
      <div className={clsx("flex justify-center rounded border border-metal-700 bg-furnace-900", compact ? "mt-2 p-2" : "mt-3 p-3")}>
        <div className={clsx("rune-wheel-shell", compact && "rune-wheel-shell-compact")}>
          <div className="rune-wheel-pointer" aria-hidden="true" />
          <div className="rune-wheel-circle" style={wheelStyle}>
            <div className="rune-wheel-hub" aria-hidden="true" />
            {slots.map((slot, index) => (
              <div
                key={`${slot.id}-${index}`}
                style={
                  {
                    "--rune-slot-angle": `${index * slotAngle}deg`,
                    "--rune-slot-counter-angle": `${index * -slotAngle}deg`,
                  } as CSSProperties
                }
                data-testid="rune-wheel-slot"
                className={clsx(
                  "rune-wheel-slot rounded border bg-black/65 p-2 text-center text-[10px] font-black uppercase text-white",
                  winnerRevealed && slot.id === winnerChartId
                    ? "border-ember-300 shadow-ember-tight"
                    : "border-metal-700",
                )}
              >
                <p className="font-mono text-ember-300">{String(index + 1).padStart(2, "0")}</p>
                <p className="mt-1 line-clamp-2">
                  {slot.name}
                </p>
              </div>
            ))}
          </div>
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
