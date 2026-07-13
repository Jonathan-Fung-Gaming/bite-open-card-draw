import { describe, expect, it } from "vitest";
import {
  createDefaultPublicStateGenerationRecord,
  PublicStateGenerationStore,
  type AdvancePublicStateGenerationInput,
} from "./public-state-generation";

function transition(
  overrides: Partial<AdvancePublicStateGenerationInput> = {},
): AdvancePublicStateGenerationInput {
  return {
    roundNumber: 1,
    expectedGeneration: 0,
    transitionKind: "reroll_one_chart",
    resultMode: false,
    updatedAt: "2026-07-13T00:00:01.000Z",
    activeDraws: [
      { drawId: "draw-1-v2", roundSetId: "round-1-set-1", version: 2 },
      { drawId: "draw-2-v1", roundSetId: "round-1-set-2", version: 1 },
    ],
    votingStatus: "ready_to_vote",
    votingDeadline: null,
    resultId: null,
    resultPhase: null,
    resultPhaseStartedAt: null,
    tiebreakStarts: [],
    phoneReleaseStatus: "held",
    phoneReleasedAt: null,
    ...overrides,
  };
}

describe("public state generation store", () => {
  it("provides complete generation-zero defaults for every round", () => {
    const store = new PublicStateGenerationStore();

    expect(store.exportSnapshot().rounds).toEqual(
      [1, 2, 3, 4].map((roundNumber) =>
        createDefaultPublicStateGenerationRecord(roundNumber as 1 | 2 | 3 | 4),
      ),
    );
  });

  it("advances one coherent projection exactly once from the expected generation", () => {
    const store = new PublicStateGenerationStore();
    const next = store.advance(transition());

    expect(next).toMatchObject({
      roundNumber: 1,
      generation: 1,
      transitionKind: "reroll_one_chart",
      resultMode: false,
      votingStatus: "ready_to_vote",
      phoneReleaseStatus: "held",
    });
    expect(store.getRound(1)).toEqual(next);
    expect(store.getRound(2).generation).toBe(0);
  });

  it("rejects a stale expected generation without changing the accepted projection", () => {
    const store = new PublicStateGenerationStore();
    const accepted = store.advance(transition());

    expect(() =>
      store.advance(
        transition({
          expectedGeneration: 0,
          transitionKind: "reroll_round_set",
          updatedAt: "2026-07-13T00:00:02.000Z",
        }),
      ),
    ).toThrow(/Expected 0, found 1/);
    expect(store.getRound(1)).toEqual(accepted);
  });

  it("clones nested projection fields across reads and snapshots", () => {
    const store = new PublicStateGenerationStore();
    const next = store.advance(
      transition({
        resultMode: true,
        resultId: "result-1",
        resultPhase: "set_1_resolved",
        resultPhaseStartedAt: "2026-07-13T00:00:01.000Z",
        tiebreakStarts: [{ setOrder: 1, startedAt: "2026-07-13T00:00:01.000Z" }],
        votingStatus: "results_revealing",
      }),
    );

    next.activeDraws[0]!.version = 99;
    next.tiebreakStarts[0]!.startedAt = "mutated";
    const exported = store.exportSnapshot();
    exported.rounds[0]!.activeDraws.length = 0;

    expect(store.getRound(1).activeDraws[0]?.version).toBe(2);
    expect(store.getRound(1).tiebreakStarts[0]?.startedAt).toBe("2026-07-13T00:00:01.000Z");
  });

  it("restores legacy snapshots as generation zero", () => {
    const store = new PublicStateGenerationStore();

    store.advance(transition());
    store.importSnapshot(undefined);

    expect(store.getRound(1)).toEqual(createDefaultPublicStateGenerationRecord(1));
  });
});
