import { randomUUID } from "node:crypto";
import type { RandomIndex } from "@/lib/draw/draw-engine";
import { secureRandomIndex } from "@/lib/draw/draw-engine";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { PriorSelectedSongBlock } from "@/lib/results/selected-song-blocks";
import type { RoundBallot } from "@/lib/vote/ballot";
import type { EligiblePlayerSnapshot } from "@/lib/vote/voting-window";
import {
  computeRoundResult,
  RESULT_REVEAL_PHASES,
  type ResultRevealPhase,
  type ResultSetSnapshot,
  type RoundResultSnapshot,
} from "./result-engine";
import { getTiebreakRevealRemainingMs } from "./reveal-timing";

export type ResultStoreSnapshot = {
  results: RoundResultSnapshot[];
};

function cloneResultSet(set: ResultSetSnapshot): ResultSetSnapshot {
  return {
    ...set,
    selectedChart: { ...set.selectedChart },
    rows: set.rows.map((row) => ({
      ...row,
      chart: { ...row.chart },
    })),
    tiebreakCandidateIds: [...set.tiebreakCandidateIds],
    wheelSlots: set.wheelSlots.map((chart) => ({ ...chart })),
  };
}

function cloneRoundResult(result: RoundResultSnapshot): RoundResultSnapshot {
  return {
    ...result,
    eligiblePlayers: result.eligiblePlayers.map((player) => ({ ...player })),
    sets: [cloneResultSet(result.sets[0]), cloneResultSet(result.sets[1])],
  };
}

export class ResultStore {
  private results = new Map<1 | 2 | 3 | 4, RoundResultSnapshot>();

  constructor(private readonly randomIndex: RandomIndex = secureRandomIndex) {}

  computeRound(input: {
    roundNumber: 1 | 2 | 3 | 4;
    draws: readonly DrawRecord[];
    ballots: readonly RoundBallot[];
    eligiblePlayers: EligiblePlayerSnapshot[];
    priorSelectedSongBlocks: readonly PriorSelectedSongBlock[];
    now?: string;
  }) {
    if (this.results.has(input.roundNumber)) {
      throw new Error("Results have already been computed for this round.");
    }

    const result = computeRoundResult({
      id: randomUUID(),
      roundNumber: input.roundNumber,
      draws: input.draws,
      ballots: input.ballots,
      eligiblePlayers: input.eligiblePlayers,
      priorSelectedSongBlocks: input.priorSelectedSongBlocks,
      computedAt: input.now ?? new Date().toISOString(),
      randomIndex: this.randomIndex,
    });

    this.results.set(input.roundNumber, result);

    return result;
  }

  getRoundResult(roundNumber: 1 | 2 | 3 | 4) {
    return this.results.get(roundNumber) ?? null;
  }

  clearRoundResult(roundNumber: 1 | 2 | 3 | 4) {
    this.results.delete(roundNumber);
  }

  resetRound(roundNumber: 1 | 2 | 3 | 4) {
    this.clearRoundResult(roundNumber);
  }

  overrideSelectedChart(input: {
    roundNumber: 1 | 2 | 3 | 4;
    setOrder: 1 | 2;
    chartId: string;
    now?: string;
  }) {
    const result = this.requireResult(input.roundNumber);
    const set = result.sets.find((candidate) => candidate.setOrder === input.setOrder);

    if (!set) {
      throw new Error("Result set not found.");
    }

    const row = set.rows.find((candidate) => candidate.chart.id === input.chartId);

    if (!row) {
      throw new Error("Override chart must be part of the computed result set.");
    }

    set.selectedChart = row.chart;
    set.tiebreakWinnerChartId = set.tiebreakUsed ? row.chart.id : null;
    set.rows = set.rows.map((candidate) => ({
      ...candidate,
      selected: candidate.chart.id === row.chart.id,
    }));
    set.winnerRevealStartedAt = set.winnerRevealStartedAt ?? input.now ?? new Date().toISOString();
    result.revealPhaseStartedAt = input.now ?? new Date().toISOString();

    return result;
  }

  advanceReveal(roundNumber: 1 | 2 | 3 | 4, now = new Date().toISOString()) {
    const result = this.requireResult(roundNumber);

    this.requireTiebreakRevealComplete(result, now);

    const index = RESULT_REVEAL_PHASES.indexOf(result.revealPhase);
    const nextPhase = RESULT_REVEAL_PHASES[Math.min(index + 1, RESULT_REVEAL_PHASES.length - 1)] as ResultRevealPhase;

    result.revealPhase = nextPhase;
    result.revealPhaseStartedAt = now;
    this.markWinnerRevealStarted(result, nextPhase, now);

    if (nextPhase === "final") {
      result.finalRevealedAt = result.finalRevealedAt ?? now;
    }

    return result;
  }

  setRevealPhase(roundNumber: 1 | 2 | 3 | 4, phase: ResultRevealPhase, now = new Date().toISOString()) {
    const result = this.requireResult(roundNumber);

    result.revealPhase = phase;
    result.revealPhaseStartedAt = now;
    this.markWinnerRevealStarted(result, phase, now);

    if (phase === "final") {
      result.finalRevealedAt = result.finalRevealedAt ?? now;
    }

    return result;
  }

  private markWinnerRevealStarted(
    result: RoundResultSnapshot,
    phase: ResultRevealPhase,
    now: string,
  ) {
    const set = this.getResolvedPhaseSet(result, phase);

    if (set) {
      set.winnerRevealStartedAt = set.winnerRevealStartedAt ?? now;
    }
  }

  private requireTiebreakRevealComplete(result: RoundResultSnapshot, now: string) {
    const set = this.getResolvedPhaseSet(result, result.revealPhase);

    if (!set?.tiebreakUsed) {
      return;
    }

    const nowMs = Date.parse(now);

    if (!Number.isFinite(nowMs)) {
      return;
    }

    const remainingMs = getTiebreakRevealRemainingMs(set.winnerRevealStartedAt, nowMs);

    if (remainingMs > 0) {
      throw new Error(
        `Wait ${Math.ceil(remainingMs / 1000)} more seconds for the tiebreak reveal to complete.`,
      );
    }
  }

  private getResolvedPhaseSet(result: RoundResultSnapshot, phase: ResultRevealPhase): ResultSetSnapshot | null {
    if (phase === "set_1_resolved") {
      return result.sets[0];
    }

    if (phase === "set_2_resolved") {
      return result.sets[1];
    }

    return null;
  }

  private requireResult(roundNumber: 1 | 2 | 3 | 4) {
    const result = this.results.get(roundNumber);

    if (!result) {
      throw new Error("Results have not been computed for this round.");
    }

    return result;
  }

  exportSnapshot(): ResultStoreSnapshot {
    return {
      results: [...this.results.values()].map(cloneRoundResult),
    };
  }

  importSnapshot(snapshot: ResultStoreSnapshot) {
    this.results = new Map(
      snapshot.results.map((result) => [
        result.roundNumber,
        cloneRoundResult(result),
      ]),
    );
  }
}
