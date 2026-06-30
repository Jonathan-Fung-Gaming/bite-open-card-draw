import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

function getAdminPassword() {
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!password) {
    throw new Error("Missing E2E_ADMIN_PASSWORD from Playwright config.");
  }

  return password;
}

const ADMIN_PASSWORD = getAdminPassword();

function getTestRouteHeaders() {
  const token = process.env.E2E_TEST_ROUTE_TOKEN;

  if (!token) {
    throw new Error("Missing E2E_TEST_ROUTE_TOKEN from Playwright config.");
  }

  return { "x-tournament-test-token": token };
}
const HOSTED_REFRESH_TIMEOUT_MS = 15_000;

function route(baseURL: string, path: string) {
  return new URL(path, baseURL).toString();
}

async function goto(page: Page, baseURL: string, path: string) {
  await page.goto(route(baseURL, path), { waitUntil: "domcontentloaded" });
}

async function loginAndTakeHost(page: Page, baseURL: string) {
  await goto(page, baseURL, "/coolguy69");
  await page.getByLabel("Shared admin password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByRole("heading", { name: "coolguy69" })).toBeVisible();
  const hostControlButton = page.getByRole("button", {
    name: /^(Force Host Takeover|Take Host Control)$/,
  });

  await expect(hostControlButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await hostControlButton.click();
  await expect(page.getByText("Voting Controls")).toBeVisible();
  await expect(page.getByRole("button", { name: "Release" })).toBeEnabled({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function startRehearsalMode(page: Page) {
  const rehearsalForm = page.locator("form", {
    has: page.getByRole("button", { name: "Start Rehearsal" }),
  });

  await expect(rehearsalForm.getByRole("button", { name: "Start Rehearsal" })).toBeEnabled({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await rehearsalForm.getByPlaceholder("Audit reason").fill("Phase 9 hosted four-round rehearsal");
  await page.getByRole("button", { name: "Start Rehearsal" }).click();
  await expect(page.getByText("Rehearsal mode")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Rehearsal Player 01" })).toBeVisible();
}

async function setCurrentRound(page: Page, roundNumber: number) {
  const currentRoundForm = page.locator("form", {
    has: page.getByRole("button", { name: "Set Current Round" }),
  });

  await currentRoundForm.locator("select[name='roundNumber']").selectOption(String(roundNumber));
  await currentRoundForm.getByRole("button", { name: "Set Current Round" }).click();
  await expect(page.getByRole("heading", { name: `Current Round ${roundNumber}` })).toBeVisible();
}

async function drawRoundSet(page: Page, roundNumber: number, setOrder: 1 | 2) {
  const setSection = page
    .getByText(`Round ${roundNumber} - Set ${setOrder}`, { exact: true })
    .locator("xpath=ancestor::section[1]");

  await setSection.getByRole("button", { name: "Draw Set" }).click();
  await expect(setSection.getByText(/Version 1/)).toBeVisible();
}

async function drawCurrentRound(page: Page, roundNumber: number) {
  await drawRoundSet(page, roundNumber, 1);
  await drawRoundSet(page, roundNumber, 2);
  await expect(page.getByText("ready to vote")).toBeVisible();
}

async function submitBallot(
  request: APIRequestContext,
  baseURL: string,
  roundNumber: number,
  playerStartggUsername: string,
  revision: 1 | 2 = 1,
) {
  const response = await request.post(route(baseURL, "/api/e2e/load-ballot"), {
    headers: getTestRouteHeaders(),
    data: {
      roundNumber,
      playerStartggUsername,
      revision,
    },
  });
  const payload = (await response.json()) as { error?: string; revision?: number };

  expect(
    response.ok(),
    `Round ${roundNumber} ${playerStartggUsername} revision ${revision}: ${payload.error ?? "ok"}`,
  ).toBe(true);
  expect(payload.revision).toBe(revision);
}

async function saveManualNoBansBallot(
  page: Page,
  playerStartggUsername: string,
  roundNumber: number,
) {
  const manualForm = page.locator("form", {
    has: page.getByRole("button", { name: "Save Manual Ballot" }),
  });

  await manualForm.getByLabel("player").selectOption({ label: playerStartggUsername });
  await manualForm.getByLabel("No bans for this set").nth(0).check();
  await manualForm.getByLabel("No bans for this set").nth(1).check();
  await manualForm.getByLabel("reason").fill(`Round ${roundNumber} Phase 9 manual override`);
  await manualForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
  await manualForm.getByRole("button", { name: "Save Manual Ballot" }).click();
  await expect(page.getByText(`Entered manual ballot for ${playerStartggUsername}.`)).toBeVisible();
}

async function expectAdminRevealPhase(page: Page, phase: string) {
  await expect(
    page
      .locator("section", { hasText: "Result Reveal Controls" })
      .getByText(phase, { exact: true }),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
}

async function isAdminRevealPhaseVisible(page: Page, phase: string) {
  return page
    .locator("section", { hasText: "Result Reveal Controls" })
    .getByText(phase, { exact: true })
    .isVisible()
    .catch(() => false);
}

async function clickNextRevealStep(page: Page) {
  const nextButton = page.getByRole("button", { name: "Next Reveal Step" });

  await expect(nextButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await nextButton.click();
}

async function advanceToFinalReveal(page: Page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await isAdminRevealPhaseVisible(page, "final")) {
      return;
    }

    await clickNextRevealStep(page);
    await page.waitForTimeout(8_000);
    await page.reload({ waitUntil: "domcontentloaded" });
  }

  await expectAdminRevealPhase(page, "final");
}

async function verifyManualCsvDownload(page: Page, roundNumber: number) {
  const downloadPromise = page.waitForEvent("download");

  await page.getByRole("button", { name: "Download private ballot CSV" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  if (!downloadPath) {
    throw new Error(`Could not read Round ${roundNumber} private CSV.`);
  }

  const csv = await readFile(downloadPath, "utf8");

  expect(download.suggestedFilename()).toBe(`round-${roundNumber}-private-ballots.csv`);
  expect(csv).toContain("player_startgg_username");
  expect(csv).toContain("selected_set_1_chart");
  expect(csv).toContain("selected_set_2_chart");
  expect(csv).toContain(`Round ${roundNumber} Phase 9 manual override`);
}

test("hosted Supabase four-round rehearsal covers tiebreaks, manual ballots, and CSV", async ({
  page,
  browser,
  request,
  baseURL,
}) => {
  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  await loginAndTakeHost(page, baseURL);
  await startRehearsalMode(page);

  const stagePage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const chartsPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const resultsPage = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await goto(stagePage, baseURL, "/stage");
  await goto(chartsPage, baseURL, "/charts");
  await goto(resultsPage, baseURL, "/results");

  for (const roundNumber of [1, 2, 3, 4]) {
    await setCurrentRound(page, roundNumber);
    await drawCurrentRound(page, roundNumber);

    await stagePage.reload({ waitUntil: "domcontentloaded" });
    await expect(stagePage.getByTestId("stage-set-row")).toHaveCount(2);
    await expect(
      stagePage.getByTestId("stage-set-row").nth(0).getByTestId("stage-chart-card"),
    ).toHaveCount(7);
    await expect(
      stagePage.getByTestId("stage-set-row").nth(1).getByTestId("stage-chart-card"),
    ).toHaveCount(7);

    await chartsPage.reload({ waitUntil: "domcontentloaded" });
    await expect(chartsPage.getByTestId("view-only-status")).toBeVisible();
    await expect(chartsPage.getByLabel("Select your start.gg username")).toHaveCount(0);

    await page.getByRole("button", { name: "Open Voting", exact: true }).click();
    await expect(page.getByText("voting open")).toBeVisible();

    if (roundNumber === 1) {
      const seedTiebreakForm = page.locator("form", {
        has: page.getByRole("button", { name: "Seed Tiebreak" }),
      });
      await seedTiebreakForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
      await seedTiebreakForm.getByPlaceholder("Audit reason").fill("phase9 forced tiebreak");
      await page.getByRole("button", { name: "Seed Tiebreak" }).click();
      await expect(page.getByText("Seeded rehearsal tiebreak ballots")).toBeVisible();
    } else {
      await submitBallot(request, baseURL, roundNumber, "Rehearsal Player 01", 1);
      await submitBallot(request, baseURL, roundNumber, "Rehearsal Player 01", 2);
      await submitBallot(request, baseURL, roundNumber, "Rehearsal Player 02", 1);
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("voting open")).toBeVisible();
    await page.getByRole("button", { name: "Close Voting" }).click();
    await expect(page.getByText("voting closed")).toBeVisible();

    await saveManualNoBansBallot(page, "Rehearsal Player 04", roundNumber);

    await page.getByRole("button", { name: "Compute Results" }).click();
    await expect(page.getByText("results computed")).toBeVisible();
    await expectAdminRevealPhase(page, "computed");
    await advanceToFinalReveal(page);

    await expect(
      stagePage.getByRole("heading", { name: `ROUND ${roundNumber} FINAL CHARTS` }),
    ).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await resultsPage.reload({ waitUntil: "domcontentloaded" });
    await expect(
      resultsPage.getByRole("heading", { name: `ROUND ${roundNumber} FINAL CHARTS` }),
    ).toBeVisible();

    await verifyManualCsvDownload(page, roundNumber);

    if (roundNumber < 4) {
      await page.getByRole("button", { name: "Advance Round" }).click();
      await expect(
        page.getByRole("heading", { name: `Current Round ${roundNumber + 1}` }),
      ).toBeVisible();
    }
  }

  await stagePage.close();
  await chartsPage.close();
  await resultsPage.close();
});
