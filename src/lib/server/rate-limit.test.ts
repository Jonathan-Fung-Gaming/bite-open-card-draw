import { beforeEach, describe, expect, it } from "vitest";
import { assertRateLimit, RateLimitError, resetRateLimitState } from "./rate-limit";

describe("server action rate limiting", () => {
  beforeEach(() => {
    resetRateLimitState();
  });

  it("throttles requests after the configured window limit", () => {
    assertRateLimit({ key: "admin-login:127.0.0.1", limit: 2, windowMs: 1_000, nowMs: 0 });
    assertRateLimit({ key: "admin-login:127.0.0.1", limit: 2, windowMs: 1_000, nowMs: 100 });

    expect(() =>
      assertRateLimit({
        key: "admin-login:127.0.0.1",
        limit: 2,
        windowMs: 1_000,
        nowMs: 200,
      }),
    ).toThrow(RateLimitError);
  });

  it("opens a fresh bucket after the window expires", () => {
    assertRateLimit({ key: "ballot-submit:player-a", limit: 1, windowMs: 1_000, nowMs: 0 });

    expect(() =>
      assertRateLimit({
        key: "ballot-submit:player-a",
        limit: 1,
        windowMs: 1_000,
        nowMs: 1_000,
      }),
    ).not.toThrow();
  });
});
