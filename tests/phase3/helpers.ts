import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { ADMIN_SESSION_COOKIE } from "../../src/lib/admin/session";
import {
  clickAdminActionAndWait,
  getAdminPassword,
  goto,
  openAdminPanel,
} from "../e2e/admin-helpers";

type AdminSessionCookiePayload = {
  expiresAt?: unknown;
  sessionId?: unknown;
};

export async function loginAdmin(page: Page) {
  await goto(page, "/coolguy69");
  await page.getByLabel("Shared admin password").fill(getAdminPassword());
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Log In" }));
  await expect(page.getByRole("heading", { name: "Host Console" })).toBeVisible();
}

export async function takeHost(page: Page) {
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Take Host Control" }));
  await expect(page.getByTestId("admin-action-notice")).toHaveText("Host control acquired.");
  await expect(page.getByRole("button", { name: "Release" })).toBeEnabled();
}

export async function restoreHost(page: Page) {
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Restore Host Control" }));
  await expect(page.getByTestId("admin-action-notice")).toHaveText(
    "Host control restored and credentials rotated.",
  );
  await expect(page.getByRole("button", { name: "Release" })).toBeEnabled();
}

export async function forceHost(page: Page, reason: string) {
  const panel = page.getByTestId("admin-force-host-takeover-panel");

  if (!(await panel.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await panel.locator("summary").click();
  }

  const form = panel.locator("form");

  await expect(form).toContainText("persistent host owner");
  await form.getByLabel("Audit reason").fill(reason);
  await form.getByLabel("Admin password").fill(getAdminPassword());
  await clickAdminActionAndWait(page, form.getByRole("button", { name: "Force Host Takeover" }));
  await expect(page.getByTestId("admin-action-notice")).toHaveText(
    "Forced host takeover completed.",
  );
  await expect(page.getByRole("button", { name: "Release" })).toBeEnabled();
}

export async function releaseHost(page: Page) {
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Release" }));
  await expect(page.getByTestId("admin-action-notice")).toHaveText("Host control released.");
  await expect(page.getByRole("button", { name: "Take Host Control" })).toBeEnabled();
}

export async function logoutAdmin(page: Page) {
  await openAdminPanel(page, "admin-support-panels");
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Log Out" }));
  await expect(page.getByLabel("Shared admin password")).toBeVisible();
}

export async function clickAdminActionAllowingError(page: Page, button: Locator) {
  const response = page
    .waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname === "/coolguy69" &&
        candidate.request().method() === "POST",
      { timeout: 10_000 },
    )
    .catch(() => null);

  await button.click();
  await Promise.race([response, page.waitForTimeout(1_000)]);
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}

export async function blockAdminLiveRefresh(page: Page) {
  await page.evaluate(() => {
    const form = document.createElement("form");
    const input = document.createElement("input");

    form.dataset.adminLiveRefreshBlocking = "true";
    form.hidden = true;
    input.defaultValue = "";
    input.value = "phase3-stale-page-evidence";
    form.append(input);
    document.body.append(form);
  });
}

export async function getAdminSessionPayload(context: BrowserContext) {
  const cookie = (await context.cookies()).find(({ name }) => name === ADMIN_SESSION_COOKIE);

  if (!cookie) {
    return null;
  }

  const [encodedPayload] = cookie.value.split(".");

  if (!encodedPayload) {
    throw new Error("Admin session cookie is malformed.");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as AdminSessionCookiePayload;

  if (typeof payload.sessionId !== "string" || typeof payload.expiresAt !== "number") {
    throw new Error("Admin session cookie payload is incomplete.");
  }

  return { expiresAt: payload.expiresAt, sessionId: payload.sessionId };
}
