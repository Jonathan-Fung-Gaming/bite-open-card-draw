import { describe, expect, it, vi } from "vitest";
import type { Json } from "@/lib/db/database.types";
import { readNormalizedRosterVersion } from "./normalized-roster";

vi.mock("server-only", () => ({}));

function rosterVersionResult(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "phase-4-test",
    scope: "roster",
    updatedAt: "2026-07-14T00:00:00.000Z",
    version: 7,
    ...overrides,
  } as Json;
}

describe("normalized roster version reads", () => {
  it("retries one transient RPC failure and strictly accepts the scoped result", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "temporary failure" } })
      .mockResolvedValueOnce({ data: rosterVersionResult(), error: null });

    await expect(
      readNormalizedRosterVersion({
        eventId: "phase-4-test",
        supabase: { rpc },
      }),
    ).resolves.toEqual(rosterVersionResult());
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("normalized_read_roster_version", {
      p_event_id: "phase-4-test",
    });
  });

  it("fails closed when the RPC returns a different event scope", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: rosterVersionResult({ eventId: "another-event" }),
      error: null,
    });

    await expect(
      readNormalizedRosterVersion({
        eventId: "phase-4-test",
        retries: 0,
        supabase: { rpc },
      }),
    ).rejects.toThrow(/wrong event scope/i);
  });

  it("fails closed when the RPC adds an unexpected field", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: rosterVersionResult({ passwordHash: "must-not-cross-the-boundary" }),
      error: null,
    });

    await expect(
      readNormalizedRosterVersion({
        eventId: "phase-4-test",
        retries: 0,
        supabase: { rpc },
      }),
    ).rejects.toThrow(/invalid response/i);
  });
});
