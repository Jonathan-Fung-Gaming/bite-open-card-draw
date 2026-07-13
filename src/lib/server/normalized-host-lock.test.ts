import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { executeNormalizedTransactionalMutation } = vi.hoisted(() => ({
  executeNormalizedTransactionalMutation: vi.fn(),
}));

vi.mock("@/lib/server/transactions/normalized-runtime", () => ({
  executeNormalizedTransactionalMutation,
}));

import {
  acquireNormalizedHostLock,
  heartbeatNormalizedHostLock,
  releaseNormalizedHostLock,
} from "./normalized-host-lock";

const requestId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const tokenHash = "a".repeat(64);

describe("normalized host-lock transactions", () => {
  beforeEach(() => {
    executeNormalizedTransactionalMutation.mockReset();
  });

  it("parses an atomic restored-owner result", async () => {
    executeNormalizedTransactionalMutation.mockResolvedValue({
      outcome: "restored",
      ownerSessionId: sessionId,
      acquiredAt: "2026-07-14T00:00:00.000Z",
      heartbeatAt: "2026-07-14T00:01:00.000Z",
      expiresAt: "9999-12-31T23:59:59.999Z",
      adminActionId: requestId,
    });

    await expect(
      acquireNormalizedHostLock({
        requestId,
        mode: "restore",
        adminSessionId: sessionId,
        hostTokenHash: tokenHash,
        expectedHostTokenHash: "b".repeat(64),
        recoveryOwnerSessionId: "old-owner",
      }),
    ).resolves.toMatchObject({ outcome: "restored", ownerSessionId: sessionId });
  });

  it("parses heartbeat and release results", async () => {
    executeNormalizedTransactionalMutation
      .mockResolvedValueOnce({
        outcome: "refreshed",
        ownerSessionId: sessionId,
        heartbeatAt: "2026-07-14T00:02:00.000Z",
        expiresAt: "9999-12-31T23:59:59.999Z",
      })
      .mockResolvedValueOnce({
        outcome: "released",
        previousOwnerSessionId: sessionId,
        releasedAt: "2026-07-14T00:03:00.000Z",
        adminActionId: requestId,
      });

    await expect(
      heartbeatNormalizedHostLock({
        requestId,
        adminSessionId: sessionId,
        hostTokenHash: tokenHash,
      }),
    ).resolves.toMatchObject({ outcome: "refreshed" });
    await expect(
      releaseNormalizedHostLock({ requestId, adminSessionId: sessionId, hostTokenHash: tokenHash }),
    ).resolves.toMatchObject({ outcome: "released" });
  });

  it("turns a placeholder RPC response into a migration-required error", async () => {
    executeNormalizedTransactionalMutation.mockRejectedValue(
      new Error("returned a placeholder commit acknowledgement"),
    );

    await expect(
      releaseNormalizedHostLock({ requestId, adminSessionId: sessionId, hostTokenHash: tokenHash }),
    ).rejects.toThrow("Phase 3 database migration");
  });
});
