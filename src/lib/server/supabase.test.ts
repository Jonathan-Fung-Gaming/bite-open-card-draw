import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "./supabase";

vi.mock("server-only", () => ({}));

vi.mock("./env", () => ({
  getServerEnv: () => ({
    nextPublicSupabaseUrl: "https://example.supabase.co",
    supabaseServiceRoleKey: "service-role-test-key",
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((_url, _key, options) => options),
}));

function getSupabaseFetch() {
  createServiceRoleSupabaseClient();

  const options = vi.mocked(createClient).mock.calls.at(-1)?.[2];

  return options?.global?.fetch as typeof fetch;
}

describe("service-role Supabase client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("retries transient read failures", async () => {
    vi.useFakeTimers();
    const retryFetch = getSupabaseFetch();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("timeout", { status: 522 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const responsePromise = retryFetch("https://example.supabase.co/rest/v1/players", {
      method: "GET",
    });

    await vi.advanceTimersByTimeAsync(750);

    await expect(responsePromise).resolves.toMatchObject({ status: 200 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not retry writes", async () => {
    const retryFetch = getSupabaseFetch();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("timeout", { status: 522 }));

    const response = await retryFetch("https://example.supabase.co/rest/v1/players", {
      method: "POST",
    });

    expect(response.status).toBe(522);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries the read-only database-time RPC", async () => {
    vi.useFakeTimers();
    const retryFetch = getSupabaseFetch();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("timeout", { status: 522 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const responsePromise = retryFetch(
      "https://example.supabase.co/rest/v1/rpc/normalized_database_time",
      {
        method: "POST",
      },
    );

    await vi.advanceTimersByTimeAsync(750);

    await expect(responsePromise).resolves.toMatchObject({ status: 200 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not retry mutation RPC posts", async () => {
    const retryFetch = getSupabaseFetch();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("timeout", { status: 522 }));

    const response = await retryFetch("https://example.supabase.co/rest/v1/rpc/submit_ballot", {
      method: "POST",
    });

    expect(response.status).toBe(522);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries transient read network errors", async () => {
    vi.useFakeTimers();
    const retryFetch = getSupabaseFetch();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const responsePromise = retryFetch("https://example.supabase.co/rest/v1/players", {
      method: "HEAD",
    });

    await vi.advanceTimersByTimeAsync(750);

    await expect(responsePromise).resolves.toMatchObject({ status: 200 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
