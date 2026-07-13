import { expect, test } from "@playwright/test";
import { HOST_TOKEN_COOKIE } from "../../src/lib/admin/session";
import {
  blockAdminLiveRefresh,
  clickAdminActionAllowingError,
  forceHost,
  loginAdmin,
  logoutAdmin,
  releaseHost,
  restoreHost,
  takeHost,
} from "./helpers";

test("@phase3-memory persistent ownership has explicit recovery and forced-takeover UI", async ({
  page,
  browser,
  context,
}) => {
  await loginAdmin(page);
  await expect(page.getByRole("button", { name: "Take Host Control" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore Host Control" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Release" })).toHaveCount(0);

  await takeHost(page);
  await expect(page.getByTestId("admin-host-lock-context")).toContainText(
    "This browser is active host",
  );
  await expect(page.getByRole("button", { name: "Take Host Control" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restore Host Control" })).toHaveCount(0);

  const staleRelease = page.getByRole("button", { name: "Release" });
  await context.clearCookies({ name: HOST_TOKEN_COOKIE });
  await clickAdminActionAllowingError(page, staleRelease);
  await expect(page.getByText("Host credential is required to release control.")).toBeVisible();
  await expect(page.getByTestId("admin-host-lock-context")).toContainText(
    "Original host can be restored",
  );
  await expect(page.getByRole("button", { name: "Restore Host Control" })).toBeEnabled();
  await expect(
    page.getByTestId("admin-host-run-controls").getByRole("button", { name: "Draw Set" }).first(),
  ).toBeDisabled();

  await page.goto("/coolguy69", { waitUntil: "domcontentloaded" });
  await restoreHost(page);
  await logoutAdmin(page);
  await loginAdmin(page);
  await expect(page.getByTestId("admin-host-lock-context")).toContainText(
    "Original host can be restored",
  );
  await expect(page.getByRole("button", { name: "Restore Host Control" })).toBeEnabled();
  await restoreHost(page);

  const standbyContext = await browser.newContext();
  const standbyPage = await standbyContext.newPage();

  try {
    await loginAdmin(standbyPage);
    await expect(standbyPage.getByTestId("admin-host-lock-context")).toContainText(
      "Read-only admin",
    );
    await expect(standbyPage.getByTestId("admin-force-host-takeover-panel")).toContainText(
      "Force host takeover",
    );
    await expect(standbyPage.getByRole("button", { name: "Take Host Control" })).toHaveCount(0);
    await expect(standbyPage.getByRole("button", { name: "Restore Host Control" })).toHaveCount(0);
    await expect(standbyPage.getByRole("button", { name: "Release" })).toHaveCount(0);

    await standbyPage.waitForTimeout(16_000);
    await expect(standbyPage.getByTestId("host-heartbeat-confidence")).toContainText(
      "Heartbeat missing; owner retained",
    );
    await expect(standbyPage.getByTestId("admin-host-lock-context")).toContainText(
      "Another browser has persistent host control",
    );

    await blockAdminLiveRefresh(page);
    const nowStaleRelease = page.getByRole("button", { name: "Release" });
    await forceHost(standbyPage, "Phase 3 browser forced-takeover evidence");
    await clickAdminActionAllowingError(page, nowStaleRelease);
    await expect(
      page.getByText("This session and credential are not the active host."),
    ).toBeVisible();
    await expect(page.getByTestId("admin-host-lock-context")).toContainText("Read-only admin");
    await expect(standbyPage.getByTestId("admin-host-lock-context")).toContainText(
      "This browser is active host",
    );

    await releaseHost(standbyPage);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("admin-host-lock-context")).toContainText("No active host");
  } finally {
    await standbyContext.close();
  }
});
