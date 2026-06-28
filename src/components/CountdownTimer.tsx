"use client";

import { useEffect, useState } from "react";
import { formatVotingTime } from "@/lib/vote/voting-window";

type CountdownTimerProps = {
  label: string;
  minutes?: string;
  caption?: string;
  targetTime?: string | null;
  paused?: boolean;
};

export function CountdownTimer({ label, minutes, caption, targetTime, paused = false }: CountdownTimerProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!targetTime || paused) {
      return undefined;
    }

    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);

    return () => window.clearInterval(intervalId);
  }, [paused, targetTime]);

  const targetMs = targetTime ? Date.parse(targetTime) : null;
  const display = targetMs === null || paused ? (minutes ?? "--:--") : formatVotingTime(targetMs - nowMs);

  return (
    <div className="metal-panel rounded-lg px-5 py-4" data-testid="stage-countdown">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">{label}</p>
      <div
        className="mt-2 font-mono text-5xl font-black tabular-nums text-white sm:text-7xl"
        data-testid="stage-countdown-display"
      >
        {display}
      </div>
      {caption ? <p className="mt-2 text-sm text-metal-300">{caption}</p> : null}
    </div>
  );
}
