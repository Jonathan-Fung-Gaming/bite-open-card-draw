import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

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

async function expectStageRows(page: Page) {
  const rows = page.getByTestId("stage-set-row");

  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-set-order", "1");
  await expect(rows.nth(1)).toHaveAttribute("data-set-order", "2");
  await expect(rows.nth(0).getByTestId("stage-chart-card")).toHaveCount(7);
  await expect(rows.nth(1).getByTestId("stage-chart-card")).toHaveCount(7);
}

async function expectRenderedStageImage(page: Page) {
  const image = page.getByTestId("stage-chart-image").first();

  await expect(image).toBeVisible({ timeout: 7_000 });
  await expect
    .poll(async () => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
}

async function expectReadableVotingAccess(page: Page) {
  const qrLink = page.getByTestId("room-qr-link");
  const qrCode = page.getByTestId("room-qr-code");
  const qrBox = await qrLink.boundingBox();
  const timerBox = await page.getByTestId("stage-countdown-display").boundingBox();
  const qrPathCount = await qrCode.locator("svg path").count();

  await expect(qrLink).toBeVisible();
  await expect(qrLink).toHaveAttribute("data-qr-target", "http://127.0.0.1:3100/room");
  await expect(qrCode.locator("svg")).toBeVisible();
  await expect(page.getByTestId("room-short-url")).toHaveText("127.0.0.1:3100/room");
  await expect(page.getByTestId("stage-countdown-display")).toHaveText(/\d{2}:\d{2}/);
  expect(qrPathCount).toBeGreaterThan(0);
  expect(qrBox?.width).toBeGreaterThan(180);
  expect(qrBox?.height).toBeGreaterThan(180);
  expect(timerBox?.width).toBeGreaterThan(160);
  expect(timerBox?.height).toBeGreaterThan(60);
}

async function waitForVisibleTiebreakReveal(page: Page, expectedPanelCount: number) {
  const tiebreakPanels = page.getByTestId("rune-wheel").or(page.getByTestId("fallback-tiebreak-reveal"));
  const tiebreakReveal = tiebreakPanels.nth(expectedPanelCount - 1);

  await expect(tiebreakPanels).toHaveCount(expectedPanelCount, { timeout: 7_000 });
  await expect(tiebreakReveal).toHaveAttribute("data-winner-revealed", "true", {
    timeout: 8_000,
  });
}

test("full round smoke flow reaches final reveal and downloads private CSV", async ({ page }) => {
  await goto(page, "/stage");
  await expect(page.getByText("Round 1 Draw")).toBeVisible();

  await goto(page, "/room");
  await expect(page.getByRole("link", { name: "I am a player voting" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View charts only" })).toBeVisible();

  await loginAndTakeHost(page);
  await page
    .getByPlaceholder("Bulk import start.gg usernames")
    .fill("Alpha\nBravo\nCharlie\nDelta");
  await page.getByRole("button", { name: "Bulk Import" }).click();
  await expect(page.getByRole("cell", { name: "Alpha" })).toBeVisible();

  const stagePage = await page.context().newPage();
  await goto(stagePage, "/stage");
  await expect(stagePage.locator("header").getByText("Awaiting host draw")).toBeVisible();

  await page.getByRole("button", { name: "Draw Set" }).nth(0).click();
  await expect(page.getByText(/Version 1/).first()).toBeVisible();
  await expect(stagePage.getByText(/Version 1 \/ (Revealing|Pool)/)).toBeVisible({ timeout: 7000 });

  const firstChartRerollForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Reroll", exact: true }) })
    .first();
  await firstChartRerollForm.getByPlaceholder("Password").fill(ADMIN_PASSWORD);
  await firstChartRerollForm.getByPlaceholder("Reason").fill("e2e stage reroll");
  await firstChartRerollForm.evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });
  await expect(page.getByText(/Version 2/).first()).toBeVisible();
  await expect(stagePage.getByText(/Version 2 \/ (Revealing|Pool)/)).toBeVisible({ timeout: 7000 });

  await page.getByRole("button", { name: "Draw Set" }).nth(1).click();
  await expect(page.getByText("ready to vote")).toBeVisible();
  await expect(stagePage.getByText(/Version 1 \/ (Revealing [0-7] \/ 7|Pool)/)).toBeVisible({
    timeout: 7000,
  });
  await expectStageRows(stagePage);
  await expectRenderedStageImage(stagePage);

  await page.getByRole("button", { name: "Open Voting" }).click();
  await expect(page.getByText("voting open")).toBeVisible();
  await expect(stagePage.locator("header").getByText("Voting open")).toBeVisible({ timeout: 7000 });
  await expectReadableVotingAccess(stagePage);

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

  await page.getByRole("button", { name: "Next Reveal Step" }).click();
  await page.getByRole("button", { name: "Next Reveal Step" }).click();
  await waitForVisibleTiebreakReveal(stagePage, 1);
  await page.getByRole("button", { name: "Next Reveal Step" }).click();
  await page.getByRole("button", { name: "Next Reveal Step" }).click();
  await waitForVisibleTiebreakReveal(stagePage, 2);
  await page.getByRole("button", { name: "Next Reveal Step" }).click();

  await expect(
    page
      .locator("section", { hasText: "Result Reveal Controls" })
      .getByText("final", { exact: true }),
  ).toBeVisible();
  await expect(stagePage.getByText("ROUND 1 FINAL CHARTS")).toBeVisible({ timeout: 7000 });

  await goto(page, "/stage");
  await expect(page.getByText("ROUND 1 FINAL CHARTS")).toBeVisible();
  await expect(page.getByTestId("stage-final-chart-list").getByTestId("stage-chart-card")).toHaveCount(2);

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

test("stage tiebreak wheel hides the winner until the five-second reveal completes", async ({
  page,
}) => {
  await loginAndTakeHost(page);
  await page
    .locator("form", { has: page.getByRole("button", { name: "Start Rehearsal" }) })
    .getByPlaceholder("Admin password")
    .fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Start Rehearsal" }).click();
  await expect(page.getByText("Rehearsal mode")).toBeVisible();

  const stagePage = await page.context().newPage();
  await goto(stagePage, "/stage");

  await page.getByRole("button", { name: "Draw Set" }).nth(0).click();
  await page.getByRole("button", { name: "Draw Set" }).nth(1).click();
  await expectStageRows(stagePage);
  await expectRenderedStageImage(stagePage);

  await page.getByRole("button", { name: "Seed Tiebreak" }).click();
  await page.getByRole("button", { name: "Close Voting" }).click();
  await expect(page.getByText("voting closed")).toBeVisible();
  await page.getByRole("button", { name: "Compute Results" }).click();
  await expect(page.getByText("results computed")).toBeVisible();
  await page.getByRole("button", { name: "Next Reveal Step" }).click();
  await page.getByRole("button", { name: "Next Reveal Step" }).click();

  await expect(stagePage.getByTestId("rune-wheel")).toHaveAttribute("data-winner-revealed", "false", {
    timeout: 7_000,
  });
  await expect(stagePage.getByTestId("rune-wheel-status")).toHaveText(
    "Backend winner sealed. Reveal in progress.",
  );
  await expect(stagePage.getByTestId("result-selected-label")).toHaveCount(0);

  await expect(stagePage.getByTestId("rune-wheel")).toHaveAttribute("data-winner-revealed", "true", {
    timeout: 8_000,
  });
  await expect(stagePage.getByTestId("rune-wheel-status")).toContainText("Backend winner revealed:");
  await expect(stagePage.getByTestId("result-selected-label")).toHaveCount(1);
});
