import { afterEach, describe, expect, it, vi } from "vitest";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";
import { getAuthoritativeNowMs } from "./authoritative-clock";

vi.mock("server-only", () => ({}));

const supabaseClient = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/server/supabase", () => ({
  createServiceRoleSupabaseClient: vi.fn(() => supabaseClient),
}));

describe("authoritative clock", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("uses local process time outside Supabase mode", async () => {
    const now = Date.parse("2026-07-03T00:00:00.000Z");
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "memory");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await expect(getAuthoritativeNowMs()).resolves.toBe(now);
    expect(createServiceRoleSupabaseClient).not.toHaveBeenCalled();
    expect(supabaseClient.rpc).not.toHaveBeenCalled();
  });

  it("calls normalized_database_time in Supabase mode", async () => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    supabaseClient.rpc.mockResolvedValue({
      data: "2026-07-03T01:02:03.004Z",
      error: null,
    });

    await expect(getAuthoritativeNowMs()).resolves.toBe(
      Date.parse("2026-07-03T01:02:03.004Z"),
    );
    expect(createServiceRoleSupabaseClient).toHaveBeenCalledTimes(1);
    expect(supabaseClient.rpc).toHaveBeenCalledWith("normalized_database_time", {});
  });

  it("fails closed when database time RPC returns an error", async () => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    supabaseClient.rpc.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(getAuthoritativeNowMs()).rejects.toThrow(
      "Could not read hosted Supabase database time: permission denied",
    );
  });

  it("fails closed when database time RPC returns an invalid timestamp", async () => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    supabaseClient.rpc.mockResolvedValue({
      data: "not a timestamp",
      error: null,
    });

    await expect(getAuthoritativeNowMs()).rejects.toThrow(
      "Hosted Supabase database time returned an invalid timestamp.",
    );
  });

  it("fails closed when database time RPC returns no timestamp", async () => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    supabaseClient.rpc.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(getAuthoritativeNowMs()).rejects.toThrow(
      "Hosted Supabase database time returned an invalid timestamp.",
    );
  });
});
