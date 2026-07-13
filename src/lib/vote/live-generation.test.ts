import { describe, expect, it } from "vitest";
import type { BallotSetChoice } from "@/lib/vote/ballot";
import {
  activeDrawGenerationKey,
  classifyVoteLiveProjectionChange,
  compareVoteLiveGeneration,
  isStaleBallotStateError,
  reconcileChoicesForActiveDraws,
  shouldAcceptVoteLivePoll,
  shouldRequestVoteRouteRefresh,
} from "./live-generation";

const setOne = "00000000-0000-4000-8000-000000000001";
const setTwo = "00000000-0000-4000-8000-000000000002";

function generation(
  value: number,
  one = "00000000-0000-4000-8000-000000000011",
  two = "00000000-0000-4000-8000-000000000012",
) {
  return {
    generation: value,
    activeDraws: [
      { roundSetId: setOne, drawId: one, version: value + 1 },
      { roundSetId: setTwo, drawId: two, version: value + 1 },
    ],
  };
}

describe("vote live generation", () => {
  it("recognizes stale generation and active-draw submission failures", () => {
    expect(
      isStaleBallotStateError(
        "The ballot draw changed before submission. Expected generation 4, found 5.",
      ),
    ).toBe(true);
    expect(
      isStaleBallotStateError(
        "Public state changed before this action could run. Expected generation 4, found 5.",
      ),
    ).toBe(true);
    expect(isStaleBallotStateError("Network request failed.")).toBe(false);
  });

  it("uses the monotonic generation before draw or voting-status inference", () => {
    expect(compareVoteLiveGeneration(generation(2), generation(1))).toBe(1);
    expect(compareVoteLiveGeneration(generation(1), generation(2))).toBe(-1);
  });

  it("builds a stable key independent of draw order", () => {
    const draws = generation(3).activeDraws;

    expect(activeDrawGenerationKey(draws)).toBe(activeDrawGenerationKey([...draws].reverse()));
  });

  it("rejects a late older-generation poll even when its request sequence is higher", () => {
    expect(
      shouldAcceptVoteLivePoll({
        acceptedGeneration: generation(4),
        acceptedRequestSequence: 2,
        nextGeneration: generation(3),
        nextRequestSequence: 99,
      }),
    ).toBe(false);
  });

  it("rejects a late request within the same generation", () => {
    expect(
      shouldAcceptVoteLivePoll({
        acceptedGeneration: generation(4),
        acceptedRequestSequence: 8,
        nextGeneration: generation(4),
        nextRequestSequence: 7,
      }),
    ).toBe(false);
  });

  it("accepts a newer generation even when its poll started before the accepted request", () => {
    expect(
      shouldAcceptVoteLivePoll({
        acceptedGeneration: generation(4),
        acceptedRequestSequence: 12,
        nextGeneration: generation(5),
        nextRequestSequence: 3,
      }),
    ).toBe(true);
  });

  it("separates generation-only voting transitions from chart replacement", () => {
    const rendered = generation(4);

    expect(
      classifyVoteLiveProjectionChange(rendered, {
        ...rendered,
        generation: 5,
      }),
    ).toBe("generation");
    expect(classifyVoteLiveProjectionChange(rendered, generation(5))).toBe("draws");
    expect(classifyVoteLiveProjectionChange(rendered, rendered)).toBe("none");
  });

  it("bounds route-refresh retries while allowing newer generations immediately", () => {
    const lastAttempt = { attemptedAtMs: 1_000, targetGeneration: 5 };

    expect(
      shouldRequestVoteRouteRefresh({
        lastAttempt,
        nowMs: 1_100,
        retryAfterMs: 5_000,
        targetGeneration: 5,
      }),
    ).toBe(false);
    expect(
      shouldRequestVoteRouteRefresh({
        lastAttempt,
        nowMs: 6_000,
        retryAfterMs: 5_000,
        targetGeneration: 5,
      }),
    ).toBe(true);
    expect(
      shouldRequestVoteRouteRefresh({
        lastAttempt,
        nowMs: 1_100,
        retryAfterMs: 5_000,
        targetGeneration: 6,
      }),
    ).toBe(true);
  });
});

describe("generation choice reconciliation", () => {
  const choices: BallotSetChoice[] = [
    {
      roundSetId: setOne,
      drawId: "00000000-0000-4000-8000-000000000011",
      displayLabel: "S16",
      noBans: false,
      bannedChartIds: ["chart-a"],
    },
    {
      roundSetId: setTwo,
      drawId: "00000000-0000-4000-8000-000000000012",
      displayLabel: "S17",
      noBans: true,
      bannedChartIds: [],
    },
  ];

  it("clears only the replaced set for a one-set generation change", () => {
    const reconciled = reconcileChoicesForActiveDraws(choices, [
      {
        roundSetId: setOne,
        drawId: "00000000-0000-4000-8000-000000000021",
        version: 2,
      },
      {
        roundSetId: setTwo,
        drawId: "00000000-0000-4000-8000-000000000012",
        version: 1,
      },
    ]);

    expect(reconciled[0]).toMatchObject({
      drawId: "00000000-0000-4000-8000-000000000021",
      noBans: false,
      bannedChartIds: [],
    });
    expect(reconciled[1]).toEqual(choices[1]);
  });

  it("clears both choices for a full-round replacement", () => {
    const reconciled = reconcileChoicesForActiveDraws(choices, [
      {
        roundSetId: setOne,
        drawId: "00000000-0000-4000-8000-000000000021",
        version: 2,
      },
      {
        roundSetId: setTwo,
        drawId: "00000000-0000-4000-8000-000000000022",
        version: 2,
      },
    ]);

    expect(reconciled.every((choice) => choice.bannedChartIds.length === 0)).toBe(true);
    expect(reconciled.every((choice) => choice.noBans === false)).toBe(true);
  });

  it("does not let a late pre-reroll poll restore reconciled choices", () => {
    const beforeReroll = generation(4);
    const afterReroll = {
      generation: 5,
      activeDraws: [
        {
          roundSetId: setOne,
          drawId: "00000000-0000-4000-8000-000000000021",
          version: 2,
        },
        {
          roundSetId: setTwo,
          drawId: "00000000-0000-4000-8000-000000000012",
          version: 1,
        },
      ],
    };

    expect(
      shouldAcceptVoteLivePoll({
        acceptedGeneration: beforeReroll,
        acceptedRequestSequence: 1,
        nextGeneration: afterReroll,
        nextRequestSequence: 2,
      }),
    ).toBe(true);

    const reconciled = reconcileChoicesForActiveDraws(choices, afterReroll.activeDraws);

    expect(reconciled[0]).toMatchObject({
      drawId: "00000000-0000-4000-8000-000000000021",
      noBans: false,
      bannedChartIds: [],
    });
    expect(reconciled[1]).toEqual(choices[1]);
    expect(
      shouldAcceptVoteLivePoll({
        acceptedGeneration: afterReroll,
        acceptedRequestSequence: 2,
        nextGeneration: beforeReroll,
        nextRequestSequence: 99,
      }),
    ).toBe(false);
  });
});
