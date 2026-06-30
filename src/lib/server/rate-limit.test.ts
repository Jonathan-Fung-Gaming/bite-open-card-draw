import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertRateLimit, RateLimitError, resetRateLimitState } from "./rate-limit";

vi.mock("server-only", () => ({}));

describe("server action rate limiting", () => {
  beforeEach(() => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "memory");
    resetRateLimitState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throttles requests after the configured window limit", async () => {
    await assertRateLimit({ key: "admin-login:127.0.0.1", limit: 2, windowMs: 1_000, nowMs: 0 });
    await assertRateLimit({
      key: "admin-login:127.0.0.1",
      limit: 2,
      windowMs: 1_000,
      nowMs: 100,
    });

    await expect(
      assertRateLimit({
        key: "admin-login:127.0.0.1",
        limit: 2,
        windowMs: 1_000,
        nowMs: 200,
      }),
    ).rejects.toThrow(RateLimitError);
  });

  it("opens a fresh bucket after the window expires", async () => {
    await assertRateLimit({ key: "ballot-submit:player-a", limit: 1, windowMs: 1_000, nowMs: 0 });

    await expect(
      assertRateLimit({
        key: "ballot-submit:player-a",
        limit: 1,
        windowMs: 1_000,
        nowMs: 1_000,
      }),
    ).resolves.toBeUndefined();
  });
});
