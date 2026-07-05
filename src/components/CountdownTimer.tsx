"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { formatVotingTime } from "@/lib/vote/voting-window";

type CountdownTimerProps = {
  label: string;
  minutes?: string;
  caption?: string;
  targetTime?: string | null;
  serverNowMs?: number;
  paused?: boolean;
  compact?: boolean;
};

export function CountdownTimer({
  label,
  minutes,
  caption,
  targetTime,
  serverNowMs,
  paused = false,
  compact = false,
}: CountdownTimerProps) {
  const [nowMs, setNowMs] = useState(() => serverNowMs ?? Date.now());

  useEffect(() => {
    if (!targetTime || paused) {
      return undefined;
    }

    const baseNowMs = serverNowMs ?? Date.now();
    const basePerformanceMs = window.performance.now();
    const updateNow = () => setNowMs(baseNowMs + window.performance.now() - basePerformanceMs);
    const intervalId = window.setInterval(updateNow, 1000);

    updateNow();

    return () => window.clearInterval(intervalId);
  }, [paused, serverNowMs, targetTime]);

  const targetMs = targetTime ? Date.parse(targetTime) : null;
  const display =
    targetMs === null || paused ? (minutes ?? "--:--") : formatVotingTime(targetMs - nowMs);

  return (
    <div
      className={clsx(
        "metal-panel rounded-lg",
        compact ? "flex min-h-60 flex-col justify-between px-5 py-4" : "px-5 py-4",
      )}
      data-testid="stage-countdown"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">{label}</p>
      <div
        className={clsx(
          "font-mono font-black leading-none tabular-nums text-white",
          compact
            ? "mt-3 text-7xl md:text-[7.5rem] 2xl:text-[9rem]"
            : "mt-2 text-5xl sm:text-7xl",
        )}
        data-testid="stage-countdown-display"
      >
        {display}
      </div>
      {caption ? <p className="mt-2 text-sm text-metal-300">{caption}</p> : null}
    </div>
  );
}
