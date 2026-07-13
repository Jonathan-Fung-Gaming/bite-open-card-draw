import type { RosterPlayer } from "@/lib/admin/roster";

export const TEN_MINUTES_MS = 10 * 60 * 1000;
export const ONE_MINUTE_MS = 60 * 1000;
export const FINAL_CHANGE_MS = 30 * 1000;
export const MAX_REOPEN_MINUTES = 10;

export type VotingRoundStatus =
  | "not_started"
  | "drawing"
  | "ready_to_vote"
  | "voting_open"
  | "voting_paused"
  | "final_30_seconds"
  | "extension_1_minute"
  | "voting_closed"
  | "results_computed"
  | "results_revealing"
  | "results_revealed"
  | "round_complete";

export type EligiblePlayerSnapshot = Pick<RosterPlayer, "id" | "startggUsername">;

type TimedVotingStatus = "voting_open" | "final_30_seconds" | "extension_1_minute";
type FinalWarningPreviousStatus = Exclude<TimedVotingStatus, "final_30_seconds">;

export type VotingWindowRecord = {
  roundNumber: 1 | 2 | 3 | 4;
  status: VotingRoundStatus;
  eligiblePlayers: EligiblePlayerSnapshot[];
  openedAt: string;
  closesAt: string | null;
  closedAt: string | null;
  extensionUsed: boolean;
  finalWarningStartedAt: string | null;
  finalWarningPreviousStatus?: FinalWarningPreviousStatus | null;
  pausedAt: string | null;
  pausedFromStatus: TimedVotingStatus | null;
  remainingMsWhenPaused: number | null;
  updatedAt: string;
};

export type VotingWindowStoreSnapshot = {
  windows: VotingWindowRecord[];
};

export type VotingRoundSnapshot = {
  roundNumber: 1 | 2 | 3 | 4;
  status: VotingRoundStatus;
  serverNow: string;
  drawnSetCount: number;
  eligiblePlayers: EligiblePlayerSnapshot[];
  eligibleCount: number;
  submittedCount: number;
  turnoutRatio: number;
  banSelectionsCast: number;
  openedAt: string | null;
  closesAt: string | null;
  closedAt: string | null;
  updatedAt: string | null;
  remainingMs: number;
  extensionUsed: boolean;
  finalWarningStartedAt: string | null;
  canOpen: boolean;
  canSubmit: boolean;
  canPause: boolean;
  canResume: boolean;
  canClose: boolean;
  canAcceptManualBallot: boolean;
  postCloseManualBallotsAreOverrides: boolean;
};

type VotingSnapshotInput = {
  roundNumber: 1 | 2 | 3 | 4;
  drawnSetCount: number;
  eligiblePlayers: EligiblePlayerSnapshot[];
  submittedPlayerIds: string[];
  banSelectionsCast?: number;
  nowMs?: number;
};

function toIso(ms: number) {
  return new Date(ms).toISOString();
}

function parseIso(value: string | null) {
  return value ? Date.parse(value) : null;
}

function dedupePlayers(players: EligiblePlayerSnapshot[]) {
  const byId = new Map<string, EligiblePlayerSnapshot>();

  for (const player of players) {
    byId.set(player.id, {
      id: player.id,
      startggUsername: player.startggUsername,
    });
  }

  return [...byId.values()].sort((left, right) =>
    left.startggUsername.localeCompare(right.startggUsername),
  );
}

function countSubmittedEligible(
  eligiblePlayers: EligiblePlayerSnapshot[],
  submittedPlayerIds: string[],
) {
  const eligibleIds = new Set(eligiblePlayers.map((player) => player.id));
  const submittedIds = new Set(submittedPlayerIds);

  return [...submittedIds].filter((playerId) => eligibleIds.has(playerId)).length;
}

function notOpenedStatus(drawnSetCount: number): VotingRoundStatus {
  if (drawnSetCount === 0) {
    return "not_started";
  }

  return drawnSetCount < 2 ? "drawing" : "ready_to_vote";
}

