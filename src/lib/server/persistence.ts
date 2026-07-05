import "server-only";
import { adminState } from "@/lib/server/admin-state";
import {
  createOperationalStateSnapshot,
  cloneOperationalStateSnapshot,
  restoreOperationalStateSnapshot,
  type AdminStateStores,
  type OperationalStateSnapshot,
} from "@/lib/persistence/operational-state";
import { mergeOperationalStateSnapshots } from "@/lib/persistence/merge";
import {
  MemoryOperationalStateRepository,
  type OperationalStateRepository,
} from "@/lib/persistence/repository";
import { getTournamentEventId, isProductionDeploymentEnv } from "@/lib/server/env";
import { NormalizedOperationalStateRepository } from "@/lib/server/normalized-operational-state";
import {
  invalidateTournamentReadCaches,
  readCachedPublicOperationalStateSnapshot,
} from "@/lib/server/public-hydration-cache";

export type TournamentStateBackend = "memory" | "supabase";

const globalForPersistence = globalThis as typeof globalThis & {
  biteOpenMemoryOperationalStateRepository?: MemoryOperationalStateRepository;
  biteOpenPersistenceWriteQueue?: Promise<void>;
};

const hydrationBaselines = new WeakMap<AdminStateStores, OperationalStateSnapshot | null>();

function restoreHydratedTournamentState(
  stores: AdminStateStores,
  snapshot: OperationalStateSnapshot | null,
) {
  if (snapshot) {
    restoreOperationalStateSnapshot(stores, snapshot);
  }

  hydrationBaselines.set(stores, createOperationalStateSnapshot(stores));
}

async function withPersistenceWriteQueue<T>(callback: () => Promise<T>) {
  const previous = globalForPersistence.biteOpenPersistenceWriteQueue ?? Promise.resolve();
  let releaseCurrent!: () => void;

  globalForPersistence.biteOpenPersistenceWriteQueue = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });

  await previous;

  try {
    return await callback();
  } finally {
    releaseCurrent();

    if (globalForPersistence.biteOpenPersistenceWriteQueue) {
      void globalForPersistence.biteOpenPersistenceWriteQueue.catch(() => undefined);
    }
  }
}

function getMemoryRepository() {
  return (
    globalForPersistence.biteOpenMemoryOperationalStateRepository ??
    (globalForPersistence.biteOpenMemoryOperationalStateRepository =
      new MemoryOperationalStateRepository())
  );
}

export function getTournamentStateBackend(): TournamentStateBackend {
  const configuredBackend = process.env.TOURNAMENT_STATE_BACKEND;

  if (configuredBackend === "supabase" || configuredBackend === "memory") {
    if (isProductionDeploymentEnv() && configuredBackend !== "supabase") {
      throw new Error("TOURNAMENT_STATE_BACKEND=supabase is required in production.");
    }

    return configuredBackend;
  }

  if (isProductionDeploymentEnv()) {
    throw new Error("TOURNAMENT_STATE_BACKEND must be explicitly set to supabase in production.");
  }

  return "memory";
}

export function getOperationalStateRepository(): OperationalStateRepository {
  const backend = getTournamentStateBackend();

  if (backend === "supabase") {
    getTournamentEventId();
    return new NormalizedOperationalStateRepository();
  }

  return getMemoryRepository();
}

async function persistTournamentStateUnlocked(
  stores: AdminStateStores,
  repository: OperationalStateRepository,
) {
  const baseline = hydrationBaselines.get(stores) ?? null;
  const current = createOperationalStateSnapshot(stores);

  if (repository.persistMerged) {
    const merged = await repository.persistMerged({ baseline, current });

    restoreOperationalStateSnapshot(stores, merged);
    hydrationBaselines.set(stores, cloneOperationalStateSnapshot(merged));
    invalidateTournamentReadCaches();

    return;
  }

  const latest = await repository.load();
  const merged = mergeOperationalStateSnapshots({
    baseline,
    current,
    latest,
  });

  await repository.save(merged);
  restoreOperationalStateSnapshot(stores, merged);
  hydrationBaselines.set(stores, cloneOperationalStateSnapshot(merged));
  invalidateTournamentReadCaches();
}

async function persistVotingStateUnlocked(
  stores: AdminStateStores,
  repository: OperationalStateRepository,
) {
  const persistVotingStateInRepository = repository.persistVotingState;

  if (!persistVotingStateInRepository) {
    await persistTournamentStateUnlocked(stores, repository);

    return;
  }

  const baseline = hydrationBaselines.get(stores) ?? null;
  const current = createOperationalStateSnapshot(stores);
  const merged = await persistVotingStateInRepository.call(repository, { baseline, current });

  restoreOperationalStateSnapshot(stores, merged);
  hydrationBaselines.set(stores, cloneOperationalStateSnapshot(merged));
  invalidateTournamentReadCaches();
}

async function persistVotingAdminStateUnlocked(
  stores: AdminStateStores,
  repository: OperationalStateRepository,
) {
  const persistVotingAdminStateInRepository = repository.persistVotingAdminState;

  if (!persistVotingAdminStateInRepository) {
    await persistTournamentStateUnlocked(stores, repository);

    return;
  }

  const baseline = hydrationBaselines.get(stores) ?? null;
  const current = createOperationalStateSnapshot(stores);
  const merged = await persistVotingAdminStateInRepository.call(repository, {
    baseline,
    current,
  });

  restoreOperationalStateSnapshot(stores, merged);
  hydrationBaselines.set(stores, cloneOperationalStateSnapshot(merged));
  invalidateTournamentReadCaches();
}

