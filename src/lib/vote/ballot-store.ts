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

export type BallotStoreSnapshot = {
  ballots: RoundBallot[];
  phoneStatus: Array<{
    roundNumber: 1 | 2 | 3 | 4;
    status: PhoneRoundStatus;
  }>;
};

export class BallotStore {
  private ballots = new Map<string, RoundBallot>();
  private phoneStatus = new Map<1 | 2 | 3 | 4, PhoneRoundStatus>();

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

  resetRound(roundNumber: 1 | 2 | 3 | 4) {
    for (const key of this.ballots.keys()) {
      if (key.startsWith(`${roundNumber}:`)) {
        this.ballots.delete(key);
      }
    }

    this.phoneStatus.delete(roundNumber);
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
        ...ballot,
        choices: ballot.choices.map((choice) => ({
          ...choice,
          bannedChartIds: [...choice.bannedChartIds],
        })),
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
    };
  }

  importSnapshot(snapshot: BallotStoreSnapshot) {
    this.ballots = new Map(
      snapshot.ballots.map((ballot) => [
        ballotKey(ballot.roundNumber, ballot.playerId),
        {
          ...ballot,
          choices: ballot.choices.map((choice) => ({
            ...choice,
            bannedChartIds: [...choice.bannedChartIds],
          })),
        },
      ]),
    );
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
  }
}
