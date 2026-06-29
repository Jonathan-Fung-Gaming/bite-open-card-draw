import { describe, expect, it } from "vitest";
import { createAdminStateStores, createOperationalStateSnapshot } from "./operational-state";
import {
  createOperationalDebugSnapshotExport,
  operationalDebugSnapshotFilename,
  serializeOperationalDebugSnapshotExport,
} from "./debug-export";

describe("operational debug snapshot export", () => {
  it("labels snapshot exports as non-authoritative backup/debug data", () => {
    const stores = createAdminStateStores();

    stores.auditStore.record({
      sessionId: "session-a",
      action: "debug_snapshot_export",
      summary: "Downloaded debug operational state snapshot.",
      tournamentChanging: false,
      now: "2026-06-29T00:00:00.000Z",
    });
    const snapshot = createOperationalStateSnapshot(stores, "2026-06-29T00:01:00.000Z");
    const exportData = createOperationalDebugSnapshotExport(
      snapshot,
      "2026-06-29T00:02:00.000Z",
    );
    const serialized = serializeOperationalDebugSnapshotExport(exportData);

    expect(exportData.authoritativeRuntimeSource).toBe(false);
    expect(exportData.warning).toContain("normalized Supabase tables");
    expect(serialized).toContain('"exportType": "debug_operational_state_snapshot"');
    expect(serialized).toContain('"action": "debug_snapshot_export"');
    expect(operationalDebugSnapshotFilename(snapshot)).toBe(
      "operational-debug-snapshot-2026-06-29T00-01-00-000Z.json",
    );
  });
});
