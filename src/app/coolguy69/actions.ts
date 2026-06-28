"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHostToken } from "@/lib/admin/host-lock";
import { generatePrivateBallotCsv } from "@/lib/results/private-csv";
import { adminState, resetTournamentOperationalState } from "@/lib/server/admin-state";
import {
  getRoundDrawRecords,
  getVotingRoundSnapshot,
  revalidateTournamentViews,
} from "@/lib/server/voting-round";
import {
  clearAdminCookies,
  clearHostTokenCookie,
  createAdminSessionCookie,
  getHostTokenCookie,
  requireAdminSession,
  setHostTokenCookie,
  verifyDangerousActionPassword,
} from "@/lib/server/admin-auth";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function getStringList(formData: FormData, name: string) {
  return formData.getAll(name).filter((value): value is string => typeof value === "string");
}

function redirectWithError(message: string) {
  redirect(`/coolguy69?error=${encodeURIComponent(message)}`);
}

export async function adminLoginAction(formData: FormData) {
  try {
    await createAdminSessionCookie(getString(formData, "password"));
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Admin login failed.");
  }

  redirect("/coolguy69");
}

export async function adminLogoutAction() {
  await clearAdminCookies();
  redirect("/coolguy69");
}

export async function takeHostControlAction() {
  const session = await requireAdminSession();
  const hostToken = createHostToken();

  adminState.hostLockStore.acquire(session.sessionId, hostToken);
  await setHostTokenCookie(hostToken);
  revalidatePath("/coolguy69");
}

export async function refreshHostLockAction() {
  const session = await requireAdminSession();
  const hostToken = await getHostTokenCookie();

  if (hostToken) {
    adminState.hostLockStore.refresh(session.sessionId, hostToken);
  }
}

export async function releaseHostControlAction() {
  const session = await requireAdminSession();
  const hostToken = await getHostTokenCookie();

  if (hostToken) {
    adminState.hostLockStore.release(session.sessionId, hostToken);
  }

  await clearHostTokenCookie();
  revalidatePath("/coolguy69");
}

async function requireActiveHost() {
  const session = await requireAdminSession();
  const hostToken = await getHostTokenCookie();

  if (!hostToken || !adminState.hostLockStore.refresh(session.sessionId, hostToken)) {
    throw new Error("Host control is required for this action.");
  }

  return session;
}

export async function addPlayerAction(formData: FormData) {
  await requireActiveHost();

  try {
    adminState.rosterStore.createOrUpdatePlayer({
      startggUsername: getString(formData, "startggUsername"),
      active: true,
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not add player.");
  }

  revalidatePath("/coolguy69");
}

export async function bulkImportPlayersAction(formData: FormData) {
  await requireActiveHost();
  const usernames = getString(formData, "startggUsernames")
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);

  adminState.rosterStore.bulkImport(usernames);
  revalidatePath("/coolguy69");
}

export async function setPlayerActiveStatusAction(formData: FormData) {
  await requireActiveHost();

  try {
    adminState.rosterStore.setPlayerActiveStatus(
      getString(formData, "playerId"),
      getString(formData, "active") === "true",
    );
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not update player.");
  }

  revalidatePath("/coolguy69");
}

export async function addInactivePlayerToCurrentRoundAction(formData: FormData) {
  await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    const roundNumber = Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4;
    const entry = adminState.rosterStore.addPlayerToCurrentRoundEligibility({
      playerId: getString(formData, "playerId"),
      roundNumber,
      reason: getString(formData, "reason"),
    });
    const player = adminState.rosterStore.getPlayer(entry.playerId);

    if (player) {
      adminState.votingWindowStore.addEligiblePlayerToOpenRound({
        roundNumber,
        player: {
          id: player.id,
          startggUsername: player.startggUsername,
        },
      });
    }
  } catch (error) {
    redirectWithError(
      error instanceof Error ? error.message : "Could not update round eligibility.",
    );
  }

  revalidateTournamentViews(revalidatePath);
}

