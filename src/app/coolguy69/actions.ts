"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHostToken } from "@/lib/admin/host-lock";
import type { AdminSessionPayload } from "@/lib/admin/session";
import { generatePrivateBallotCsv } from "@/lib/results/private-csv";
import { adminState, resetTournamentOperationalState } from "@/lib/server/admin-state";
import { hydrateTournamentState, persistTournamentState } from "@/lib/server/persistence";
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
  refreshAdminSessionCookie,
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

function getRoundNumber(formData: FormData) {
  return Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4;
}

function getRequiredReason(formData: FormData) {
  const reason = getString(formData, "reason").trim();

  if (!reason) {
    throw new Error("Audit reason is required.");
  }

  return reason;
}

function audit(
  session: AdminSessionPayload,
  input: {
    action: string;
    summary: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    affectedRecords?: Array<{ type: string; id: string }>;
    dangerous?: boolean;
    tournamentChanging?: boolean;
  },
) {
  return adminState.auditStore.record({
    sessionId: session.sessionId,
    ...input,
  });
}

function selectedSongKeysForRound(roundNumber: 1 | 2 | 3 | 4) {
  return adminState.resultStore
    .getRoundResult(roundNumber)
    ?.sets.map((set) => set.selectedChart.songKey) ?? [];
}

function resetRoundState(roundNumber: 1 | 2 | 3 | 4) {
  adminState.drawStateStore.unmarkSelectedSongs(selectedSongKeysForRound(roundNumber));
  adminState.resultStore.resetRound(roundNumber);
  adminState.ballotStore.resetRound(roundNumber);
  adminState.votingWindowStore.resetRound(roundNumber);
  adminState.drawStateStore.resetRound(roundNumber);
}

function invalidateRoundVotingForReroll(
  roundNumber: 1 | 2 | 3 | 4,
  reason: string,
  session: AdminSessionPayload,
) {
  const snapshot = getVotingRoundSnapshot(roundNumber);
  const ballots = adminState.ballotStore.listForRound(roundNumber);
  const result = adminState.resultStore.getRoundResult(roundNumber);
  const votingStarted = snapshot.openedAt !== null || ballots.length > 0 || result !== null;

  if (!votingStarted) {
    return null;
  }

  if (result && result.revealPhase !== "computed") {
    throw new Error("Rerolls after reveal starts require result correction or a full round reset.");
  }

  const invalidation = adminState.ballotStore.invalidateRound({
    roundNumber,
    reason,
    adminSessionId: session.sessionId,
    invalidatedAt: snapshot.serverNow,
  });

  adminState.resultStore.clearRoundResult(roundNumber);
  adminState.votingWindowStore.resetRound(roundNumber);
  adminState.ballotStore.setPhoneStatus(roundNumber, { phase: "voting_open" });

  return {
    id: invalidation.id,
    ballotCount: invalidation.ballotIds.length,
    previousStatus: snapshot.status,
  };
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

export async function refreshAdminSessionAction() {
  await refreshAdminSessionCookie();
}

export async function takeHostControlAction(formData: FormData) {
  const session = await requireAdminSession();
  const hostToken = createHostToken();
  const force = getString(formData, "forceHostTakeover") === "true";

  try {
    await hydrateTournamentState();
    const before = adminState.hostLockStore.getSnapshot(session.sessionId);
    const result = adminState.hostLockStore.acquire(session.sessionId, hostToken, Date.now(), {
      force,
    });

    await setHostTokenCookie(hostToken);
    audit(session, {
      action: result.takeover ? "host_lock_takeover" : "host_lock_acquire",
      summary: result.takeover
        ? "Forced takeover of the active host lock."
        : "Acquired host control.",
      dangerous: result.takeover,
      tournamentChanging: false,
      metadata: {
        force,
        previousOwnerSessionId: result.takeover ? before.ownerSessionId : null,
      },
    });
    await persistTournamentState();
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not take host control.");
  }

  revalidatePath("/coolguy69");
}

export async function refreshHostLockAction() {
  const session = await requireAdminSession();
  const hostToken = await getHostTokenCookie();

  await hydrateTournamentState();

  if (hostToken) {
    adminState.hostLockStore.refresh(session.sessionId, hostToken);
    await persistTournamentState();
  }
}

export async function releaseHostControlAction() {
  const session = await requireAdminSession();
  const hostToken = await getHostTokenCookie();

  await hydrateTournamentState();

  if (hostToken) {
    adminState.hostLockStore.release(session.sessionId, hostToken);
  }

  audit(session, {
    action: "host_lock_release",
    summary: "Released host control.",
    tournamentChanging: false,
  });
  await persistTournamentState();
  await clearHostTokenCookie();
  revalidatePath("/coolguy69");
}

async function requireActiveHost() {
  const session = await requireAdminSession();
  const hostToken = await getHostTokenCookie();

  await hydrateTournamentState();

  if (!hostToken || !adminState.hostLockStore.refresh(session.sessionId, hostToken)) {
    throw new Error("Host control is required for this action.");
  }

  return session;
}

export async function addPlayerAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    const player = adminState.rosterStore.createOrUpdatePlayer({
      startggUsername: getString(formData, "startggUsername"),
      active: true,
    });
    audit(session, {
      action: "roster_player_add",
      summary: `Added active player ${player.startggUsername}.`,
      affectedRecords: [{ type: "player", id: player.id }],
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not add player.");
  }

  await persistTournamentState();
  revalidatePath("/coolguy69");
}

export async function bulkImportPlayersAction(formData: FormData) {
  const session = await requireActiveHost();
  const usernames = getString(formData, "startggUsernames")
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);

  const result = adminState.rosterStore.bulkImport(usernames);
  audit(session, {
    action: "roster_bulk_import",
    summary: `Bulk imported roster names: ${result.created} created, ${result.skipped} skipped.`,
    metadata: result,
  });
  await persistTournamentState();
  revalidatePath("/coolguy69");
}

