import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ROSTER_MUTATION_REQUEST_HEADER,
  ROSTER_MUTATION_REQUEST_HEADER_VALUE,
} from "@/lib/admin/roster-mutation-transport";

vi.mock("server-only", () => ({}));

const actionMocks = vi.hoisted(() => ({
  editPlayerUsernameAction: vi.fn(),
  setPlayerActiveStatusAction: vi.fn(),
}));
const serverMocks = vi.hoisted(() => ({
  createServiceRoleSupabaseClient: vi.fn(),
  getAdminSessionFromCookies: vi.fn(),
  getMemoryRosterVersion: vi.fn(),
  getTournamentEventId: vi.fn(),
  getTournamentStateBackend: vi.fn(),
  hydrateTournamentState: vi.fn(),
  listPlayers: vi.fn(),
  playersEq: vi.fn(),
  readNormalizedRosterVersion: vi.fn(),
}));

vi.mock("@/app/coolguy69/actions", () => actionMocks);
vi.mock("@/lib/server/admin-auth", () => ({
  getAdminSessionFromCookies: serverMocks.getAdminSessionFromCookies,
}));
vi.mock("@/lib/server/env", () => ({
  getTournamentEventId: serverMocks.getTournamentEventId,
}));
vi.mock("@/lib/server/admin-state", () => ({
  adminState: { rosterStore: { listPlayers: serverMocks.listPlayers } },
}));
vi.mock("@/lib/server/normalized-roster", () => ({
  readNormalizedRosterVersion: serverMocks.readNormalizedRosterVersion,
}));
vi.mock("@/lib/server/persistence", () => ({
  getMemoryRosterVersion: serverMocks.getMemoryRosterVersion,
  getTournamentStateBackend: serverMocks.getTournamentStateBackend,
  hydrateTournamentState: serverMocks.hydrateTournamentState,
}));
vi.mock("@/lib/server/supabase", () => ({
  createServiceRoleSupabaseClient: serverMocks.createServiceRoleSupabaseClient,
}));

import { GET, POST } from "./route";

const requestId = "00000000-0000-4000-8000-000000000001";
const playerId = "00000000-0000-4000-8000-000000000002";
const now = "2026-07-14T00:00:00.000Z";
const player = {
  active: false,
  createdAt: now,
  hasTournamentHistory: false,
  id: playerId,
  normalizedUsername: "alpha",
  startggUsername: "Alpha",
  updatedAt: now,
};

function mutationRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://tournament.example/coolguy69/roster-mutations", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin: "https://tournament.example",
      "sec-fetch-site": "same-origin",
      [ROSTER_MUTATION_REQUEST_HEADER]: ROSTER_MUTATION_REQUEST_HEADER_VALUE,
      ...headers,
    },
    method: "POST",
  });
}

function snapshotRequest(headers: Record<string, string> = {}) {
  return new Request("https://tournament.example/coolguy69/roster-mutations", {
    headers: {
      origin: "https://tournament.example",
      "sec-fetch-site": "same-origin",
      [ROSTER_MUTATION_REQUEST_HEADER]: ROSTER_MUTATION_REQUEST_HEADER_VALUE,
      ...headers,
    },
    method: "GET",
  });
}

