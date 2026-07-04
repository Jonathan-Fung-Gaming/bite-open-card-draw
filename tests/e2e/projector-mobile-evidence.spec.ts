import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { captureEvidenceScreenshot, writeJsonEvidence } from "./evidence-artifacts";
import {
  clickAdminActionAndWait,
  getAdminPassword,
  goto,
  HOSTED_REFRESH_TIMEOUT_MS,
  loginAndTakeHost,
  openRehearsalControls,
} from "./admin-helpers";

test.describe.configure({ mode: "serial" });

const ADMIN_PASSWORD = getAdminPassword();
const PROJECTOR_VIEWPORTS = [
  { height: 720, name: "1280x720", width: 1280 },
  { height: 768, name: "1366x768", width: 1366 },
  { height: 1080, name: "1920x1080", width: 1920 },
] as const;
const MOBILE_VOTE_VIEWPORT = { height: 844, name: "390x844", width: 390 } as const;
const STAGE_QR_MIN_SIZE_PX = 176;
const STAGE_TITLE_MIN_FONT_SIZE_PX = 12;

type EvidenceBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

function toEvidenceBox(box: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>): EvidenceBox {
  return {
    height: Math.round(box.height * 100) / 100,
    width: Math.round(box.width * 100) / 100,
    x: Math.round(box.x * 100) / 100,
    y: Math.round(box.y * 100) / 100,
  };
}

function intersectionArea(left: EvidenceBox, right: EvidenceBox) {
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

async function collectLocatorBoxes(locator: Locator) {
  const boxes: Array<EvidenceBox & { index: number }> = [];

  for (let index = 0; index < (await locator.count()); index += 1) {
    const box = await locator.nth(index).boundingBox();

    expect(box).not.toBeNull();
    boxes.push({ index, ...toEvidenceBox(box!) });
  }

  return boxes;
}

function expectNoBoxOverlap(boxes: Array<EvidenceBox & { index: number }>, label: string) {
  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const left = boxes[leftIndex]!;
      const right = boxes[rightIndex]!;

      expect(
        intersectionArea(left, right),
        `${label} ${left.index} should not overlap ${label} ${right.index}`,
      ).toBeLessThanOrEqual(1);
    }
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(4);
}

async function expectNoVerticalOverflow(page: Page) {
  const viewport = page.viewportSize();

  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) -
            window.innerHeight,
        ),
      {
        message: `Expected no vertical overflow for ${viewport?.width ?? "unknown"}x${
          viewport?.height ?? "unknown"
        } projector viewport`,
      },
    )
    .toBeLessThanOrEqual(4);
}

async function expectStageImagesRendered(page: Page) {
  const images = page.getByTestId("stage-chart-image");

  await expect(images).toHaveCount(14);
  await expect
    .poll(async () =>
      images.evaluateAll((elements) =>
        elements.every((element) => (element as HTMLImageElement).naturalWidth > 0),
      ),
    )
    .toBe(true);
}

async function expectStageTitlesReadable(page: Page) {
  const titles = page.getByTestId("stage-chart-title");

  await expect(titles).toHaveCount(14);

  const titleEvidence = await titles.evaluateAll((elements) =>
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

  for (const title of titleEvidence) {
    expect(title.text.length).toBeGreaterThan(0);
    expect(title.fontSize).toBeGreaterThanOrEqual(STAGE_TITLE_MIN_FONT_SIZE_PX);
    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth + 2);
  }
}

