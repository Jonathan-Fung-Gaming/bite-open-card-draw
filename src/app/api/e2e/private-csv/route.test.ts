import { afterEach, describe, expect, it, vi } from "vitest";
import { resetTournamentOperationalState, adminState } from "@/lib/server/admin-state";
import type { RoundResultSnapshot } from "@/lib/results/result-engine";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

const selectedChart = {
  id: "chart-1",
  name: "Selected One",
  artist: "Artist",
  displayDifficulty: "S16",
  songKey: "song-1",
  chartKey: "chart-1",
  sourceBgImg: "",
  localImagePath: "/chart-images/fallback-card.svg",
};

function result(revealPhase: RoundResultSnapshot["revealPhase"]): RoundResultSnapshot {
  const final = revealPhase === "final";

  return {
    id: "result-1",
    roundNumber: 1,
    computedAt: "2026-07-03T00:00:00.000Z",
    eligiblePlayers: [{ id: "player-1", startggUsername: "Alpha" }],
    revealPhase,
    revealPhaseStartedAt: "2026-07-03T00:00:00.000Z",
    finalRevealedAt: final ? "2026-07-03T00:00:00.000Z" : null,
    sets: [
      {
        drawId: "draw-1",
        drawVersion: 1,
        roundSetId: "static-s16",
        setOrder: 1,
        displayLabel: "S16",
        rows: [{ chart: selectedChart, banCount: 0, selected: true, tiedForFewest: true }],
        maxBanCount: 0,
        leastBanCount: 0,
        selectedChart,
        tiebreakUsed: false,
        tiebreakCandidateIds: [],
        tiebreakWinnerChartId: null,
        wheelSlots: [],
        wheelSupported: false,
        winnerRevealStartedAt: null,
      },
      {
        drawId: "draw-2",
        drawVersion: 1,
        roundSetId: "static-s17",
        setOrder: 2,
        displayLabel: "S17",
        rows: [{ chart: selectedChart, banCount: 0, selected: true, tiedForFewest: true }],
        maxBanCount: 0,
        leastBanCount: 0,
        selectedChart,
        tiebreakUsed: false,
        tiebreakCandidateIds: [],
        tiebreakWinnerChartId: null,
        wheelSlots: [],
        wheelSupported: false,
        winnerRevealStartedAt: null,
      },
    ],
  };
}

function request(headers: HeadersInit = {}) {
  return new Request("http://localhost/api/e2e/private-csv?roundNumber=1", {
    headers,
  });
}

function configureAllowedMemoryRoute() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("TOURNAMENT_STATE_BACKEND", "memory");
  vi.stubEnv("TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND", "true");
  vi.stubEnv("TOURNAMENT_TEST_ROUTE_TOKEN", "test-token");
  vi.stubEnv("TOURNAMENT_EVENT_ID", "e2e-phase-1");
}

describe("/api/e2e/private-csv", () => {
  afterEach(() => {
    resetTournamentOperationalState();
    vi.unstubAllEnvs();
  });

  it("is unavailable in production even when a test token is present", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_E2E_ROUTES", "true");
    vi.stubEnv("TOURNAMENT_TEST_ROUTE_TOKEN", "test-token");

    const response = await GET(request({ "x-tournament-test-token": "test-token" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });

  it("is unavailable in production without a test token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_E2E_ROUTES", "true");
    vi.stubEnv("TOURNAMENT_TEST_ROUTE_TOKEN", "test-token");

    const response = await GET(request());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });

  it("is unavailable in Vercel production semantics even when NODE_ENV is not production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_E2E_ROUTES", "true");
    vi.stubEnv("TOURNAMENT_TEST_ROUTE_TOKEN", "test-token");

    const response = await GET(request({ "x-tournament-test-token": "test-token" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });

  it("is unavailable in Vercel production semantics without a test token", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_E2E_ROUTES", "true");
    vi.stubEnv("TOURNAMENT_TEST_ROUTE_TOKEN", "test-token");

    const response = await GET(request());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });

  it("requires the private test token outside production", async () => {
    configureAllowedMemoryRoute();

    const response = await GET(request());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });

  it("denies private CSV export before the final reveal", async () => {
    configureAllowedMemoryRoute();
    adminState.resultStore.importSnapshot({ results: [result("computed")] });

    const response = await GET(request({ "x-tournament-test-token": "test-token" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Private CSV is available only after the final reveal.",
    });
  });

  it("allows safe non-production rehearsal export after final reveal", async () => {
    configureAllowedMemoryRoute();
    adminState.resultStore.importSnapshot({ results: [result("final")] });

    const response = await GET(request({ "x-tournament-test-token": "test-token" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      filename: "round-1-private-ballots.csv",
      csv: expect.stringContaining("Alpha"),
    });
  });
});
