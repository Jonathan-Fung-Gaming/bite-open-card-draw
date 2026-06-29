import type { OperationalStateSnapshot } from "@/lib/persistence/operational-state";

export type OperationalDebugSnapshotExport = {
  exportType: "debug_operational_state_snapshot";
  authoritativeRuntimeSource: false;
  generatedAt: string;
  warning: string;
  snapshot: OperationalStateSnapshot;
};

function fileSafeTimestamp(value: string) {
  return value.replaceAll(":", "-").replaceAll(".", "-");
}

export function createOperationalDebugSnapshotExport(
  snapshot: OperationalStateSnapshot,
  generatedAt = snapshot.savedAt,
): OperationalDebugSnapshotExport {
  return {
    exportType: "debug_operational_state_snapshot",
    authoritativeRuntimeSource: false,
    generatedAt,
    warning:
      "This export is for backup and debugging only. Deployed runtime state is loaded from normalized Supabase tables.",
    snapshot,
  };
}

export function serializeOperationalDebugSnapshotExport(exportData: OperationalDebugSnapshotExport) {
  return `${JSON.stringify(exportData, null, 2)}\n`;
}

export function operationalDebugSnapshotFilename(snapshot: OperationalStateSnapshot) {
  return `operational-debug-snapshot-${fileSafeTimestamp(snapshot.savedAt)}.json`;
}
