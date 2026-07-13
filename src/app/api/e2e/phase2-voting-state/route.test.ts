import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

function request(token = "test-token") {
  return new Request("http://localhost/api/e2e/phase2-voting-state", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tournament-test-token": token,
    },
    body: JSON.stringify({ roundNumber: 1, status: "final_30_seconds" }),
  });
}

describe("/api/e2e/phase2-voting-state", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is unavailable in production even when e2e flags are enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_E2E_ROUTES", "true");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND", "true");
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "memory");
    vi.stubEnv("TOURNAMENT_EVENT_ID", "e2e-phase2-memory");
    vi.stubEnv("TOURNAMENT_TEST_ROUTE_TOKEN", "test-token");

    const response = await POST(request());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });

  it("requires the private test token outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_E2E_ROUTES", "true");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND", "true");
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "memory");
    vi.stubEnv("TOURNAMENT_EVENT_ID", "e2e-phase2-memory");
    vi.stubEnv("TOURNAMENT_TEST_ROUTE_TOKEN", "test-token");

    const response = await POST(request("wrong-token"));

    expect(response.status).toBe(404);
  });

  it("is unavailable for Supabase-backed runs", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_E2E_ROUTES", "true");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND", "false");
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    vi.stubEnv("TOURNAMENT_EVENT_ID", "e2e-phase2-memory");
    vi.stubEnv("TOURNAMENT_TEST_ROUTE_TOKEN", "test-token");

    const response = await POST(request());

    expect(response.status).toBe(404);
  });
});
