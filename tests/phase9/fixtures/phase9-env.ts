import type { Locator, Page } from "@playwright/test";

export const HOSTED_REFRESH_TIMEOUT_MS = 90_000;

export function requireBaseURL(baseURL: string | undefined) {
  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  return baseURL;
}

function getAdminPassword() {
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!password) {
    throw new Error("Missing E2E_ADMIN_PASSWORD from Playwright config.");
  }

  return password;
}

export const ADMIN_PASSWORD = getAdminPassword();

export function getTestRouteHeaders() {
  const token = process.env.E2E_TEST_ROUTE_TOKEN;

  if (!token) {
    throw new Error("Missing E2E_TEST_ROUTE_TOKEN from Playwright config.");
  }

  return { "x-tournament-test-token": token };
}

export function route(baseURL: string, path: string) {
  return new URL(path, baseURL).toString();
}

export async function goto(page: Page, baseURL: string, path: string) {
  await page.goto(route(baseURL, path), { waitUntil: "domcontentloaded" });
}

export async function clickServerAction(page: Page, target: Locator, settleMs = 2_000) {
  const responsePromise = page
    .waitForResponse((response) => response.request().method() === "POST", {
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    })
    .catch(() => null);

  await target.click();
  await responsePromise;
  await page.waitForTimeout(settleMs);
}
