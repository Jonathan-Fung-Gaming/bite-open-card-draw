import { randomUUID } from "node:crypto";

export type AdminAuditAffectedRecord = {
  type: string;
  id: string;
};

export type AdminAuditRecord = {
  id: string;
  createdAt: string;
  sessionId: string;
  action: string;
  summary: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  affectedRecords: AdminAuditAffectedRecord[];
  dangerous: boolean;
  tournamentChanging: boolean;
};

export type AdminAuditStoreSnapshot = {
  records: AdminAuditRecord[];
};

export class AdminAuditStore {
  private records: AdminAuditRecord[] = [];

  record(input: {
    sessionId: string;
    action: string;
    summary: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    affectedRecords?: AdminAuditAffectedRecord[];
    dangerous?: boolean;
    tournamentChanging?: boolean;
    now?: string;
  }) {
    const record: AdminAuditRecord = {
      id: randomUUID(),
      createdAt: input.now ?? new Date().toISOString(),
      sessionId: input.sessionId,
      action: input.action,
      summary: input.summary,
      reason: input.reason?.trim() || null,
      metadata: input.metadata ?? {},
      affectedRecords: input.affectedRecords ?? [],
      dangerous: input.dangerous ?? false,
      tournamentChanging: input.tournamentChanging ?? true,
    };

    this.records = [record, ...this.records];

    return record;
  }

  list(limit = 25) {
    return this.records.slice(0, limit);
  }

  exportSnapshot(): AdminAuditStoreSnapshot {
    return {
      records: this.records.map((record) => ({
        ...record,
        metadata: { ...record.metadata },
        affectedRecords: record.affectedRecords.map((affected) => ({ ...affected })),
      })),
    };
  }

  importSnapshot(snapshot: AdminAuditStoreSnapshot) {
    this.records = snapshot.records.map((record) => ({
      ...record,
      metadata: { ...record.metadata },
      affectedRecords: record.affectedRecords.map((affected) => ({ ...affected })),
    }));
  }
}
