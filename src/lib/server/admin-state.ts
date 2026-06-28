import "server-only";
import { createAdminStateStores, type AdminStateStores } from "@/lib/persistence/operational-state";

const globalForAdminState = globalThis as typeof globalThis & {
  biteOpenAdminState?: AdminStateStores;
};

export const adminState =
  globalForAdminState.biteOpenAdminState ?? (globalForAdminState.biteOpenAdminState = createAdminStateStores());

export function resetTournamentOperationalState() {
  const fresh = createAdminStateStores();

  adminState.rosterStore = fresh.rosterStore;
  adminState.drawStateStore = fresh.drawStateStore;
  adminState.ballotStore = fresh.ballotStore;
  adminState.votingWindowStore = fresh.votingWindowStore;
  adminState.resultStore = fresh.resultStore;
}
