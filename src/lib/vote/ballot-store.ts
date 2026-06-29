import { randomUUID } from "node:crypto";
import {
  type SubmitRoundBallotOptions,
  validateRoundBallot,
  type PhoneRoundStatus,
  type RoundBallot,
  type SubmitRoundBallotInput,
} from "./ballot";
import type { DrawRecord } from "@/lib/draw/draw-state";

function ballotKey(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  return `${roundNumber}:${playerId}`;
}

const VOTER_PRESENCE_TTL_MS = 2 * 60 * 1000;

export type PlayerPresenceClaim = {
  roundNumber: 1 | 2 | 3 | 4;
  playerId: string;
  deviceId: string;
  claimedAt: string;
  expiresAt: string;
};

export type BallotInvalidationRecord = {
  id: string;
  roundNumber: 1 | 2 | 3 | 4;
  invalidatedAt: string;
  reason: string;
  adminSessionId: string;
  ballotIds: string[];
  ballots: RoundBallot[];
};

export type BallotStoreSnapshot = {
  ballots: RoundBallot[];
  ballotInvalidations?: BallotInvalidationRecord[];
  phoneStatus: Array<{
    roundNumber: 1 | 2 | 3 | 4;
    status: PhoneRoundStatus;
  }>;
  presenceClaims?: PlayerPresenceClaim[];
};

export class BallotStore {
  private ballots = new Map<string, RoundBallot>();
  private phoneStatus = new Map<1 | 2 | 3 | 4, PhoneRoundStatus>();
  private presenceClaims = new Map<string, PlayerPresenceClaim>();
  private ballotInvalidations: BallotInvalidationRecord[] = [];

  submit(
    input: SubmitRoundBallotInput,
    draws: readonly DrawRecord[],
    now = new Date().toISOString(),
    options: SubmitRoundBallotOptions = {},
  ) {
    validateRoundBallot(input, draws);

    const key = ballotKey(input.roundNumber, input.playerId);
    const existing = this.ballots.get(key);
    const manualReason = options.manualReason?.trim() || null;
    const ballot: RoundBallot = {
      id: existing?.id ?? randomUUID(),
      roundNumber: input.roundNumber,
      playerId: input.playerId,
      playerStartggUsername: input.playerStartggUsername,
      choices: input.choices,
      submittedAt: now,
      revision: (existing?.revision ?? 0) + 1,
      editTokenHash: options.editTokenHash ?? null,
      source: options.source ?? "player",
      manualReason,
      manualOverride: options.manualOverride ?? false,
      replacedExistingBallot: options.replacedExistingBallot ?? false,
    };

    this.ballots.set(key, ballot);

    return ballot;
  }

  get(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
    return this.ballots.get(ballotKey(roundNumber, playerId)) ?? null;
  }

  listForRound(roundNumber: 1 | 2 | 3 | 4) {
    return [...this.ballots.values()].filter((ballot) => ballot.roundNumber === roundNumber);
  }

  claimVoterPresence(input: {
    roundNumber: 1 | 2 | 3 | 4;
    playerId: string;
    deviceId: string;
    nowMs?: number;
  }) {
    const nowMs = input.nowMs ?? Date.now();
    const claimedAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + VOTER_PRESENCE_TTL_MS).toISOString();

    this.pruneExpiredPresence(nowMs);
    this.presenceClaims.set(
      `${input.roundNumber}:${input.playerId}:${input.deviceId}`,
      {
        roundNumber: input.roundNumber,
        playerId: input.playerId,
        deviceId: input.deviceId,
        claimedAt,
        expiresAt,
      },
    );

    const otherActiveDeviceCount = [...this.presenceClaims.values()].filter(
      (claim) =>
        claim.roundNumber === input.roundNumber &&
        claim.playerId === input.playerId &&
        claim.deviceId !== input.deviceId,
    ).length;

