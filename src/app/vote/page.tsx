import type { Metadata } from "next";
import { PublicResultSummary, RoundHeader } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { getAuthoritativeNowMs } from "@/lib/server/authoritative-clock";
import { hydrateTournamentState } from "@/lib/server/persistence";
import {
  advanceVotingTimerIfDue,
  getRoundDrawRecords,
  getVotingRoundSnapshot,
} from "@/lib/server/voting-round";
import {
  PUBLIC_INSPECTION_REFRESH_INTERVAL_MS,
  shouldShowFinalPhoneResults,
  shouldShowPhoneResultHoldingState,
} from "@/lib/vote/phone-view";
import { formatVotingStatusLabel, formatVotingTime } from "@/lib/vote/voting-window";
import { BallotFlow } from "./BallotFlow";
import { VoteAutoRefresh } from "./VoteAutoRefresh";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Player Voting",
};

export default async function VotePage() {
  await hydrateTournamentState();

  const { currentRound: roundNumber } = adminState.roundStateStore.getSnapshot();
  const nowMs = await getAuthoritativeNowMs();
  await advanceVotingTimerIfDue(roundNumber, nowMs);
  const snapshot = getVotingRoundSnapshot(roundNumber, nowMs);
  const draws = getRoundDrawRecords(roundNumber);
  const phoneStatus = adminState.ballotStore.getPhoneStatus(roundNumber);
  const result = adminState.resultStore.getRoundResult(roundNumber);
  const showFinalPhoneResults = shouldShowFinalPhoneResults(snapshot.status, result?.revealPhase);
  const showResultHoldingState = shouldShowPhoneResultHoldingState(
    snapshot.status,
    result?.revealPhase,
  );

  if (snapshot.status === "voting_paused" && draws.length !== 2) {
    return (
      <main className="min-h-screen">
        <VoteAutoRefresh />
        <RoundHeader title="Voting Paused" status={`Round ${roundNumber}`} />
        <section className="mx-auto max-w-2xl px-5 py-5">
          <div className="metal-panel rounded-lg p-5 text-center text-lg font-bold text-metal-300">
            Voting is paused. The timer and ballot changes are frozen until the host resumes.
          </div>
        </section>
      </main>
    );
  }

  if (showFinalPhoneResults && result) {
    return (
      <main className="min-h-screen">
        <VoteAutoRefresh intervalMs={PUBLIC_INSPECTION_REFRESH_INTERVAL_MS} />
        <RoundHeader
          title={`Round ${roundNumber} Final Charts`}
          status={formatVotingStatusLabel(snapshot.status)}
        />
        <section className="mx-auto max-w-4xl px-5 py-5">
          <PublicResultSummary result={result} selectedCardTestId="phone-final-chart-card" />
        </section>
      </main>
    );
  }

  if (showResultHoldingState) {
    const missingFinalResult =
      snapshot.status === "results_revealed" || snapshot.status === "round_complete";

    return (
      <main className="min-h-screen">
        <VoteAutoRefresh />
        <RoundHeader
          title={missingFinalResult ? `Round ${roundNumber} Final Charts` : "Voting Closed"}
          status={
            missingFinalResult ? formatVotingStatusLabel(snapshot.status) : `Round ${roundNumber}`
          }
        />
        <section className="mx-auto max-w-2xl px-5 py-5">
          <div className="metal-panel rounded-lg p-5 text-center text-lg font-bold text-metal-300">
            {missingFinalResult ? (
              <>
                <p>Final charts will appear here once the host releases them.</p>
                {phoneStatus.phase === "revealed" ? (
                  <p className="mt-3 text-sm text-metal-300">
                    Keep this page open; it will update after the host finishes the stage check.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p>Voting is closed.</p>
                <p>Results are being revealed on stage.</p>
              </>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (!snapshot.canSubmit && snapshot.status !== "voting_paused") {
    const message =
      snapshot.status === "ready_to_vote"
        ? "Both chart sets are drawn. The host has not opened the 10-minute voting window yet. Keep this page open; the ballot will appear when voting starts."
        : "The host is drawing the two chart sets. Voting opens only after both sets are ready.";

    return (
      <main className="min-h-screen">
        <VoteAutoRefresh />
        <RoundHeader title="Player Ballot" status={`Round ${roundNumber}`} />
        <section className="mx-auto max-w-2xl px-5 py-5">
          <div className="metal-panel rounded-lg p-5 text-lg font-bold text-metal-300">
            {message}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <VoteAutoRefresh
        enabled={
          !snapshot.canSubmit || process.env.NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING === "true"
        }
      />
      <RoundHeader
        title="Player Ballot"
        status={`${formatVotingStatusLabel(snapshot.status)} - Round ${roundNumber}`}
      />
      <section className="mx-auto max-w-4xl px-5 py-5">
        <BallotFlow
          roundNumber={roundNumber}
          players={snapshot.eligiblePlayers}
          draws={draws}
          statusLabel={formatVotingStatusLabel(snapshot.status)}
          status={snapshot.status}
          timerText={formatVotingTime(snapshot.remainingMs)}
          turnoutText={`Ballots submitted: ${snapshot.submittedCount} / ${snapshot.eligibleCount}`}
          canSubmit={snapshot.canSubmit}
        />
      </section>
    </main>
  );
}