function cloneVotingWindowRecord(record: VotingWindowRecord): VotingWindowRecord {
  return {
    ...record,
    eligiblePlayers: record.eligiblePlayers.map((player) => ({ ...player })),
  };
}

export function formatVotingTime(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function formatVotingStatusLabel(status: VotingRoundStatus) {
  switch (status) {
    case "final_30_seconds":
      return "Final 30 seconds";
    case "extension_1_minute":
      return "One-minute extension";
    case "voting_open":
      return "Voting open";
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
    case "ready_to_vote":
      return "Ready to vote";
    case "drawing":
      return "Drawing";
    case "round_complete":
      return "Round complete";
    default:
      return "Voting";
  }
}

export function isPlayerSubmissionOpen(status: VotingRoundStatus) {
  return (
    status === "voting_open" || status === "final_30_seconds" || status === "extension_1_minute"
  );
}

export function isManualBallotAllowed(status: VotingRoundStatus) {
  return (
    status === "voting_open" ||
    status === "final_30_seconds" ||
    status === "extension_1_minute" ||
    status === "voting_closed" ||
    status === "results_computed"
  );
}

export function isPostCloseManualOverride(status: VotingRoundStatus) {
  return status === "voting_closed" || status === "results_computed";
}

export function isCurrentRoundEligibilityChangeAllowed(status: VotingRoundStatus) {
  return isPlayerSubmissionOpen(status) || status === "voting_paused";
}

export class VotingWindowStore {
  private windows = new Map<1 | 2 | 3 | 4, VotingWindowRecord>();

  constructor(private readonly clock: () => number = () => Date.now()) {}

  openVoting(input: {
    roundNumber: 1 | 2 | 3 | 4;
    drawsReady: boolean;
    eligiblePlayers: EligiblePlayerSnapshot[];
    nowMs?: number;
  }) {
    if (!input.drawsReady) {
      throw new Error("Both chart sets must be drawn before voting opens.");
    }

    const eligiblePlayers = dedupePlayers(input.eligiblePlayers);

    if (eligiblePlayers.length === 0) {
      throw new Error("At least one eligible active player is required before voting opens.");
    }

    const existing = this.windows.get(input.roundNumber);

    if (existing) {
      throw new Error("Voting has already opened for this round.");
    }

    const nowMs = input.nowMs ?? this.clock();
    const record: VotingWindowRecord = {
      roundNumber: input.roundNumber,
      status: "voting_open",
      eligiblePlayers,
      openedAt: toIso(nowMs),
      closesAt: toIso(nowMs + TEN_MINUTES_MS),
      closedAt: null,
      extensionUsed: false,
      finalWarningStartedAt: null,
      finalWarningPreviousStatus: null,
      pausedAt: null,
      pausedFromStatus: null,
      remainingMsWhenPaused: null,
      updatedAt: toIso(nowMs),
    };

    this.windows.set(input.roundNumber, record);

    return record;
  }

  pauseVoting(roundNumber: 1 | 2 | 3 | 4, nowMs = this.clock()) {
    const record = this.requireWindow(roundNumber);

    if (!isPlayerSubmissionOpen(record.status)) {
      throw new Error("Voting can only be paused while submissions are open.");
    }

    const closesAtMs = parseIso(record.closesAt);

    record.pausedFromStatus = record.status;
    record.remainingMsWhenPaused = Math.max(0, (closesAtMs ?? nowMs) - nowMs);
    record.status = "voting_paused";
    record.pausedAt = toIso(nowMs);
    record.closesAt = null;
    record.updatedAt = toIso(nowMs);

    return record;
  }

  resumeVoting(roundNumber: 1 | 2 | 3 | 4, nowMs = this.clock()) {
    const record = this.requireWindow(roundNumber);

    if (
      record.status !== "voting_paused" ||
      !record.pausedFromStatus ||
      record.remainingMsWhenPaused === null
    ) {
      throw new Error("Voting is not paused.");
    }

    record.status = record.pausedFromStatus;
    record.closesAt = toIso(nowMs + record.remainingMsWhenPaused);
    record.pausedAt = null;
    record.pausedFromStatus = null;
    record.remainingMsWhenPaused = null;
    record.updatedAt = toIso(nowMs);

    return record;
  }

  closeVoting(roundNumber: 1 | 2 | 3 | 4, nowMs = this.clock()) {
    const record = this.requireWindow(roundNumber);

    if (
      record.status === "results_computed" ||
      record.status === "results_revealing" ||
      record.status === "results_revealed" ||
      record.status === "round_complete"
    ) {
      throw new Error("Voting is already past the close stage.");
    }

    record.status = "voting_closed";
    record.closedAt = record.closedAt ?? toIso(nowMs);
    record.closesAt = record.closedAt;
    record.finalWarningPreviousStatus = null;
    record.pausedAt = null;
    record.pausedFromStatus = null;
    record.remainingMsWhenPaused = null;
    record.updatedAt = toIso(nowMs);

    return record;
  }

  advanceVoting(roundNumber: 1 | 2 | 3 | 4, submittedPlayerIds: string[], nowMs = this.clock()) {
    const record = this.windows.get(roundNumber);

    if (!record) {
      return null;
    }

    this.advanceRecord(record, submittedPlayerIds, nowMs);

    return record;
  }

  reopenVoting(input: { roundNumber: 1 | 2 | 3 | 4; durationMinutes: number; nowMs?: number }) {
    const record = this.requireWindow(input.roundNumber);

    if (record.status !== "voting_closed" && record.status !== "results_computed") {
      throw new Error("Emergency reopen is allowed only after voting closes and before reveal.");
    }

    if (
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes < 1 ||
      input.durationMinutes > MAX_REOPEN_MINUTES
    ) {
      throw new Error(`Reopen duration must be 1-${MAX_REOPEN_MINUTES} minutes.`);
    }

    const nowMs = input.nowMs ?? this.clock();

    record.status = "voting_open";
    record.closesAt = toIso(nowMs + input.durationMinutes * ONE_MINUTE_MS);
    record.closedAt = null;
    record.extensionUsed = true;
    record.finalWarningStartedAt = null;
    record.finalWarningPreviousStatus = null;
    record.pausedAt = null;
    record.pausedFromStatus = null;
    record.remainingMsWhenPaused = null;
    record.updatedAt = toIso(nowMs);

    return record;
  }

  returnToClosedForRecompute(roundNumber: 1 | 2 | 3 | 4, nowMs = this.clock()) {
    const record = this.requireWindow(roundNumber);

    if (record.status !== "results_computed") {
      return record;
    }

    record.status = "voting_closed";
    record.closedAt = record.closedAt ?? toIso(nowMs);
    record.closesAt = record.closedAt;
    record.finalWarningPreviousStatus = null;
    record.updatedAt = toIso(nowMs);

    return record;
  }

  resetRound(roundNumber: 1 | 2 | 3 | 4) {
    this.windows.delete(roundNumber);
  }

  addEligiblePlayerToOpenRound(input: {
    roundNumber: 1 | 2 | 3 | 4;
    player: EligiblePlayerSnapshot;
    submittedPlayerIds?: string[];
    nowMs?: number;
  }) {
    const record = this.windows.get(input.roundNumber);

    if (!record) {
      return null;
    }

    if (!isCurrentRoundEligibilityChangeAllowed(record.status)) {
      throw new Error(
        "Current-round eligibility can change only while voting is open or paused before results are computed.",
      );
    }

    const wasAlreadyEligible = record.eligiblePlayers.some(
      (player) => player.id === input.player.id,
    );
    const eligiblePlayers = dedupePlayers([...record.eligiblePlayers, input.player]);
    const nowMs = input.nowMs ?? this.clock();

    record.eligiblePlayers = eligiblePlayers;

    if (!wasAlreadyEligible) {
      this.recomputeFinalWarningAfterEligibilityChange(
        record,
        input.submittedPlayerIds ?? [],
        nowMs,
      );
    }

    record.updatedAt = toIso(nowMs);

    return record;
  }

  setResultsPhase(
    roundNumber: 1 | 2 | 3 | 4,
    status: Extract<VotingRoundStatus, `results_${string}`>,
  ) {
    const record = this.requireWindow(roundNumber);

    if (record.status !== "voting_closed" && !record.status.startsWith("results_")) {
      throw new Error("Results phases can only start after voting closes.");
    }

    record.status = status;
    record.updatedAt = toIso(this.clock());

    return record;
  }

  getSnapshot(input: VotingSnapshotInput): VotingRoundSnapshot {
    const nowMs = input.nowMs ?? this.clock();
    const record = this.windows.get(input.roundNumber);

    if (record) {
      const effectiveRecord = cloneVotingWindowRecord(record);

      this.advanceRecord(effectiveRecord, input.submittedPlayerIds, nowMs);

      return this.snapshotFromRecord(effectiveRecord, input, nowMs);
    }

    const eligiblePlayers = dedupePlayers(input.eligiblePlayers);
    const status = notOpenedStatus(input.drawnSetCount);
    const submittedCount = countSubmittedEligible(eligiblePlayers, input.submittedPlayerIds);

    return {
      roundNumber: input.roundNumber,
      status,
      serverNow: toIso(nowMs),
      drawnSetCount: input.drawnSetCount,
      eligiblePlayers,
      eligibleCount: eligiblePlayers.length,
      submittedCount,
      turnoutRatio: eligiblePlayers.length === 0 ? 0 : submittedCount / eligiblePlayers.length,
      banSelectionsCast: input.banSelectionsCast ?? 0,
      openedAt: null,
      closesAt: null,
      closedAt: null,
      updatedAt: null,
      remainingMs: status === "ready_to_vote" ? TEN_MINUTES_MS : 0,
      extensionUsed: false,
      finalWarningStartedAt: null,
      canOpen: status === "ready_to_vote" && eligiblePlayers.length > 0,
      canSubmit: false,
      canPause: false,
      canResume: false,
      canClose: false,
      canAcceptManualBallot: false,
      postCloseManualBallotsAreOverrides: false,
    };
  }

  private requireWindow(roundNumber: 1 | 2 | 3 | 4) {
    const record = this.windows.get(roundNumber);

    if (!record) {
      throw new Error("Voting has not opened for this round.");
    }

    return record;
  }

  private advanceRecord(record: VotingWindowRecord, submittedPlayerIds: string[], nowMs: number) {
    if (record.status === "voting_paused" || !isPlayerSubmissionOpen(record.status)) {
      return;
    }

    const eligibleCount = record.eligiblePlayers.length;
    const submittedCount = countSubmittedEligible(record.eligiblePlayers, submittedPlayerIds);
    let closesAtMs = parseIso(record.closesAt) ?? nowMs;

    if (
      (record.status === "voting_open" || record.status === "extension_1_minute") &&
      nowMs < closesAtMs &&
      eligibleCount > 0 &&
      submittedCount >= eligibleCount
    ) {
      record.finalWarningPreviousStatus = record.status;
      record.status = "final_30_seconds";
      record.finalWarningStartedAt = toIso(nowMs);
      record.closesAt = toIso(nowMs + FINAL_CHANGE_MS);
      record.updatedAt = toIso(nowMs);
      return;
    }

    if (nowMs < closesAtMs) {
      return;
    }

    if (
      record.status === "voting_open" &&
      !record.extensionUsed &&
      eligibleCount > 0 &&
      submittedCount / eligibleCount < 0.75
    ) {
      closesAtMs += ONE_MINUTE_MS;
      record.status = "extension_1_minute";
      record.extensionUsed = true;
      record.closesAt = toIso(closesAtMs);
      record.updatedAt = toIso(nowMs);

      if (nowMs < closesAtMs) {
        return;
      }
    }

    record.status = "voting_closed";
    record.closedAt = record.closedAt ?? toIso(closesAtMs);
    record.closesAt = record.closedAt;
    record.finalWarningPreviousStatus = null;
    record.updatedAt = toIso(nowMs);
  }

  private recomputeFinalWarningAfterEligibilityChange(
    record: VotingWindowRecord,
    submittedPlayerIds: string[],
    nowMs: number,
  ) {
    if (record.status !== "final_30_seconds") {
      return;
    }

    const submittedCount = countSubmittedEligible(record.eligiblePlayers, submittedPlayerIds);

    if (submittedCount >= record.eligiblePlayers.length) {
      return;
    }

    const previousStatus = record.finalWarningPreviousStatus ?? "voting_open";
    const openedAtMs = parseIso(record.openedAt) ?? nowMs;
    const existingClosesAtMs = parseIso(record.closesAt) ?? nowMs;
    const scheduledClosesAtMs =
      openedAtMs + TEN_MINUTES_MS + (previousStatus === "extension_1_minute" ? ONE_MINUTE_MS : 0);

    record.status = previousStatus;
    record.finalWarningStartedAt = null;
    record.finalWarningPreviousStatus = null;
    record.closesAt = toIso(Math.max(nowMs, existingClosesAtMs, scheduledClosesAtMs));
  }

  private snapshotFromRecord(
    record: VotingWindowRecord,
    input: VotingSnapshotInput,
    nowMs: number,
  ): VotingRoundSnapshot {
    const submittedCount = countSubmittedEligible(record.eligiblePlayers, input.submittedPlayerIds);
    const closesAtMs = parseIso(record.closesAt);
    const remainingMs =
      record.status === "voting_paused"
        ? (record.remainingMsWhenPaused ?? 0)
        : Math.max(0, (closesAtMs ?? nowMs) - nowMs);

    return {
      roundNumber: input.roundNumber,
      status: record.status,
      serverNow: toIso(nowMs),
      drawnSetCount: input.drawnSetCount,
      eligiblePlayers: [...record.eligiblePlayers],
      eligibleCount: record.eligiblePlayers.length,
      submittedCount,
      turnoutRatio:
        record.eligiblePlayers.length === 0 ? 0 : submittedCount / record.eligiblePlayers.length,
      banSelectionsCast: input.banSelectionsCast ?? 0,
      openedAt: record.openedAt,
      closesAt: record.closesAt,
      closedAt: record.closedAt,
      updatedAt: record.updatedAt,
      remainingMs,
      extensionUsed: record.extensionUsed,
      finalWarningStartedAt: record.finalWarningStartedAt,
      canOpen: false,
      canSubmit: isPlayerSubmissionOpen(record.status),
      canPause: isPlayerSubmissionOpen(record.status),
      canResume: record.status === "voting_paused",
      canClose: isPlayerSubmissionOpen(record.status) || record.status === "voting_paused",
      canAcceptManualBallot: isManualBallotAllowed(record.status),
      postCloseManualBallotsAreOverrides: isPostCloseManualOverride(record.status),
    };
  }

  exportSnapshot(): VotingWindowStoreSnapshot {
    return {
      windows: [...this.windows.values()].map((window) => ({
        ...window,
        eligiblePlayers: window.eligiblePlayers.map((player) => ({ ...player })),
      })),
    };
  }

  importSnapshot(snapshot: VotingWindowStoreSnapshot) {
    this.windows = new Map(
      snapshot.windows.map((window) => [
        window.roundNumber,
        {
          ...window,
          eligiblePlayers: window.eligiblePlayers.map((player) => ({ ...player })),
        },
      ]),
    );
  }
}
