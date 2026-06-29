import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminStateStores } from "@/lib/persistence/operational-state";
import type { OperationalStateRepository } from "@/lib/persistence/repository";
import {
  getOperationalStateRepository,
  getTournamentStateBackend,
  withPersistedTournamentState,
} from "./persistence";

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

  it("requires an event id before initializing Supabase-backed runtime persistence", () => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
    vi.stubEnv("ADMIN_PASSWORD_HASH", "$2a$10$test");
    vi.stubEnv("SESSION_SECRET", "test-session-secret");
    vi.stubEnv("TOURNAMENT_EVENT_ID", "");

    expect(() => getOperationalStateRepository()).toThrow(/TOURNAMENT_EVENT_ID/);

    vi.stubEnv("TOURNAMENT_EVENT_ID", "test-event");

    expect(() => getOperationalStateRepository()).not.toThrow();
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
      withPersistedTournamentState(
        () => {
          stores.rosterStore.createOrUpdatePlayer({ startggUsername: "Rolled Back", active: true });
        },
        stores,
        repository,
      ),
    ).rejects.toThrow("save failed");

    expect(stores.rosterStore.listPlayers().map((player) => player.startggUsername)).toEqual([
      "Existing",
    ]);
  });
});
