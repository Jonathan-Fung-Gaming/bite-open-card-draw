"use client";

import clsx from "clsx";
import { useAuthoritativeCountdown } from "@/lib/client/use-authoritative-countdown";
import type { AuthoritativeCountdownSample } from "@/lib/vote/authoritative-countdown";
import { formatVotingTime } from "@/lib/vote/voting-window";

type CountdownTimerProps = {
  label: string;
  minutes?: string;
  caption?: string;
  sample?: AuthoritativeCountdownSample | null;
  compact?: boolean;
};

export function CountdownTimer({
  label,
  minutes,
  caption,
  sample = null,
  compact = false,
}: CountdownTimerProps) {
  const countdown = useAuthoritativeCountdown(sample);
  const shouldRenderIncomingSample = Boolean(
    sample &&
    (countdown.acceptedRoundNumber === null ||
      countdown.acceptedRoundNumber !== sample.roundNumber ||
      countdown.acceptedRevision === null ||
      sample.revision > countdown.acceptedRevision),
  );
  const displayedRemainingMs = shouldRenderIncomingSample
    ? (sample?.remainingMs ?? 0)
    : countdown.remainingMs;
  const displayedRevision = shouldRenderIncomingSample
    ? (sample?.revision ?? null)
    : countdown.acceptedRevision;
  const displayedStatus = shouldRenderIncomingSample
    ? (sample?.status ?? null)
    : countdown.acceptedStatus;
  const display = sample ? formatVotingTime(displayedRemainingMs) : (minutes ?? "--:--");

  return (
    <div
      className={clsx(
        "metal-panel rounded-lg",
        compact ? "flex min-h-[10rem] flex-col justify-between px-4 py-3" : "px-5 py-4",
      )}
      data-countdown-revision={displayedRevision ?? "none"}
      data-countdown-status={displayedStatus ?? "none"}
      data-testid="stage-countdown"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">{label}</p>
      <div
        className={clsx(
          "font-mono font-black leading-none tabular-nums text-white",
          compact ? "mt-2 text-7xl md:text-[7.5rem] 2xl:text-[9rem]" : "mt-2 text-5xl sm:text-7xl",
        )}
        data-testid="stage-countdown-display"
      >
        {display}
      </div>
      {caption ? <p className="mt-1 text-sm text-metal-300">{caption}</p> : null}
    </div>
  );
}
