import { describe, expect, it } from "vitest";
import { buildStageRoundView } from "./stage-view";

describe("stage round view", () => {
  it("reports readiness only when both round sets are drawn", () => {
    const view = buildStageRoundView(
      {
        getActiveDraw: (_roundNumber, setOrder) => (setOrder === 1 ? ({ id: "draw" } as never) : null),
      },
      1,
    );

    expect(view.sets).toHaveLength(2);
    expect(view.bothSetsDrawn).toBe(false);
  });
});
