import { afterEach, describe, expect, it, vi } from "vitest";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";
import { getAuthoritativeNowMs, invalidateAuthoritativeClockCache } from "./authoritative-clock";

vi.mock("server-only", () => ({}));

const supabaseClient = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/server/supabase", () => ({
  createServiceRoleSupabaseClient: vi.fn(() => supabaseClient),
}));

describe("authoritative clock", () => {
  afterEach(() => {
    invalidateAuthoritativeClockCache();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.mocked(createServiceRoleSupabaseClient).mockClear();
    supabaseClient.rpc.mockReset();
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
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-03T01:02:03.000Z"));
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

  it("reuses cached Supabase time while preserving local elapsed time", async () => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-03T01:02:03.000Z"));
    supabaseClient.rpc.mockResolvedValue({
      data: "2026-07-03T01:02:03.004Z",
      error: null,
    });

    await expect(getAuthoritativeNowMs()).resolves.toBe(
      Date.parse("2026-07-03T01:02:03.004Z"),
    );

    await vi.advanceTimersByTimeAsync(250);

    await expect(getAuthoritativeNowMs()).resolves.toBe(
      Date.parse("2026-07-03T01:02:03.254Z"),
    );
    expect(createServiceRoleSupabaseClient).toHaveBeenCalledTimes(1);
    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
  });

  it("anchors cached Supabase time when the RPC response completes", async () => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-03T01:02:03.000Z"));
    supabaseClient.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                data: "2026-07-03T01:02:05.004Z",
                error: null,
              }),
            2_000,
          );
        }),
    );

    const firstRead = getAuthoritativeNowMs();

    await vi.advanceTimersByTimeAsync(2_000);

    await expect(firstRead).resolves.toBe(Date.parse("2026-07-03T01:02:05.004Z"));

    await vi.advanceTimersByTimeAsync(250);

    await expect(getAuthoritativeNowMs()).resolves.toBe(
      Date.parse("2026-07-03T01:02:05.254Z"),
    );
    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
  });

  it("coalesces pending Supabase time reads while the RPC is delayed", async () => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-03T01:02:03.000Z"));
    supabaseClient.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                data: "2026-07-03T01:02:05.004Z",
                error: null,
              }),
            2_000,
          );
        }),
    );

    const firstRead = getAuthoritativeNowMs();

    await vi.advanceTimersByTimeAsync(1_500);

    const secondRead = getAuthoritativeNowMs();

    await vi.advanceTimersByTimeAsync(500);

    await expect(Promise.all([firstRead, secondRead])).resolves.toEqual([
      Date.parse("2026-07-03T01:02:05.004Z"),
      Date.parse("2026-07-03T01:02:05.004Z"),
    ]);
    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
  });

  it("can disable Supabase time caching", async () => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    vi.stubEnv("TOURNAMENT_DATABASE_TIME_CACHE_MS", "0");
    supabaseClient.rpc
      .mockResolvedValueOnce({
        data: "2026-07-03T01:02:03.004Z",
        error: null,
      })
      .mockResolvedValueOnce({
        data: "2026-07-03T01:02:04.004Z",
        error: null,
      });

    await expect(getAuthoritativeNowMs()).resolves.toBe(
      Date.parse("2026-07-03T01:02:03.004Z"),
    );
    await expect(getAuthoritativeNowMs()).resolves.toBe(
      Date.parse("2026-07-03T01:02:04.004Z"),
    );
    expect(supabaseClient.rpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed when database time RPC returns an error", async () => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    vi.stubEnv("TOURNAMENT_DATABASE_TIME_CACHE_MS", "0");
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
    vi.stubEnv("TOURNAMENT_DATABASE_TIME_CACHE_MS", "0");
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
    vi.stubEnv("TOURNAMENT_DATABASE_TIME_CACHE_MS", "0");
    supabaseClient.rpc.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(getAuthoritativeNowMs()).rejects.toThrow(
      "Hosted Supabase database time returned an invalid timestamp.",
    );
  });
});
