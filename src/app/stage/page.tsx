import { CountdownTimer, QRPanel, RoundHeader, StageSetPanel } from "@/components";
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
    case "results_computed":
    case "results_revealing":
      return "Voting closed";
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

export default function StagePage() {
  const roundNumber = 1;
  const view = buildStageRoundView(adminState.drawStateStore, roundNumber);
  const snapshot = getVotingRoundSnapshot(roundNumber);

  return (
    <main className="min-h-screen">
      <RoundHeader
        title={`Round ${view.roundNumber} Draw`}
        status={stageStatus(snapshot, view.bothSetsDrawn)}
      />
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