describe("/coolguy69/roster-mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverMocks.getAdminSessionFromCookies.mockResolvedValue({ sessionId: "admin-session" });
    serverMocks.getTournamentEventId.mockReturnValue("event-1");
    serverMocks.getTournamentStateBackend.mockReturnValue("supabase");
    serverMocks.getMemoryRosterVersion.mockReturnValue(2);
    serverMocks.hydrateTournamentState.mockResolvedValue(undefined);
    serverMocks.listPlayers.mockReturnValue([player]);
    serverMocks.createServiceRoleSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: serverMocks.playersEq })),
      })),
    });
    serverMocks.playersEq.mockResolvedValue({
      data: [
        {
          active: false,
          created_at: now,
          has_tournament_history: false,
          id: playerId,
          startgg_username: "Alpha",
          startgg_username_normalized: "alpha",
          updated_at: now,
        },
      ],
      error: null,
    });
    serverMocks.readNormalizedRosterVersion.mockResolvedValue({
      eventId: "event-1",
      scope: "roster",
      updatedAt: now,
      version: 2,
    });
    actionMocks.setPlayerActiveStatusAction.mockResolvedValue({
      activeCount: 0,
      ok: true,
      players: [player],
      requestId,
      version: 2,
    });
    actionMocks.editPlayerUsernameAction.mockResolvedValue({
      activeCount: 1,
      ok: true,
      players: [{ ...player, active: true, startggUsername: "Beta" }],
      requestId,
      version: 2,
    });
  });

  it("requires the explicit header and same-origin browser metadata for snapshots", async () => {
    const missingHeader = await GET(snapshotRequest({ [ROSTER_MUTATION_REQUEST_HEADER]: "" }));
    const crossSite = await GET(
      snapshotRequest({ origin: "https://attacker.example", "sec-fetch-site": "cross-site" }),
    );
    const missingFetchMetadata = await GET(snapshotRequest({ "sec-fetch-site": "" }));

    expect(missingHeader.status).toBe(403);
    expect(crossSite.status).toBe(403);
    expect(missingFetchMetadata.status).toBe(403);
    expect(serverMocks.getAdminSessionFromCookies).not.toHaveBeenCalled();
  });

  it("accepts same-origin GET fetch metadata when the browser omits Origin", async () => {
    const response = await GET(
      new Request("https://tournament.example/coolguy69/roster-mutations", {
        headers: {
          "sec-fetch-site": "same-origin",
          [ROSTER_MUTATION_REQUEST_HEADER]: ROSTER_MUTATION_REQUEST_HEADER_VALUE,
        },
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
  });

  it("requires an active normalized admin session before reading a snapshot", async () => {
    serverMocks.getAdminSessionFromCookies.mockResolvedValueOnce(null);

    const response = await GET(snapshotRequest());

    expect(response.status).toBe(401);
    expect(serverMocks.playersEq).not.toHaveBeenCalled();
    expect(serverMocks.readNormalizedRosterVersion).not.toHaveBeenCalled();
  });

  it("does not expose normalized-session validation failures", async () => {
    serverMocks.getAdminSessionFromCookies.mockRejectedValueOnce(
      new Error("sensitive session-store detail"),
    );

    const response = await GET(snapshotRequest());

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("sensitive session-store detail");
    expect(serverMocks.playersEq).not.toHaveBeenCalled();
  });

  it("returns a mapped, sorted, no-store roster snapshot", async () => {
    serverMocks.playersEq.mockResolvedValueOnce({
      data: [
        {
          active: true,
          created_at: now,
          has_tournament_history: true,
          id: "00000000-0000-4000-8000-000000000003",
          startgg_username: "Zulu",
          startgg_username_normalized: "zulu",
          updated_at: now,
        },
        {
          active: false,
          created_at: now,
          has_tournament_history: false,
          id: playerId,
          startgg_username: "Alpha",
          startgg_username_normalized: "alpha",
          updated_at: now,
        },
      ],
      error: null,
    });

    const response = await GET(snapshotRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(serverMocks.getAdminSessionFromCookies).toHaveBeenCalledTimes(1);
    expect(serverMocks.playersEq).toHaveBeenCalledWith("event_id", "event-1");
    expect(serverMocks.readNormalizedRosterVersion).toHaveBeenCalledWith({ eventId: "event-1" });
    expect(body).toEqual({
      activeCount: 1,
      players: [
        player,
        {
          ...player,
          active: true,
          hasTournamentHistory: true,
          id: "00000000-0000-4000-8000-000000000003",
          normalizedUsername: "zulu",
          startggUsername: "Zulu",
        },
      ],
      version: 2,
    });
  });

  it("keeps memory snapshots isolated from any configured Supabase client", async () => {
    serverMocks.getTournamentStateBackend.mockReturnValueOnce("memory");

    const response = await GET(snapshotRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      activeCount: 0,
      players: [player],
      version: 2,
    });
    expect(serverMocks.hydrateTournamentState).toHaveBeenCalledTimes(1);
    expect(serverMocks.getMemoryRosterVersion).toHaveBeenCalledTimes(2);
    expect(serverMocks.createServiceRoleSupabaseClient).not.toHaveBeenCalled();
    expect(serverMocks.readNormalizedRosterVersion).not.toHaveBeenCalled();
  });

  it("retries until the roster rows and version come from a stable generation", async () => {
    serverMocks.readNormalizedRosterVersion
      .mockResolvedValueOnce({
        eventId: "event-1",
        scope: "roster",
        updatedAt: now,
        version: 1,
      })
      .mockResolvedValueOnce({
        eventId: "event-1",
        scope: "roster",
        updatedAt: now,
        version: 2,
      })
      .mockResolvedValueOnce({
        eventId: "event-1",
        scope: "roster",
        updatedAt: now,
        version: 2,
      })
      .mockResolvedValueOnce({
        eventId: "event-1",
        scope: "roster",
        updatedAt: now,
        version: 2,
      });

    const response = await GET(snapshotRequest());

    expect(response.status).toBe(200);
    expect((await response.json()).version).toBe(2);
    expect(serverMocks.playersEq).toHaveBeenCalledTimes(2);
    expect(serverMocks.readNormalizedRosterVersion).toHaveBeenCalledTimes(4);
  });

  it("fails safely when the roster does not stabilize within the retry limit", async () => {
    serverMocks.readNormalizedRosterVersion
      .mockResolvedValueOnce({
        eventId: "event-1",
        scope: "roster",
        updatedAt: now,
        version: 1,
      })
      .mockResolvedValueOnce({
        eventId: "event-1",
        scope: "roster",
        updatedAt: now,
        version: 2,
      })
      .mockResolvedValueOnce({
        eventId: "event-1",
        scope: "roster",
        updatedAt: now,
        version: 2,
      })
      .mockResolvedValueOnce({
        eventId: "event-1",
        scope: "roster",
        updatedAt: now,
        version: 3,
      })
      .mockResolvedValueOnce({
        eventId: "event-1",
        scope: "roster",
        updatedAt: now,
        version: 3,
      })
      .mockResolvedValueOnce({
        eventId: "event-1",
        scope: "roster",
        updatedAt: now,
        version: 4,
      });

    const response = await GET(snapshotRequest());

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("Roster changed");
    expect(serverMocks.playersEq).toHaveBeenCalledTimes(3);
    expect(serverMocks.readNormalizedRosterVersion).toHaveBeenCalledTimes(6);
  });

  it("does not expose service-role query or snapshot validation failures", async () => {
    serverMocks.playersEq.mockResolvedValueOnce({
      data: null,
      error: { message: "sensitive database detail" },
    });
    const queryFailure = await GET(snapshotRequest());

    expect(queryFailure.status).toBe(500);
    expect(await queryFailure.text()).not.toContain("sensitive database detail");

    serverMocks.playersEq.mockResolvedValueOnce({
      data: [{ id: "not-a-uuid" }],
      error: null,
    });
    const invalidRows = await GET(snapshotRequest());

    expect(invalidRows.status).toBe(500);
  });

  it("requires the explicit mutation header and a matching same origin", async () => {
    const missingHeader = await POST(
      mutationRequest(
        {
          input: {
            changes: [{ active: false, expectedUpdatedAt: now, playerId }],
            expectedVersion: 1,
            requestId,
          },
          mutation: "active-status",
        },
        { [ROSTER_MUTATION_REQUEST_HEADER]: "" },
      ),
    );
    const crossOrigin = await POST(
      mutationRequest(
        {
          input: {
            changes: [{ active: false, expectedUpdatedAt: now, playerId }],
            expectedVersion: 1,
            requestId,
          },
          mutation: "active-status",
        },
        { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
      ),
    );

    expect(missingHeader.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
    expect(actionMocks.setPlayerActiveStatusAction).not.toHaveBeenCalled();
  });

  it("requires bounded JSON and validates the mutation contract before dispatch", async () => {
    const wrongContentType = await POST(mutationRequest("{}", { "content-type": "text/plain" }));
    const tooLarge = await POST(mutationRequest("x".repeat(32 * 1_024 + 1)));
    const malformed = await POST(mutationRequest("{"));
    const invalidContract = await POST(
      mutationRequest({ input: { expectedVersion: -1 }, mutation: "active-status" }),
    );

    expect(wrongContentType.status).toBe(415);
    expect(tooLarge.status).toBe(413);
    expect(malformed.status).toBe(400);
    expect(invalidContract.status).toBe(400);
    expect(actionMocks.setPlayerActiveStatusAction).not.toHaveBeenCalled();
  });

  it("dispatches active-status mutations and returns a validated no-store result", async () => {
    const input = {
      changes: [{ active: false, expectedUpdatedAt: now, playerId }],
      expectedVersion: 1,
      requestId,
    };
    const response = await POST(mutationRequest({ input, mutation: "active-status" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({ ok: true, requestId, version: 2 });
    expect(actionMocks.setPlayerActiveStatusAction).toHaveBeenCalledWith(input);
    expect(actionMocks.editPlayerUsernameAction).not.toHaveBeenCalled();
  });

  it("dispatches username mutations", async () => {
    const input = {
      expectedUpdatedAt: now,
      expectedVersion: 1,
      playerId,
      requestId,
      startggUsername: "Beta",
    };
    const response = await POST(mutationRequest({ input, mutation: "username" }));

    expect(response.status).toBe(200);
    expect(actionMocks.editPlayerUsernameAction).toHaveBeenCalledWith(input);
    expect(actionMocks.setPlayerActiveStatusAction).not.toHaveBeenCalled();
  });

  it("does not expose thrown action errors or malformed action results", async () => {
    const body = {
      input: {
        changes: [{ active: false, expectedUpdatedAt: now, playerId }],
        expectedVersion: 1,
        requestId,
      },
      mutation: "active-status",
    };
    actionMocks.setPlayerActiveStatusAction.mockRejectedValueOnce(
      new Error("sensitive persistence detail"),
    );
    const thrownResponse = await POST(mutationRequest(body));

    expect(thrownResponse.status).toBe(500);
    expect(await thrownResponse.text()).not.toContain("sensitive persistence detail");

    actionMocks.setPlayerActiveStatusAction.mockResolvedValueOnce({ ok: true });
    const invalidResponse = await POST(mutationRequest(body));

    expect(invalidResponse.status).toBe(500);

    actionMocks.setPlayerActiveStatusAction.mockResolvedValueOnce({
      message: "sensitive persistence relation and constraint detail",
      ok: false,
      players: [player],
      requestId,
      retryable: false,
      version: 2,
    });
    const failedResponse = await POST(mutationRequest(body));

    expect(failedResponse.status).toBe(200);
    expect(await failedResponse.text()).not.toContain("sensitive persistence");
  });
});
