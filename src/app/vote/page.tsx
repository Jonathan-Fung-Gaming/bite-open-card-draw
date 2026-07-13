import type { Metadata } from "next";
import { PublicResultSummary, TournamentLogo } from "@/components";
import { PublicRouteFreshnessGuard } from "@/lib/client/PublicRouteFreshnessGuard";
import { buildPublicRouteFreshness } from "@/lib/server/public-route-freshness";
import { adminState } from "@/lib/server/admin-state";
import { getAuthoritativeNowMs } from "@/lib/server/authoritative-clock";
import { hydratePublicTournamentState } from "@/lib/server/persistence";
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
import { VoteAutoRefresh } from "./VoteAutoRefresh";
import { VoteLiveShell } from "./VoteLiveShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Player Voting",
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

export default async function VotePage() {
  await hydratePublicTournamentState();

  const { currentRound: roundNumber } = adminState.roundStateStore.getSnapshot();
  const nowMs = await getAuthoritativeNowMs();
  await advanceVotingTimerIfDue(roundNumber, nowMs);
  const snapshot = getVotingRoundSnapshot(roundNumber, nowMs);
  const draws = getRoundDrawRecords(roundNumber);
  const phoneStatus = adminState.ballotStore.getPhoneStatus(roundNumber);
  const result = adminState.resultStore.getRoundResult(roundNumber);
  const publicStateGeneration =
    adminState.publicStateGenerationStore.getRound(roundNumber).generation;
  const freshness = buildPublicRouteFreshness({
    currentRound: roundNumber,
    result,
    route: "/vote",
    routeRoundNumber: roundNumber,
    routeSource: "current_round",
    votingSnapshot: snapshot,
  });
  const showFinalPhoneResults = shouldShowFinalPhoneResults(snapshot.status, result?.revealPhase);
  const showResultHoldingState = shouldShowPhoneResultHoldingState(
    snapshot.status,
    result?.revealPhase,
  );

  if (snapshot.status === "voting_paused" && draws.length !== 2) {
    return (
      <PublicRouteFreshnessGuard freshness={freshness} testId="vote-route-freshness-guard">
        <main className="min-h-screen">
          <VoteAutoRefresh />
          <VoteDenseHeader title="Voting Paused" status={`Round ${roundNumber}`} />
          <section className="mx-auto max-w-2xl px-5 py-5">
            <div className="metal-panel rounded-lg p-5 text-center text-lg font-bold text-metal-300">
              Voting is paused. Ballot changes resume when voting resumes.
            </div>
          </section>
        </main>
      </PublicRouteFreshnessGuard>
    );
  }

  if (showFinalPhoneResults && result) {
    return (
      <PublicRouteFreshnessGuard freshness={freshness} testId="vote-route-freshness-guard">
        <main className="min-h-screen">
          <VoteAutoRefresh intervalMs={PUBLIC_INSPECTION_REFRESH_INTERVAL_MS} />
          <VoteDenseHeader
            title={`Round ${roundNumber} Final Charts`}
            status={formatVotingStatusLabel(snapshot.status)}
          />
          <section className="mx-auto max-w-4xl px-5 py-5">
            <PublicResultSummary result={result} selectedCardTestId="phone-final-chart-card" />
          </section>
        </main>
      </PublicRouteFreshnessGuard>
    );
  }

  if (showResultHoldingState) {
    const missingFinalResult =
      snapshot.status === "results_revealed" || snapshot.status === "round_complete";

    return (
      <PublicRouteFreshnessGuard freshness={freshness} testId="vote-route-freshness-guard">
        <main className="min-h-screen">
          <VoteAutoRefresh />
          <VoteDenseHeader
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
                      Keep this page open; it will update after the stage reveal.
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
      </PublicRouteFreshnessGuard>
    );
  }

  if (!snapshot.canSubmit && snapshot.status !== "voting_paused") {
    const message =
      snapshot.status === "ready_to_vote"
        ? "Both chart sets are drawn. Keep this page open; the ballot appears when voting starts."
        : "Chart sets are being drawn. Voting opens after both sets are ready.";

    return (
      <PublicRouteFreshnessGuard freshness={freshness} testId="vote-route-freshness-guard">
        <main className="min-h-screen">
          <VoteAutoRefresh />
          <VoteDenseHeader title="Player Ballot" status={`Round ${roundNumber}`} />
          <section className="mx-auto max-w-2xl px-5 py-5">
            <div className="metal-panel rounded-lg p-5 text-lg font-bold text-metal-300">
              {message}
            </div>
          </section>
        </main>
      </PublicRouteFreshnessGuard>
    );
  }

  return (
    <PublicRouteFreshnessGuard freshness={freshness} testId="vote-route-freshness-guard">
      <main className="min-h-screen">
        <VoteAutoRefresh
          enabled={
            !snapshot.canSubmit || process.env.NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING === "true"
          }
        />
        <VoteLiveShell
          canSubmit={snapshot.canSubmit}
          closesAt={snapshot.closesAt}
          draws={draws}
          eligibleCount={snapshot.eligibleCount}
          players={snapshot.eligiblePlayers}
          publicStateGeneration={publicStateGeneration}
          remainingMs={snapshot.remainingMs}
          roundNumber={roundNumber}
          serverNowMs={nowMs}
          status={snapshot.status}
          statusLabel={formatVotingStatusLabel(snapshot.status)}
          submittedCount={snapshot.submittedCount}
          timerText={formatVotingTime(snapshot.remainingMs)}
          title="Player Ballot"
          turnoutText={`Ballots submitted: ${snapshot.submittedCount} / ${snapshot.eligibleCount}`}
        />
      </main>
    </PublicRouteFreshnessGuard>
  );
}
