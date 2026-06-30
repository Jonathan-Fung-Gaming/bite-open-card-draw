import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

describe("/api/e2e/load-ballot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is unavailable in production even when e2e flags are misconfigured on", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_E2E_ROUTES", "true");
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    vi.stubEnv("TOURNAMENT_TEST_ROUTE_TOKEN", "test-token");

    const response = await POST(
      new Request("http://localhost/api/e2e/load-ballot", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tournament-test-token": "test-token",
        },
        body: JSON.stringify({
          roundNumber: 1,
          playerStartggUsername: "Alpha",
          revision: 1,
        }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });

  it("requires the private test token outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_E2E_ROUTES", "true");
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "memory");
    vi.stubEnv("TOURNAMENT_TEST_ROUTE_TOKEN", "test-token");

    const response = await POST(
      new Request("http://localhost/api/e2e/load-ballot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(404);
  });
});
