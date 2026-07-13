import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultPublicStateGenerationRecord } from "@/lib/round/public-state-generation";
import { adminState, resetTournamentOperationalState } from "./admin-state";

vi.mock("server-only", () => ({}));

afterEach(() => {
  resetTournamentOperationalState();
});

describe("resetTournamentOperationalState", () => {
  it("keeps public generations monotonic when an operational reset is published", () => {
    const initial = createDefaultPublicStateGenerationRecord(1);

    adminState.publicStateGenerationStore.advance({
      ...initial,
      expectedGeneration: initial.generation,
      transitionKind: "voting_opened",
      updatedAt: "2026-07-13T00:00:01.000Z",
    });

    resetTournamentOperationalState({
      publicTransitionKind: "reset_tournament_data",
      publicUpdatedAtMs: Date.parse("2026-07-13T00:00:02.000Z"),
    });

    expect(adminState.publicStateGenerationStore.getRound(1)).toEqual({
      ...createDefaultPublicStateGenerationRecord(1),
      generation: 2,
      transitionKind: "reset_tournament_data",
      updatedAt: "2026-07-13T00:00:02.000Z",
    });
    expect(adminState.publicStateGenerationStore.getRound(2).generation).toBe(1);
  });
});
