import { PublicResultSummary, RoundHeader } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { getAuthoritativeNowMs } from "@/lib/server/authoritative-clock";
import { hydrateTournamentState } from "@/lib/server/persistence";
import {
  getRoundDrawRecords,
  getVotingRoundSnapshot,
} from "@/lib/server/voting-round";
import { shouldShowFinalPhoneResults } from "@/lib/vote/phone-view";
import { formatVotingStatusLabel, formatVotingTime } from "@/lib/vote/voting-window";
import { BallotFlow } from "./BallotFlow";
import { VoteAutoRefresh } from "./VoteAutoRefresh";

export const dynamic = "force-dynamic";

export default async function VotePage() {
  await hydrateTournamentState();

  const { currentRound: roundNumber } = adminState.roundStateStore.getSnapshot();
  const nowMs = await getAuthoritativeNowMs();
  const snapshot = getVotingRoundSnapshot(roundNumber, nowMs);
  const draws = getRoundDrawRecords(roundNumber);
  const phoneStatus = adminState.ballotStore.getPhoneStatus(roundNumber);
  const result = adminState.resultStore.getRoundResult(roundNumber);
  const showFinalPhoneResults = shouldShowFinalPhoneResults(snapshot.status, result?.revealPhase);

  if (snapshot.status === "voting_paused") {
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

  if (
    snapshot.status === "voting_closed" ||
    snapshot.status === "results_computed" ||
    snapshot.status === "results_revealing"
  ) {
    return (
      <main className="min-h-screen">
        <VoteAutoRefresh />
        <RoundHeader title="Voting Closed" status={`Round ${roundNumber}`} />
        <section className="mx-auto max-w-2xl px-5 py-5">
          <div className="metal-panel rounded-lg p-5 text-center text-lg font-bold text-metal-300">
            <p>Voting is closed.</p>
            <p>Results are being revealed on stage.</p>
          </div>
        </section>
      </main>
    );
  }

  if (snapshot.status === "results_revealed" || showFinalPhoneResults) {
    return (
      <main className="min-h-screen">
        <VoteAutoRefresh />
        <RoundHeader
          title={`Round ${roundNumber} Final Charts`}
          status={formatVotingStatusLabel(snapshot.status)}
        />
        <section className="mx-auto max-w-4xl px-5 py-5">
          {result && showFinalPhoneResults ? (
            <PublicResultSummary result={result} selectedCardTestId="phone-final-chart-card" />
          ) : (
            <div className="metal-panel rounded-lg p-5">
              <p className="text-metal-300">
                Final charts will appear here after result computation stores them.
              </p>
              {phoneStatus.phase === "revealed" ? (
                <p className="mt-3 text-sm text-metal-300">
                  Phone reveal state is ready; the committed result snapshot is still loading.
                </p>
              ) : null}
            </div>
          )}
        </section>
      </main>
    );
  }

  if (!snapshot.canSubmit) {
    const message =
      snapshot.status === "ready_to_vote"
        ? "Both chart sets are drawn. Waiting for the host to open voting."
        : "Both chart sets must be drawn before voting opens.";

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
          timerText={formatVotingTime(snapshot.remainingMs)}
          turnoutText={`Ballots submitted: ${snapshot.submittedCount} / ${snapshot.eligibleCount}`}
          canSubmit={snapshot.canSubmit}
        />
      </section>
    </main>
  );
}