export async function drawRoundSetAction(formData: FormData) {
  await requireActiveHost();

  try {
    adminState.drawStateStore.drawRoundSet({
      roundNumber: Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4,
      setOrder: Number(getString(formData, "setOrder")) as 1 | 2,
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not draw round set.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function rerollOneChartAction(formData: FormData) {
  await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    adminState.drawStateStore.rerollOneChart({
      roundNumber: Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4,
      setOrder: Number(getString(formData, "setOrder")) as 1 | 2,
      chartId: getString(formData, "chartId"),
      reason: getString(formData, "reason"),
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not reroll chart.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function rerollRoundSetAction(formData: FormData) {
  await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    adminState.drawStateStore.rerollRoundSet({
      roundNumber: Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4,
      setOrder: Number(getString(formData, "setOrder")) as 1 | 2,
      reason: getString(formData, "reason"),
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not reroll round set.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function rerollFullRoundAction(formData: FormData) {
  await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    adminState.drawStateStore.rerollFullRound({
      roundNumber: Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4,
      reason: getString(formData, "reason"),
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not reroll full round.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function openVotingAction(formData: FormData) {
  await requireActiveHost();

  try {
    const roundNumber = Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4;
    const snapshot = getVotingRoundSnapshot(roundNumber);

    adminState.votingWindowStore.openVoting({
      roundNumber,
      drawsReady: snapshot.drawnSetCount === 2,
      eligiblePlayers: snapshot.eligiblePlayers,
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not open voting.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function pauseVotingAction(formData: FormData) {
  await requireActiveHost();

  try {
    const roundNumber = Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4;

    getVotingRoundSnapshot(roundNumber);
    adminState.votingWindowStore.pauseVoting(roundNumber);
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not pause voting.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function resumeVotingAction(formData: FormData) {
  await requireActiveHost();

  try {
    adminState.votingWindowStore.resumeVoting(
      Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4,
    );
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not resume voting.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function closeVotingAction(formData: FormData) {
  await requireActiveHost();

  try {
    const roundNumber = Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4;

    adminState.votingWindowStore.closeVoting(roundNumber);
    adminState.ballotStore.setPhoneStatus(roundNumber, { phase: "closed_revealing" });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not close voting.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function manualBallotAction(formData: FormData) {
  await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));

    const roundNumber = Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4;
    const snapshot = getVotingRoundSnapshot(roundNumber);

    if (!snapshot.canAcceptManualBallot) {
      throw new Error("Manual ballots are allowed only before results reveal.");
    }

    if (adminState.resultStore.getRoundResult(roundNumber)) {
      throw new Error("Manual ballots must be entered before results are computed.");
    }

    const playerId = getString(formData, "playerId");
    const player = snapshot.eligiblePlayers.find((candidate) => candidate.id === playerId);

    if (!player) {
      throw new Error("Manual ballot player must be eligible for the voting window.");
    }

    const reason = getString(formData, "reason").trim();

    if (!reason) {
      throw new Error("Manual ballot reason is required.");
    }

    const existing = adminState.ballotStore.get(roundNumber, playerId);
    const replaceExisting = getString(formData, "replaceExistingBallot") === "yes";

    if (existing && !replaceExisting) {
      throw new Error(
        "This player already has a submitted ballot. Are you sure you want to replace it?",
      );
    }

    const draws = getRoundDrawRecords(roundNumber);
    const choices = draws.map((draw) => {
      const noBans = getString(formData, `noBans:${draw.id}`) === "true";

      return {
        roundSetId: draw.id,
        displayLabel: draw.displayLabel,
        noBans,
        bannedChartIds: noBans ? [] : getStringList(formData, `bans:${draw.id}`),
      };
    });

    adminState.ballotStore.submit(
      {
        roundNumber,
        playerId: player.id,
        playerStartggUsername: player.startggUsername,
        choices,
      },
      draws,
      snapshot.serverNow,
      {
        source: "manual_admin",
        manualReason: reason,
        manualOverride: snapshot.postCloseManualBallotsAreOverrides,
        replacedExistingBallot: Boolean(existing),
      },
    );

    getVotingRoundSnapshot(roundNumber);
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not save manual ballot.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function computeResultsAction(formData: FormData) {
  await requireActiveHost();

  try {
    const roundNumber = Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4;
    const snapshot = getVotingRoundSnapshot(roundNumber);

    if (snapshot.status !== "voting_closed") {
      throw new Error("Voting must be closed before results are computed.");
    }

    adminState.resultStore.computeRound({
      roundNumber,
      draws: getRoundDrawRecords(roundNumber),
      ballots: adminState.ballotStore.listForRound(roundNumber),
      eligiblePlayers: snapshot.eligiblePlayers,
      now: snapshot.serverNow,
    });
    adminState.votingWindowStore.setResultsPhase(roundNumber, "results_computed");
    adminState.ballotStore.setPhoneStatus(roundNumber, { phase: "closed_revealing" });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not compute results.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function advanceResultRevealAction(formData: FormData) {
  await requireActiveHost();

  try {
    const roundNumber = Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4;
    const result = adminState.resultStore.advanceReveal(roundNumber);

    if (result.revealPhase === "final") {
      adminState.votingWindowStore.setResultsPhase(roundNumber, "results_revealed");
      adminState.ballotStore.setPhoneStatus(roundNumber, {
        phase: "revealed",
        selectedCharts: result.sets.map((set) => ({
          id: set.selectedChart.id,
          name: set.selectedChart.name,
          artist: set.selectedChart.artist,
          displayDifficulty: set.selectedChart.displayDifficulty,
          localImagePath: set.selectedChart.localImagePath,
        })),
      });

      for (const set of result.sets) {
        adminState.drawStateStore.markSelectedSong(set.selectedChart.songKey);
      }
    } else {
      adminState.votingWindowStore.setResultsPhase(roundNumber, "results_revealing");
      adminState.ballotStore.setPhoneStatus(roundNumber, { phase: "closed_revealing" });
    }
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not advance result reveal.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function downloadPrivateCsvAction(roundNumber: 1 | 2 | 3 | 4) {
  await requireAdminSession();

  const result = adminState.resultStore.getRoundResult(roundNumber);

  if (!result || result.revealPhase !== "final") {
    throw new Error("Private CSV is available only after the final reveal.");
  }

  return {
    filename: `round-${roundNumber}-private-ballots.csv`,
    csv: generatePrivateBallotCsv({
      result,
      ballots: adminState.ballotStore.listForRound(roundNumber),
    }),
  };
}

export async function setCurrentRoundAction(formData: FormData) {
  await requireActiveHost();

  try {
    adminState.roundStateStore.setCurrentRound(
      Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4,
    );
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not set current round.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function advanceCurrentRoundAction() {
  await requireActiveHost();

  try {
    adminState.roundStateStore.advanceRound();
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not advance round.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function startRehearsalModeAction(formData: FormData) {
  await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    resetTournamentOperationalState();
    adminState.roundStateStore.setCurrentRound(1);
    adminState.roundStateStore.setRehearsalMode(true);

    Array.from(
      { length: 12 },
      (_, index) => `Rehearsal Player ${String(index + 1).padStart(2, "0")}`,
    ).forEach((startggUsername) => {
      adminState.rosterStore.createOrUpdatePlayer({ startggUsername, active: true });
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not start rehearsal mode.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function resetRehearsalModeAction(formData: FormData) {
  await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    resetTournamentOperationalState();
    adminState.roundStateStore.setCurrentRound(1);
    adminState.roundStateStore.setRehearsalMode(false);
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not reset rehearsal data.");
  }

  revalidateTournamentViews(revalidatePath);
}

export async function seedRehearsalTiebreakAction() {
  await requireActiveHost();

  try {
    const { currentRound, rehearsalMode } = adminState.roundStateStore.getSnapshot();

    if (!rehearsalMode) {
      throw new Error("Rehearsal mode must be active before seeding a forced tiebreak.");
    }

    const draws = getRoundDrawRecords(currentRound);
    const snapshot = getVotingRoundSnapshot(currentRound);

    if (adminState.resultStore.getRoundResult(currentRound)) {
      throw new Error("Rehearsal tiebreak ballots must be seeded before results are computed.");
    }

    if (draws.length !== 2) {
      throw new Error("Draw both sets before seeding rehearsal ballots.");
    }

    if (snapshot.status === "ready_to_vote") {
      adminState.votingWindowStore.openVoting({
        roundNumber: currentRound,
        drawsReady: true,
        eligiblePlayers: snapshot.eligiblePlayers,
      });
    } else if (!snapshot.canSubmit && !snapshot.canAcceptManualBallot) {
      throw new Error("Rehearsal ballots can be seeded only before results reveal.");
    }

    const players = adminState.rosterStore.listEligiblePlayersForRound(currentRound).slice(0, 3);

    if (players.length < 3) {
      throw new Error("At least three rehearsal players are required to seed a tiebreak.");
    }

    const banPatterns = [
      [2, 3],
      [4, 5],
      [6, 2],
    ];

    players.forEach((player, playerIndex) => {
      adminState.ballotStore.submit(
        {
          roundNumber: currentRound,
          playerId: player.id,
          playerStartggUsername: player.startggUsername,
          choices: draws.map((draw) => ({
            roundSetId: draw.id,
            displayLabel: draw.displayLabel,
            noBans: false,
            bannedChartIds:
              banPatterns[playerIndex]?.map((chartIndex) => draw.charts[chartIndex]?.id ?? "") ??
              [],
          })),
        },
        draws,
        new Date().toISOString(),
        {
          source: "manual_admin",
          manualReason: "Rehearsal forced two-way tiebreak",
          manualOverride: getVotingRoundSnapshot(currentRound).postCloseManualBallotsAreOverrides,
        },
      );
    });
  } catch (error) {
    redirectWithError(
      error instanceof Error ? error.message : "Could not seed rehearsal tiebreak.",
    );
  }

  revalidateTournamentViews(revalidatePath);
}
