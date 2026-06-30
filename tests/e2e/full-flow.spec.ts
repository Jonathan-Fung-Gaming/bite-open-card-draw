import { expect, test, type Locator, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

function getAdminPassword() {
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!password) {
    throw new Error("Missing E2E_ADMIN_PASSWORD from Playwright config.");
  }

  return password;
}

const ADMIN_PASSWORD = getAdminPassword();
const FALLBACK_CHART_IMAGE_PATH = "/chart-images/fallback-card.svg";
const HOSTED_REFRESH_TIMEOUT_MS = 15_000;

function expectRealCachedImagePath(source: string | null) {
  expect(source).toBeTruthy();
  expect(source).toContain("/chart-images/cache/");
  expect(source).not.toContain(FALLBACK_CHART_IMAGE_PATH);
}

async function goto(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

async function loginAndTakeHost(page: Page) {
  await goto(page, "/coolguy69");
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

async function expectStageRows(page: Page) {
  const rows = page.getByTestId("stage-set-row");

  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-set-order", "1");
  await expect(rows.nth(1)).toHaveAttribute("data-set-order", "2");
  await expect(rows.nth(0).getByTestId("stage-chart-card")).toHaveCount(7);
  await expect(rows.nth(1).getByTestId("stage-chart-card")).toHaveCount(7);
}

async function expectRenderedImageElement(image: Locator) {
  await expect(image).toBeVisible({ timeout: 7_000 });
  await expect
    .poll(async () => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
}

async function expectRenderedRealStageImage(page: Page) {
  const image = page.getByTestId("stage-chart-image").first();

  await expectRenderedImageElement(image);
  expectRealCachedImagePath(await image.getAttribute("src"));
}

async function expectRenderedRealBackgroundImage(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: 7_000 });
  expectRealCachedImagePath(await locator.getAttribute("data-chart-image-path"));
  await expect
    .poll(async () =>
      locator.evaluate(
        (element) =>
          new Promise<number>((resolve) => {
            const explicitPath = element.getAttribute("data-chart-image-path");
            const backgroundImage = window.getComputedStyle(element).backgroundImage;
            const backgroundUrl = /url\(["']?(.*?)["']?\)/.exec(backgroundImage)?.[1];
            const source = explicitPath || backgroundUrl;

            if (!source) {
              resolve(0);
              return;
            }

            const image = new Image();
            image.onload = () => resolve(image.naturalWidth);
            image.onerror = () => resolve(0);
            image.src = new URL(source, window.location.href).toString();
          }),
      ),
    )
    .toBeGreaterThan(0);
}

async function expectReadableVotingAccess(page: Page) {
  const qrLink = page.getByTestId("room-qr-link");
  const qrCode = page.getByTestId("room-qr-code");
  const roomUrl = new URL("/room", page.url()).toString();
  const shortRoomUrl = `${new URL(roomUrl).host}/room`;
  const votingBandBox = await page.getByTestId("stage-voting-band").boundingBox();
  const chartRowsBox = await page.getByTestId("stage-chart-rows").boundingBox();
  const qrBox = await qrLink.boundingBox();
  const timerBox = await page.getByTestId("stage-countdown-display").boundingBox();
  const qrPathCount = await qrCode.locator("svg path").count();

  await expect(qrLink).toBeVisible();
  await expect(qrLink).toHaveAttribute("data-qr-target", roomUrl);
  await expect(qrCode.locator("svg")).toBeVisible();
  await expect(page.getByTestId("room-short-url")).toHaveText(shortRoomUrl);
  await expect(page.getByTestId("stage-countdown-display")).toHaveText(/\d{2}:\d{2}/);
  expect(qrPathCount).toBeGreaterThan(0);
  expect(qrBox).not.toBeNull();
  expect(timerBox).not.toBeNull();
  expect(votingBandBox).not.toBeNull();
  expect(chartRowsBox).not.toBeNull();
  expect(qrBox!.width).toBeGreaterThan(140);
  expect(qrBox!.height).toBeGreaterThan(140);
  expect(timerBox?.width).toBeGreaterThan(160);
  expect(timerBox?.height).toBeGreaterThanOrEqual(60);
  expect(qrBox!.x).toBeGreaterThan(timerBox!.x + timerBox!.width - 8);
  expect(votingBandBox!.y + votingBandBox!.height).toBeLessThanOrEqual(chartRowsBox!.y);
  expect(qrBox!.y).toBeLessThan(chartRowsBox!.y);
  expect(timerBox!.y).toBeLessThan(chartRowsBox!.y);
}

async function expectNoStageVerticalScroll(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) -
          window.innerHeight,
      ),
    )
    .toBeLessThanOrEqual(4);
}

