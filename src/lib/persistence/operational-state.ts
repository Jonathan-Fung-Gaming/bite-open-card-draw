import { AdminAuditStore, type AdminAuditStoreSnapshot } from "@/lib/admin/audit";
import { HostLockStore, type HostLockStoreSnapshot } from "@/lib/admin/host-lock";
import { RosterStore, type RosterStoreSnapshot } from "@/lib/admin/roster";
import { DrawStateStore, type DrawStateStoreSnapshot } from "@/lib/draw/draw-state";
import { getRoundSetDefinition } from "@/lib/draw/draw-engine";
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
  const migratedSnapshot = migrateSnapshotIdentityFields(snapshot);

  stores.auditStore.importSnapshot(migratedSnapshot.audit);
  stores.hostLockStore.importSnapshot(migratedSnapshot.hostLock);
  stores.rosterStore.importSnapshot(migratedSnapshot.roster);
  stores.ballotStore.importSnapshot(migratedSnapshot.ballot);
  stores.votingWindowStore.importSnapshot(migratedSnapshot.votingWindow);
  stores.resultStore.importSnapshot(migratedSnapshot.result);
  stores.roundStateStore.importSnapshot(migratedSnapshot.roundState);

  const selectedSongKeys = migratedSnapshot.result.results
    .filter((result) => result.revealPhase === "final")
    .flatMap((result) => result.sets.map((set) => set.selectedChart.songKey));

  stores.drawStateStore.importSnapshot({
    ...migratedSnapshot.draw,
    selectedSongKeys,
  });
}

export function cloneOperationalStateSnapshot(snapshot: OperationalStateSnapshot) {
  return JSON.parse(JSON.stringify(snapshot)) as OperationalStateSnapshot;
}

function migrateSnapshotIdentityFields(snapshot: OperationalStateSnapshot): OperationalStateSnapshot {
  const cloned = cloneOperationalStateSnapshot(snapshot);
  const drawsById = new Map(
    cloned.draw.drawHistory.map((draw) => {
      const roundSetId =
        draw.roundSetId ?? getRoundSetDefinition(draw.roundNumber, draw.setOrder).id;

      draw.roundSetId = roundSetId;

      return [draw.id, { roundSetId, version: draw.version }];
    }),
  );

  cloned.ballot.ballots = cloned.ballot.ballots.map((ballot) => ({
    ...ballot,
    choices: ballot.choices.map((choice) => {
      const legacyDrawId = choice.drawId ?? choice.roundSetId;
      const draw = drawsById.get(legacyDrawId);

      return {
        ...choice,
        drawId: legacyDrawId,
        roundSetId: draw?.roundSetId ?? choice.roundSetId,
      };
    }),
  }));

  cloned.ballot.ballotInvalidations = cloned.ballot.ballotInvalidations?.map((record) => ({
    ...record,
    ballots: record.ballots.map((ballot) => ({
      ...ballot,
      choices: ballot.choices.map((choice) => {
        const legacyDrawId = choice.drawId ?? choice.roundSetId;
        const draw = drawsById.get(legacyDrawId);

        return {
          ...choice,
          drawId: legacyDrawId,
          roundSetId: draw?.roundSetId ?? choice.roundSetId,
        };
      }),
    })),
  }));

  cloned.result.results = cloned.result.results.map((result) => ({
    ...result,
    sets: [
      migrateResultSetIdentity(result.sets[0], drawsById),
      migrateResultSetIdentity(result.sets[1], drawsById),
    ],
  }));

  return cloned;
}

function migrateResultSetIdentity<TSet extends ResultStoreSnapshot["results"][number]["sets"][number]>(
  set: TSet,
  drawsById: Map<string, { roundSetId: string; version: number }>,
): TSet {
  const legacyDrawId = set.drawId ?? set.roundSetId;
  const draw = drawsById.get(legacyDrawId);

  return {
    ...set,
    drawId: legacyDrawId,
    drawVersion: set.drawVersion ?? draw?.version ?? 1,
    roundSetId: draw?.roundSetId ?? set.roundSetId,
  };
}
