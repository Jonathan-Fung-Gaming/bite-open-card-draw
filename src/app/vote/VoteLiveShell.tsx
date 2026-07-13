"use client";

import { useCallback, useState, type ReactNode } from "react";
import { TournamentLogo } from "@/components";
import { useAuthoritativeCountdown } from "@/lib/client/use-authoritative-countdown";
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
  meta?: ReactNode;
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
    revision: ballotProps.publicStateGeneration,
    serverNowMs: ballotProps.serverNowMs,
    status: ballotProps.status,
    statusLabel: ballotProps.statusLabel,
    submittedCount: ballotProps.submittedCount,
    timerText: ballotProps.timerText,
    turnoutText: ballotProps.turnoutText,
  });

  const handleLiveStateChange = useCallback((state: VoteLiveState) => {
    setLiveState(state);
  }, []);

  const countdown = useAuthoritativeCountdown({
    roundNumber: ballotProps.roundNumber,
    revision: liveState.revision,
    status: liveState.status,
    deadline: liveState.closesAt,
    serverNowMs: liveState.serverNowMs,
    remainingMs: liveState.remainingMs,
  });
  const timerText = formatVotingTime(countdown.remainingMs);

  return (
    <>
      <VoteDenseHeader
        title={title}
        status={`${liveState.statusLabel} - Round ${ballotProps.roundNumber}`}
        meta={
          <>
            <span
              data-countdown-decision={countdown.lastSampleDecision ?? "pending"}
              data-countdown-revision={countdown.acceptedRevision ?? "none"}
              data-countdown-status={countdown.acceptedStatus ?? "none"}
              data-testid="phone-countdown-display"
            >
              {timerText}
            </span>{" "}
            | {liveState.submittedCount}/{liveState.eligibleCount} ballots
          </>
        }
      />
      <section className="mx-auto max-w-4xl px-3 py-3 sm:px-5 sm:py-5">
        <BallotFlow
          {...ballotProps}
          onLiveStateChange={handleLiveStateChange}
          visualTimerText={timerText}
        />
      </section>
    </>
  );
}
