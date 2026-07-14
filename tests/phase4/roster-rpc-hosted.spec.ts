import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { loginAdmin, takeHost } from "../phase3/helpers";
import {
  cleanupPhase4HostedEvent,
  executeHostedRenameMutation,
  executeHostedStatusMutation,
  expectHostedRosterState,
  readHostedPlayer,
  seedPhase4Players,
} from "./hosted-state";

test("@phase4-hosted targeted roster RPCs are atomic, guarded, and idempotent", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phase4-desktop-chromium");
  await cleanupPhase4HostedEvent();

  try {
    const players = await seedPhase4Players(4);

    await loginAdmin(page);
    await takeHost(page);

    const emptyRename = await executeHostedRenameMutation({
      requestId: randomUUID(),
      expectedVersion: 0,
      playerId: players[0].id,
      expectedUpdatedAt: players[0].updatedAt,
      startggUsername: "   ",
    });

    expect(emptyRename.error?.message).toContain("start.gg username is required");

    const duplicateRename = await executeHostedRenameMutation({
      requestId: randomUUID(),
      expectedVersion: 0,
      playerId: players[1].id,
      expectedUpdatedAt: players[1].updatedAt,
      startggUsername: players[0].startggUsername,
    });

    expect(duplicateRename.error?.message).toContain("already exists");

    const historyRename = await executeHostedRenameMutation({
      requestId: randomUUID(),
      expectedVersion: 0,
      playerId: players[3].id,
      expectedUpdatedAt: players[3].updatedAt,
      startggUsername: "History Must Stay Locked",
    });

    expect(historyRename.error?.message).toContain("tournament history");
    await expectHostedRosterState({
      activeCount: 4,
      auditCount: 0,
      eligibilityCount: 4,
      version: 0,
    });

    const renameRequestId = randomUUID();
    const rename = await executeHostedRenameMutation({
      requestId: renameRequestId,
      expectedVersion: 0,
      playerId: players[1].id,
      expectedUpdatedAt: players[1].updatedAt,
      startggUsername: "Phase4 Corrected Player",
    });

    expect(rename.error).toBeNull();
    expect(rename.data).toMatchObject({ changed: true, requestId: renameRequestId, version: 1 });

    const renamed = await readHostedPlayer(players[1].id);
    const invalidBatch = await executeHostedStatusMutation({
      requestId: randomUUID(),
      expectedVersion: 1,
      changes: [
        {
          playerId: players[0].id,
          active: false,
          expectedUpdatedAt: players[0].updatedAt,
        },
        {
          playerId: randomUUID(),
          active: false,
          expectedUpdatedAt: players[2].updatedAt,
        },
      ],
    });

    expect(invalidBatch.error?.message).toContain("not found");
    expect((await readHostedPlayer(players[0].id)).active).toBe(true);

    const statusRequestId = randomUUID();
    const statusChanges = [
      {
        playerId: players[0].id,
        active: false,
        expectedUpdatedAt: players[0].updatedAt,
      },
      {
        playerId: players[1].id,
        active: false,
        expectedUpdatedAt: renamed.updated_at,
      },
    ];
    const status = await executeHostedStatusMutation({
      requestId: statusRequestId,
      expectedVersion: 1,
      changes: statusChanges,
    });

    expect(status.error).toBeNull();
    expect(status.data).toMatchObject({ changed: true, requestId: statusRequestId, version: 2 });

    const replay = await executeHostedStatusMutation({
      requestId: statusRequestId,
      expectedVersion: 1,
      changes: statusChanges,
    });

    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(status.data);
    await expectHostedRosterState({
      activeCount: 2,
      auditCount: 1,
      eligibilityCount: 4,
      version: 2,
    });

    const reusedRequest = await executeHostedStatusMutation({
      requestId: statusRequestId,
      expectedVersion: 1,
      changes: [{ ...statusChanges[0], active: true }],
    });

    expect(reusedRequest.error?.message).toContain("different mutation payload");

    const staleBatch = await executeHostedStatusMutation({
      requestId: randomUUID(),
      expectedVersion: 1,
      changes: [
        {
          playerId: players[2].id,
          active: false,
          expectedUpdatedAt: players[2].updatedAt,
        },
      ],
    });

    expect(staleBatch.error?.message).toContain("Roster version changed");

    const concurrent = await Promise.all([
      executeHostedStatusMutation({
        requestId: randomUUID(),
        expectedVersion: 2,
        changes: [
          {
            playerId: players[2].id,
            active: false,
            expectedUpdatedAt: players[2].updatedAt,
          },
        ],
      }),
      executeHostedStatusMutation({
        requestId: randomUUID(),
        expectedVersion: 2,
        changes: [
          {
            playerId: players[3].id,
            active: false,
            expectedUpdatedAt: players[3].updatedAt,
          },
        ],
      }),
    ]);

    expect(concurrent.filter(({ error }) => error === null)).toHaveLength(1);
    expect(concurrent.filter(({ error }) => error !== null)).toHaveLength(1);
    expect(concurrent.find(({ error }) => error)?.error?.message).toContain(
      "Roster version changed",
    );
    await expectHostedRosterState({
      activeCount: 1,
      auditCount: 2,
      eligibilityCount: 4,
      version: 3,
    });
  } finally {
    await page.goto("about:blank");
    await cleanupPhase4HostedEvent();
  }
});
