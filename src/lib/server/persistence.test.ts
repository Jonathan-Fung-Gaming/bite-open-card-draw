import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminStateStores } from "@/lib/persistence/operational-state";
import type { OperationalStateRepository } from "@/lib/persistence/repository";
import { getTournamentStateBackend, withPersistedTournamentState } from "./persistence";

vi.mock("server-only", () => ({}));

describe("server persistence safety", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects memory or missing tournament state backend in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "");
    expect(() => getTournamentStateBackend()).toThrow(/supabase/);

    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "memory");
    expect(() => getTournamentStateBackend()).toThrow(/supabase/);

    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    expect(getTournamentStateBackend()).toBe("supabase");
  });

  it("restores the previous in-process state when persistence fails", async () => {
    const stores = createAdminStateStores();
    const repository: OperationalStateRepository = {
      async load() {
        return null;
      },
      async save() {
        throw new Error("save failed");
      },
    };

    stores.rosterStore.createOrUpdatePlayer({ startggUsername: "Existing", active: true });

    await expect(
      withPersistedTournamentState(() => {
        stores.rosterStore.createOrUpdatePlayer({ startggUsername: "Rolled Back", active: true });
      }, stores, repository),
    ).rejects.toThrow("save failed");

    expect(stores.rosterStore.listPlayers().map((player) => player.startggUsername)).toEqual([
      "Existing",
    ]);
  });
});
