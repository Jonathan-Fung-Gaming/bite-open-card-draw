import { expect, test, type Page } from "@playwright/test";

function getAdminPassword() {
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!password) {
    throw new Error("Missing E2E_ADMIN_PASSWORD from Playwright config.");
  }

  return password;
}

const ADMIN_PASSWORD = getAdminPassword();

async function goto(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

async function loginAndTakeHost(page: Page) {
  await goto(page, "/coolguy69");
  await page.getByLabel("Shared admin password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByRole("heading", { name: "coolguy69" })).toBeVisible();
  await page.getByRole("button", { name: "Take Host Control" }).click();
  await expect(page.getByText("Voting Controls")).toBeVisible();
}

test("full round smoke flow reaches final reveal and downloads private CSV", async ({ page }) => {
  await goto(page, "/stage");
  await expect(page.getByText("Round 1 Draw")).toBeVisible();

  await goto(page, "/room");
  await expect(page.getByRole("link", { name: "I am a player voting" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View charts only" })).toBeVisible();

  await loginAndTakeHost(page);
  await page.getByPlaceholder("Bulk import start.gg usernames").fill("Alpha\nBravo\nCharlie\nDelta");
  await page.getByRole("button", { name: "Bulk Import" }).click();
  await expect(page.getByRole("cell", { name: "Alpha" })).toBeVisible();

  await page.getByRole("button", { name: "Draw Set" }).nth(0).click();
  await expect(page.getByText(/Version 1/).first()).toBeVisible();
  await page.getByRole("button", { name: "Draw Set" }).nth(1).click();
  await expect(page.getByText("ready to vote")).toBeVisible();

  await page.getByRole("button", { name: "Open Voting" }).click();
  await expect(page.getByText("voting open")).toBeVisible();

  await goto(page, "/vote");
  await page.getByLabel("Select your start.gg username").selectOption({ label: "Alpha" });
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("button").filter({ hasText: "S16" }).first().click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("No bans for this set").check();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit Ballot" }).click();
  await expect(page.getByText("Ballot Saved")).toBeVisible();

  await goto(page, "/coolguy69");
  await page.getByRole("button", { name: "Close Voting" }).click();
  await expect(page.getByText("voting closed")).toBeVisible();
  await page.getByRole("button", { name: "Compute Results" }).click();
  await expect(page.getByText("results computed")).toBeVisible();

  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: "Next Reveal Step" }).click();
  }

  await expect(page.getByText("final")).toBeVisible();

  await goto(page, "/stage");
  await expect(page.getByText("ROUND 1 FINAL CHARTS")).toBeVisible();

  await goto(page, "/results");
  await expect(page.getByText("ROUND 1 FINAL CHARTS")).toBeVisible();

  await goto(page, "/vote");
  await expect(page.getByText("Full ban counts")).toBeVisible();

  await goto(page, "/coolguy69");
  const downloadButton = page.getByRole("button", { name: "Download private ballot CSV" });
  await expect(downloadButton).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("round-1-private-ballots.csv");
});
