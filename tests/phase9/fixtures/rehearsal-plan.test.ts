import { describe, expect, it } from "vitest";
import {
  assertRoundAttritionPlan,
  createProductionFlowRoundExpectations,
  createSmokeRoundExpectation,
  rehearsalPlayerName,
  visualEvidencePlayerName,
} from "./rehearsal-plan";

describe("Phase 10 rehearsal planner", () => {
  it("builds the production-flow 48 -> 36 -> 24 -> 12 attrition plan", () => {
    const expectations = createProductionFlowRoundExpectations();

    assertRoundAttritionPlan(expectations);
    expect(expectations.map((round) => round.activePlayerCount)).toEqual([48, 36, 24, 12]);
    expect(expectations.map((round) => round.expectedSubmittedRows)).toEqual([38, 29, 19, 10]);
    expect(expectations.map((round) => round.expectedRows)).toEqual([48, 36, 24, 12]);
    expect(expectations.map((round) => round.expectedActiveAtRoundStartRows)).toEqual([
      48,
      36,
      24,
      12,
    ]);
    expect(expectations.map((round) => round.submittedPlayerCount)).toEqual([38, 29, 19, 10]);
    expect(
      expectations.map((round) =>
        round.supportedTiebreakCandidateCounts.some((count) => count >= 2 && count <= 4),
      ),
    ).toEqual([true, true, true, true]);

    expect(expectations[1]?.playersToMarkInactiveBeforeRound).toEqual(
      Array.from({ length: 12 }, (_, index) => rehearsalPlayerName(37 + index)),
    );
    expect(expectations[2]?.playersToMarkInactiveBeforeRound).toEqual(
      Array.from({ length: 12 }, (_, index) => rehearsalPlayerName(25 + index)),
    );
    expect(expectations[3]?.playersToMarkInactiveBeforeRound).toEqual(
      Array.from({ length: 12 }, (_, index) => rehearsalPlayerName(13 + index)),
    );
  });

  it("plans reproducible random production-flow final ballots and revision expectations", () => {
    const [roundOne] = createProductionFlowRoundExpectations();
    const [repeatRoundOne] = createProductionFlowRoundExpectations();

    expect(roundOne?.ballotPlans).toHaveLength(38);
    expect(repeatRoundOne?.ballotPlans).toEqual(roundOne?.ballotPlans);
    expect(roundOne?.expectedRevisionByPlayer.get(roundOne?.ballotPlans[0]?.playerName ?? "")).toBe(2);
    expect(roundOne?.expectedRevisionByPlayer.get(roundOne?.ballotPlans[1]?.playerName ?? "")).toBe(1);
    expect(roundOne?.ballotPlans[0]?.revisions.map((revision) => revision.revision)).toEqual([
      1,
      2,
    ]);

    const uniqueFinalPlans = new Set(
      (roundOne?.ballotPlans ?? []).map((plan) => JSON.stringify(plan.finalBanPlan)),
    );

    expect(uniqueFinalPlans.size).toBeGreaterThan(10);
    expect(roundOne?.expectedBanSelectionCount).toBe(
      (roundOne?.ballotPlans ?? []).reduce(
        (total, plan) =>
          total +
          plan.finalBanPlan.reduce(
            (setTotal, bannedIndexes) => setTotal + bannedIndexes.length,
            0,
          ),
        0,
      ),
    );

    for (const plan of roundOne?.ballotPlans ?? []) {
      for (const bannedIndexes of plan.finalBanPlan) {
        expect(bannedIndexes.length).toBeLessThanOrEqual(2);
        expect(new Set(bannedIndexes).size).toBe(bannedIndexes.length);

        for (const index of bannedIndexes) {
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(7);
        }
      }
    }
  });

  it("selects a visual-evidence player outside the planned production-flow submitters", () => {
    const [roundOne] = createProductionFlowRoundExpectations();

    if (!roundOne) {
      throw new Error("Missing round one production-flow expectation.");
    }

    const playerName = visualEvidencePlayerName(roundOne);

    expect(roundOne.activePlayers).toContain(playerName);
    expect(roundOne.ballotPlans.map((plan) => plan.playerName)).not.toContain(playerName);
  });

  it("keeps the smaller smoke plan explicit", () => {
    const expectation = createSmokeRoundExpectation(1);

    expect(expectation.activePlayerCount).toBe(12);
    expect(expectation.submittedPlayerCount).toBe(2);
    expect(expectation.expectedBanSelectionCount).toBe(8);
    expect(expectation.expectedRevisionByPlayer.get("Rehearsal Player 01")).toBe(2);
    expect(expectation.expectedRevisionByPlayer.get("Rehearsal Player 02")).toBe(1);
  });
});
