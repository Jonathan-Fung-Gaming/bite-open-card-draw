import "server-only";
import { createAdminStateStores, type AdminStateStores } from "@/lib/persistence/operational-state";
import { invalidateTournamentReadCaches } from "@/lib/server/public-hydration-cache";

const globalForAdminState = globalThis as typeof globalThis & {
  biteOpenAdminState?: AdminStateStores;
};

export const adminState =
  globalForAdminState.biteOpenAdminState ?? (globalForAdminState.biteOpenAdminState = createAdminStateStores());

export function resetTournamentOperationalState() {
  const fresh = createAdminStateStores();

  invalidateTournamentReadCaches();
  adminState.rosterStore = fresh.rosterStore;
  adminState.drawStateStore = fresh.drawStateStore;
  adminState.ballotStore = fresh.ballotStore;
  adminState.votingWindowStore = fresh.votingWindowStore;
  adminState.resultStore = fresh.resultStore;
}
