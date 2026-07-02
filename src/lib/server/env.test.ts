import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertProductionTestFlagsDisabled,
  getTournamentEventId,
  isProductionDeploymentEnv,
} from "./env";

vi.mock("server-only", () => ({}));

describe("server environment validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects production deployment contexts", () => {
    expect(isProductionDeploymentEnv({ NODE_ENV: "development" })).toBe(false);
    expect(isProductionDeploymentEnv({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionDeploymentEnv({ VERCEL_ENV: "production" })).toBe(true);
  });

  it("fails closed when local public URL test flags are enabled in production", () => {
    expect(() =>
      assertProductionTestFlagsDisabled({
        NODE_ENV: "production",
        TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL: "true",
      }),
    ).toThrow("TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL cannot be enabled");

    expect(() =>
      assertProductionTestFlagsDisabled({
        VERCEL_ENV: "production",
        TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL: "true",
      }),
    ).toThrow("TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL cannot be enabled");
  });

  it("still allows local public URL test flags outside production", () => {
    expect(() =>
      assertProductionTestFlagsDisabled({
        NODE_ENV: "test",
        TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL: "true",
      }),
    ).not.toThrow();
  });

  it("validates production test flags before returning the event id", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL", "true");
    vi.stubEnv("TOURNAMENT_EVENT_ID", "event-a");

    expect(() => getTournamentEventId()).toThrow(
      "TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL cannot be enabled",
    );
  });
});
