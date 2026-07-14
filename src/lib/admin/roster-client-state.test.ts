import { afterEach, describe, expect, it, vi } from "vitest";
import type { RosterPlayer } from "./roster";
import {
  SerializedRosterStatusBatcher,
  type RosterActiveStatusMutationInput,
  type RosterMutationResult,
} from "./roster-client-state";

function player(index: number, active = true): RosterPlayer {
  return {
    active,
    createdAt: `2026-07-14T00:00:${String(index).padStart(2, "0")}.000Z`,
    hasTournamentHistory: false,
    id: `player-${index}`,
    normalizedUsername: `player ${index}`,
    startggUsername: `Player ${index}`,
    updatedAt: `2026-07-14T00:00:${String(index).padStart(2, "0")}.000Z`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("SerializedRosterStatusBatcher", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("optimistically changes a row and active count before its request starts", () => {
    vi.useFakeTimers();
    const mutate =
      vi.fn<(input: RosterActiveStatusMutationInput) => Promise<RosterMutationResult>>();
    const batcher = new SerializedRosterStatusBatcher({
      createRequestId: () => "request-1",
      initialPlayers: [player(1), player(2)],
      initialVersion: 1,
      mutate,
    });

    batcher.setDesiredActive("player-1", false);

    expect(batcher.getSnapshot().activeCount).toBe(1);
    expect(batcher.getSnapshot().players.find((entry) => entry.id === "player-1")?.active).toBe(
      false,
    );
    expect(batcher.getSnapshot().pendingPlayerIds.has("player-1")).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("coalesces thirty rapid row changes into one desired-state batch", async () => {
    vi.useFakeTimers();
    const players = Array.from({ length: 30 }, (_, index) => player(index + 1));
    const mutate = vi.fn(async (input: RosterActiveStatusMutationInput) => ({
      activeCount: 0,
      ok: true as const,
      players: players.map((entry) => ({ ...entry, active: false })),
      requestId: input.requestId,
      version: 2,
    }));
    const batcher = new SerializedRosterStatusBatcher({
      createRequestId: () => "request-30",
      initialPlayers: players,
      initialVersion: 1,
      mutate,
    });

    for (const entry of players) {
      batcher.setDesiredActive(entry.id, false);
    }

    expect(batcher.getSnapshot().activeCount).toBe(0);
    await vi.advanceTimersByTimeAsync(80);
    await settle();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]?.[0].changes).toHaveLength(30);
    expect(batcher.getSnapshot().pendingPlayerIds.size).toBe(0);
  });

  it("serializes a newer same-row intent behind an in-flight request", async () => {
    vi.useFakeTimers();
    const first = deferred<RosterMutationResult>();
    const second = deferred<RosterMutationResult>();
    const requests: RosterActiveStatusMutationInput[] = [];
    const mutate = vi.fn((input: RosterActiveStatusMutationInput) => {
      requests.push(input);
      return requests.length === 1 ? first.promise : second.promise;
    });
    let requestIndex = 0;
    const initial = player(1);
    const batcher = new SerializedRosterStatusBatcher({
      createRequestId: () => `request-${++requestIndex}`,
      initialPlayers: [initial],
      initialVersion: 1,
      mutate,
    });

    batcher.setDesiredActive(initial.id, false);
    await vi.advanceTimersByTimeAsync(80);
    expect(requests).toHaveLength(1);

    batcher.setDesiredActive(initial.id, true);
    first.resolve({
      activeCount: 0,
      ok: true,
      players: [{ ...initial, active: false, updatedAt: "2026-07-14T00:01:00.000Z" }],
      requestId: "request-1",
      version: 2,
    });
    await settle();
    await vi.advanceTimersByTimeAsync(80);

    expect(requests).toHaveLength(2);
    expect(requests[1]?.changes).toEqual([
      {
        active: true,
        expectedUpdatedAt: "2026-07-14T00:01:00.000Z",
        playerId: initial.id,
      },
    ]);

    second.resolve({
      activeCount: 1,
      ok: true,
      players: [{ ...initial, active: true, updatedAt: "2026-07-14T00:02:00.000Z" }],
      requestId: "request-2",
      version: 3,
    });
    await settle();

    expect(batcher.getSnapshot().players[0]?.active).toBe(true);
    expect(batcher.getSnapshot().pendingPlayerIds.size).toBe(0);
  });

  it("rolls back only a failed request while preserving an unrelated queued row", async () => {
    vi.useFakeTimers();
    const first = deferred<RosterMutationResult>();
    const second = deferred<RosterMutationResult>();
    const mutate = vi
      .fn<(input: RosterActiveStatusMutationInput) => Promise<RosterMutationResult>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    let requestIndex = 0;
    const firstPlayer = player(1);
    const secondPlayer = player(2);
    const batcher = new SerializedRosterStatusBatcher({
      createRequestId: () => `request-${++requestIndex}`,
      initialPlayers: [firstPlayer, secondPlayer],
      initialVersion: 1,
      mutate,
    });

    batcher.setDesiredActive(firstPlayer.id, false);
    await vi.advanceTimersByTimeAsync(80);
    batcher.setDesiredActive(secondPlayer.id, false);

    first.resolve({
      message: "The roster changed before this request committed.",
      ok: false,
      players: [firstPlayer],
      requestId: "request-1",
      retryable: true,
      version: 2,
    });
    await settle();

    expect(batcher.getSnapshot().players.find((entry) => entry.id === firstPlayer.id)?.active).toBe(
      true,
    );
    expect(
      batcher.getSnapshot().players.find((entry) => entry.id === secondPlayer.id)?.active,
    ).toBe(false);
    expect(batcher.getSnapshot().errors.get(firstPlayer.id)).toContain("roster changed");
    expect(batcher.getSnapshot().errors.has(secondPlayer.id)).toBe(false);

    await vi.advanceTimersByTimeAsync(80);
    expect(mutate).toHaveBeenCalledTimes(2);

    second.resolve({
      activeCount: 1,
      ok: true,
      players: [{ ...secondPlayer, active: false }],
      requestId: "request-2",
      version: 3,
    });
    await settle();
  });

  it("does not let an older canonical refresh replace newer state", () => {
    const initial = player(1);
    const batcher = new SerializedRosterStatusBatcher({
      initialPlayers: [{ ...initial, active: false }],
      initialVersion: 4,
      mutate: vi.fn(),
    });

    batcher.mergeCanonical(3, [initial]);

    expect(batcher.getSnapshot().version).toBe(4);
    expect(batcher.getSnapshot().players[0]?.active).toBe(false);
  });
});
