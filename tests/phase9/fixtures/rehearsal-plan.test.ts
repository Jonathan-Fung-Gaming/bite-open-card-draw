import { describe, expect, it } from "vitest";
import {
  assertRoundAttritionPlan,
  createProductionFlowRoundExpectations,
  createSmokeRoundExpectation,
  rehearsalPlayerName,
} from "./rehearsal-plan";

describe("Phase 10 rehearsal planner", () => {
  it("builds the production-flow 48 -> 36 -> 24 -> 12 attrition plan", () => {
    const expectations = createProductionFlowRoundExpectations();

    assertRoundAttritionPlan(expectations);
    expect(expectations.map((round) => round.activePlayerCount)).toEqual([48, 36, 24, 12]);
    expect(expectations.map((round) => round.expectedSubmittedRows)).toEqual([48, 36, 24, 12]);
    expect(expectations.map((round) => round.expectedRows)).toEqual([48, 36, 24, 12]);
    expect(expectations.map((round) => round.expectedActiveAtRoundStartRows)).toEqual([
      48,
      36,
      24,
      12,
    ]);
    expect(expectations.map((round) => round.expectedBanSelectionCount)).toEqual([12, 12, 12, 12]);

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

  it("plans deterministic final ballots and revision expectations", () => {
    const [roundOne] = createProductionFlowRoundExpectations();

    expect(roundOne?.ballotPlans).toHaveLength(48);
    expect(roundOne?.expectedRevisionByPlayer.get("Rehearsal Player 01")).toBe(2);
    expect(roundOne?.expectedRevisionByPlayer.get("Rehearsal Player 02")).toBe(1);
    expect(roundOne?.ballotPlans[0]?.revisions.map((revision) => revision.revision)).toEqual([
      1,
      2,
    ]);

    for (const plan of roundOne?.ballotPlans.slice(0, 3) ?? []) {
      expect(plan.finalBanPlan[0]).toHaveLength(2);
      expect(plan.finalBanPlan[1]).toHaveLength(2);
      expect(plan.finalBanPlan[0]).not.toContain(0);
      expect(plan.finalBanPlan[0]).not.toContain(1);
      expect(plan.finalBanPlan[1]).not.toContain(0);
      expect(plan.finalBanPlan[1]).not.toContain(1);
    }

    for (const plan of roundOne?.ballotPlans.slice(3) ?? []) {
      expect(plan.finalBanPlan).toEqual([[], []]);
    }
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
