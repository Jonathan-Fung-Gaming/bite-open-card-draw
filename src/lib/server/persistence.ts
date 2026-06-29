import "server-only";
import { adminState } from "@/lib/server/admin-state";
import {
  createOperationalStateSnapshot,
  restoreOperationalStateSnapshot,
  type AdminStateStores,
} from "@/lib/persistence/operational-state";
import {
  MemoryOperationalStateRepository,
  type OperationalStateRepository,
} from "@/lib/persistence/repository";
import { getTournamentEventId } from "@/lib/server/env";
import { NormalizedOperationalStateRepository } from "@/lib/server/normalized-operational-state";

export type TournamentStateBackend = "memory" | "supabase";

const globalForPersistence = globalThis as typeof globalThis & {
  biteOpenMemoryOperationalStateRepository?: MemoryOperationalStateRepository;
};

function getMemoryRepository() {
  return (
    globalForPersistence.biteOpenMemoryOperationalStateRepository ??
    (globalForPersistence.biteOpenMemoryOperationalStateRepository =
      new MemoryOperationalStateRepository())
  );
}

function isTestMemoryBackendAllowed() {
  return process.env.TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND === "true";
}

export function getTournamentStateBackend(): TournamentStateBackend {
  const configuredBackend = process.env.TOURNAMENT_STATE_BACKEND;

  if (configuredBackend === "supabase" || configuredBackend === "memory") {
    if (
      process.env.NODE_ENV === "production" &&
      configuredBackend !== "supabase" &&
      !isTestMemoryBackendAllowed()
    ) {
      throw new Error("TOURNAMENT_STATE_BACKEND=supabase is required in production.");
    }

    return configuredBackend;
  }

  if (process.env.NODE_ENV === "production") {
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

export async function hydrateTournamentState(
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  const snapshot = await repository.load();

  if (snapshot) {
    restoreOperationalStateSnapshot(stores, snapshot);
  }
}

export async function persistTournamentState(
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  await repository.save(createOperationalStateSnapshot(stores));
}

export async function withPersistedTournamentState<T>(
  callback: () => T | Promise<T>,
  stores: AdminStateStores = adminState,
  repository = getOperationalStateRepository(),
) {
  await hydrateTournamentState(stores, repository);
  const rollbackSnapshot = createOperationalStateSnapshot(stores);

  try {
    const result = await callback();

    await persistTournamentState(stores, repository);

    return result;
  } catch (error) {
    restoreOperationalStateSnapshot(stores, rollbackSnapshot);

    throw error;
  }
}
