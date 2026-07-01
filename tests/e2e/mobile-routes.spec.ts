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
const HOSTED_REFRESH_TIMEOUT_MS = 30_000;

async function goto(page: Page, path: string) {
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

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    )
    .toBeLessThanOrEqual(4);
}

async function expectCenteredSeventhCard(page: Page) {
  const viewport = page.viewportSize();
  const cards = page.getByTestId("ballot-chart-card");
  const sixthBox = await cards.nth(5).boundingBox();
  const seventhBox = await cards.nth(6).boundingBox();

  expect(viewport).not.toBeNull();
  expect(sixthBox).not.toBeNull();
  expect(seventhBox).not.toBeNull();
  expect(seventhBox!.y).toBeGreaterThan(sixthBox!.y);
  expect(Math.abs(seventhBox!.x + seventhBox!.width / 2 - viewport!.width / 2)).toBeLessThanOrEqual(
    8,
  );
  expect(seventhBox!.width).toBeGreaterThan(120);
}

async function loginAndTakeHost(page: Page) {
  await goto(page, "/coolguy69");
  await page.getByLabel("Shared admin password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByRole("heading", { name: "coolguy69" })).toBeVisible();
  const releaseButton = page.getByRole("button", { name: "Release" });

  if (await releaseButton.isEnabled()) {
    await expect(page.getByText("Voting Controls")).toBeVisible();
    return;
  }

  const takeHostButton = page.getByRole("button", { name: "Take Host Control" });

  if ((await takeHostButton.count()) > 0 && (await takeHostButton.isEnabled())) {
    await takeHostButton.click();
  } else {
    const forceHostForm = page.locator("form", {
      has: page.getByRole("button", { name: "Force Host Takeover" }),
    });

    await forceHostForm.getByLabel("Audit reason").fill("mobile route e2e takeover");
    await forceHostForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
    await forceHostForm.getByRole("button", { name: "Force Host Takeover" }).click();
  }

  await expect(page.getByText("Voting Controls")).toBeVisible();
  await expect(releaseButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
}

async function startRehearsalMode(page: Page) {
  const rehearsalForm = page.locator("form", {
    has: page.getByRole("button", { name: "Start Rehearsal" }),
  });

  await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await rehearsalForm.getByPlaceholder("Audit reason").fill("mobile route e2e reset");
  await page.getByRole("button", { name: "Start Rehearsal" }).click();
  await expect(page.getByText("Rehearsal mode", { exact: true }).first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function drawBothSetsAndOpenVoting(page: Page) {
  await page.getByRole("button", { name: "Draw Set" }).nth(0).click();
  await expect(page.getByText(/Version 1/).first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await page.getByRole("button", { name: "Draw Set" }).nth(1).click();
  await expect(page.getByText("ready to vote")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await page.getByRole("button", { name: "Open Voting", exact: true }).click();
  await expect(page.getByText("voting open")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

test("mobile routes cover room, charts, vote, and pre-reveal results", async (
  { page },
  testInfo,
) => {
  const publicOnlyWebKitRun = testInfo.project.name === "mobile-webkit";
  const voterName = publicOnlyWebKitRun ? "Rehearsal Player 02" : "Rehearsal Player 01";

  if (!publicOnlyWebKitRun) {
    await loginAndTakeHost(page);
    await startRehearsalMode(page);
    await drawBothSetsAndOpenVoting(page);
  } else {
    await goto(page, "/charts");
    const statusText = (await page.getByTestId("view-only-status").textContent()) ?? "";

    if (!statusText.includes("Voting open")) {
      await loginAndTakeHost(page);
      await startRehearsalMode(page);
      await drawBothSetsAndOpenVoting(page);
    }
  }

  await goto(page, "/room");
  await expect(page.getByRole("link", { name: "I am a player voting" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View charts only" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await goto(page, "/charts");
  await expect(page.getByTestId("view-only-status")).toContainText("Voting open");
  await expect(page.getByRole("tab", { name: /Set 1/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Set 2/ })).toBeVisible();
  await expect(page.getByTestId("stage-set-row").nth(0)).toBeVisible();
  await expect(page.getByTestId("stage-set-row").nth(1)).toBeHidden();
  await page.getByRole("tab", { name: /Set 2/ }).click();
  await expect(page.getByTestId("stage-set-row").nth(1)).toBeVisible();
  await expect(page.getByLabel("Select your start.gg username")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit Ballot" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await goto(page, "/vote");
  await page.getByLabel("Select your start.gg username").selectOption({
    label: voterName,
  });
  await expect(
    page.getByText(`Are you sure you are voting as ${voterName}?`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("ballot-chart-card")).toHaveCount(7);
  await expectCenteredSeventhCard(page);
  await expectNoHorizontalOverflow(page);

  await page.getByLabel("No bans for this set").check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("No bans for this set").check();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit Ballot" }).click();
  await expect(page.getByText("Ballot Saved")).toBeVisible();

  await goto(page, "/results");
  await expect(page.getByRole("heading", { name: "Round 1 Results" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
