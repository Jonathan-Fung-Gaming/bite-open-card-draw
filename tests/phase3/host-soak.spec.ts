import { expect, test } from "@playwright/test";
import { loginAdmin, getAdminSessionPayload, releaseHost, takeHost } from "./helpers";

const soakDurationMs = Number(process.env.E2E_PHASE3_SOAK_DURATION_MS ?? 15_000);
const realSoak = process.env.E2E_PHASE3_REAL_SOAK === "true";

test("@phase3-soak active host renews while an idle standby never gains ownership", async ({
  page,
  browser,
  context,
}) => {
  test.setTimeout(soakDurationMs + 120_000);

  if (realSoak) {
    expect(soakDurationMs).toBe(35 * 60_000);
  }

  await loginAdmin(page);
  await takeHost(page);
  const initialHostSession = await getAdminSessionPayload(context);

  expect(initialHostSession).not.toBeNull();

  const standbyContext = await browser.newContext();
  const standbyPage = await standbyContext.newPage();

  try {
    await loginAdmin(standbyPage);
    await expect(standbyPage.getByTestId("admin-host-lock-context")).toContainText(
      "Read-only admin",
    );

    // This is intentionally a single wait: no user event is sent to either browser during soak.
    await page.waitForTimeout(soakDurationMs);

    const renewedHostSession = await getAdminSessionPayload(context);

    expect(renewedHostSession?.sessionId).toBe(initialHostSession?.sessionId);
    expect(renewedHostSession?.expiresAt ?? 0).toBeGreaterThan(
      initialHostSession?.expiresAt ?? Number.MAX_SAFE_INTEGER,
    );
    await expect(page.getByRole("button", { name: "Release" })).toBeEnabled();

    await standbyPage.reload({ waitUntil: "domcontentloaded" });
    if (realSoak) {
      await expect(standbyPage.getByLabel("Shared admin password")).toBeVisible();
      await loginAdmin(standbyPage);
    }
    await expect(standbyPage.getByTestId("admin-host-lock-context")).toContainText(
      "Read-only admin",
    );

    await releaseHost(page);
  } finally {
    await standbyContext.close();
  }
});
