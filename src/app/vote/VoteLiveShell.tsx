"use client";

import { useCallback, useEffect, useState } from "react";
import { TournamentLogo } from "@/components";
import { formatVotingTime } from "@/lib/vote/voting-window";
import { BallotFlow, type VoteLiveState } from "./BallotFlow";
import type { BallotFlowProps } from "./BallotFlow";

type VoteLiveShellProps = BallotFlowProps & {
  title: string;
};

function VoteDenseHeader({
  meta,
  status,
  title,
}: {
  meta?: string;
  status: string;
  title: string;
}) {
  return (
    <header
      className="flex items-center gap-3 border-b border-ember-300/15 px-3 py-2 sm:px-5"
      data-testid="vote-dense-header"
    >
      <TournamentLogo priority className="shrink-0" size="compact" />
      <div className="min-w-0 flex-1 text-right">
        <p className="truncate text-xs font-semibold uppercase text-ember-300">{status}</p>
        <h1 className="mt-0.5 truncate text-xl font-black uppercase leading-none text-white sm:text-3xl">
          {title}
        </h1>
        {meta ? (
          <p className="mt-1 truncate text-xs font-semibold uppercase text-metal-300">{meta}</p>
        ) : null}
      </div>
    </header>
  );
}

export function VoteLiveShell({ title, ...ballotProps }: VoteLiveShellProps) {
  const [liveState, setLiveState] = useState<VoteLiveState>({
    canSubmit: ballotProps.canSubmit,
    closesAt: ballotProps.closesAt,
    eligibleCount: ballotProps.eligibleCount,
    remainingMs: ballotProps.remainingMs,
    serverNowMs: ballotProps.serverNowMs,
    status: ballotProps.status,
    statusLabel: ballotProps.statusLabel,
    submittedCount: ballotProps.submittedCount,
    timerText: ballotProps.timerText,
    turnoutText: ballotProps.turnoutText,
  });
  const [visualNowMs, setVisualNowMs] = useState(ballotProps.serverNowMs);

  const handleLiveStateChange = useCallback((state: VoteLiveState) => {
    setLiveState(state);
  }, []);

  useEffect(() => {
    const baseNowMs = liveState.serverNowMs;
    const basePerformanceMs = window.performance.now();
    const updateNow = () => setVisualNowMs(baseNowMs + window.performance.now() - basePerformanceMs);

    updateNow();

    if (!liveState.canSubmit || !liveState.closesAt) {
      return undefined;
    }

    const intervalId = window.setInterval(updateNow, 1000);

    return () => window.clearInterval(intervalId);
  }, [liveState.canSubmit, liveState.closesAt, liveState.serverNowMs]);

  const targetMs = liveState.closesAt ? Date.parse(liveState.closesAt) : NaN;
  const timerText =
    liveState.canSubmit && Number.isFinite(targetMs)
      ? formatVotingTime(targetMs - visualNowMs)
      : liveState.timerText;

  return (
    <>
      <VoteDenseHeader
        title={title}
        status={`${liveState.statusLabel} - Round ${ballotProps.roundNumber}`}
        meta={`${timerText} | ${liveState.submittedCount}/${liveState.eligibleCount} ballots`}
      />
      <section className="mx-auto max-w-4xl px-3 py-3 sm:px-5 sm:py-5">
        <BallotFlow {...ballotProps} onLiveStateChange={handleLiveStateChange} />
      </section>
    </>
  );
}
