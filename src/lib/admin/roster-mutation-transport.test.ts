import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ROSTER_MUTATION_ENDPOINT,
  ROSTER_MUTATION_REQUEST_HEADER,
  ROSTER_MUTATION_REQUEST_HEADER_VALUE,
  editRosterUsername,
  fetchRosterSnapshot,
  setRosterActiveStatus,
} from "./roster-mutation-transport";

const requestId = "00000000-0000-4000-8000-000000000001";
const playerId = "00000000-0000-4000-8000-000000000002";
const now = "2026-07-14T00:00:00.000Z";

describe("roster mutation transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends active-status mutations through the same-origin JSON endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        activeCount: 0,
        ok: true,
        players: [
          {
            active: false,
            createdAt: now,
            hasTournamentHistory: false,
            id: playerId,
            normalizedUsername: "alpha",
            startggUsername: "Alpha",
            updatedAt: now,
          },
        ],
        requestId,
        version: 2,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      changes: [{ active: false, expectedUpdatedAt: now, playerId }],
      expectedVersion: 1,
      requestId,
    };

    await expect(setRosterActiveStatus(input)).resolves.toMatchObject({ ok: true, version: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      ROSTER_MUTATION_ENDPOINT,
      expect.objectContaining({
        body: JSON.stringify({ input, mutation: "active-status" }),
        cache: "no-store",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "content-type": "application/json",
          [ROSTER_MUTATION_REQUEST_HEADER]: ROSTER_MUTATION_REQUEST_HEADER_VALUE,
        }),
        method: "POST",
      }),
    );
  });

  it("uses the username mutation discriminator", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        message: "Player was updated since this roster was loaded.",
        ok: false,
        players: [],
        requestId,
        retryable: true,
        version: 2,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      expectedUpdatedAt: now,
      expectedVersion: 1,
      playerId,
      requestId,
      startggUsername: "Beta",
    };

    await expect(editRosterUsername(input)).resolves.toMatchObject({ ok: false, retryable: true });
    expect(fetchMock).toHaveBeenCalledWith(
      ROSTER_MUTATION_ENDPOINT,
      expect.objectContaining({ body: JSON.stringify({ input, mutation: "username" }) }),
    );
  });

  it("fetches and validates authenticated same-origin roster snapshots", async () => {
    const snapshot = {
      activeCount: 1,
      players: [
        {
          active: true,
          createdAt: now,
          hasTournamentHistory: false,
          id: playerId,
          normalizedUsername: "alpha",
          startggUsername: "Alpha",
          updatedAt: now,
        },
      ],
      version: 3,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(snapshot));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRosterSnapshot()).resolves.toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledWith(
      ROSTER_MUTATION_ENDPOINT,
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          [ROSTER_MUTATION_REQUEST_HEADER]: ROSTER_MUTATION_REQUEST_HEADER_VALUE,
        },
        method: "GET",
      }),
    );
  });

  it("maps snapshot HTTP, network, and invalid-response failures to safe messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: "sensitive server detail" }, { status: 500 })),
    );
    await expect(fetchRosterSnapshot()).rejects.toThrow("Could not refresh the roster");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sensitive network detail")));
    await expect(fetchRosterSnapshot()).rejects.toThrow("Could not refresh the roster");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ activeCount: 1 })));
    await expect(fetchRosterSnapshot()).rejects.toThrow("Could not confirm the roster refresh");
  });

  it("maps HTTP, network, and invalid-response failures to safe generic messages", async () => {
    const input = {
      changes: [{ active: false, expectedUpdatedAt: now, playerId }],
      expectedVersion: 1,
      requestId,
    };

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: "sensitive server detail" }, { status: 500 })),
    );
    await expect(setRosterActiveStatus(input)).rejects.toThrow("Could not update the roster");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sensitive network detail")));
    await expect(setRosterActiveStatus(input)).rejects.toThrow("Could not update the roster");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
    await expect(setRosterActiveStatus(input)).rejects.toThrow(
      "Could not confirm the roster update",
    );
  });
});
