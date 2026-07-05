import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdminStateStores,
  createOperationalStateSnapshot,
} from "@/lib/persistence/operational-state";
import {
  invalidateTournamentReadCaches,
  readCachedPublicOperationalStateSnapshot,
} from "./public-hydration-cache";

vi.mock("server-only", () => ({}));

function createSnapshot(username: string) {
  const stores = createAdminStateStores();

  stores.rosterStore.createOrUpdatePlayer({
    active: true,
    startggUsername: username,
  });

  return createOperationalStateSnapshot(stores, "2026-07-05T00:00:00.000Z");
}

describe("public hydration cache", () => {
  afterEach(() => {
    invalidateTournamentReadCaches();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("coalesces public state reads inside the short cache window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-05T00:00:00.000Z"));
    const loadSnapshot = vi.fn(async () => createSnapshot("Alpha"));

    const first = await readCachedPublicOperationalStateSnapshot("event-a", loadSnapshot);
    const second = await readCachedPublicOperationalStateSnapshot("event-a", loadSnapshot);

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(first?.roster.players[0]?.startggUsername).toBe("Alpha");
    expect(second?.roster.players[0]?.startggUsername).toBe("Alpha");
  });

  it("returns cloned snapshots so route rendering cannot mutate the cache", async () => {
    const loadSnapshot = vi.fn(async () => createSnapshot("Alpha"));
    const first = await readCachedPublicOperationalStateSnapshot("event-a", loadSnapshot);

    if (first?.roster.players[0]) {
      first.roster.players[0].startggUsername = "Mutated";
    }

    const second = await readCachedPublicOperationalStateSnapshot("event-a", loadSnapshot);

    expect(second?.roster.players[0]?.startggUsername).toBe("Alpha");
  });

  it("expires by event key and explicit invalidation", async () => {
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(createSnapshot("Alpha"))
      .mockResolvedValueOnce(createSnapshot("Bravo"))
      .mockResolvedValueOnce(createSnapshot("Charlie"));

    await expect(
      readCachedPublicOperationalStateSnapshot("event-a", loadSnapshot),
    ).resolves.toMatchObject({
      roster: { players: [{ startggUsername: "Alpha" }] },
    });
    await expect(
      readCachedPublicOperationalStateSnapshot("event-b", loadSnapshot),
    ).resolves.toMatchObject({
      roster: { players: [{ startggUsername: "Bravo" }] },
    });

    invalidateTournamentReadCaches();

    await expect(
      readCachedPublicOperationalStateSnapshot("event-b", loadSnapshot),
    ).resolves.toMatchObject({
      roster: { players: [{ startggUsername: "Charlie" }] },
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(3);
  });

  it("can be disabled for diagnostics", async () => {
    vi.stubEnv("TOURNAMENT_PUBLIC_READ_CACHE_MS", "0");
    const loadSnapshot = vi.fn(async () => createSnapshot("Alpha"));

    await readCachedPublicOperationalStateSnapshot("event-a", loadSnapshot);
    await readCachedPublicOperationalStateSnapshot("event-a", loadSnapshot);

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });
});
