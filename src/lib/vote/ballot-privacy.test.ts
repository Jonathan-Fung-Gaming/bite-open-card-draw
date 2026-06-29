import { describe, expect, it } from "vitest";
import type { RoundBallot } from "./ballot";
import { buildPublicBallotLookup, hashBallotEditToken } from "./ballot-privacy";

const editToken = "11111111-1111-4111-8111-111111111111";

function ballot(): RoundBallot {
  return {
    id: "ballot-1",
    roundNumber: 1,
    playerId: "player-1",
    playerStartggUsername: "Alpha",
    choices: [
      {
        drawId: "draw-1",
        roundSetId: "round-set-1",
        displayLabel: "S16",
        noBans: false,
        bannedChartIds: ["chart-1"],
      },
      {
        drawId: "draw-2",
        roundSetId: "round-set-2",
        displayLabel: "S17",
        noBans: true,
        bannedChartIds: [],
      },
    ],
    submittedAt: "2026-06-30T00:00:00.000Z",
    revision: 3,
    editTokenHash: hashBallotEditToken(editToken),
    source: "player",
    manualReason: null,
    manualOverride: false,
    replacedExistingBallot: false,
  };
}

describe("public ballot privacy", () => {
  it("returns only duplicate metadata when the edit token does not match", () => {
    const lookup = buildPublicBallotLookup(
      ballot(),
      "22222222-2222-4222-8222-222222222222",
    );

    expect(lookup).toMatchObject({
      exists: true,
      revision: 3,
      canEdit: false,
      warning: "A ballot already exists for this start.gg username.",
      ballot: null,
    });
  });

  it("returns editable choices without the token hash when the device token matches", () => {
    const lookup = buildPublicBallotLookup(ballot(), editToken);

    expect(lookup.canEdit).toBe(true);
    expect(lookup.warning).toBeNull();
    expect(lookup.ballot?.choices[0]?.bannedChartIds).toEqual(["chart-1"]);
    expect(lookup.ballot).not.toHaveProperty("editTokenHash");
  });

  it("rejects malformed edit tokens before hashing for storage", () => {
    expect(() => hashBallotEditToken("short")).toThrow(/valid ballot edit token/);
  });
});
