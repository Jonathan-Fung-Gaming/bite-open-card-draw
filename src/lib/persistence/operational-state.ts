import { AdminAuditStore, type AdminAuditStoreSnapshot } from "@/lib/admin/audit";
import { HostLockStore, type HostLockStoreSnapshot } from "@/lib/admin/host-lock";
import { RosterStore, type RosterStoreSnapshot } from "@/lib/admin/roster";
import { DrawStateStore, type DrawStateStoreSnapshot } from "@/lib/draw/draw-state";
import { ResultStore, type ResultStoreSnapshot } from "@/lib/results/result-store";
import { RoundStateStore, type RoundStateSnapshot } from "@/lib/round/round-state";
import { BallotStore, type BallotStoreSnapshot } from "@/lib/vote/ballot-store";
import { VotingWindowStore, type VotingWindowStoreSnapshot } from "@/lib/vote/voting-window";

export const OPERATIONAL_STATE_SCHEMA_VERSION = 1;

export type AdminStateStores = {
  auditStore: AdminAuditStore;
  hostLockStore: HostLockStore;
  rosterStore: RosterStore;
  drawStateStore: DrawStateStore;
  ballotStore: BallotStore;
  votingWindowStore: VotingWindowStore;
  resultStore: ResultStore;
  roundStateStore: RoundStateStore;
};

export type OperationalStateSnapshot = {
  schemaVersion: typeof OPERATIONAL_STATE_SCHEMA_VERSION;
  savedAt: string;
  audit: AdminAuditStoreSnapshot;
  hostLock: HostLockStoreSnapshot;
  roster: RosterStoreSnapshot;
  draw: DrawStateStoreSnapshot;
  ballot: BallotStoreSnapshot;
  votingWindow: VotingWindowStoreSnapshot;
  result: ResultStoreSnapshot;
  roundState: RoundStateSnapshot;
};

export function createAdminStateStores(): AdminStateStores {
  return {
    auditStore: new AdminAuditStore(),
    hostLockStore: new HostLockStore(),
    rosterStore: new RosterStore(),
    drawStateStore: new DrawStateStore(),
    ballotStore: new BallotStore(),
    votingWindowStore: new VotingWindowStore(),
    resultStore: new ResultStore(),
    roundStateStore: new RoundStateStore(),
  };
}

export function createOperationalStateSnapshot(
  stores: AdminStateStores,
  savedAt = new Date().toISOString(),
): OperationalStateSnapshot {
  return {
    schemaVersion: OPERATIONAL_STATE_SCHEMA_VERSION,
    savedAt,
    audit: stores.auditStore.exportSnapshot(),
    hostLock: stores.hostLockStore.exportSnapshot(),
    roster: stores.rosterStore.exportSnapshot(),
    draw: stores.drawStateStore.exportSnapshot(),
    ballot: stores.ballotStore.exportSnapshot(),
    votingWindow: stores.votingWindowStore.exportSnapshot(),
    result: stores.resultStore.exportSnapshot(),
    roundState: stores.roundStateStore.exportSnapshot(),
  };
}

export function restoreOperationalStateSnapshot(
  stores: AdminStateStores,
  snapshot: OperationalStateSnapshot,
) {
  stores.auditStore.importSnapshot(snapshot.audit);
  stores.hostLockStore.importSnapshot(snapshot.hostLock);
  stores.rosterStore.importSnapshot(snapshot.roster);
  stores.ballotStore.importSnapshot(snapshot.ballot);
  stores.votingWindowStore.importSnapshot(snapshot.votingWindow);
  stores.resultStore.importSnapshot(snapshot.result);
  stores.roundStateStore.importSnapshot(snapshot.roundState);

  const selectedSongKeys = snapshot.result.results
    .filter((result) => result.revealPhase === "final")
    .flatMap((result) => result.sets.map((set) => set.selectedChart.songKey));

  stores.drawStateStore.importSnapshot({
    ...snapshot.draw,
    selectedSongKeys,
  });
}

export function cloneOperationalStateSnapshot(snapshot: OperationalStateSnapshot) {
  return JSON.parse(JSON.stringify(snapshot)) as OperationalStateSnapshot;
}
