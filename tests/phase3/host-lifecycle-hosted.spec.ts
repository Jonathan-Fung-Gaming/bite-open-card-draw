import { expect, test } from "@playwright/test";
import {
  ageHostedHostHealth,
  cleanupPhase3HostedEvent,
  expectConcurrentRestoreSingleWinner,
  expectHostedHostAuditCounts,
  expectHostedOwner,
} from "./hosted-state";
import {
  blockAdminLiveRefresh,
  clickAdminActionAllowingError,
  forceHost,
  getAdminSessionPayload,
  loginAdmin,
  logoutAdmin,
  releaseHost,
  restoreHost,
  takeHost,
} from "./helpers";

test("@phase3-hosted host lifecycle is persistent, recoverable, audited, and race safe", async ({
  page,
  browser,
  context,
}) => {
  await cleanupPhase3HostedEvent();

  const standbyContext = await browser.newContext();
  const standbyPage = await standbyContext.newPage();

  try {
    await loginAdmin(page);
    await takeHost(page);
    const firstOwner = await getAdminSessionPayload(context);

    expect(firstOwner).not.toBeNull();
    await expectHostedOwner(firstOwner?.sessionId ?? "");
    await expectHostedHostAuditCounts({ host_lock_acquire: 1 });

    await ageHostedHostHealth();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("admin-host-lock-context")).toContainText(
      "This browser is active host",
    );
    await expect(page.getByTestId("host-heartbeat-confidence")).toContainText(
      "retained until release or force",
    );
    await expectHostedOwner(firstOwner?.sessionId ?? "");

    await logoutAdmin(page);
    await loginAdmin(page);
    await expect(page.getByTestId("admin-host-lock-context")).toContainText(
      "Original host can be restored",
    );
    await restoreHost(page);
    const restoredOwner = await getAdminSessionPayload(context);

    expect(restoredOwner?.sessionId).not.toBe(firstOwner?.sessionId);
    await expectHostedOwner(restoredOwner?.sessionId ?? "");
    await expectHostedHostAuditCounts({ host_lock_acquire: 1, host_lock_restore: 1 });

    await loginAdmin(standbyPage);
    const standbySession = await getAdminSessionPayload(standbyContext);

    expect(standbySession).not.toBeNull();
    await expect(standbyPage.getByTestId("admin-host-lock-context")).toContainText(
      "Read-only admin",
    );

    await blockAdminLiveRefresh(page);
    const staleRelease = page.getByRole("button", { name: "Release" });
    await forceHost(standbyPage, "Phase 3 hosted forced-takeover evidence");
    await expectHostedOwner(standbySession?.sessionId ?? "");
    await expectHostedHostAuditCounts({
      host_lock_acquire: 1,
      host_lock_restore: 1,
      host_lock_takeover: 1,
      host_lock_release: 0,
    });

    await clickAdminActionAllowingError(page, staleRelease);
    await expect(page).toHaveURL(/error=/);
    await expect(
      page.getByText(/This admin session does not own the active host lock/i),
    ).toBeVisible();
    await expectHostedOwner(standbySession?.sessionId ?? "");
    await expectHostedHostAuditCounts({ host_lock_release: 0 });

    await releaseHost(standbyPage);
    await expectHostedOwner(null);
    await expectHostedHostAuditCounts({
      host_lock_acquire: 1,
      host_lock_restore: 1,
      host_lock_takeover: 1,
      host_lock_release: 1,
    });

    await Promise.all([
      page.reload({ waitUntil: "domcontentloaded" }),
      standbyPage.reload({ waitUntil: "domcontentloaded" }),
    ]);
    const sessionA = await getAdminSessionPayload(context);
    const sessionB = await getAdminSessionPayload(standbyContext);

    await Promise.all([
      clickAdminActionAllowingError(page, page.getByRole("button", { name: "Take Host Control" })),
      clickAdminActionAllowingError(
        standbyPage,
        standbyPage.getByRole("button", { name: "Take Host Control" }),
      ),
    ]);

    await expect
      .poll(
        async () => {
          const [activeA, activeB] = await Promise.all([
            page
              .getByRole("button", { name: "Release" })
              .isVisible()
              .catch(() => false),
            standbyPage
              .getByRole("button", { name: "Release" })
              .isVisible()
              .catch(() => false),
          ]);

          return Number(activeA) + Number(activeB);
        },
        { timeout: 30_000 },
      )
      .toBe(1);
    const activeA = await page.getByRole("button", { name: "Release" }).isVisible();

    await expectHostedOwner(activeA ? (sessionA?.sessionId ?? "") : (sessionB?.sessionId ?? ""));
    await expectHostedHostAuditCounts({ host_lock_acquire: 2 });
  } finally {
    await standbyContext.close();
    await cleanupPhase3HostedEvent();
  }
});

test("@phase3-hosted concurrent restore rotates one credential generation", async () => {
  await cleanupPhase3HostedEvent();

  try {
    await expectConcurrentRestoreSingleWinner();
  } finally {
    await cleanupPhase3HostedEvent();
  }
});
