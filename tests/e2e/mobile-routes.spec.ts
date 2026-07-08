import { expect, test, type Locator, type Page } from "@playwright/test";
import { captureEvidenceScreenshot, writeJsonEvidence } from "./evidence-artifacts";
import {
  getAdminPassword,
  goto,
  HOSTED_REFRESH_TIMEOUT_MS,
  clickAdminActionAndWait,
  loginAndTakeHost,
  openRehearsalControls,
} from "./admin-helpers";

test.describe.configure({ mode: "serial" });

const ADMIN_PASSWORD = getAdminPassword();

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(4);
}

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();

  expect(box, `${label} should be visible for touch-target measurement`).not.toBeNull();
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
}

async function expectNoVagueSkipAction(page: Page) {
  await expect(page.getByRole("button", { name: /skip/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /skip/i })).toHaveCount(0);
  await expect(page.getByText(/skip/i)).toHaveCount(0);
}

async function expectBanInstructionThenBallotCards(page: Page) {
  const popin = page.getByTestId("ban-instruction-popin");
  const cards = page.getByTestId("ballot-chart-card");

  await expect(popin).toContainText("Please ban up to two charts");
  await expect(popin).toHaveAttribute("data-controls-paused", "true");
  await expect(cards.first()).toBeDisabled();
  await expect(popin).toHaveAttribute("data-controls-paused", "false", { timeout: 4_000 });
  await expect(popin).toBeHidden({ timeout: 5_000 });
  await expect(cards).toHaveCount(7);
}

async function confirmSelectedVoter(page: Page, playerName: string) {
  const confirmButton = page.getByRole("button", { name: "Confirm" });

  await expect(confirmButton).toBeDisabled();
  await page.getByLabel(`I confirm that I am ${playerName}`).check();
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
  await expectBanInstructionThenBallotCards(page);
}

async function expectCenteredSeventhCard(page: Page) {
  const viewport = page.viewportSize();
  const cards = page.getByTestId("ballot-chart-card");
  const sixthBox = await cards.nth(5).boundingBox();
  const seventhBox = await cards.nth(6).boundingBox();
  const noBansBox = await page.getByTestId("no-bans-choice").boundingBox();

  expect(viewport).not.toBeNull();
  expect(sixthBox).not.toBeNull();
  expect(seventhBox).not.toBeNull();
  expect(noBansBox).not.toBeNull();
  expect(seventhBox!.y).toBeGreaterThan(sixthBox!.y);
  expect(Math.abs(seventhBox!.y - noBansBox!.y)).toBeLessThanOrEqual(2);
  expect(noBansBox!.x).toBeGreaterThan(seventhBox!.x);
  expect(noBansBox!.x + noBansBox!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(seventhBox!.width).toBeGreaterThan(120);
}

function intersectionArea(
  left: { height: number; width: number; x: number; y: number },
  right: { height: number; width: number; x: number; y: number },
) {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );

  return width * height;
}

async function collectMobileBallotGeometry(page: Page) {
  const viewport = page.viewportSize();
  const cards = page.getByTestId("ballot-chart-card");
  const noBansBox = await page.getByTestId("no-bans-choice").boundingBox();
  const cardBoxes = [];

  expect(noBansBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(noBansBox!.y + noBansBox!.height).toBeLessThanOrEqual(viewport!.height);

  for (let index = 0; index < (await cards.count()); index += 1) {
    const box = await cards.nth(index).boundingBox();

    expect(box).not.toBeNull();
    cardBoxes.push({
      height: Math.round(box!.height * 100) / 100,
      index,
      width: Math.round(box!.width * 100) / 100,
      x: Math.round(box!.x * 100) / 100,
      y: Math.round(box!.y * 100) / 100,
    });
  }

  for (let leftIndex = 0; leftIndex < cardBoxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < cardBoxes.length; rightIndex += 1) {
      expect(intersectionArea(cardBoxes[leftIndex]!, cardBoxes[rightIndex]!)).toBeLessThanOrEqual(
        1,
      );
    }
  }

  return {
    cardBoxes,
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
    noBansBox: {
      height: Math.round(noBansBox!.height * 100) / 100,
      width: Math.round(noBansBox!.width * 100) / 100,
      x: Math.round(noBansBox!.x * 100) / 100,
      y: Math.round(noBansBox!.y * 100) / 100,
    },
    projectViewport: viewport,
  };
}

