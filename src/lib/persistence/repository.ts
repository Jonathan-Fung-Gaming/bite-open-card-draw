import {
  cloneOperationalStateSnapshot,
  type OperationalStateSnapshot,
} from "@/lib/persistence/operational-state";

export type OperationalStateRepository = {
  load(): Promise<OperationalStateSnapshot | null>;
  save(snapshot: OperationalStateSnapshot): Promise<void>;
};

export class MemoryOperationalStateRepository implements OperationalStateRepository {
  private snapshot: OperationalStateSnapshot | null = null;

  async load() {
    return this.snapshot ? cloneOperationalStateSnapshot(this.snapshot) : null;
  }

  async save(snapshot: OperationalStateSnapshot) {
    this.snapshot = cloneOperationalStateSnapshot(snapshot);
  }

  clear() {
    this.snapshot = null;
  }
}
