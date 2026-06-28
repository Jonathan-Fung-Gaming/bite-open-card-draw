import { RoundHeader } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import {
  getRoundDrawRecords,
  getSubmittedPlayerIdsForRound,
  getVotingRoundSnapshot,
} from "@/lib/server/voting-round";
import { formatVotingTime, type VotingRoundSnapshot } from "@/lib/vote/voting-window";
import { BallotFlow } from "./BallotFlow";

export const dynamic = "force-dynamic";

function votingStatusLabel(snapshot: VotingRoundSnapshot) {
  switch (snapshot.status) {
    case "final_30_seconds":
      return "Final 30 seconds";
    case "extension_1_minute":
      return "One-minute extension";
    case "voting_open":
      return "Voting open";
    default:
      return "Voting";
  }
}

export default function VotePage() {
  const roundNumber = 1;
  const snapshot = getVotingRoundSnapshot(roundNumber);
  const draws = getRoundDrawRecords(roundNumber);
  const submittedPlayerIds = getSubmittedPlayerIdsForRound(roundNumber);
  const phoneStatus = adminState.ballotStore.getPhoneStatus(roundNumber);
  const result = adminState.resultStore.getRoundResult(roundNumber);

  if (snapshot.status === "voting_paused") {
    return (
      <main className="min-h-screen">
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

  if (snapshot.status === "results_revealed") {
    const selectedCharts =
      result?.revealPhase === "final"
        ? result.sets.map((set) => set.selectedChart)
        : phoneStatus.phase === "revealed"
          ? phoneStatus.selectedCharts
          : [];

    return (
      <main className="min-h-screen">
        <RoundHeader title={`Round ${roundNumber} Final Charts`} status="Results revealed" />
        <section className="mx-auto max-w-4xl px-5 py-5">
          <div className="metal-panel rounded-lg p-5">
            {selectedCharts.length === 2 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {selectedCharts.map((chart) => (
                  <article key={chart.id} className="rounded border border-ember-300/30 bg-black/25 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
                      {chart.displayDifficulty}
                    </p>
                    <h2 className="mt-2 text-2xl font-black uppercase text-white">{chart.name}</h2>
                    <p className="mt-1 text-metal-300">{chart.artist}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-metal-300">Final charts will appear here after result computation stores them.</p>
            )}
            <details className="mt-4 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300">
              <summary className="cursor-pointer font-bold uppercase text-ember-300">Full ban counts</summary>
              {result?.revealPhase === "final" ? (
                <div className="mt-3 grid gap-3">
                  {result.sets.map((set) => (
                    <div key={set.roundSetId}>
                      <p className="font-bold text-white">{set.displayLabel}</p>
                      <ol className="mt-2 grid gap-1">
                        {set.rows.map((row) => (
                          <li key={row.chart.id} className="flex justify-between gap-3">
                            <span>{row.chart.name}</span>
                            <span className="font-mono text-ember-300">{row.banCount}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2">Ban counts are available after result computation.</p>
              )}
            </details>
          </div>
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
        <RoundHeader title="Player Ballot" status={`Round ${roundNumber}`} />
        <section className="mx-auto max-w-2xl px-5 py-5">
          <div className="metal-panel rounded-lg p-5 text-lg font-bold text-metal-300">{message}</div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <RoundHeader title="Player Ballot" status={`${votingStatusLabel(snapshot)} - Round ${roundNumber}`} />
      <section className="mx-auto max-w-4xl px-5 py-5">
        <BallotFlow
          roundNumber={roundNumber}
          players={snapshot.eligiblePlayers}
          draws={draws}
          submittedPlayerIds={submittedPlayerIds}
          statusLabel={votingStatusLabel(snapshot)}
          timerText={formatVotingTime(snapshot.remainingMs)}
          turnoutText={`Ballots submitted: ${snapshot.submittedCount} / ${snapshot.eligibleCount}`}
        />
      </section>
    </main>
  );
}
