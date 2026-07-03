import { NextResponse } from "next/server";
import { generatePrivateBallotCsv } from "@/lib/results/private-csv";
import { adminState } from "@/lib/server/admin-state";
import { hydrateTournamentState } from "@/lib/server/persistence";
import { isE2eTestRouteAvailable } from "@/lib/server/test-route-safety";

export const dynamic = "force-dynamic";

function parseRoundNumber(value: string | null) {
  const roundNumber = Number(value);

  if (roundNumber === 1 || roundNumber === 2 || roundNumber === 3 || roundNumber === 4) {
    return roundNumber;
  }

  throw new Error("roundNumber must be 1, 2, 3, or 4.");
}

function memoryPrivateCsvExportAllowed() {
  if (adminState.roundStateStore.getSnapshot().rehearsalMode) {
    return true;
  }

  const eventId = process.env.TOURNAMENT_EVENT_ID ?? "";

  return (
    process.env.TOURNAMENT_STATE_BACKEND === "memory" &&
    process.env.TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND === "true" &&
    /^(e2e|load)-[a-z0-9-]+$/i.test(eventId)
  );
}

export async function GET(request: Request) {
  if (!isE2eTestRouteAvailable(request)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const roundNumber = parseRoundNumber(new URL(request.url).searchParams.get("roundNumber"));

    await hydrateTournamentState();

    if (!memoryPrivateCsvExportAllowed()) {
      return NextResponse.json(
        {
          error:
            "Private CSV e2e export is only available in rehearsal mode or disposable memory e2e mode.",
        },
        { status: 403 },
      );
    }

    const result = adminState.resultStore.getRoundResult(roundNumber);

    if (!result || result.revealPhase !== "final") {
      return NextResponse.json(
        { error: "Private CSV is available only after the final reveal." },
        { status: 409 },
      );
    }

    const csv = generatePrivateBallotCsv({
      result,
      ballots: adminState.ballotStore.listForRound(roundNumber),
      roundEligibility: adminState.rosterStore
        .listCurrentRoundEligibility()
        .filter((entry) => entry.roundNumber === roundNumber)
        .map((entry) => ({
          playerId: entry.playerId,
          activeAtRoundStart: false,
        })),
    });

    return NextResponse.json({
      filename: `round-${roundNumber}-private-ballots.csv`,
      csv,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate private CSV." },
      { status: 400 },
    );
  }
}