async function expectVisibleCardMetadata(scope: Locator, expectedCount: number) {
  const images = scope.getByTestId("stage-chart-image");
  const titles = scope.getByTestId("chart-card-title");
  const artists = scope.getByTestId("chart-card-artist");

  await expect(images).toHaveCount(expectedCount);
  await expect(titles).toHaveCount(expectedCount);
  await expect(artists).toHaveCount(expectedCount);

  await expect
    .poll(async () =>
      images.evaluateAll((elements) =>
        elements.every((element) => (element as HTMLImageElement).naturalWidth > 0),
      ),
    )
    .toBe(true);

  for (const locator of [titles, artists]) {
    const boxes = await locator.evaluateAll((elements) =>
      elements.map((element) => {
        const style = window.getComputedStyle(element);

        return {
          clientWidth: element.clientWidth,
          fontSize: Number.parseFloat(style.fontSize),
          scrollWidth: element.scrollWidth,
          text: element.textContent?.trim() ?? "",
        };
      }),
    );

    for (const box of boxes) {
      expect(box.text.length).toBeGreaterThan(0);
      expect(box.fontSize).toBeGreaterThanOrEqual(12);
      expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 2);
    }
  }
}

async function startRehearsalMode(page: Page) {
  await openRehearsalControls(page);
  const rehearsalForm = page
    .getByTestId("admin-rehearsal-controls")
    .locator("form", { has: page.getByRole("button", { name: "Start Rehearsal" }) })
    .first();

  await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await rehearsalForm.getByPlaceholder("Audit reason").fill("mobile route e2e reset");
  await clickAdminActionAndWait(
    page,
    rehearsalForm.getByRole("button", { name: "Start Rehearsal" }),
  );
  await expect(page.getByText("Rehearsal mode", { exact: true }).first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function drawFirstSet(page: Page) {
  await clickAdminActionAndWait(
    page,
    page.getByTestId("admin-host-run-controls").getByRole("button", { name: "Draw Set" }).nth(0),
  );
  await expect(page.getByText(/Version 1/).first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function drawSecondSet(page: Page) {
  await clickAdminActionAndWait(
    page,
    page.getByTestId("admin-host-run-controls").getByRole("button", { name: "Draw Set" }).nth(1),
  );
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("ready to vote", { exact: true }),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
}

async function openVoting(page: Page) {
  await clickAdminActionAndWait(
    page,
    page
      .getByTestId("admin-host-run-controls")
      .getByRole("button", { name: "Open Voting", exact: true }),
  );
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("voting open", { exact: true }),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
}

async function drawBothSetsAndOpenVoting(page: Page) {
  await drawFirstSet(page);
  await drawSecondSet(page);
  await openVoting(page);
}

async function expectNoInternalPublicCopy(page: Page) {
  await expect(
    page.getByText(/rerolled|invalidated|result computation|committed result snapshot|snapshot/i),
  ).toHaveCount(0);
}

test("mobile routes cover room, charts, vote, and pre-reveal results", async ({
  page,
}, testInfo) => {
  const publicOnlyWebKitRun = testInfo.project.name === "mobile-webkit";
  const voterName = publicOnlyWebKitRun ? "Rehearsal Player 02" : "Rehearsal Player 01";

  if (!publicOnlyWebKitRun) {
    await loginAndTakeHost(page, "mobile route e2e takeover");
    await expect(page).toHaveTitle("Host Console | Pump It Up Open Stage");
    await startRehearsalMode(page);
    const phase4EvidencePage = await page.context().newPage();

    await phase4EvidencePage.setViewportSize({ width: 390, height: 844 });
    await goto(phase4EvidencePage, "/room");
    await expect(phase4EvidencePage).toHaveTitle("Tournament Room | Pump It Up Open Stage");
    await expect(phase4EvidencePage.getByTestId("room-current-status")).toContainText(
      "Round 1 awaiting draw",
    );
    await captureEvidenceScreenshot(
      testInfo,
      "uxr-012-mobile-room-awaiting-draw.png",
      phase4EvidencePage,
    );
    await expect(phase4EvidencePage.getByTestId("room-auto-refresh")).toHaveAttribute(
      "data-refresh-enabled",
      "true",
    );
    await drawFirstSet(page);
    await phase4EvidencePage.evaluate(() => {
      window.sessionStorage.setItem("bite-open-card-draw:view-only-active-set", "1");
    });
    await goto(phase4EvidencePage, "/charts");
    await expect(phase4EvidencePage).toHaveTitle("View Charts | Pump It Up Open Stage");
    await expect(phase4EvidencePage.getByTestId("view-only-status")).toContainText(
      "One chart set drawn",
    );
    await expect(phase4EvidencePage.getByTestId("view-only-status")).toContainText(
      "The drawn chart set is visible now",
    );
    await expect(phase4EvidencePage.getByTestId("view-only-navigation-note")).toContainText(
      "No votes are recorded here",
    );
    await expect(phase4EvidencePage.getByTestId("stage-set-row").nth(0)).toContainText(
      "Draw complete",
    );
    await expect(phase4EvidencePage.getByTestId("stage-set-row").nth(0)).toBeVisible();
    await expect(phase4EvidencePage.getByTestId("stage-set-row").nth(1)).toBeHidden();
    await expect(phase4EvidencePage.getByRole("tab", { name: /View Set 2/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expectNoInternalPublicCopy(phase4EvidencePage);
    await captureEvidenceScreenshot(
      testInfo,
      "uxr-018-mobile-charts-one-set-drawn.png",
      phase4EvidencePage,
    );
    await phase4EvidencePage.close();
    await drawSecondSet(page);
    await openVoting(page);
  } else {
    await goto(page, "/charts");
    const statusText = (await page.getByTestId("view-only-status").textContent()) ?? "";

    if (!statusText.includes("Voting open")) {
      await loginAndTakeHost(page, "mobile route e2e takeover");
      await startRehearsalMode(page);
      await drawBothSetsAndOpenVoting(page);
    }
  }

  await goto(page, "/room");
  await expect(page).toHaveTitle("Tournament Room | Pump It Up Open Stage");
  await expect(page.getByTestId("room-current-status")).toContainText("Current tournament state");
  await expect(page.getByTestId("room-current-status")).toContainText("Round 1 voting open");
  await expect(page.getByRole("link", { name: "I am a player voting" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View charts only" })).toBeVisible();
  await expectTouchTarget(
    page.getByRole("link", { name: "I am a player voting" }),
    "room vote link",
  );
  await expectTouchTarget(page.getByRole("link", { name: "View charts only" }), "room charts link");
  await expectNoHorizontalOverflow(page);
  await expectNoInternalPublicCopy(page);

  await goto(page, "/charts");
  await expect(page).toHaveTitle("View Charts | Pump It Up Open Stage");
  await expect(page.getByTestId("view-only-status")).toContainText("View-only chart browser");
  await expect(page.getByTestId("view-only-status")).toContainText("Voting open");
  await expect(page.getByTestId("view-only-navigation-note")).toContainText(
    "No votes are recorded here",
  );
  await expect(page.getByRole("tab", { name: /View Set 1/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /View Set 2/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /View Set 1/ })).toHaveAttribute(
    "href",
    /#view-only-set-1$/,
  );
  await expect(page.getByRole("tab", { name: /View Set 2/ })).toHaveAttribute(
    "href",
    /#view-only-set-2$/,
  );
  await expectTouchTarget(page.getByRole("tab", { name: /View Set 1/ }), "charts set 1 tab");
  await expectTouchTarget(page.getByRole("tab", { name: /View Set 2/ }), "charts set 2 tab");
  await expect(page.getByTestId("stage-set-row").nth(0)).toBeVisible();
  await expect(page.getByTestId("stage-set-row").nth(1)).toBeHidden();
  await expectVisibleCardMetadata(page.getByTestId("stage-set-row").nth(0), 7);
  await captureEvidenceScreenshot(
    testInfo,
    `uxr-003-${testInfo.project.name}-mobile-charts-set-1.png`,
    page,
  );
  await page.getByRole("tab", { name: /View Set 2/ }).click();
  await expect(page.getByTestId("stage-set-row").nth(1)).toBeVisible();
  await expectVisibleCardMetadata(page.getByTestId("stage-set-row").nth(1), 7);
  await captureEvidenceScreenshot(
    testInfo,
    `uxr-003-${testInfo.project.name}-mobile-charts-set-2.png`,
    page,
  );
  await expect(page.getByLabel("Select your start.gg username")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit Ballot" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectNoInternalPublicCopy(page);

  await goto(page, "/vote");
  await expect(page).toHaveTitle("Player Voting | Pump It Up Open Stage");
  await expectNoVagueSkipAction(page);
  await expectNoInternalPublicCopy(page);
  await page.getByLabel("Select your start.gg username").selectOption({
    label: voterName,
  });
  await expect(page.getByText(`Are you sure you are voting as ${voterName}?`)).toBeVisible();
  await expectTouchTarget(page.getByRole("button", { name: "Confirm" }), "confirm button");
  await expectTouchTarget(
    page.getByTestId("identity-confirmation-checkbox"),
    "identity confirmation",
  );
  await confirmSelectedVoter(page, voterName);
  await expectNoVagueSkipAction(page);
  await expectCenteredSeventhCard(page);
  await expect(page.getByRole("button", { name: /skip/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /skip/i })).toHaveCount(0);
  await expect(page.getByText(/^skip$/i)).toHaveCount(0);
  await expect(page.getByLabel("No bans for this set")).toBeVisible();
  await expectTouchTarget(page.getByTestId("no-bans-choice"), "no-bans choice");
  await expectTouchTarget(page.getByRole("button", { name: "Next", exact: true }), "next button");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  const ballotGeometry = await collectMobileBallotGeometry(page);

  await captureEvidenceScreenshot(
    testInfo,
    `pfr-${testInfo.project.name}-mobile-vote-ballot.png`,
    page,
  );
  await writeJsonEvidence(
    testInfo,
    `pfr-${testInfo.project.name}-mobile-vote-ballot-geometry.json`,
    {
      ...ballotGeometry,
      project: testInfo.project.name,
    },
  );

  await page.getByLabel("No bans for this set").check();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await page.getByTestId("ballot-chart-card").first().click();
  await expect(page.getByLabel("No bans for this set")).not.toBeChecked();
  await expect(page.getByTestId("ban-selection-counter")).toHaveText("1/2 bans selected");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("No bans for this set").check();
  await expectTouchTarget(page.getByRole("button", { name: "Review" }), "review button");
  await page.getByRole("button", { name: "Review" }).click();
  await expectTouchTarget(page.getByRole("button", { name: "Submit Ballot" }), "submit button");
  await page.getByRole("button", { name: "Submit Ballot" }).click();
  await expect(page.getByText("Ballot successfully submitted.")).toBeVisible();
  await expectTouchTarget(page.getByRole("button", { name: "Edit S16" }), "saved edit S16");
  await expectTouchTarget(page.getByRole("button", { name: "Edit S17" }), "saved edit S17");

  await goto(page, "/results");
  await expect(page).toHaveTitle("Results | Pump It Up Open Stage");
  await expect(page.getByRole("heading", { name: "Round 1 Results" })).toBeVisible();
  await expect(page.getByTestId("current-round-results-pending")).toContainText("Current Round 1");
  await expectNoInternalPublicCopy(page);
  await captureEvidenceScreenshot(
    testInfo,
    `uxr-019-${testInfo.project.name}-mobile-results-pending.png`,
    page,
  );
  await expectNoHorizontalOverflow(page);
});
