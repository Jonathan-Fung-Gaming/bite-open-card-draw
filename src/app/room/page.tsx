import type { Metadata } from "next";
import Link from "next/link";
import { Eye, Vote } from "lucide-react";
import { TournamentLogo } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import type { RoundResultSnapshot } from "@/lib/results/result-engine";
import { getAuthoritativeNowMs } from "@/lib/server/authoritative-clock";
import { hydrateTournamentState } from "@/lib/server/persistence";
import {
  advanceVotingTimerIfDue,
  getRoundDrawRecords,
  getVotingRoundSnapshot,
} from "@/lib/server/voting-round";
import {
  shouldShowFinalPhoneResults,
  shouldShowPhoneResultHoldingState,
} from "@/lib/vote/phone-view";
import {
  formatVotingStatusLabel,
  formatVotingTime,
  type VotingRoundSnapshot,
} from "@/lib/vote/voting-window";
import { RoomAutoRefresh } from "./RoomAutoRefresh";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournament Room",
};

function roomStatus(
  snapshot: VotingRoundSnapshot,
  drawnSetCount: number,
  resultPhase: RoundResultSnapshot["revealPhase"] | null | undefined,
) {
  const roundLabel = `Round ${snapshot.roundNumber}`;

  if (shouldShowFinalPhoneResults(snapshot.status, resultPhase)) {
    return {
      label: `${roundLabel} final charts revealed`,
      detail: "Players and spectators can view the selected charts now.",
    };
  }

  if (shouldShowPhoneResultHoldingState(snapshot.status, resultPhase)) {
    return {
      label: `${roundLabel} stage reveal in progress`,
      detail:
        "Voting is closed. Final charts will appear on phones after the stage reveal finishes.",
    };
  }

  if (drawnSetCount === 0) {
    return {
      label: `${roundLabel} awaiting draw`,
      detail: "The host is preparing the two chart sets. Choose a path and keep the page open.",
    };
  }

  if (drawnSetCount === 1) {
    return {
      label: `${roundLabel} first chart set drawn`,
      detail:
        "One chart set is visible. The second set will appear when the host finishes the draw.",
    };
  }

  if (snapshot.status === "ready_to_vote") {
    return {
      label: `${roundLabel} charts ready`,
      detail: "Both chart sets are drawn. Voting starts when the host opens the 10-minute window.",
    };
  }

  if (
    snapshot.status === "voting_open" ||
    snapshot.status === "final_30_seconds" ||
    snapshot.status === "extension_1_minute"
  ) {
    return {
      label: `${roundLabel} ${formatVotingStatusLabel(snapshot.status).toLowerCase()}`,
      detail: `Voting window is live with ${formatVotingTime(
        snapshot.remainingMs,
      )} remaining. Players should vote; spectators can view charts only.`,
    };
  }

  if (snapshot.status === "voting_paused") {
    return {
      label: `${roundLabel} voting paused`,
      detail:
        "The host paused voting. Ballot changes and the timer are frozen until voting resumes.",
    };
  }

  return {
    label: `${roundLabel} ${formatVotingStatusLabel(snapshot.status).toLowerCase()}`,
    detail: "Choose player voting if you are competing, or view charts only if you are spectating.",
  };
}

export default async function RoomPage() {
  await hydrateTournamentState();

  const { currentRound } = adminState.roundStateStore.getSnapshot();
  const nowMs = await getAuthoritativeNowMs();
  await advanceVotingTimerIfDue(currentRound, nowMs);
  const snapshot = getVotingRoundSnapshot(currentRound, nowMs);
  const drawnSetCount = getRoundDrawRecords(currentRound).length;
  const result = adminState.resultStore.getRoundResult(currentRound);
  const status = roomStatus(snapshot, drawnSetCount, result?.revealPhase);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-6">
      <RoomAutoRefresh />
      <section className="w-full max-w-xl">
        <TournamentLogo priority className="mx-auto mb-8" />
        <div className="metal-panel rounded-lg p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember-300">
            Pump It Up Open Stage
          </p>
          <h1 className="mt-2 text-3xl font-black uppercase text-white sm:text-4xl">
            Tournament Room
          </h1>
          <div className="rune-divider my-5" />
          <div
            className="mb-5 rounded border border-ember-300/25 bg-black/25 p-4"
            data-testid="room-current-status"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
              Current tournament state
            </p>
            <h2 className="mt-1 text-lg font-black uppercase text-white">{status.label}</h2>
            <p className="mt-2 text-sm text-metal-300">{status.detail}</p>
          </div>
          <div className="grid gap-3">
            <Link
              href="/vote"
              className="button-metal flex items-center justify-center gap-3 rounded px-4 py-4 text-base font-black uppercase"
            >
              <Vote aria-hidden="true" className="h-5 w-5" />I am a player voting
            </Link>
            <Link
              href="/charts"
              className="flex items-center justify-center gap-3 rounded border border-metal-700 bg-black/25 px-4 py-4 text-base font-black uppercase text-metal-300 hover:border-ember-300/50 hover:text-white"
            >
              <Eye aria-hidden="true" className="h-5 w-5" />
              View charts only
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
