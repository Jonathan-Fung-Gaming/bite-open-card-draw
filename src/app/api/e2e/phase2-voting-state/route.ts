import { NextResponse } from "next/server";
import { adminState } from "@/lib/server/admin-state";
import { getAuthoritativeNowMs } from "@/lib/server/authoritative-clock";
import { getTournamentStateBackend, withPersistedVotingState } from "@/lib/server/persistence";
import { advancePublicStateGeneration } from "@/lib/server/public-state-projection";
import { isE2eTestRouteAvailable } from "@/lib/server/test-route-safety";
import { getVotingRoundSnapshot } from "@/lib/server/voting-round";
import type { VotingRoundStatus, VotingWindowRecord } from "@/lib/vote/voting-window";

export const dynamic = "force-dynamic";

type Phase2VotingState = Extract<VotingRoundStatus, "final_30_seconds" | "extension_1_minute">;

type Phase2VotingStateRequest = {
  roundNumber?: unknown;
  status?: unknown;
};

function parseRoundNumber(value: unknown) {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }

  throw new Error("roundNumber must be 1, 2, 3, or 4.");
}

function parseStatus(value: unknown): Phase2VotingState {
  if (value === "final_30_seconds" || value === "extension_1_minute") {
    return value;
  }

  throw new Error("status must be final_30_seconds or extension_1_minute.");
}

function memoryPhase2FixtureIsAllowed() {
  return (
    getTournamentStateBackend() === "memory" &&
    process.env.TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND === "true" &&
    process.env.TOURNAMENT_EVENT_ID === "e2e-phase2-memory" &&
    adminState.roundStateStore.getSnapshot().rehearsalMode
  );
}

function buildFixtureWindow(
  current: VotingWindowRecord,
  status: Phase2VotingState,
  nowMs: number,
): VotingWindowRecord {
  const updatedAt = new Date(nowMs).toISOString();

  return {
    ...current,
    status,
    closesAt: new Date(nowMs + (status === "final_30_seconds" ? 30_000 : 60_000)).toISOString(),
    closedAt: null,
    extensionUsed: status === "extension_1_minute" ? true : current.extensionUsed,
    finalWarningStartedAt: status === "final_30_seconds" ? updatedAt : null,
    finalWarningPreviousStatus: status === "final_30_seconds" ? "voting_open" : null,
    pausedAt: null,
    pausedFromStatus: null,
    remainingMsWhenPaused: null,
    updatedAt,
  };
}

export async function POST(request: Request) {
  if (!isE2eTestRouteAvailable(request) || !memoryPhase2FixtureIsAllowed()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as Phase2VotingStateRequest;
    const roundNumber = parseRoundNumber(body.roundNumber);
    const status = parseStatus(body.status);
    const response = await withPersistedVotingState(async () => {
      const nowMs = await getAuthoritativeNowMs();
      const storeSnapshot = adminState.votingWindowStore.exportSnapshot();
      const current = storeSnapshot.windows.find((window) => window.roundNumber === roundNumber);

      if (!current) {
        throw new Error("Voting must be open before applying a Phase 2 lifecycle fixture.");
      }

      const fixtureWindow = buildFixtureWindow(current, status, nowMs);
      adminState.votingWindowStore.importSnapshot({
        windows: storeSnapshot.windows.map((window) =>
          window.roundNumber === roundNumber ? fixtureWindow : window,
        ),
      });

      const currentGeneration = adminState.publicStateGenerationStore.getRound(roundNumber);
      const nextGeneration = advancePublicStateGeneration({
        expectedGeneration: currentGeneration.generation,
        roundNumber,
        transitionKind: status === "final_30_seconds" ? "voting_final_warning" : "voting_extended",
        updatedAt: fixtureWindow.updatedAt,
      });
      const snapshot = getVotingRoundSnapshot(roundNumber, nowMs);

      return {
        generation: nextGeneration.generation,
        remainingMs: snapshot.remainingMs,
        status: snapshot.status,
      };
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not set Phase 2 voting state." },
      { status: 400 },
    );
  }
}
