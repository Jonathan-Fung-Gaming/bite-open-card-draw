import { expect, type Locator, type Page } from "@playwright/test";

export const HOSTED_REFRESH_TIMEOUT_MS = 30_000;

const ADMIN_PATH = "/coolguy69";

export function getAdminPassword() {
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!password) {
    throw new Error("Missing E2E_ADMIN_PASSWORD from Playwright config.");
  }

  return password;
}

export async function goto(page: Page, path: string) {
  try {
    await page.goto(path, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (error instanceof Error && error.message.includes("interrupted by another navigation")) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      return;
    }

    throw error;
  }
}

function isAdminPostResponse(responseUrl: string, method: string) {
  try {
    return new URL(responseUrl).pathname === ADMIN_PATH && method === "POST";
  } catch {
    return false;
  }
}

async function throwIfAdminError(page: Page) {
  const currentUrl = new URL(page.url());
  const error = currentUrl.searchParams.get("error");

  if (error) {
    throw new Error(`Admin action failed: ${error}`);
  }
}

export async function clickAdminActionAndWait(page: Page, button: Locator) {
  const adminPostPromise = page
    .waitForResponse(
      (response) => isAdminPostResponse(response.url(), response.request().method()),
      { timeout: 5_000 },
    )
    .catch(() => null);

  await button.click();
  await Promise.race([adminPostPromise, page.waitForTimeout(1_000)]);
  await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => null);
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => null);
  await throwIfAdminError(page);
}

async function releaseButtonIsEnabled(page: Page) {
  const releaseButton = page.getByRole("button", { name: "Release" });

  if ((await releaseButton.count()) === 0) {
    return false;
  }

  return releaseButton.isEnabled().catch(() => false);
}

async function waitForActiveHost(page: Page, timeout = HOSTED_REFRESH_TIMEOUT_MS) {
  try {
    await expect
      .poll(async () => releaseButtonIsEnabled(page), {
        intervals: [250, 500, 1_000],
        timeout,
      })
      .toBe(true);
    await expect(page.getByText("Voting Controls")).toBeVisible();
    await throwIfAdminError(page);
    return true;
  } catch {
    return false;
  }
}

async function submitHostRequest(page: Page, takeoverReason: string) {
  const takeHostButton = page.getByRole("button", { name: "Take Host Control" });

  if ((await takeHostButton.count()) > 0 && (await takeHostButton.isEnabled())) {
    await clickAdminActionAndWait(page, takeHostButton);
    return;
  }

  const forceHostButton = page.getByRole("button", { name: "Force Host Takeover" });
  const forceHostForm = page.locator("form", { has: forceHostButton });

  await expect(forceHostButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await forceHostForm.getByLabel("Audit reason").fill(takeoverReason);
  await forceHostForm.getByLabel("Admin password").fill(getAdminPassword());
  await clickAdminActionAndWait(page, forceHostButton);
}

export async function loginAndTakeHost(page: Page, takeoverReason = "e2e host takeover") {
  await goto(page, ADMIN_PATH);
  await page.getByLabel("Shared admin password").fill(getAdminPassword());
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Log In" }));
  await expect(page.getByRole("heading", { name: "coolguy69" })).toBeVisible();
  await throwIfAdminError(page);

  if (await waitForActiveHost(page, 1_000)) {
    return;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await submitHostRequest(page, takeoverReason);

    if (await waitForActiveHost(page, 8_000)) {
      return;
    }

    await page.reload({ waitUntil: "domcontentloaded" });
  }

  await expect(page.getByRole("button", { name: "Release" })).toBeEnabled({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}
