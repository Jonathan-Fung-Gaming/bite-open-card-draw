import type { Metadata } from "next";
import { CountdownTimer, QRPanel, ResultSetPanel, RoundHeader, StageDrawCard } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { hydratePublicTournamentState } from "@/lib/server/persistence";
import { advanceVotingTimerIfDue, getVotingRoundSnapshot } from "@/lib/server/voting-round";
import { buildStageRoundView, stageShouldUseResultMode } from "@/lib/stage/stage-view";
import type { ResultSetSnapshot } from "@/lib/results/result-engine";
import { buildPublicRouteFreshness } from "@/lib/server/public-route-freshness";
import { getAuthoritativeNowMs } from "@/lib/server/authoritative-clock";
import {
  STAGE_LIVE_REFRESH_INTERVAL_MS,
  STAGE_LIVE_REFRESH_JITTER_MS,
} from "@/lib/vote/phone-view";
import { formatVotingTime, type VotingRoundSnapshot } from "@/lib/vote/voting-window";
import { StageAutoRefresh } from "./StageAutoRefresh";
import { StageDrawRows } from "./StageDrawRows";
import { StageResultPhaseGuard } from "./StageResultPhaseGuard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stage Display",
};

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
      return "Results ready";
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
  const bans = `Ban selections cast across both sets: ${snapshot.banSelectionsCast}`;

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
    case "computed":
      return "Ready to reveal";
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
    <section className="metal-panel rounded-lg p-4" data-testid="stage-resolved-set-summary">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-lg font-semibold uppercase tracking-[0.18em] text-ember-300">
            Set {set.setOrder} resolved
          </p>
          <h2 className="mt-1 text-4xl font-black uppercase text-white">{set.displayLabel}</h2>
        </div>
        <p className="rounded border border-ember-300/35 bg-ember-900/25 px-4 py-2 text-lg font-black uppercase text-ember-300">
          Selected
        </p>
      </div>
      <div className="max-w-sm">
        <StageDrawCard chart={set.selectedChart} />
      </div>
    </section>
  );
}

