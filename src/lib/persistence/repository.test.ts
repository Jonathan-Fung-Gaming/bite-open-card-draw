import { describe, expect, it } from "vitest";
import {
  createAdminStateStores,
  createOperationalStateSnapshot,
  restoreOperationalStateSnapshot,
} from "./operational-state";
import { MemoryOperationalStateRepository } from "./repository";

describe("targeted memory roster persistence", () => {
  it("changes only roster players and audit while preserving open-round eligibility", async () => {
    const repository = new MemoryOperationalStateRepository();
    const baselineStores = createAdminStateStores();
    const player = baselineStores.rosterStore.createOrUpdatePlayer({
      active: true,
      now: "2026-07-14T00:00:00.000Z",
      startggUsername: "Alpha",
    });
    baselineStores.rosterStore.snapshotRoundEligibility({
      now: "2026-07-14T00:01:00.000Z",
      playerIds: [player.id],
      roundNumber: 1,
    });
    const baseline = createOperationalStateSnapshot(baselineStores, "2026-07-14T00:01:00.000Z");
    await repository.save(baseline);

    const writer = createAdminStateStores();
    restoreOperationalStateSnapshot(writer, baseline);
    writer.rosterStore.setPlayerActiveStatus(player.id, false, "2026-07-14T00:02:00.000Z");
    writer.rosterStore.clearRoundEligibility(1);
    writer.roundStateStore.setCurrentRound(2);
    writer.auditStore.record({
      action: "roster_active_status_update",
      sessionId: "session-a",
      summary: "Marked Alpha inactive.",
      now: "2026-07-14T00:02:00.000Z",
    });

    const persisted = await repository.persistRosterState({
      current: createOperationalStateSnapshot(writer, "2026-07-14T00:02:00.000Z"),
    });

    expect(persisted.roster.players).toMatchObject([{ id: player.id, active: false }]);
    expect(persisted.roster.currentRoundEligibility).toEqual(
      baseline.roster.currentRoundEligibility,
    );
    expect(persisted.roundState).toEqual(baseline.roundState);
    expect(persisted.audit.records).toHaveLength(1);
    expect(persisted.audit.records[0]?.action).toBe("roster_active_status_update");
  });
});