async function collectStageViewportGeometry(page: Page) {
  const viewport = page.viewportSize();
  const rows = page.getByTestId("stage-set-row");
  const cardRows = page.getByTestId("stage-set-card-row");
  const qrPanel = page.getByTestId("room-qr-panel");
  const qr = page.getByTestId("room-qr-link");
  const timer = page.getByTestId("stage-countdown-display");
  const votingBand = page.getByTestId("stage-voting-band");
  const chartRows = page.getByTestId("stage-chart-rows");
  const rowEvidence = [];

  expect(viewport).not.toBeNull();
  await expect(rows).toHaveCount(2);
  await expect(cardRows).toHaveCount(2);
  await expect(page.locator('[data-testid="stage-chart-card"][data-has-chart="true"]')).toHaveCount(
    14,
    { timeout: 35_000 },
  );
  await expectStageImagesRendered(page);
  await expectStageTitlesReadable(page);
  await expectNoHorizontalOverflow(page);
  await expectNoVerticalOverflow(page);

  for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
    const row = rows.nth(rowIndex);
    const cards = row.getByTestId("stage-chart-card");
    const cardBoxes = await collectLocatorBoxes(cards);
    const rowBox = await row.boundingBox();

    expect(rowBox).not.toBeNull();
    await expect(cards).toHaveCount(7);
    expectNoBoxOverlap(cardBoxes, `projector row ${rowIndex + 1} card`);
    expect(
      Math.max(...cardBoxes.map((box) => box.y)) - Math.min(...cardBoxes.map((box) => box.y)),
    ).toBeLessThanOrEqual(2);

    for (const card of cardBoxes) {
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(viewport!.width + 1);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.y + card.height).toBeLessThanOrEqual(viewport!.height + 1);
    }

    rowEvidence.push({
      box: toEvidenceBox(rowBox!),
      cards: cardBoxes,
      setOrder: await row.getAttribute("data-set-order"),
    });
  }

  const qrBox = await qr.boundingBox();
  const qrPanelBox = await qrPanel.boundingBox();
  const timerBox = await timer.boundingBox();
  const votingBandBox = await votingBand.boundingBox();
  const chartRowsBox = await chartRows.boundingBox();

  expect(qrBox).not.toBeNull();
  expect(qrPanelBox).not.toBeNull();
  expect(timerBox).not.toBeNull();
  expect(votingBandBox).not.toBeNull();
  expect(chartRowsBox).not.toBeNull();
  expect(qrBox!.width).toBeGreaterThanOrEqual(STAGE_QR_MIN_SIZE_PX);
  expect(qrBox!.height).toBeGreaterThanOrEqual(STAGE_QR_MIN_SIZE_PX);
  expect(
    Math.abs(qrBox!.x + qrBox!.width / 2 - (qrPanelBox!.x + qrPanelBox!.width / 2)),
  ).toBeLessThanOrEqual(4);
  expect(timerBox!.width).toBeGreaterThan(160);
  expect(timerBox!.height).toBeGreaterThanOrEqual(60);
  expect(intersectionArea(toEvidenceBox(qrBox!), toEvidenceBox(timerBox!))).toBeLessThanOrEqual(1);
  expect(votingBandBox!.y + votingBandBox!.height).toBeLessThanOrEqual(chartRowsBox!.y + 1);

  const qrTarget = await qr.getAttribute("data-qr-target");

  expect(qrTarget).toBeTruthy();
  expect(new URL(qrTarget!).pathname).toBe("/room");
  await expect(qr).not.toHaveAttribute("href", /.+/);
  await expect(page.getByTestId("stage-countdown-display")).toHaveText(/\d{2}:\d{2}/);

  return {
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
    regions: {
      chartRows: toEvidenceBox(chartRowsBox!),
      qrPanel: toEvidenceBox(qrPanelBox!),
      qr: toEvidenceBox(qrBox!),
      timer: toEvidenceBox(timerBox!),
      votingBand: toEvidenceBox(votingBandBox!),
    },
    route: "/stage",
    rows: rowEvidence,
    verticalOverflow: await page.evaluate(
      () =>
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) -
        window.innerHeight,
    ),
    viewport,
  };
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

async function collectMobileVoteGeometry(page: Page) {
  const viewport = page.viewportSize();
  const cards = await collectLocatorBoxes(page.getByTestId("ballot-chart-card"));

  expect(viewport).not.toBeNull();
  expect(cards).toHaveLength(7);
  expectNoBoxOverlap(cards, "mobile ballot card");

  for (const card of cards) {
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(viewport!.width + 1);
  }

  await expectNoHorizontalOverflow(page);
  await expectCenteredSeventhCard(page);

  return {
    cards,
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
    route: "/vote",
    viewport,
  };
}