async function persistResultAdminStateUnlocked(
  stores: AdminStateStores,
  repository: OperationalStateRepository,
) {
  const persistResultAdminStateInRepository = repository.persistResultAdminState;

  if (!persistResultAdminStateInRepository) {
    await persistTournamentStateUnlocked(stores, repository);

    return;
  }

  const baseline = hydrationBaselines.get(stores) ?? null;
  const current = createOperationalStateSnapshot(stores);
  const merged = await persistResultAdminStateInRepository.call(repository, {
    baseline,
    current,
  });

  restoreOperationalStateSnapshot(stores, merged);
  hydrationBaselines.set(stores, cloneOperationalStateSnapshot(merged));
  invalidateTournamentReadCaches();
}

async function persistHostLockStateUnlocked(
  stores: AdminStateStores,
  repository: OperationalStateRepository,
) {
  if (!repository.persistHostLock) {
    await persistTournamentStateUnlocked(stores, repository);

    return;
  }

  const baseline = hydrationBaselines.get(stores)?.hostLock ?? null;
  const persisted = await repository.persistHostLock({
    baseline,
    current: stores.hostLockStore.exportSnapshot(),
  });

  stores.hostLockStore.importSnapshot(persisted);
  hydrationBaselines.set(stores, createOperationalStateSnapshot(stores));
  invalidateTournamentReadCaches();
}

export async function hydrateTournamentState(
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  const snapshot = await repository.load();

  restoreHydratedTournamentState(stores, snapshot);
}

export async function hydratePublicTournamentState(
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  const snapshot =
    getTournamentStateBackend() === "supabase"
      ? await readCachedPublicOperationalStateSnapshot(getTournamentEventId(), () =>
          repository.load(),
        )
      : await repository.load();

  restoreHydratedTournamentState(stores, snapshot);
}

export async function persistTournamentState(
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  return withPersistenceWriteQueue(() => persistTournamentStateUnlocked(stores, repository));
}

export async function persistHostLockState(
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  return withPersistenceWriteQueue(() => persistHostLockStateUnlocked(stores, repository));
}

export async function persistVotingState(
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  return withPersistenceWriteQueue(() => persistVotingStateUnlocked(stores, repository));
}

export async function persistVotingAdminState(
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  return withPersistenceWriteQueue(() => persistVotingAdminStateUnlocked(stores, repository));
}

export async function persistResultAdminState(
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  return withPersistenceWriteQueue(() => persistResultAdminStateUnlocked(stores, repository));
}

export async function withPersistedTournamentState<T>(
  callback: () => T | Promise<T>,
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  return withPersistenceWriteQueue(async () => {
    await hydrateTournamentState(stores, repository);
    const rollbackSnapshot = createOperationalStateSnapshot(stores);

    try {
      const result = await callback();

      await persistTournamentStateUnlocked(stores, repository);

      return result;
    } catch (error) {
      restoreOperationalStateSnapshot(stores, rollbackSnapshot);

      throw error;
    }
  });
}

export async function withPersistedVotingState<T>(
  callback: () => T | Promise<T>,
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  return withPersistenceWriteQueue(async () => {
    await hydrateTournamentState(stores, repository);
    const rollbackSnapshot = createOperationalStateSnapshot(stores);

    try {
      const result = await callback();

      await persistVotingStateUnlocked(stores, repository);

      return result;
    } catch (error) {
      restoreOperationalStateSnapshot(stores, rollbackSnapshot);

      throw error;
    }
  });
}

export async function withPersistedVotingAdminState<T>(
  callback: () => T | Promise<T>,
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  return withPersistenceWriteQueue(async () => {
    const snapshot = repository.loadVotingAdminState
      ? await repository.loadVotingAdminState()
      : await repository.load();

    restoreHydratedTournamentState(stores, snapshot);
    const rollbackSnapshot = createOperationalStateSnapshot(stores);

    try {
      const result = await callback();

      await persistVotingAdminStateUnlocked(stores, repository);

      return result;
    } catch (error) {
      restoreOperationalStateSnapshot(stores, rollbackSnapshot);

      throw error;
    }
  });
}

export async function withPersistedResultAdminState<T>(
  callback: () => T | Promise<T>,
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  return withPersistenceWriteQueue(async () => {
    const snapshot = repository.loadResultAdminState
      ? await repository.loadResultAdminState()
      : await repository.load();

    restoreHydratedTournamentState(stores, snapshot);
    const rollbackSnapshot = createOperationalStateSnapshot(stores);

    try {
      const result = await callback();

      await persistResultAdminStateUnlocked(stores, repository);

      return result;
    } catch (error) {
      restoreOperationalStateSnapshot(stores, rollbackSnapshot);

      throw error;
    }
  });
}

export async function withPersistedHostLockState<T>(
  callback: () => T | Promise<T>,
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  return withPersistenceWriteQueue(async () => {
    await hydrateTournamentState(stores, repository);
    const rollbackSnapshot = createOperationalStateSnapshot(stores);

    try {
      const result = await callback();

      await persistHostLockStateUnlocked(stores, repository);

      return result;
    } catch (error) {
      restoreOperationalStateSnapshot(stores, rollbackSnapshot);

      throw error;
    }
  });
}
