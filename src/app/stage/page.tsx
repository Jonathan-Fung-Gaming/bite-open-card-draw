import { CountdownTimer, QRPanel, ResultSetPanel, RoundHeader, StageDrawCard, StageSetPanel } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { getVotingRoundSnapshot } from "@/lib/server/voting-round";
import { buildStageRoundView } from "@/lib/stage/stage-view";
import { formatVotingTime, type VotingRoundSnapshot } from "@/lib/vote/voting-window";

export const dynamic = "force-dynamic";

function stageStatus(snapshot: VotingRoundSnapshot, bothSetsDrawn: boolean) {
  if (!bothSetsDrawn) {
    return "Awaiting host draw";
  }

  switch (snapshot.status) {
    case "ready_to_vote":
      return "Both sets drawn - ready to vote";
    case "voting_open":
      return "Voting open";
    case "final_30_seconds":
      return "Final 30 seconds";
    case "extension_1_minute":
      return "One-minute extension";
    case "voting_paused":
      return "Voting paused";
    case "voting_closed":
      return "Voting closed";
    case "results_computed":
      return "Results computed";
    case "results_revealing":
      return "Results revealing";
    case "results_revealed":
      return "Results revealed";
    default:
      return "Awaiting host";
  }
}

function stageTimerCaption(snapshot: VotingRoundSnapshot, bothSetsDrawn: boolean) {
  if (!bothSetsDrawn) {
    return "Draw both sets before voting.";
  }

  const turnout = `Ballots submitted: ${snapshot.submittedCount} / ${snapshot.eligibleCount}`;
  const bans = `Ban selections cast: ${snapshot.banSelectionsCast}`;

  if (snapshot.status === "voting_paused") {
    return `${turnout}. ${bans}. Timer paused by host.`;
  }

  if (snapshot.status === "extension_1_minute") {
    return `${turnout}. ${bans}. Turnout was below 75%, so the one-time extension is active.`;
  }

  if (snapshot.status === "final_30_seconds") {
    return `${turnout}. ${bans}. All eligible players submitted; final changes are open.`;
  }

  return `${turnout}. ${bans}. One window covers both sets.`;
}

function revealLabel(phase: string) {
  switch (phase) {
    case "set_1_counts":
      return "Set 1 counts";
    case "set_1_resolved":
      return "Set 1 selected";
    case "set_2_counts":
      return "Set 2 counts";
    case "set_2_resolved":
      return "Set 2 selected";
    case "final":
      return "Final charts";
    default:
      return "Awaiting reveal";
  }
}

export default function StagePage() {
  const roundNumber = 1;
  const view = buildStageRoundView(adminState.drawStateStore, roundNumber);
  const snapshot = getVotingRoundSnapshot(roundNumber);
  const result = adminState.resultStore.getRoundResult(roundNumber);

  if (result) {
    const [setOne, setTwo] = result.sets;

    if (result.revealPhase === "final") {
      return (
        <main className="min-h-screen">
          <RoundHeader title={`ROUND ${roundNumber} FINAL CHARTS`} status="Stable final screen" />
          <section className="grid gap-5 px-5 py-5 lg:grid-cols-[1fr_280px] lg:px-8">
            <div className="grid gap-5 md:grid-cols-2">
              {result.sets.map((set, index) => (
                <StageDrawCard key={set.roundSetId} chart={set.selectedChart} index={index + 1} />
              ))}
            </div>
            <aside className="grid content-start gap-5">
              <div className="metal-panel rounded-lg p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">Selected</p>
                <p className="mt-2 text-sm text-metal-300">Final two charts are visible on stage.</p>
              </div>
              <QRPanel />
            </aside>
          </section>
        </main>
      );
    }

    return (
      <main className="min-h-screen">
        <RoundHeader title={`Round ${roundNumber} Results Reveal`} status={revealLabel(result.revealPhase)} />
        <section className="grid gap-5 px-5 py-5 lg:grid-cols-[1fr_280px] lg:px-8">
          <div className="grid gap-5">
            {result.revealPhase === "computed" ? (
              <section className="metal-panel rounded-lg p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Results computed
                </p>
                <h1 className="mt-2 text-3xl font-black uppercase text-white">Awaiting Host Reveal</h1>
              </section>
            ) : null}
            {result.revealPhase === "set_1_counts" ? <ResultSetPanel set={setOne} /> : null}
            {result.revealPhase === "set_1_resolved" ? <ResultSetPanel set={setOne} showWinner /> : null}
            {result.revealPhase === "set_2_counts" ? (
              <>
                <ResultSetPanel set={setOne} showWinner />
                <ResultSetPanel set={setTwo} />
              </>
            ) : null}
            {result.revealPhase === "set_2_resolved" ? (
              <>
                <ResultSetPanel set={setOne} showWinner />
                <ResultSetPanel set={setTwo} showWinner />
              </>
            ) : null}
          </div>
          <aside className="grid content-start gap-5">
            <div className="metal-panel rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">Reveal Order</p>
              <ol className="mt-3 grid gap-2 text-sm text-metal-300">
                <li>Set 1 counts</li>
                <li>Set 1 selected</li>
                <li>Set 2 counts</li>
                <li>Set 2 selected</li>
                <li>Final two charts</li>
              </ol>
            </div>
            <QRPanel />
          </aside>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <RoundHeader title={`Round ${view.roundNumber} Draw`} status={stageStatus(snapshot, view.bothSetsDrawn)} />
      <section className="grid gap-5 px-5 py-5 lg:grid-cols-[1fr_280px] lg:px-8">
        <div className="grid gap-5">
          {view.sets.map(({ set, draw }) => (
            <StageSetPanel key={set.displayLabel} set={set} draw={draw} />
          ))}
        </div>
        <aside className="grid content-start gap-5">
          <CountdownTimer
            label={view.bothSetsDrawn ? "Voting Window" : "Draw Status"}
            minutes={view.bothSetsDrawn ? formatVotingTime(snapshot.remainingMs) : "--:--"}
            targetTime={snapshot.canSubmit ? snapshot.closesAt : null}
            paused={snapshot.status === "voting_paused"}
            caption={stageTimerCaption(snapshot, view.bothSetsDrawn)}
          />
          <QRPanel />
        </aside>
      </section>
    </main>
  );
}
