import type { OperationalStateSnapshot } from "@/lib/persistence/operational-state";

export type OperationalDebugSnapshotExport = {
  exportType: "debug_operational_state_snapshot";
  authoritativeRuntimeSource: false;
  generatedAt: string;
  warning: string;
  snapshot: OperationalStateSnapshot;
};

const REDACTED = "[redacted]";

function fileSafeTimestamp(value: string) {
  return value.replaceAll(":", "-").replaceAll(".", "-");
}

export function createOperationalDebugSnapshotExport(
  snapshot: OperationalStateSnapshot,
  generatedAt = snapshot.savedAt,
): OperationalDebugSnapshotExport {
  const redactedSnapshot = redactOperationalDebugSnapshot(snapshot);

  return {
    exportType: "debug_operational_state_snapshot",
    authoritativeRuntimeSource: false,
    generatedAt,
    warning:
      "This redacted export is for backup and debugging only. Deployed runtime state is loaded from normalized Supabase tables.",
    snapshot: redactedSnapshot,
  };
}

export function serializeOperationalDebugSnapshotExport(exportData: OperationalDebugSnapshotExport) {
  return `${JSON.stringify(exportData, null, 2)}\n`;
}

export function operationalDebugSnapshotFilename(snapshot: OperationalStateSnapshot) {
  return `operational-debug-snapshot-${fileSafeTimestamp(snapshot.savedAt)}.json`;
}

function redactOperationalDebugSnapshot(snapshot: OperationalStateSnapshot): OperationalStateSnapshot {
  const redacted = JSON.parse(JSON.stringify(snapshot)) as OperationalStateSnapshot;

  if (redacted.hostLock.lock) {
    redacted.hostLock.lock.ownerSessionId = REDACTED;
    redacted.hostLock.lock.hostTokenHash = REDACTED;
  }

  redacted.audit.records = redacted.audit.records.map((record) => ({
    ...record,
    sessionId: REDACTED,
  }));
  redacted.ballot.ballots = redacted.ballot.ballots.map((ballot) => ({
    ...ballot,
    editTokenHash: ballot.editTokenHash ? REDACTED : ballot.editTokenHash,
  }));
  redacted.ballot.ballotInvalidations = redacted.ballot.ballotInvalidations?.map((record) => ({
    ...record,
    adminSessionId: REDACTED,
    ballots: record.ballots.map((ballot) => ({
      ...ballot,
      editTokenHash: ballot.editTokenHash ? REDACTED : ballot.editTokenHash,
    })),
  }));
  redacted.ballot.presenceClaims = redacted.ballot.presenceClaims?.map((claim) => ({
    ...claim,
    deviceId: REDACTED,
  }));

  return redacted;
}
