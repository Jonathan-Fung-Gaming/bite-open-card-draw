import type { ResultRevealPhase } from "@/lib/results/result-engine";
import type { RoundNumber } from "@/lib/round/round-state";
import type { VotingRoundStatus } from "@/lib/vote/voting-window";

export type PublicStateActiveDraw = {
  drawId: string;
  roundSetId: string;
  version: number;
};

export type PublicStateTiebreakStart = {
  setOrder: 1 | 2;
  startedAt: string;
};

export type PublicPhoneReleaseStatus = "held" | "released";

export type PublicStateGenerationRecord = {
  roundNumber: RoundNumber;
  generation: number;
  transitionKind: string;
  resultMode: boolean;
  updatedAt: string | null;
  activeDraws: PublicStateActiveDraw[];
  votingStatus: VotingRoundStatus;
  votingDeadline: string | null;
  resultId: string | null;
  resultPhase: ResultRevealPhase | null;
  resultPhaseStartedAt: string | null;
  tiebreakStarts: PublicStateTiebreakStart[];
  phoneReleaseStatus: PublicPhoneReleaseStatus;
  phoneReleasedAt: string | null;
};

export type PublicStateGenerationStoreSnapshot = {
  rounds: PublicStateGenerationRecord[];
};

export type AdvancePublicStateGenerationInput = Omit<PublicStateGenerationRecord, "generation"> & {
  expectedGeneration: number;
};

const ROUND_NUMBERS: readonly RoundNumber[] = [1, 2, 3, 4];

function assertGeneration(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function assertRecord(record: PublicStateGenerationRecord) {
  assertGeneration(record.generation, "Public state generation");

  if (!record.transitionKind.trim()) {
    throw new Error("Public state transition kind is required.");
  }

  for (const draw of record.activeDraws) {
    if (
      !draw.drawId ||
      !draw.roundSetId ||
      !Number.isSafeInteger(draw.version) ||
      draw.version < 1
    ) {
      throw new Error("Public state active draws require ids and a positive integer version.");
    }
  }
}

function cloneRecord(record: PublicStateGenerationRecord): PublicStateGenerationRecord {
  return {
    ...record,
    activeDraws: record.activeDraws.map((draw) => ({ ...draw })),
    tiebreakStarts: record.tiebreakStarts.map((start) => ({ ...start })),
  };
}

export function createDefaultPublicStateGenerationRecord(
  roundNumber: RoundNumber,
): PublicStateGenerationRecord {
  return {
    roundNumber,
    generation: 0,
    transitionKind: "legacy",
    resultMode: false,
    updatedAt: null,
    activeDraws: [],
    votingStatus: "not_started",
    votingDeadline: null,
    resultId: null,
    resultPhase: null,
    resultPhaseStartedAt: null,
    tiebreakStarts: [],
    phoneReleaseStatus: "held",
    phoneReleasedAt: null,
  };
}

export function createDefaultPublicStateGenerationSnapshot(): PublicStateGenerationStoreSnapshot {
  return {
    rounds: ROUND_NUMBERS.map(createDefaultPublicStateGenerationRecord),
  };
}

export class PublicStateGenerationStore {
  private rounds = new Map<RoundNumber, PublicStateGenerationRecord>(
    createDefaultPublicStateGenerationSnapshot().rounds.map((record) => [
      record.roundNumber,
      record,
    ]),
  );

  getRound(roundNumber: RoundNumber) {
    return cloneRecord(
      this.rounds.get(roundNumber) ?? createDefaultPublicStateGenerationRecord(roundNumber),
    );
  }

  advance(input: AdvancePublicStateGenerationInput) {
    assertGeneration(input.expectedGeneration, "Expected public state generation");

    const current = this.getRound(input.roundNumber);

    if (current.generation !== input.expectedGeneration) {
      throw new Error(
        `Public state generation changed before this transition could run. Expected ${input.expectedGeneration}, found ${current.generation}.`,
      );
    }

    const next: PublicStateGenerationRecord = {
      roundNumber: input.roundNumber,
      generation: current.generation + 1,
      transitionKind: input.transitionKind,
      resultMode: input.resultMode,
      updatedAt: input.updatedAt,
      activeDraws: input.activeDraws.map((draw) => ({ ...draw })),
      votingStatus: input.votingStatus,
      votingDeadline: input.votingDeadline,
      resultId: input.resultId,
      resultPhase: input.resultPhase,
      resultPhaseStartedAt: input.resultPhaseStartedAt,
      tiebreakStarts: input.tiebreakStarts.map((start) => ({ ...start })),
      phoneReleaseStatus: input.phoneReleaseStatus,
      phoneReleasedAt: input.phoneReleasedAt,
    };

    assertRecord(next);
    this.rounds.set(input.roundNumber, next);

    return cloneRecord(next);
  }

  exportSnapshot(): PublicStateGenerationStoreSnapshot {
    return {
      rounds: ROUND_NUMBERS.map((roundNumber) => this.getRound(roundNumber)),
    };
  }

  importSnapshot(snapshot: PublicStateGenerationStoreSnapshot | null | undefined) {
    const imported = new Map<RoundNumber, PublicStateGenerationRecord>();

    for (const record of snapshot?.rounds ?? []) {
      assertRecord(record);
      const existing = imported.get(record.roundNumber);

      if (!existing || record.generation > existing.generation) {
        imported.set(record.roundNumber, cloneRecord(record));
      }
    }

    this.rounds = new Map(
      ROUND_NUMBERS.map((roundNumber) => [
        roundNumber,
        imported.get(roundNumber) ?? createDefaultPublicStateGenerationRecord(roundNumber),
      ]),
    );
  }
}
