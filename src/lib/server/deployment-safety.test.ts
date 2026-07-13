import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getDeploymentSafetySnapshot,
  requireRehearsalAdminControlsAllowed,
} from "@/lib/server/deployment-safety";

describe("deployment safety policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows rehearsal admin controls in local memory development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "memory");
    vi.stubEnv("TOURNAMENT_EVENT_ID", "local-dev");

    expect(getDeploymentSafetySnapshot()).toMatchObject({
      backend: "memory",
      rehearsalAdminControlsAllowed: true,
      operationalDataDescription: "memory-only local process data",
    });
  });

  it("blocks rehearsal admin controls for normal Supabase event data", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    vi.stubEnv("TOURNAMENT_EVENT_ID", "open-stage-2026");

    const snapshot = getDeploymentSafetySnapshot();

    expect(snapshot.rehearsalAdminControlsAllowed).toBe(false);
    expect(snapshot.operationalDataDescription).toBe(
      "persistent Supabase event data for open-stage-2026",
    );
    expect(() => requireRehearsalAdminControlsAllowed("reset rehearsal mode")).toThrow(
      /disabled in this deployment/,
    );
  });

  it("blocks local memory rehearsal controls in Vercel production semantics", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "memory");
    vi.stubEnv("TOURNAMENT_EVENT_ID", "local-dev");

    expect(() => getDeploymentSafetySnapshot()).toThrow(/supabase is required in production/);
  });

  it("allows explicit disposable Supabase rehearsal events", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    vi.stubEnv("TOURNAMENT_EVENT_ID", "phase0-2026-07-13");
    vi.stubEnv("TOURNAMENT_ALLOW_REHEARSAL_ADMIN_CONTROLS", "true");

    expect(getDeploymentSafetySnapshot().rehearsalAdminControlsAllowed).toBe(true);
  });

  it("rejects rehearsal controls when the explicit flag uses a non-disposable event id", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    vi.stubEnv("TOURNAMENT_EVENT_ID", "open-stage-2026");
    vi.stubEnv("TOURNAMENT_ALLOW_REHEARSAL_ADMIN_CONTROLS", "true");

    expect(getDeploymentSafetySnapshot()).toMatchObject({
      rehearsalAdminControlsAllowed: false,
      rehearsalControlBlockReason:
        "Rehearsal reset and seed controls require a disposable event id beginning with e2e-, phase0-, phase9-, load-, or rehearsal-.",
    });
  });
});
