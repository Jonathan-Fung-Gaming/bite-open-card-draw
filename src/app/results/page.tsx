import { PublicResultSummary, RoundHeader } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { getAuthoritativeNowMs } from "@/lib/server/authoritative-clock";
import { hydrateTournamentState } from "@/lib/server/persistence";
import { getRoundDrawRecords, getVotingRoundSnapshot } from "@/lib/server/voting-round";
import { shouldShowFinalPhoneResults } from "@/lib/vote/phone-view";
import { formatVotingStatusLabel, formatVotingTime } from "@/lib/vote/voting-window";
import { ResultsAutoRefresh } from "./ResultsAutoRefresh";

export const dynamic = "force-dynamic";

function pendingResultsCopy(
  status: ReturnType<typeof getVotingRoundSnapshot>["status"],
  bothSetsDrawn: boolean,
  remainingMs: number,
) {
  if (!bothSetsDrawn) {
    return {
      title: "Awaiting host draw",
      status: "No results yet",
      lines: [
        "Both chart sets must be drawn before voting opens.",
        "Final charts will appear here after the stage reveal finishes.",
      ],
    };
  }

  if (status === "ready_to_vote") {
    return {
      title: "Awaiting voting window",
      status: formatVotingStatusLabel(status),
      lines: [
        "Both chart sets are drawn. Waiting for the host to open voting.",
        "Final charts will appear here after the stage reveal finishes.",
      ],
    };
  }

  if (
    status === "voting_open" ||
    status === "final_30_seconds" ||
    status === "extension_1_minute"
  ) {
    return {
      title: "Voting in progress",
      status: formatVotingStatusLabel(status),
      lines: [
        `Voting is open. Time remaining: ${formatVotingTime(remainingMs)}.`,
        "Results will appear after voting closes and the stage reveal finishes.",
      ],
    };
  }

  if (status === "voting_paused") {
    return {
      title: "Voting paused",
      status: formatVotingStatusLabel(status),
      lines: [
        "Voting is paused by the host. Ballot changes and the timer are frozen.",
        "Results will appear after voting resumes, closes, and the stage reveal finishes.",
      ],
    };
  }

  if (
    status === "voting_closed" ||
    status === "results_computed" ||
    status === "results_revealing"
  ) {
    return {
      title: "Voting closed",
      status: "Awaiting stage reveal",
      lines: ["Voting is closed.", "Results are being revealed on stage."],
    };
  }

  return {
    title: "Awaiting final reveal",
    status: formatVotingStatusLabel(status),
    lines: ["Final charts will appear here after the stage reveal finishes."],
  };
}

export default async function ResultsPage() {
  await hydrateTournamentState();

  const { currentRound: roundNumber } = adminState.roundStateStore.getSnapshot();
  const nowMs = await getAuthoritativeNowMs();
  const snapshot = getVotingRoundSnapshot(roundNumber, nowMs);
  const bothSetsDrawn = getRoundDrawRecords(roundNumber).length === 2;
  const result = adminState.resultStore.getRoundResult(roundNumber);
  const showFinalResults = shouldShowFinalPhoneResults(snapshot.status, result?.revealPhase);

  if (!showFinalResults || !result) {
    const pending = pendingResultsCopy(snapshot.status, bothSetsDrawn, snapshot.remainingMs);

    return (
      <main className="min-h-screen">
        <ResultsAutoRefresh />
        <RoundHeader title={`Round ${roundNumber} Results`} status={pending.status} />
        <section className="mx-auto max-w-3xl px-5 py-5">
          <div className="metal-panel rounded-lg p-5 text-center text-lg font-bold text-metal-300">
            <h1 className="text-2xl font-black uppercase text-white">{pending.title}</h1>
            <div className="mt-3 grid gap-1">
              {pending.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <ResultsAutoRefresh />
      <RoundHeader title={`ROUND ${roundNumber} FINAL CHARTS`} status="Results revealed" />
      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-5">
        <PublicResultSummary result={result} />
      </section>
    </main>
  );
}