async function startRehearsalMode(page: Page) {
  await openRehearsalControls(page);
  const rehearsalForm = page.locator("form", {
    has: page.getByRole("button", { name: "Start Rehearsal" }),
  });

  await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await rehearsalForm.getByPlaceholder("Audit reason").fill("PFR-031 viewport evidence reset");
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Start Rehearsal" }));
  await expect(page.getByText("Rehearsal mode", { exact: true }).first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function drawBothSetsAndOpenVoting(page: Page) {
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Draw Set" }).nth(0));
  await expect(page.getByText(/Version 1/).first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Draw Set" }).nth(1));
  await expect(page.getByText("ready to vote")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await clickAdminActionAndWait(
    page,
    page.getByRole("button", { name: "Open Voting", exact: true }),
  );
  await expect(page.getByText("voting open")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function resetRehearsalMode(page: Page) {
  await goto(page, "/coolguy69");

  const resetButton = page.getByRole("button", { name: "Reset Rehearsal" });

  if ((await resetButton.count()) > 0 && (await resetButton.isEnabled().catch(() => false))) {
    const resetForm = page.locator("form", { has: resetButton });

    await resetForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
    await resetForm.getByPlaceholder("Audit reason").fill("PFR-031 viewport evidence cleanup");
    await clickAdminActionAndWait(page, resetButton);
  }

  const releaseButton = page.getByRole("button", { name: "Release" });

  if ((await releaseButton.count()) > 0 && (await releaseButton.isEnabled().catch(() => false))) {
    await clickAdminActionAndWait(page, releaseButton);
  }
}

async function captureProjectorEvidence(browser: Browser, baseURL: string, testInfo: TestInfo) {
  for (const viewport of PROJECTOR_VIEWPORTS) {
    const context = await browser.newContext({
      baseURL,
      viewport: { height: viewport.height, width: viewport.width },
    });
    const stagePage = await context.newPage();

    try {
      await goto(stagePage, "/stage");
      await expect(stagePage.locator("header").getByText("Voting open")).toBeVisible({
        timeout: HOSTED_REFRESH_TIMEOUT_MS,
      });

      const geometry = await collectStageViewportGeometry(stagePage);
      const artifactStem = `pfr-031-stage-${viewport.name}-voting`;

      await captureEvidenceScreenshot(testInfo, `${artifactStem}.png`, stagePage);
      await writeJsonEvidence(testInfo, `${artifactStem}-geometry.json`, {
        ...geometry,
        pfr: "PFR-031",
        project: testInfo.project.name,
        viewportName: viewport.name,
      });
    } finally {
      await context.close();
    }
  }
}

async function captureMobileVoteEvidence(browser: Browser, baseURL: string, testInfo: TestInfo) {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    viewport: { height: MOBILE_VOTE_VIEWPORT.height, width: MOBILE_VOTE_VIEWPORT.width },
  });
  const votePage = await context.newPage();

  try {
    await goto(votePage, "/vote");
    await votePage.getByLabel("Select your start.gg username").selectOption({
      label: "Rehearsal Player 01",
    });
    await expect(
      votePage.getByText("Are you sure you are voting as Rehearsal Player 01?"),
    ).toBeVisible();
    await votePage.getByRole("button", { name: "Confirm" }).click();
    await expect(votePage.getByTestId("ballot-chart-card")).toHaveCount(7);

    const geometry = await collectMobileVoteGeometry(votePage);
    const artifactStem = `pfr-031-mobile-vote-${MOBILE_VOTE_VIEWPORT.name}-ballot`;

    await captureEvidenceScreenshot(testInfo, `${artifactStem}.png`, votePage);
    await writeJsonEvidence(testInfo, `${artifactStem}-geometry.json`, {
      ...geometry,
      pfr: "PFR-031",
      project: testInfo.project.name,
      viewportName: MOBILE_VOTE_VIEWPORT.name,
    });
  } finally {
    await context.close();
  }
}

test("PFR-031 captures common projector viewports and mobile vote layout", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(150_000);

  if (!baseURL) {
    throw new Error("Missing Playwright baseURL for PFR-031 visual evidence.");
  }

  try {
    await loginAndTakeHost(page, "PFR-031 viewport evidence takeover");
    await startRehearsalMode(page);
    await drawBothSetsAndOpenVoting(page);

    await captureProjectorEvidence(browser, baseURL, testInfo);
    await captureMobileVoteEvidence(browser, baseURL, testInfo);
  } finally {
    await resetRehearsalMode(page);
  }
});