async function waitForVisibleTiebreakReveal(page: Page, expectedPanelCount: number) {
  const tiebreakPanels = page
    .getByTestId("rune-wheel")
    .or(page.getByTestId("fallback-tiebreak-reveal"));
  const tiebreakReveal = tiebreakPanels.nth(expectedPanelCount - 1);

  await expect(tiebreakPanels).toHaveCount(expectedPanelCount, {
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(tiebreakReveal).toHaveAttribute("data-winner-revealed", "true", {
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function expectAdminRevealPhase(page: Page, phase: string) {
  await expect(
    page
      .locator("section", { hasText: "Result Reveal Controls" })
      .getByText(phase, { exact: true }),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
}

async function advanceRevealAndWaitForAdminPhase(page: Page, phase: string) {
  await page.getByRole("button", { name: "Next Reveal Step" }).click();
  await expectAdminRevealPhase(page, phase);
}

test("full round smoke flow reaches final reveal and downloads private CSV", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);

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

  const chartsPage = await page.context().newPage();
  await goto(chartsPage, "/charts");
  await expect(chartsPage.getByText("Awaiting host draw").first()).toBeVisible();

  await page.getByRole("button", { name: "Draw Set" }).nth(0).click();
  await expect(page.getByText(/Version 1/).first()).toBeVisible();
  await expect(stagePage.getByText(/Version 1 \/ (Revealing|Pool)/)).toBeVisible({ timeout: 7000 });
  await expect(chartsPage.getByText(/Version 1 \/ (Revealing|Pool)/)).toBeVisible({
    timeout: 7000,
  });

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
  await expect(chartsPage.getByText(/Version 2 \/ (Revealing|Pool)/)).toBeVisible({
    timeout: 7000,
  });

  await page.getByRole("button", { name: "Draw Set" }).nth(1).click();
  await expect(page.getByText("ready to vote")).toBeVisible();
  await expect(stagePage.getByText(/Version 1 \/ (Revealing [0-7] \/ 7|Pool)/)).toBeVisible({
    timeout: 7000,
  });
  await expectStageRows(stagePage);
  await expectRenderedRealStageImage(stagePage);
  await expectStageRows(chartsPage);
  await expectRenderedRealStageImage(chartsPage);

  await page.getByRole("button", { name: "Open Voting", exact: true }).click();
  await expect(page.getByText("voting open")).toBeVisible();
  await expect(stagePage.locator("header").getByText("Voting open")).toBeVisible({ timeout: 7000 });
  await expectReadableVotingAccess(stagePage);
  await expectNoStageVerticalScroll(stagePage);

  const mobileChartsPage = await page.context().newPage();
  await mobileChartsPage.setViewportSize({ width: 390, height: 844 });
  await goto(mobileChartsPage, "/charts");
  await expect(mobileChartsPage.getByTestId("view-only-status")).toContainText("Voting open");
  await expect(mobileChartsPage.getByRole("tab", { name: /Set 1/ })).toBeVisible();
  await expect(mobileChartsPage.getByRole("tab", { name: /Set 2/ })).toBeVisible();
  await expect(mobileChartsPage.getByTestId("stage-set-row").nth(0)).toBeVisible();
  await expect(mobileChartsPage.getByTestId("stage-set-row").nth(1)).toBeHidden();
  await mobileChartsPage.getByRole("tab", { name: /Set 2/ }).click();
  await expect(mobileChartsPage.getByTestId("stage-set-row").nth(1)).toBeVisible();
  await expect(mobileChartsPage.getByLabel("Select your start.gg username")).toHaveCount(0);
  await expect(mobileChartsPage.getByRole("button", { name: "Submit Ballot" })).toHaveCount(0);
  await mobileChartsPage.close();

  const phonePage = await page.context().newPage();
  await phonePage.setViewportSize({ width: 390, height: 844 });
  await goto(phonePage, "/vote");
  await phonePage.getByLabel("Select your start.gg username").selectOption({ label: "Alpha" });
  await phonePage.getByRole("button", { name: "Confirm" }).click();
  await expectRenderedRealBackgroundImage(phonePage.getByTestId("ballot-chart-card").first());
  await expect(phonePage.getByTestId("ban-selection-counter")).toHaveText("0/2 bans selected");
  const ballotCards = phonePage.getByTestId("ballot-chart-card");
  await ballotCards.nth(0).click();
  await expect(ballotCards.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(ballotCards.nth(0).getByTestId("ban-selected-label")).toHaveText("Ban selected");
  await expect(phonePage.getByTestId("ban-selection-counter")).toHaveText("1/2 bans selected");
  await ballotCards.nth(1).click();
  await expect(phonePage.getByTestId("ban-selection-counter")).toHaveText("2/2 bans selected");
  await ballotCards.nth(2).click();
  await expect(phonePage.getByTestId("ban-limit-feedback")).toContainText("Only 2 bans");
  await expect(ballotCards.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(ballotCards.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(ballotCards.nth(2)).toHaveAttribute("aria-pressed", "false");
  await phonePage.getByRole("button", { name: "Next" }).click();
  await phonePage.getByLabel("No bans for this set").check();
  await phonePage.getByRole("button", { name: "Review" }).click();
  await phonePage.getByRole("button", { name: "Submit Ballot" }).click();
  await expect(phonePage.getByText("Ballot Saved")).toBeVisible();
  await expect(phonePage.getByText("Server-confirmed timestamp:")).toBeVisible();
  await expect(phonePage.getByText("S16", { exact: true })).toBeVisible();
  await expect(phonePage.getByText("No bans for this set")).toBeVisible();
  await expect(phonePage.getByRole("button", { name: "Edit S16" })).toBeVisible();
  await expect(phonePage.getByRole("button", { name: "Edit S17" })).toBeVisible();
  await phonePage.getByRole("button", { name: "Edit S16" }).click();
  await expect(phonePage.getByRole("heading", { name: "S16" })).toBeVisible();
  await expect(phonePage.getByTestId("ban-selection-counter")).toHaveText("2/2 bans selected");
  await phonePage.getByRole("button", { name: "Next" }).click();
  await phonePage.getByRole("button", { name: "Review" }).click();
  await phonePage.getByRole("button", { name: "Submit Ballot" }).click();
  await expect(phonePage.getByText("Saved revision 2.")).toBeVisible();

  await phonePage.reload({ waitUntil: "domcontentloaded" });
  await expect(phonePage.getByText("Ballot Saved")).toBeVisible({ timeout: 7000 });
  await expect(phonePage.getByText("Loaded saved revision 2.")).toBeVisible();
  await expect(phonePage.getByText("Server-confirmed timestamp:")).toBeVisible();

  const duplicatePhonePage = await browser.newPage();
  await duplicatePhonePage.goto(new URL("/vote", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await duplicatePhonePage
    .getByLabel("Select your start.gg username")
    .selectOption({ label: "Alpha" });
  await expect(
    duplicatePhonePage.getByText("A ballot already exists for this start.gg username"),
  ).toBeVisible({ timeout: 7000 });
  await duplicatePhonePage.close();

  await page.getByRole("button", { name: "Close Voting" }).click();
  await expect(page.getByText("voting closed")).toBeVisible();
  await expect(phonePage.getByText("Voting is closed.")).toBeVisible({ timeout: 7000 });
  await expect(phonePage.getByText("Results are being revealed on stage.")).toBeVisible();
  await page.getByRole("button", { name: "Compute Results" }).click();
  await expect(page.getByText("results computed")).toBeVisible();
  await expectAdminRevealPhase(page, "computed");

  await advanceRevealAndWaitForAdminPhase(page, "set 1 counts");
  await advanceRevealAndWaitForAdminPhase(page, "set 1 resolved");
  await waitForVisibleTiebreakReveal(stagePage, 1);
  await advanceRevealAndWaitForAdminPhase(page, "set 2 counts");
  await expect(stagePage.locator("header").getByText("Set 2 counts")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expectNoStageVerticalScroll(stagePage);
  await advanceRevealAndWaitForAdminPhase(page, "set 2 resolved");
  await waitForVisibleTiebreakReveal(stagePage, 1);
  await expectNoStageVerticalScroll(stagePage);
  const privateCsvDownloadPromise = page.waitForEvent("download");
  await advanceRevealAndWaitForAdminPhase(page, "final");
  const privateCsvDownload = await privateCsvDownloadPromise;

  expect(privateCsvDownload.suggestedFilename()).toBe("round-1-private-ballots.csv");

  await expect(
    page
      .locator("section", { hasText: "Result Reveal Controls" })
      .getByText("final", { exact: true }),
  ).toBeVisible();
  await expect(stagePage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible({
    timeout: 7000,
  });
  await expect(chartsPage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible({
    timeout: 7000,
  });
  await expectRenderedRealStageImage(chartsPage);
  await chartsPage.close();
  await expect(phonePage.getByText("Full ban counts")).toBeVisible({ timeout: 7000 });
  await expectRenderedRealBackgroundImage(phonePage.getByTestId("phone-final-chart-card").first());

  await goto(page, "/stage");
  await expect(page.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible();
  const finalStageCards = page
    .getByTestId("stage-final-chart-list")
    .getByTestId("stage-chart-card");
  await expect(finalStageCards).toHaveCount(2);
  expect((await finalStageCards.first().boundingBox())?.height).toBeGreaterThan(300);
  expect((await finalStageCards.nth(1).boundingBox())?.height).toBeGreaterThan(300);
  await expectRenderedRealStageImage(page);

  await goto(page, "/charts");
  await expect(page.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible();
  await expectRenderedRealStageImage(page);

  await goto(page, "/results");
  await expect(page.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible();
  await expectRenderedRealStageImage(page);

  await goto(page, "/vote");
  await expect(page.getByText("Full ban counts")).toBeVisible();

  await goto(page, "/coolguy69");
  const downloadButton = page.getByRole("button", { name: "Download private ballot CSV" });
  await expect(downloadButton).toBeEnabled();
  await downloadButton.click();
  await expect(page.getByText("Downloaded round-1-private-ballots.csv.")).toBeVisible();
});

test("stage tiebreak wheel hides the winner until the five-second reveal completes", async ({
  page,
}) => {
  await loginAndTakeHost(page);
  await page
    .locator("form", { has: page.getByRole("button", { name: "Start Rehearsal" }) })
    .getByPlaceholder("Admin password")
    .fill(ADMIN_PASSWORD);
  await page
    .locator("form", { has: page.getByRole("button", { name: "Start Rehearsal" }) })
    .getByPlaceholder("Audit reason")
    .fill("e2e rehearsal tiebreak");
  await page.getByRole("button", { name: "Start Rehearsal" }).click();
  await expect(page.getByText("Rehearsal mode")).toBeVisible();

  const stagePage = await page.context().newPage();
  await goto(stagePage, "/stage");

  await page.getByRole("button", { name: "Draw Set" }).nth(0).click();
  await page.getByRole("button", { name: "Draw Set" }).nth(1).click();
  await expectStageRows(stagePage);
  await expectRenderedRealStageImage(stagePage);

  const seedTiebreakForm = page.locator("form", {
    has: page.getByRole("button", { name: "Seed Tiebreak" }),
  });
  await seedTiebreakForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await seedTiebreakForm.getByPlaceholder("Audit reason").fill("e2e forced tiebreak");
  await page.getByRole("button", { name: "Seed Tiebreak" }).click();
  await page.getByRole("button", { name: "Close Voting" }).click();
  await expect(page.getByText("voting closed")).toBeVisible();
  await page.getByRole("button", { name: "Compute Results" }).click();
  await expect(page.getByText("results computed")).toBeVisible();
  await expectAdminRevealPhase(page, "computed");
  await advanceRevealAndWaitForAdminPhase(page, "set 1 counts");
  await page.getByRole("button", { name: "Next Reveal Step" }).click();

  await expect(stagePage.getByTestId("rune-wheel")).toHaveAttribute(
    "data-winner-revealed",
    "false",
    {
      timeout: 7_000,
    },
  );
  await expect(stagePage.getByTestId("rune-wheel-slot")).toHaveCount(12);
  await expect(stagePage.getByTestId("rune-wheel")).not.toContainText("Sealed rune");
  await expect(stagePage.getByTestId("rune-wheel-status")).toHaveText(
    "Backend winner sealed. Reveal in progress.",
  );
  await expect(stagePage.getByTestId("result-selected-label")).toHaveCount(0);

  await expect(stagePage.getByTestId("rune-wheel")).toHaveAttribute(
    "data-winner-revealed",
    "true",
    {
      timeout: 8_000,
    },
  );
  await expect(stagePage.getByTestId("rune-wheel-status")).toContainText(
    "Backend winner revealed:",
  );
  await expect(stagePage.getByTestId("result-selected-label")).toHaveCount(1);
});
