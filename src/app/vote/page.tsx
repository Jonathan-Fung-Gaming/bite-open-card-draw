import { RoundHeader } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { BallotFlow } from "./BallotFlow";

export const dynamic = "force-dynamic";

export default function VotePage() {
  const roundNumber = 1;
  const phoneStatus = adminState.ballotStore.getPhoneStatus(roundNumber);
  const players = adminState.rosterStore.listPlayers().filter((player) => player.active);
  const draws = adminState.drawStateStore
    .getRoundDraws(roundNumber)
    .filter((draw): draw is NonNullable<typeof draw> => draw !== null);
  const submittedPlayerIds = adminState.ballotStore.listForRound(roundNumber).map((ballot) => ballot.playerId);

  if (phoneStatus.phase === "closed_revealing") {
    return (
      <main className="min-h-screen">
        <RoundHeader title="Voting Closed" status={`Round ${roundNumber}`} />
        <section className="mx-auto max-w-2xl px-5 py-5">
          <div className="metal-panel rounded-lg p-5 text-center text-lg font-bold text-metal-300">
            Voting is closed. Results are being revealed on stage.
          </div>
        </section>
      </main>
    );
  }

  if (phoneStatus.phase === "revealed") {
    return (
      <main className="min-h-screen">
        <RoundHeader title={`Round ${roundNumber} Final Charts`} status="Results revealed" />
        <section className="mx-auto max-w-4xl px-5 py-5">
          <div className="metal-panel rounded-lg p-5">
            <div className="grid gap-3 md:grid-cols-2">
              {phoneStatus.selectedCharts.map((chart) => (
                <article key={chart.id} className="rounded border border-ember-300/30 bg-black/25 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
                    {chart.displayDifficulty}
                  </p>
                  <h2 className="mt-2 text-2xl font-black uppercase text-white">{chart.name}</h2>
                  <p className="mt-1 text-metal-300">{chart.artist}</p>
                </article>
              ))}
            </div>
            <details className="mt-4 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300">
              <summary className="cursor-pointer font-bold uppercase text-ember-300">Full ban counts</summary>
              <p className="mt-2">Ban counts are available after result computation.</p>
            </details>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <RoundHeader title="Player Ballot" status={`Round ${roundNumber}`} />
      <section className="mx-auto max-w-4xl px-5 py-5">
        <BallotFlow
          roundNumber={roundNumber}
          players={players}
          draws={draws}
          submittedPlayerIds={submittedPlayerIds}
        />
      </section>
    </main>
  );
}