    return {
      otherActiveDeviceCount,
      hasOtherActiveDevice: otherActiveDeviceCount > 0,
    };
  }

  invalidateRound(input: {
    roundNumber: 1 | 2 | 3 | 4;
    reason: string;
    adminSessionId: string;
    invalidatedAt?: string;
  }) {
    const ballots = this.listForRound(input.roundNumber);
    const record: BallotInvalidationRecord = {
      id: randomUUID(),
      roundNumber: input.roundNumber,
      invalidatedAt: input.invalidatedAt ?? new Date().toISOString(),
      reason: input.reason,
      adminSessionId: input.adminSessionId,
      ballotIds: ballots.map((ballot) => ballot.id),
      ballots: ballots.map(cloneBallot),
    };

    for (const key of this.ballots.keys()) {
      if (key.startsWith(`${input.roundNumber}:`)) {
        this.ballots.delete(key);
      }
    }

    this.phoneStatus.delete(input.roundNumber);
    this.ballotInvalidations.push(record);

    return record;
  }

  resetRound(roundNumber: 1 | 2 | 3 | 4) {
    for (const key of this.ballots.keys()) {
      if (key.startsWith(`${roundNumber}:`)) {
        this.ballots.delete(key);
      }
    }

    this.phoneStatus.delete(roundNumber);
    this.presenceClaims = new Map(
      [...this.presenceClaims.entries()].filter(([, claim]) => claim.roundNumber !== roundNumber),
    );
  }

  getPhoneStatus(roundNumber: 1 | 2 | 3 | 4): PhoneRoundStatus {
    return this.phoneStatus.get(roundNumber) ?? { phase: "voting_open" };
  }

  setPhoneStatus(roundNumber: 1 | 2 | 3 | 4, status: PhoneRoundStatus) {
    this.phoneStatus.set(roundNumber, status);
  }

  exportSnapshot(): BallotStoreSnapshot {
    return {
      ballots: [...this.ballots.values()].map((ballot) => ({
        ...cloneBallot(ballot),
      })),
      ballotInvalidations: this.ballotInvalidations.map((record) => ({
        ...record,
        ballotIds: [...record.ballotIds],
        ballots: record.ballots.map(cloneBallot),
      })),
      phoneStatus: [...this.phoneStatus.entries()].map(([roundNumber, status]) => ({
        roundNumber,
        status:
          status.phase === "revealed"
            ? {
                ...status,
                selectedCharts: status.selectedCharts.map((chart) => ({ ...chart })),
              }
            : { ...status },
      })),
      presenceClaims: [...this.presenceClaims.values()].map((claim) => ({ ...claim })),
    };
  }

  importSnapshot(snapshot: BallotStoreSnapshot) {
    this.ballots = new Map(
      snapshot.ballots.map((ballot) => [
        ballotKey(ballot.roundNumber, ballot.playerId),
        cloneBallot(ballot),
      ]),
    );
    this.ballotInvalidations =
      snapshot.ballotInvalidations?.map((record) => ({
        ...record,
        ballotIds: [...record.ballotIds],
        ballots: record.ballots.map(cloneBallot),
      })) ?? [];
    this.phoneStatus = new Map(
      snapshot.phoneStatus.map((entry) => [
        entry.roundNumber,
        entry.status.phase === "revealed"
          ? {
              ...entry.status,
              selectedCharts: entry.status.selectedCharts.map((chart) => ({ ...chart })),
            }
          : { ...entry.status },
      ]),
    );
    this.presenceClaims = new Map(
      (snapshot.presenceClaims ?? []).map((claim) => [
        `${claim.roundNumber}:${claim.playerId}:${claim.deviceId}`,
        { ...claim },
      ]),
    );
  }

  private pruneExpiredPresence(nowMs: number) {
    for (const [key, claim] of this.presenceClaims.entries()) {
      if (Date.parse(claim.expiresAt) <= nowMs) {
        this.presenceClaims.delete(key);
      }
    }
  }
}

function cloneBallot(ballot: RoundBallot): RoundBallot {
  return {
    ...ballot,
    choices: ballot.choices.map((choice) => ({
      ...choice,
      bannedChartIds: [...choice.bannedChartIds],
    })),
  };
}
