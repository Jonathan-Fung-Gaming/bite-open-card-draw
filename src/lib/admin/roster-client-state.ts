import type { RosterPlayer } from "./roster";
import { createClientRequestId } from "./request-id";

export type RosterActiveStatusChange = {
  active: boolean;
  expectedUpdatedAt: string;
  playerId: string;
};

export type RosterActiveStatusMutationInput = {
  changes: RosterActiveStatusChange[];
  expectedVersion: number;
  requestId: string;
};

export type RosterMutationResult =
  | {
      activeCount: number;
      ok: true;
      players: RosterPlayer[];
      requestId: string;
      version: number;
    }
  | {
      message: string;
      ok: false;
      players: RosterPlayer[];
      requestId: string;
      retryable: boolean;
      version: number;
    };

export type RosterClientSnapshot = {
  activeCount: number;
  errors: ReadonlyMap<string, string>;
  pendingPlayerIds: ReadonlySet<string>;
  players: readonly RosterPlayer[];
  version: number;
};

type RosterBatchRequest = {
  changes: RosterActiveStatusChange[];
  requestId: string;
};

type RosterStatusBatcherOptions = {
  createRequestId?: () => string;
  debounceMs?: number;
  initialPlayers: readonly RosterPlayer[];
  initialVersion: number;
  mutate: (input: RosterActiveStatusMutationInput) => Promise<RosterMutationResult>;
};

const DEFAULT_BATCH_DEBOUNCE_MS = 80;

function sortPlayers(players: Iterable<RosterPlayer>) {
  return [...players].sort((left, right) =>
    left.startggUsername.localeCompare(right.startggUsername),
  );
}

/**
 * Owns the browser's canonical roster plus its per-row desired active-state overlay.
 * Requests are serialized so a late response can never replace a newer local intent.
 */
export class SerializedRosterStatusBatcher {
  private readonly canonicalPlayers = new Map<string, RosterPlayer>();
  private readonly createRequestId: () => string;
  private readonly debounceMs: number;
  private readonly desiredActive = new Map<string, boolean>();
  private readonly listeners = new Set<() => void>();
  private readonly mutate: RosterStatusBatcherOptions["mutate"];
  private readonly rowErrors = new Map<string, string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: RosterBatchRequest | null = null;
  private snapshot: RosterClientSnapshot;
  private version: number;

  constructor(options: RosterStatusBatcherOptions) {
    this.createRequestId = options.createRequestId ?? createClientRequestId;
    this.debounceMs = options.debounceMs ?? DEFAULT_BATCH_DEBOUNCE_MS;
    this.mutate = options.mutate;
    this.version = options.initialVersion;

    for (const player of options.initialPlayers) {
      this.canonicalPlayers.set(player.id, player);
    }

    this.snapshot = this.createSnapshot();
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setDesiredActive(playerId: string, active: boolean) {
    const canonical = this.canonicalPlayers.get(playerId);

    if (!canonical) {
      return;
    }

    this.rowErrors.delete(playerId);

    const inFlightChange = this.inFlight?.changes.find((change) => change.playerId === playerId);

    if (!inFlightChange && canonical.active === active) {
      this.desiredActive.delete(playerId);
    } else {
      this.desiredActive.set(playerId, active);
    }

    this.publish();
    this.scheduleFlush();
  }

  mergeCanonical(version: number, players: readonly RosterPlayer[]) {
    if (!this.mergeCanonicalRows(version, players)) {
      return;
    }

    this.dropSatisfiedDesiredStates();
    this.publish();
    this.scheduleFlush();
  }

  clearRowError(playerId: string) {
    if (!this.rowErrors.delete(playerId)) {
      return;
    }

    this.publish();
  }

  async flushNow() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
  }

  private createSnapshot(): RosterClientSnapshot {
    const players = sortPlayers(this.canonicalPlayers.values()).map((player) => {
      const desired = this.desiredActive.get(player.id);
      return desired === undefined || desired === player.active
        ? player
        : { ...player, active: desired };
    });

    return {
      activeCount: players.filter((player) => player.active).length,
      errors: new Map(this.rowErrors),
      pendingPlayerIds: new Set(this.desiredActive.keys()),
      players,
      version: this.version,
    };
  }

  private dropSatisfiedDesiredStates() {
    const inFlightIds = new Set(this.inFlight?.changes.map((change) => change.playerId) ?? []);

    for (const [playerId, desired] of this.desiredActive) {
      if (inFlightIds.has(playerId)) {
        continue;
      }

      if (this.canonicalPlayers.get(playerId)?.active === desired) {
        this.desiredActive.delete(playerId);
      }
    }
  }

  private getChangesToFlush() {
    const changes: RosterActiveStatusChange[] = [];

    for (const [playerId, active] of this.desiredActive) {
      const canonical = this.canonicalPlayers.get(playerId);

      if (!canonical || canonical.active === active) {
        continue;
      }

      changes.push({
        active,
        expectedUpdatedAt: canonical.updatedAt,
        playerId,
      });
    }

    return changes;
  }

  private mergeCanonicalRows(version: number, players: readonly RosterPlayer[]) {
    if (!Number.isSafeInteger(version) || version < this.version) {
      return false;
    }

    this.version = version;

    for (const player of players) {
      this.canonicalPlayers.set(player.id, player);
    }

    return true;
  }

  private publish() {
    this.snapshot = this.createSnapshot();

    for (const listener of this.listeners) {
      listener();
    }
  }

  private scheduleFlush() {
    if (this.inFlight || this.flushTimer || this.getChangesToFlush().length === 0) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.debounceMs);
  }

  private async flush() {
    if (this.inFlight) {
      return;
    }

    const changes = this.getChangesToFlush();

    if (changes.length === 0) {
      this.dropSatisfiedDesiredStates();
      this.publish();
      return;
    }

    const request: RosterBatchRequest = {
      changes,
      requestId: this.createRequestId(),
    };
    this.inFlight = request;

    let result: RosterMutationResult;

    try {
      result = await this.mutate({
        changes,
        expectedVersion: this.version,
        requestId: request.requestId,
      });
    } catch (error) {
      result = {
        message: error instanceof Error ? error.message : "Could not update the roster.",
        ok: false,
        players: [],
        requestId: request.requestId,
        retryable: false,
        version: this.version,
      };
    }

    if (this.inFlight?.requestId !== request.requestId) {
      return;
    }

    const matchingResponse = result.requestId === request.requestId;

    if (matchingResponse) {
      this.mergeCanonicalRows(result.version, result.players);
    }

    for (const change of request.changes) {
      if (this.desiredActive.get(change.playerId) !== change.active) {
        continue;
      }

      this.desiredActive.delete(change.playerId);

      if (!matchingResponse) {
        this.rowErrors.set(change.playerId, "Could not confirm this roster change.");
      } else if (!result.ok) {
        this.rowErrors.set(change.playerId, result.message);
      }
    }

    this.inFlight = null;
    this.dropSatisfiedDesiredStates();
    this.publish();
    this.scheduleFlush();
  }
}
