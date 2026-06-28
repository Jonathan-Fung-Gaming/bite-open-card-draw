import { randomUUID } from "node:crypto";
import type { RandomIndex } from "@/lib/draw/draw-engine";
import { secureRandomIndex } from "@/lib/draw/draw-engine";
import type { DrawRecord } from "@/lib/draw/draw-state";
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

export class ResultStore {
  private results = new Map<1 | 2 | 3 | 4, RoundResultSnapshot>();

  constructor(private readonly randomIndex: RandomIndex = secureRandomIndex) {}

  computeRound(input: {
    roundNumber: 1 | 2 | 3 | 4;
    draws: readonly DrawRecord[];
    ballots: readonly RoundBallot[];
    eligiblePlayers: EligiblePlayerSnapshot[];
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
      computedAt: input.now ?? new Date().toISOString(),
      randomIndex: this.randomIndex,
    });

    this.results.set(input.roundNumber, result);

    return result;
  }

  getRoundResult(roundNumber: 1 | 2 | 3 | 4) {
    return this.results.get(roundNumber) ?? null;
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
}
