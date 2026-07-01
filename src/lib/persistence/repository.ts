import {
  cloneOperationalStateSnapshot,
  type OperationalStateSnapshot,
} from "@/lib/persistence/operational-state";
import { mergeOperationalStateSnapshots } from "@/lib/persistence/merge";
import type { HostLockStoreSnapshot } from "@/lib/admin/host-lock";

export type PersistMergedStateInput = {
  baseline: OperationalStateSnapshot | null;
  current: OperationalStateSnapshot;
};

export type OperationalStateRepository = {
  load(): Promise<OperationalStateSnapshot | null>;
  loadVotingAdminState?(): Promise<OperationalStateSnapshot | null>;
  loadResultAdminState?(): Promise<OperationalStateSnapshot | null>;
  save(snapshot: OperationalStateSnapshot): Promise<void>;
  persistMerged?(input: PersistMergedStateInput): Promise<OperationalStateSnapshot>;
  persistHostLock?(hostLock: HostLockStoreSnapshot): Promise<void>;
  persistVotingState?(input: PersistMergedStateInput): Promise<OperationalStateSnapshot>;
  persistVotingAdminState?(input: PersistMergedStateInput): Promise<OperationalStateSnapshot>;
  persistResultAdminState?(input: PersistMergedStateInput): Promise<OperationalStateSnapshot>;
};

export class MemoryOperationalStateRepository implements OperationalStateRepository {
  private snapshot: OperationalStateSnapshot | null = null;

  async load() {
    return this.snapshot ? cloneOperationalStateSnapshot(this.snapshot) : null;
  }

  async loadResultAdminState() {
    return this.load();
  }

  async loadVotingAdminState() {
    return this.load();
  }

  async save(snapshot: OperationalStateSnapshot) {
    this.snapshot = cloneOperationalStateSnapshot(snapshot);
  }

  async persistMerged(input: PersistMergedStateInput) {
    const merged = mergeOperationalStateSnapshots({
      ...input,
      latest: await this.load(),
    });

    await this.save(merged);

    return cloneOperationalStateSnapshot(merged);
  }

  async persistVotingState(input: PersistMergedStateInput) {
    return this.persistMerged(input);
  }

  async persistVotingAdminState(input: PersistMergedStateInput) {
    return this.persistMerged(input);
  }

  async persistResultAdminState(input: PersistMergedStateInput) {
    return this.persistMerged(input);
  }

  clear() {
    this.snapshot = null;
  }
}