function StageResultModeHolding({ roundNumber }: { roundNumber: number }) {
  return (
    <>
      <StageAutoRefresh
        intervalMs={STAGE_LIVE_REFRESH_INTERVAL_MS}
        jitterMs={STAGE_LIVE_REFRESH_JITTER_MS}
      />
      <main className="min-h-screen" data-testid="stage-result-mode-holding">
        <RoundHeader
          title={`Round ${roundNumber} Results Reveal`}
          status="Waiting for reveal"
          compact
        />
        <section className="grid min-h-[calc(100vh-96px)] place-items-center px-5 py-4 lg:px-8">
          <div className="metal-panel w-full max-w-3xl rounded-lg p-6 text-center">
            <p className="text-xl font-semibold uppercase text-ember-300">
              Result reveal in progress
            </p>
            <h1 className="mt-3 text-6xl font-black uppercase text-white">Results Coming Up</h1>
            <p className="mt-3 text-2xl font-bold text-metal-300">
              The round has moved past voting into results. Waiting for the next official reveal
              update before showing the next step.
            </p>
            <p className="mt-5 rounded border border-metal-700 bg-black/25 px-5 py-3 text-xl font-bold uppercase text-metal-300">
              Preparing reveal
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

export default async function StagePage() {
  await hydratePublicTournamentState();

  const { currentRound: roundNumber } = adminState.roundStateStore.getSnapshot();
  const serverNowMs = await getAuthoritativeNowMs();
  await advanceVotingTimerIfDue(roundNumber, serverNowMs);
  const view = buildStageRoundView(adminState.drawStateStore, roundNumber);
  const snapshot = getVotingRoundSnapshot(roundNumber, serverNowMs);
  const result = adminState.resultStore.getRoundResult(roundNumber);
  const useResultMode = stageShouldUseResultMode(snapshot.status, Boolean(result));
  const freshness = buildPublicRouteFreshness({
    currentRound: roundNumber,
    result,
    route: "/stage",
    routeRoundNumber: roundNumber,
    routeSource: "current_round",
    votingSnapshot: snapshot,
  });

  if (useResultMode) {
    if (!result) {
      return (
        <StageResultPhaseGuard freshness={freshness}>
          <StageResultModeHolding roundNumber={roundNumber} />
        </StageResultPhaseGuard>
      );
    }

    const [setOne, setTwo] = result.sets;

    if (result.revealPhase === "final") {
      return (
        <StageResultPhaseGuard freshness={freshness}>
          <StageAutoRefresh
            intervalMs={STAGE_LIVE_REFRESH_INTERVAL_MS}
            jitterMs={STAGE_LIVE_REFRESH_JITTER_MS}
          />
          <main className="min-h-screen">
            <RoundHeader
              title={`ROUND ${roundNumber} FINAL CHARTS`}
              status="Final charts selected"
              compact
            />
            <section className="px-5 py-5 lg:px-8">
              <div
                className="grid min-h-[calc(100vh-220px)] gap-6 md:grid-cols-2"
                data-testid="stage-final-chart-list"
              >
                {result.sets.map((set) => (
                  <section key={set.roundSetId} className="grid content-stretch gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-2xl font-black uppercase text-ember-300">
                        Set {set.setOrder}
                      </p>
                      <p className="text-5xl font-black uppercase leading-none text-ember-300">
                        {set.selectedChart.displayDifficulty}
                      </p>
                    </div>
                    <StageDrawCard chart={set.selectedChart} variant="featured" />
                  </section>
                ))}
              </div>
            </section>
          </main>
        </StageResultPhaseGuard>
      );
    }

    return (
      <StageResultPhaseGuard freshness={freshness}>
        <StageAutoRefresh
          deferDuringTiebreak
          intervalMs={STAGE_LIVE_REFRESH_INTERVAL_MS}
          jitterMs={STAGE_LIVE_REFRESH_JITTER_MS}
          refreshOnStageTiebreakRevealComplete
        />
        <main className="h-screen overflow-hidden">
          <RoundHeader
            title={`Round ${roundNumber} Results Reveal`}
            status={revealLabel(result.revealPhase)}
            compact
          />
          <section className="grid gap-3 px-5 py-3 lg:px-8">
            <div className="grid gap-4">
              {result.revealPhase === "computed" ? (
                <section className="metal-panel rounded-lg p-5 text-center">
                  <p className="text-xl font-semibold uppercase tracking-[0.18em] text-ember-300">
                    Results ready
                  </p>
                  <h1 className="mt-2 text-6xl font-black uppercase text-white">
                    Reveal Starts Soon
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
      </StageResultPhaseGuard>
    );
  }

  return (
    <StageResultPhaseGuard freshness={freshness}>
      <StageAutoRefresh intervalMs={STAGE_LIVE_REFRESH_INTERVAL_MS} jitterMs={0} leading />
      <main className="min-h-screen">
        <RoundHeader
          title={`Round ${view.roundNumber} Draw`}
          status={stageStatus(snapshot, view.bothSetsDrawn)}
          compact
        />
        <section className="grid gap-1 px-5 py-1 lg:px-8">
          <div
            className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] xl:grid-cols-[minmax(0,1fr)_320px]"
            data-testid="stage-voting-band"
          >
            <CountdownTimer
              label={view.bothSetsDrawn ? "Voting Window" : "Draw Status"}
              minutes={view.bothSetsDrawn ? formatVotingTime(snapshot.remainingMs) : "--:--"}
              targetTime={snapshot.canSubmit ? snapshot.closesAt : null}
              serverNowMs={serverNowMs}
              paused={snapshot.status === "voting_paused"}
              caption={stageTimerCaption(snapshot, view.bothSetsDrawn)}
              compact
            />
            <QRPanel compact />
          </div>
          <StageDrawRows sets={view.sets} serverNowMs={serverNowMs} />
        </section>
      </main>
    </StageResultPhaseGuard>
  );
}
