import {
  CountdownTimer,
  QRPanel,
  ResultSetPanel,
  RoundHeader,
  StageDrawCard,
  StageSetPanel,
} from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { hydrateTournamentState } from "@/lib/server/persistence";
import { getVotingRoundSnapshot } from "@/lib/server/voting-round";
import { buildStageRoundView } from "@/lib/stage/stage-view";
import type { ResultSetSnapshot } from "@/lib/results/result-engine";
import { formatVotingTime, type VotingRoundSnapshot } from "@/lib/vote/voting-window";
import { StageAutoRefresh } from "./StageAutoRefresh";

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

function StageResolvedSetSummary({ set }: { set: ResultSetSnapshot }) {
  return (
    <section className="metal-panel rounded-lg p-3" data-testid="stage-resolved-set-summary">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
            Set {set.setOrder} resolved
          </p>
          <h2 className="mt-1 text-xl font-black uppercase text-white">{set.displayLabel}</h2>
        </div>
        <p className="rounded border border-ember-300/35 bg-ember-900/25 px-3 py-2 text-xs font-black uppercase text-ember-300">
          Selected
        </p>
      </div>
      <div className="max-w-sm">
        <StageDrawCard chart={set.selectedChart} index={set.setOrder} />
      </div>
    </section>
  );
}

export default async function StagePage() {
  await hydrateTournamentState();

  const { currentRound: roundNumber } = adminState.roundStateStore.getSnapshot();
  const view = buildStageRoundView(adminState.drawStateStore, roundNumber);
  const snapshot = getVotingRoundSnapshot(roundNumber);
  const result = adminState.resultStore.getRoundResult(roundNumber);
  const serverNowMs = Date.now();

  if (result) {
    const [setOne, setTwo] = result.sets;

    if (result.revealPhase === "final") {
      return (
        <>
          <StageAutoRefresh />
          <main className="min-h-screen">
            <RoundHeader title={`ROUND ${roundNumber} FINAL CHARTS`} status="Stable final screen" compact />
            <section className="px-5 py-5 lg:px-8">
              <div className="grid min-h-[calc(100vh-220px)] gap-6 md:grid-cols-2" data-testid="stage-final-chart-list">
                {result.sets.map((set, index) => (
                  <section key={set.roundSetId} className="grid content-stretch gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black uppercase tracking-[0.2em] text-ember-300">
                        Set {set.setOrder} - {set.displayLabel}
                      </p>
                      <p className="font-mono text-sm font-black text-metal-300">
                        {set.selectedChart.displayDifficulty}
                      </p>
                    </div>
                    <StageDrawCard chart={set.selectedChart} index={index + 1} variant="featured" />
                  </section>
                ))}
              </div>
            </section>
          </main>
        </>
      );
    }

    return (
      <>
        <StageAutoRefresh />
        <main className="min-h-screen">
          <RoundHeader
            title={`Round ${roundNumber} Results Reveal`}
            status={revealLabel(result.revealPhase)}
            compact
          />
          <section className="grid gap-4 px-5 py-4 lg:px-8">
            <div className="metal-panel rounded-lg p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                Reveal Order
              </p>
              <ol className="mt-2 flex flex-wrap gap-3 text-sm text-metal-300">
                <li>Set 1 counts</li>
                <li>Set 1 selected</li>
                <li>Set 2 counts</li>
                <li>Set 2 selected</li>
                <li>Final two charts</li>
              </ol>
            </div>
            <div className="grid gap-5">
              {result.revealPhase === "computed" ? (
                <section className="metal-panel rounded-lg p-5 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                    Results computed
                  </p>
                  <h1 className="mt-2 text-3xl font-black uppercase text-white">
                    Awaiting Host Reveal
                  </h1>
                </section>
              ) : null}
              {result.revealPhase === "set_1_counts" ? (
                <ResultSetPanel set={setOne} serverNowMs={serverNowMs} stageMode />
              ) : null}
              {result.revealPhase === "set_1_resolved" ? (
                <ResultSetPanel set={setOne} showWinner serverNowMs={serverNowMs} stageMode />
              ) : null}
              {result.revealPhase === "set_2_counts" ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(220px,300px)_1fr]">
                  <StageResolvedSetSummary set={setOne} />
                  <ResultSetPanel set={setTwo} serverNowMs={serverNowMs} stageMode />
                </div>
              ) : null}
              {result.revealPhase === "set_2_resolved" ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(220px,300px)_1fr]">
                  <StageResolvedSetSummary set={setOne} />
                  <ResultSetPanel set={setTwo} showWinner serverNowMs={serverNowMs} stageMode />
                </div>
              ) : null}
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <StageAutoRefresh />
      <main className="min-h-screen">
        <RoundHeader
          title={`Round ${view.roundNumber} Draw`}
          status={stageStatus(snapshot, view.bothSetsDrawn)}
          compact
        />
        <section className="grid gap-3 px-5 py-3 lg:px-8">
          <div
            className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] xl:grid-cols-[minmax(0,1fr)_320px]"
            data-testid="stage-voting-band"
          >
            <CountdownTimer
              label={view.bothSetsDrawn ? "Voting Window" : "Draw Status"}
              minutes={view.bothSetsDrawn ? formatVotingTime(snapshot.remainingMs) : "--:--"}
              targetTime={snapshot.canSubmit ? snapshot.closesAt : null}
              paused={snapshot.status === "voting_paused"}
              caption={stageTimerCaption(snapshot, view.bothSetsDrawn)}
              compact
            />
            <QRPanel compact />
          </div>
          <div className="grid gap-3" data-testid="stage-chart-rows">
            {view.sets.map(({ set, draw, revealStartsAt }) => (
              <StageSetPanel
                key={set.displayLabel}
                set={set}
                draw={draw}
                revealStartsAt={revealStartsAt}
                serverNowMs={serverNowMs}
              />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