export async function setPlayerActiveStatusAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    const player = adminState.rosterStore.setPlayerActiveStatus(
      getString(formData, "playerId"),
      getString(formData, "active") === "true",
    );
    audit(session, {
      action: "roster_active_status_update",
      summary: `${player.active ? "Reactivated" : "Marked inactive"} player ${player.startggUsername}.`,
      affectedRecords: [{ type: "player", id: player.id }],
      metadata: { active: player.active },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not update player.");
  }

  await persistTournamentState();
  revalidatePath("/coolguy69");
}

export async function updateChartExclusionAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    const chartKey = getString(formData, "chartKey");
    const excluded = getString(formData, "excluded") === "true";
    const reason = getRequiredReason(formData);
    const before = adminState.drawStateStore
      .getCharts()
      .find((chart) => chart.chartKey === chartKey);

    if (!before) {
      throw new Error("Unknown chart key.");
    }

    const exclusion = adminState.drawStateStore.updateChartExclusion({
      chartKey,
      excluded,
      reason,
    });

    audit(session, {
      action: excluded ? "chart_exclusion_add" : "chart_exclusion_remove",
      summary: `${excluded ? "Excluded" : "Re-included"} ${before.displayDifficulty} chart ${before.name}.`,
      reason,
      dangerous: true,
      affectedRecords: [{ type: "chart", id: before.id }],
      metadata: {
        chartKey,
        displayDifficulty: before.displayDifficulty,
        excluded: exclusion.excluded,
        updatedAt: exclusion.updatedAt,
      },
    });
  } catch (error) {
    redirectWithError(
      error instanceof Error ? error.message : "Could not update chart exclusion.",
    );
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function addInactivePlayerToCurrentRoundAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    const roundNumber = getRoundNumber(formData);
    const reason = getRequiredReason(formData);
    const entry = adminState.rosterStore.addPlayerToCurrentRoundEligibility({
      playerId: getString(formData, "playerId"),
      roundNumber,
      reason,
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
    audit(session, {
      action: "current_round_eligibility_add",
      summary: `Added ${player?.startggUsername ?? entry.playerId} to Round ${roundNumber} eligibility.`,
      reason,
      dangerous: true,
      affectedRecords: [{ type: "player", id: entry.playerId }],
      metadata: { roundNumber },
    });
  } catch (error) {
    redirectWithError(
      error instanceof Error ? error.message : "Could not update round eligibility.",
    );
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function drawRoundSetAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    const draw = adminState.drawStateStore.drawRoundSet({
      roundNumber: getRoundNumber(formData),
      setOrder: Number(getString(formData, "setOrder")) as 1 | 2,
    });
    audit(session, {
      action: "draw_round_set",
      summary: `Drew Round ${draw.roundNumber} - ${draw.displayLabel}.`,
      affectedRecords: [{ type: "draw", id: draw.id }],
      metadata: {
        roundNumber: draw.roundNumber,
        setOrder: draw.setOrder,
        version: draw.version,
      },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not draw round set.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function rerollOneChartAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    const reason = getRequiredReason(formData);
    const chartId = getString(formData, "chartId");
    const roundNumber = getRoundNumber(formData);
    const postVoteInvalidation = invalidateRoundVotingForReroll(roundNumber, reason, session);
    const draw = adminState.drawStateStore.rerollOneChart({
      roundNumber,
      setOrder: Number(getString(formData, "setOrder")) as 1 | 2,
      chartId,
      reason,
    });
    audit(session, {
      action: "reroll_one_chart",
      summary: `Rerolled one chart in Round ${draw.roundNumber} - ${draw.displayLabel}.`,
      reason,
      dangerous: true,
      affectedRecords: [
        { type: "draw", id: draw.id },
        { type: "chart", id: chartId },
      ],
      metadata: {
        roundNumber: draw.roundNumber,
        setOrder: draw.setOrder,
        version: draw.version,
        postVoteInvalidation,
      },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not reroll chart.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function rerollRoundSetAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    const reason = getRequiredReason(formData);
    const roundNumber = getRoundNumber(formData);
    const postVoteInvalidation = invalidateRoundVotingForReroll(roundNumber, reason, session);
    const draw = adminState.drawStateStore.rerollRoundSet({
      roundNumber,
      setOrder: Number(getString(formData, "setOrder")) as 1 | 2,
      reason,
    });
    audit(session, {
      action: "reroll_round_set",
      summary: `Rerolled Round ${draw.roundNumber} - ${draw.displayLabel}.`,
      reason,
      dangerous: true,
      affectedRecords: [{ type: "draw", id: draw.id }],
      metadata: {
        roundNumber: draw.roundNumber,
        setOrder: draw.setOrder,
        version: draw.version,
        postVoteInvalidation,
      },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not reroll round set.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function rerollFullRoundAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    const reason = getRequiredReason(formData);
    const roundNumber = getRoundNumber(formData);
    const postVoteInvalidation = invalidateRoundVotingForReroll(roundNumber, reason, session);
    const draws = adminState.drawStateStore.rerollFullRound({
      roundNumber,
      reason,
    });
    audit(session, {
      action: "reroll_full_round",
      summary: `Rerolled both chart sets for Round ${roundNumber}.`,
      reason,
      dangerous: true,
      affectedRecords: draws.map((draw) => ({ type: "draw", id: draw.id })),
      metadata: { roundNumber, postVoteInvalidation },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not reroll full round.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function openVotingAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    const roundNumber = getRoundNumber(formData);
    const snapshot = getVotingRoundSnapshot(roundNumber);

    adminState.votingWindowStore.openVoting({
      roundNumber,
      drawsReady: snapshot.drawnSetCount === 2,
      eligiblePlayers: snapshot.eligiblePlayers,
    });
    audit(session, {
      action: "open_voting",
      summary: `Opened voting for Round ${roundNumber}.`,
      metadata: {
        roundNumber,
        eligibleCount: snapshot.eligibleCount,
      },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not open voting.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function pauseVotingAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    const roundNumber = getRoundNumber(formData);

    getVotingRoundSnapshot(roundNumber);
    adminState.votingWindowStore.pauseVoting(roundNumber);
    audit(session, {
      action: "pause_voting",
      summary: `Paused voting for Round ${roundNumber}.`,
      metadata: { roundNumber },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not pause voting.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function resumeVotingAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    const roundNumber = getRoundNumber(formData);

    adminState.votingWindowStore.resumeVoting(roundNumber);
    audit(session, {
      action: "resume_voting",
      summary: `Resumed voting for Round ${roundNumber}.`,
      metadata: { roundNumber },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not resume voting.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function closeVotingAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    const roundNumber = getRoundNumber(formData);

    adminState.votingWindowStore.closeVoting(roundNumber);
    adminState.ballotStore.setPhoneStatus(roundNumber, { phase: "closed_revealing" });
    audit(session, {
      action: "close_voting",
      summary: `Closed voting for Round ${roundNumber}.`,
      metadata: { roundNumber },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not close voting.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function manualBallotAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));

    const roundNumber = getRoundNumber(formData);
    const snapshot = getVotingRoundSnapshot(roundNumber);

    if (!snapshot.canAcceptManualBallot) {
      throw new Error("Manual ballots are allowed only before results reveal.");
    }

    const result = adminState.resultStore.getRoundResult(roundNumber);

    if (result && result.revealPhase !== "computed") {
      throw new Error(
        "Manual ballots are allowed before result reveal starts. Use result correction after reveal begins.",
      );
    }

    const playerId = getString(formData, "playerId");
    const player = snapshot.eligiblePlayers.find((candidate) => candidate.id === playerId);

    if (!player) {
      throw new Error("Manual ballot player must be eligible for the voting window.");
    }

    const reason = getRequiredReason(formData);

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

    const ballot = adminState.ballotStore.submit(
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

    if (result?.revealPhase === "computed") {
      adminState.resultStore.clearRoundResult(roundNumber);
      adminState.votingWindowStore.returnToClosedForRecompute(roundNumber);
    }

    audit(session, {
      action: "manual_ballot",
      summary: `${existing ? "Replaced" : "Entered"} manual ballot for ${player.startggUsername}.`,
      reason,
      dangerous: true,
      affectedRecords: [
        { type: "ballot", id: ballot.id },
        { type: "player", id: player.id },
      ],
      metadata: {
        roundNumber,
        replacedExistingBallot: Boolean(existing),
        manualOverride: snapshot.postCloseManualBallotsAreOverrides,
        invalidatedComputedResult: result?.revealPhase === "computed",
      },
    });
    getVotingRoundSnapshot(roundNumber);
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not save manual ballot.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function computeResultsAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    const roundNumber = getRoundNumber(formData);
    const snapshot = getVotingRoundSnapshot(roundNumber);

    if (snapshot.status !== "voting_closed") {
      throw new Error("Voting must be closed before results are computed.");
    }

    const result = adminState.resultStore.computeRound({
      roundNumber,
      draws: getRoundDrawRecords(roundNumber),
      ballots: adminState.ballotStore.listForRound(roundNumber),
      eligiblePlayers: snapshot.eligiblePlayers,
      now: snapshot.serverNow,
    });
    adminState.votingWindowStore.setResultsPhase(roundNumber, "results_computed");
    adminState.ballotStore.setPhoneStatus(roundNumber, { phase: "closed_revealing" });
    audit(session, {
      action: "compute_results",
      summary: `Computed results for Round ${roundNumber}.`,
      affectedRecords: [{ type: "result", id: result.id }],
      metadata: { roundNumber },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not compute results.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function advanceResultRevealAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    const roundNumber = getRoundNumber(formData);
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
    audit(session, {
      action: "advance_result_reveal",
      summary: `Advanced Round ${roundNumber} reveal to ${result.revealPhase}.`,
      affectedRecords: [{ type: "result", id: result.id }],
      metadata: { roundNumber, revealPhase: result.revealPhase },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not advance result reveal.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function downloadPrivateCsvAction(roundNumber: 1 | 2 | 3 | 4) {
  await requireAdminSession();
  await hydrateTournamentState();

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
  const session = await requireActiveHost();

  try {
    const roundNumber = getRoundNumber(formData);

    adminState.roundStateStore.setCurrentRound(roundNumber);
    audit(session, {
      action: "set_current_round",
      summary: `Set current round to Round ${roundNumber}.`,
      metadata: { roundNumber },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not set current round.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function advanceCurrentRoundAction() {
  const session = await requireActiveHost();

  try {
    const next = adminState.roundStateStore.advanceRound();
    audit(session, {
      action: "advance_current_round",
      summary: `Advanced current round to Round ${next.currentRound}.`,
      metadata: next,
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not advance round.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function startRehearsalModeAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    const reason = getRequiredReason(formData);
    resetTournamentOperationalState();
    adminState.roundStateStore.setCurrentRound(1);
    adminState.roundStateStore.setRehearsalMode(true);

    Array.from(
      { length: 12 },
      (_, index) => `Rehearsal Player ${String(index + 1).padStart(2, "0")}`,
    ).forEach((startggUsername) => {
      adminState.rosterStore.createOrUpdatePlayer({ startggUsername, active: true });
    });
    audit(session, {
      action: "start_rehearsal_mode",
      summary: "Started rehearsal mode and loaded the disposable rehearsal roster.",
      reason,
      dangerous: true,
      metadata: { loadedPlayers: 12 },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not start rehearsal mode.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function resetRehearsalModeAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    const reason = getRequiredReason(formData);
    resetTournamentOperationalState();
    adminState.roundStateStore.setCurrentRound(1);
    adminState.roundStateStore.setRehearsalMode(false);
    audit(session, {
      action: "reset_rehearsal_mode",
      summary: "Reset rehearsal data and returned to tournament mode.",
      reason,
      dangerous: true,
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not reset rehearsal data.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function seedRehearsalTiebreakAction() {
  const session = await requireActiveHost();

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
    audit(session, {
      action: "seed_rehearsal_tiebreak",
      summary: `Seeded rehearsal tiebreak ballots for Round ${currentRound}.`,
      metadata: { roundNumber: currentRound, playerCount: players.length },
    });
  } catch (error) {
    redirectWithError(
      error instanceof Error ? error.message : "Could not seed rehearsal tiebreak.",
    );
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function reopenVotingAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    const roundNumber = getRoundNumber(formData);
    const reason = getRequiredReason(formData);
    const durationMinutes = Number(getString(formData, "durationMinutes"));
    const result = adminState.resultStore.getRoundResult(roundNumber);

    if (result && result.revealPhase !== "computed") {
      throw new Error(
        "Emergency reopen is allowed only before result reveal starts. Use result correction after reveal begins.",
      );
    }

    if (result?.revealPhase === "computed") {
      adminState.resultStore.clearRoundResult(roundNumber);
      adminState.votingWindowStore.returnToClosedForRecompute(roundNumber);
    }

    adminState.votingWindowStore.reopenVoting({
      roundNumber,
      durationMinutes,
    });
    adminState.ballotStore.setPhoneStatus(roundNumber, { phase: "voting_open" });
    audit(session, {
      action: "emergency_reopen_voting",
      summary: `Reopened Round ${roundNumber} voting for ${durationMinutes} minute(s).`,
      reason,
      dangerous: true,
      metadata: {
        roundNumber,
        durationMinutes,
        invalidatedComputedResult: result?.revealPhase === "computed",
      },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not reopen voting.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function resetRoundAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    const roundNumber = getRoundNumber(formData);
    const reason = getRequiredReason(formData);

    resetRoundState(roundNumber);
    audit(session, {
      action: "reset_round",
      summary: `Reset Round ${roundNumber} operational state.`,
      reason,
      dangerous: true,
      metadata: { roundNumber },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not reset round.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}

export async function overrideResultAction(formData: FormData) {
  const session = await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    const roundNumber = getRoundNumber(formData);
    const reason = getRequiredReason(formData);
    const [setOrderText, chartId] = getString(formData, "resultTarget").split("|");
    const setOrder = Number(setOrderText) as 1 | 2;
    const before = adminState.resultStore.getRoundResult(roundNumber);

    if (!before) {
      throw new Error("Results must be computed before a result correction.");
    }

    const oldSelected = before.sets.find((set) => set.setOrder === setOrder)?.selectedChart;
    const result = adminState.resultStore.overrideSelectedChart({
      roundNumber,
      setOrder,
      chartId,
    });
    const correctedSet = result.sets.find((set) => set.setOrder === setOrder);

    if (result.revealPhase === "final") {
      if (oldSelected) {
        adminState.drawStateStore.unmarkSelectedSongs([oldSelected.songKey]);
      }

      if (correctedSet) {
        adminState.drawStateStore.markSelectedSong(correctedSet.selectedChart.songKey);
      }

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
    }

    audit(session, {
      action: "result_correction_override",
      summary: `Overrode Round ${roundNumber} ${correctedSet?.displayLabel ?? `Set ${setOrder}`} selected chart.`,
      reason,
      dangerous: true,
      affectedRecords: [
        { type: "result", id: result.id },
        { type: "chart", id: chartId },
      ],
      metadata: {
        roundNumber,
        setOrder,
        oldChartId: oldSelected?.id ?? null,
        newChartId: correctedSet?.selectedChart.id ?? chartId,
        revealPhase: result.revealPhase,
      },
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not override result.");
  }

  await persistTournamentState();
  revalidateTournamentViews(revalidatePath);
}
