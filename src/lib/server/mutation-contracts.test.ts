import { describe, expect, it } from "vitest";
import { MUTATION_CONTRACTS, type MutationName } from "./mutation-contracts";

const requiredMutationNames: MutationName[] = [
  "adminLogin",
  "adminLogout",
  "acquireHostLock",
  "refreshHostLock",
  "releaseHostLock",
  "importCharts",
  "updateChartExclusion",
  "createOrUpdatePlayer",
  "setPlayerActiveStatus",
  "addPlayerToCurrentRoundEligibility",
  "drawRoundSet",
  "rerollOneChart",
  "rerollRoundSet",
  "rerollFullRound",
  "openVotingWindow",
  "pauseVotingWindow",
  "resumeVotingWindow",
  "reopenVotingWindow",
  "submitBallot",
  "manualBallotOverride",
  "closeVotingWindow",
  "resetRound",
  "computeResults",
  "commitTiebreak",
  "markResultsRevealed",
  "advanceResultReveal",
  "overrideResult",
  "setCurrentRound",
  "advanceCurrentRound",
  "startRehearsalMode",
  "resetRehearsalMode",
  "exportPrivateCsv",
];

describe("Phase 2 mutation contracts", () => {
  it("defines every required server-side mutation contract", () => {
    expect(Object.keys(MUTATION_CONTRACTS)).toEqual(requiredMutationNames);
  });

  it("requires dangerous actions to include password and reason fields", () => {
    for (const name of [
      "addPlayerToCurrentRoundEligibility",
      "updateChartExclusion",
      "rerollOneChart",
      "rerollRoundSet",
      "rerollFullRound",
      "manualBallotOverride",
      "reopenVotingWindow",
      "resetRound",
      "overrideResult",
      "startRehearsalMode",
      "resetRehearsalMode",
    ] as const) {
      const result = MUTATION_CONTRACTS[name].safeParse({});

      expect(result.success).toBe(false);
      expect(String(result.error)).toContain("adminPassword");
      expect(String(result.error)).toContain("reason");
    }
  });

  it("requires ballot choices to include active draw ids separately from static round-set ids", () => {
    const legacyShape = MUTATION_CONTRACTS.submitBallot.safeParse({
      roundNumber: 1,
      playerId: "00000000-0000-4000-8000-000000000001",
      choices: [
        {
          roundSetId: "00000000-0000-4000-8000-000000000101",
          noBans: true,
          bannedChartIds: [],
        },
        {
          roundSetId: "00000000-0000-4000-8000-000000000102",
          noBans: true,
          bannedChartIds: [],
        },
      ],
    });

    const drawAwareShape = MUTATION_CONTRACTS.submitBallot.safeParse({
      roundNumber: 1,
      playerId: "00000000-0000-4000-8000-000000000001",
      choices: [
        {
          drawId: "00000000-0000-4000-8000-000000000201",
          roundSetId: "00000000-0000-4000-8000-000000000101",
          noBans: true,
          bannedChartIds: [],
        },
        {
          drawId: "00000000-0000-4000-8000-000000000202",
          roundSetId: "00000000-0000-4000-8000-000000000102",
          noBans: true,
          bannedChartIds: [],
        },
      ],
    });

    expect(legacyShape.success).toBe(false);
    expect(String(legacyShape.error)).toContain("drawId");
    expect(drawAwareShape.success).toBe(true);
  });
});
