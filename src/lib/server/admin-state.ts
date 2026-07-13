import "server-only";
import { createAdminStateStores, type AdminStateStores } from "@/lib/persistence/operational-state";
import { createDefaultPublicStateGenerationRecord } from "@/lib/round/public-state-generation";
import { invalidateTournamentReadCaches } from "@/lib/server/public-hydration-cache";

const globalForAdminState = globalThis as typeof globalThis & {
  biteOpenAdminState?: AdminStateStores;
};

export const adminState =
  globalForAdminState.biteOpenAdminState ??
  (globalForAdminState.biteOpenAdminState = createAdminStateStores());

export function resetTournamentOperationalState(options?: {
  publicTransitionKind: string;
  publicUpdatedAtMs: number;
}) {
  const previousPublicState = adminState.publicStateGenerationStore.exportSnapshot();
  const fresh = createAdminStateStores();

  if (options) {
    const transitionKind = options.publicTransitionKind.trim();
    const updatedAt = new Date(options.publicUpdatedAtMs).toISOString();

    if (!transitionKind) {
      throw new Error("Public reset transition kind is required.");
    }

    fresh.publicStateGenerationStore.importSnapshot({
      rounds: previousPublicState.rounds.map((previous) => ({
        ...createDefaultPublicStateGenerationRecord(previous.roundNumber),
        generation: previous.generation + 1,
        transitionKind,
        updatedAt,
      })),
    });
  }

  invalidateTournamentReadCaches();
  adminState.rosterStore = fresh.rosterStore;
  adminState.drawStateStore = fresh.drawStateStore;
  adminState.ballotStore = fresh.ballotStore;
  adminState.votingWindowStore = fresh.votingWindowStore;
  adminState.resultStore = fresh.resultStore;
  adminState.publicStateGenerationStore = fresh.publicStateGenerationStore;
}
