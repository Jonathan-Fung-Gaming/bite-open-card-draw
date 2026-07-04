import { execFileSync } from "node:child_process";
import {
  expect,
  type Browser,
  type Locator,
  type Page,
  type Response,
  type TestInfo,
} from "@playwright/test";
import { captureEvidenceScreenshot, writeJsonEvidence } from "../../e2e/evidence-artifacts";
import { VotePage } from "../pages/vote.page";
import { HOSTED_REFRESH_TIMEOUT_MS, goto } from "./phase9-env";

const FALLBACK_CHART_IMAGE_PATH = "/chart-images/fallback-card.svg";
const PROJECTOR_VIEWPORTS = [
  { height: 720, name: "1280x720", width: 1280 },
  { height: 768, name: "1366x768", width: 1366 },
  { height: 1080, name: "1920x1080", width: 1920 },
] as const;
const MOBILE_VOTE_VIEWPORT = { height: 844, name: "390x844", width: 390 } as const;
const STAGE_QR_MIN_SIZE_PX = 176;
const STAGE_CARD_MIN_HEIGHT_PX = 90;
const STAGE_TITLE_MIN_FONT_SIZE_PX = 14;
const STAGE_SECONDARY_MIN_FONT_SIZE_PX = 12;

type EvidenceBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type Phase11EvidenceOptions = {
  baseURL: string;
  browser: Browser;
  roundNumber: number;
  testInfo: TestInfo;
  votePlayerName: string;
};

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

function toEvidenceBox(box: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>): EvidenceBox {
  return {
    height: rounded(box.height),
    width: rounded(box.width),
    x: rounded(box.x),
    y: rounded(box.y),
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

function decodeUrl(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function evidenceMetadata(baseURL: string) {
  const sourceCommit = resolveSourceCommit();
  const deployedCommit =
    process.env.E2E_DEPLOYED_COMMIT_SHA ??
    (process.env.E2E_SERVER_MODE === "external" ? null : sourceCommit);

  return {
    backend: process.env.E2E_TOURNAMENT_STATE_BACKEND ?? process.env.TOURNAMENT_STATE_BACKEND,
    baseURL,
    deployedCommit,
    eventId: process.env.E2E_TOURNAMENT_EVENT_ID ?? process.env.TOURNAMENT_EVENT_ID,
    generatedAt: new Date().toISOString(),
    profile: process.env.E2E_PROFILE,
    serverMode: process.env.E2E_SERVER_MODE,
    sourceCommit,
  };
}

function resolveSourceCommit() {
  for (const value of [
    process.env.GITHUB_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.E2E_DEPLOYED_COMMIT_SHA,
  ]) {
    if (value) {
      return value;
    }
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function isEvidenceImageUrl(url: string) {
  const decodedUrl = decodeUrl(url);

  return decodedUrl.includes("/chart-images/") || decodedUrl.includes("tournament-logo");
}

async function collectImageResponses(page: Page, run: () => Promise<void>) {
  const responseReads: Promise<void>[] = [];
  const imageResponses: Array<{
    bodyBytes: number | null;
    contentType: string | null;
    decodedUrl: string;
    status: number;
    url: string;
  }> = [];
  const onResponse = (response: Response) => {
    if (!isEvidenceImageUrl(response.url())) {
      return;
    }

    responseReads.push(
      response
        .body()
        .then((body) => {
          imageResponses.push({
            bodyBytes: body.length,
            contentType: response.headers()["content-type"] ?? null,
            decodedUrl: decodeUrl(response.url()),
            status: response.status(),
            url: response.url(),
          });
        })
        .catch(() => {
          imageResponses.push({
            bodyBytes: null,
            contentType: response.headers()["content-type"] ?? null,
            decodedUrl: decodeUrl(response.url()),
            status: response.status(),
            url: response.url(),
          });
        }),
    );
  };

  page.on("response", onResponse);
  try {
    await run();
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    await Promise.all(responseReads);
    return imageResponses;
  } finally {
    page.off("response", onResponse);
  }
}

async function collectResourceEntries(page: Page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => {
        const decodedName = decodeURIComponent(entry.name);

        return decodedName.includes("/chart-images/") || decodedName.includes("tournament-logo");
      })
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;

        return {
          decodedName: decodeURIComponent(resource.name),
          durationMs: Math.round(resource.duration * 100) / 100,
          encodedBodySize: resource.encodedBodySize,
          initiatorType: resource.initiatorType,
          transferSize: resource.transferSize,
        };
      }),
  );
}

function pathnameFromEvidenceUrl(value: string, pageUrl: string) {
  return new URL(decodeUrl(value), pageUrl).pathname;
}

function expectLocalCachedChartPath(rawPath: string | null, pageUrl: string) {
  expect(rawPath).toBeTruthy();

  const pathname = pathnameFromEvidenceUrl(rawPath!, pageUrl);

  expect(pathname).toMatch(/^\/chart-images\/cache\/.+\.png$/);
  expect(pathname).not.toBe(FALLBACK_CHART_IMAGE_PATH);
}

function expectSuccessfulImageResponses(
  imageResponses: Awaited<ReturnType<typeof collectImageResponses>>,
) {
  expect(imageResponses.length).toBeGreaterThan(0);

  for (const response of imageResponses) {
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    expect(response.contentType ?? "").toMatch(/^image\//);
    expect(response.bodyBytes).not.toBeNull();
    expect(response.bodyBytes ?? 0).toBeGreaterThan(0);
  }
}

function expectChartImageLoadEvidence(options: {
  imagePaths: readonly string[];
  imageResponses: Awaited<ReturnType<typeof collectImageResponses>>;
  pageUrl: string;
  resourceEntries: Awaited<ReturnType<typeof collectResourceEntries>>;
}) {
  const expectedPathnames = options.imagePaths.map((imagePath) =>
    pathnameFromEvidenceUrl(imagePath, options.pageUrl),
  );
  const responsePathnames = new Set(
    options.imageResponses
      .filter((response) => response.status >= 200 && response.status < 300)
      .map((response) => pathnameFromEvidenceUrl(response.decodedUrl, options.pageUrl)),
  );
  const resourcePathnames = new Set(
    options.resourceEntries
      .filter((entry) => entry.encodedBodySize > 0 || entry.transferSize > 0)
      .map((entry) => pathnameFromEvidenceUrl(entry.decodedName, options.pageUrl)),
  );

  for (const pathname of expectedPathnames) {
    expect(
      responsePathnames.has(pathname) || resourcePathnames.has(pathname),
      `${pathname} should have successful image response or resource timing evidence`,
    ).toBe(true);
  }
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

async function collectReadableTextEvidence(
  locator: Locator,
  minimumFontSizePx: number,
  label: string,
) {
  const evidence = await locator.evaluateAll((elements) =>
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

  for (const item of evidence) {
    expect(item.text.length, `${label} should have visible text`).toBeGreaterThan(0);
    expect(item.fontSize, `${label} font size`).toBeGreaterThanOrEqual(minimumFontSizePx);
    expect(item.scrollWidth, `${label} should not clip horizontally`).toBeLessThanOrEqual(
      item.clientWidth + 2,
    );
  }

  return evidence;
}

async function collectStageTextEvidence(page: Page) {
  const titles = page.getByTestId("stage-chart-title");
  const artists = page.getByTestId("stage-chart-artist");
  const difficulties = page.getByTestId("stage-chart-difficulty");

  await expect(titles).toHaveCount(14);
  await expect(artists).toHaveCount(14);
  await expect(difficulties).toHaveCount(14);

  return {
    artists: await collectReadableTextEvidence(
      artists,
      STAGE_SECONDARY_MIN_FONT_SIZE_PX,
      "stage artist",
    ),
    difficulties: await collectReadableTextEvidence(
      difficulties,
      STAGE_SECONDARY_MIN_FONT_SIZE_PX,
      "stage difficulty",
    ),
    titles: await collectReadableTextEvidence(titles, STAGE_TITLE_MIN_FONT_SIZE_PX, "stage title"),
  };
}

async function collectStageGeometry(page: Page) {
  const viewport = page.viewportSize();
  const rows = page.getByTestId("stage-set-row");
  const cardRows = page.getByTestId("stage-set-card-row");
  const qrPanel = page.getByTestId("room-qr-panel");
  const qr = page.getByTestId("room-qr-link");
  const timer = page.getByTestId("stage-countdown-display");
  const votingBand = page.getByTestId("stage-voting-band");
  const chartRows = page.getByTestId("stage-chart-rows");

  expect(viewport).not.toBeNull();
  await expect(rows).toHaveCount(2);
  await expect(cardRows).toHaveCount(2);
  await expect(page.locator('[data-testid="stage-chart-card"][data-has-chart="true"]')).toHaveCount(
    14,
    { timeout: HOSTED_REFRESH_TIMEOUT_MS },
  );
  await expectNoHorizontalOverflow(page);
  await expectNoVerticalOverflow(page);

  const images = page.getByTestId("stage-chart-image");

  await expect(images).toHaveCount(14);
  await expect
    .poll(async () =>
      images.evaluateAll((elements) =>
        elements.every((element) => (element as HTMLImageElement).naturalWidth > 0),
      ),
    )
    .toBe(true);

  const stageImagePaths = await images.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLImageElement).getAttribute("src")),
  );

  for (const imagePath of stageImagePaths) {
    expectLocalCachedChartPath(imagePath, page.url());
  }

  const rowEvidence = [];

  for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
    const row = rows.nth(rowIndex);
    const cards = row.getByTestId("stage-chart-card");
    const cardBoxes = await collectLocatorBoxes(cards);
    const rowBox = await row.boundingBox();

    expect(rowBox).not.toBeNull();
    await expect(cards).toHaveCount(7);
    expectNoBoxOverlap(cardBoxes, `phase 11 projector row ${rowIndex + 1} card`);
    expect(
      Math.max(...cardBoxes.map((box) => box.y)) - Math.min(...cardBoxes.map((box) => box.y)),
    ).toBeLessThanOrEqual(2);

    for (const card of cardBoxes) {
      expect(card.height).toBeGreaterThanOrEqual(STAGE_CARD_MIN_HEIGHT_PX);
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
  expect(intersectionArea(toEvidenceBox(qrBox!), toEvidenceBox(timerBox!))).toBeLessThanOrEqual(1);
  expect(votingBandBox!.y + votingBandBox!.height).toBeLessThanOrEqual(chartRowsBox!.y + 1);

  const qrTarget = await qr.getAttribute("data-qr-target");

  expect(qrTarget).toBeTruthy();
  expect(new URL(qrTarget!).pathname).toBe("/room");
  await expect(qr).not.toHaveAttribute("href", /.+/);

  return {
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
    imagePaths: stageImagePaths.map((imagePath) => decodeUrl(imagePath ?? "")),
    regions: {
      chartRows: toEvidenceBox(chartRowsBox!),
      qrPanel: toEvidenceBox(qrPanelBox!),
      qr: toEvidenceBox(qrBox!),
      timer: toEvidenceBox(timerBox!),
      votingBand: toEvidenceBox(votingBandBox!),
    },
    rows: rowEvidence,
    textEvidence: await collectStageTextEvidence(page),
    verticalOverflow: await page.evaluate(
      () =>
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) -
        window.innerHeight,
    ),
    viewport,
  };
}

async function collectStageEvidenceForViewport(options: {
  baseURL: string;
  browser: Browser;
  testInfo: TestInfo;
  viewport: (typeof PROJECTOR_VIEWPORTS)[number];
}) {
  const { baseURL, browser, testInfo, viewport } = options;
  const context = await browser.newContext({
    baseURL,
    viewport: { height: viewport.height, width: viewport.width },
  });
  const page = await context.newPage();

  try {
    const imageResponses = await collectImageResponses(page, async () => {
      await goto(page, baseURL, "/stage");
      await expect(page.locator("header").getByText("Voting open")).toBeVisible({
        timeout: HOSTED_REFRESH_TIMEOUT_MS,
      });
      await expect(page.getByTestId("stage-chart-image")).toHaveCount(14, {
        timeout: HOSTED_REFRESH_TIMEOUT_MS,
      });
    });
    const geometry = await collectStageGeometry(page);
    const resourceEntries = await collectResourceEntries(page);
    expectSuccessfulImageResponses(imageResponses);
    expectChartImageLoadEvidence({
      imagePaths: geometry.imagePaths,
      imageResponses,
      pageUrl: page.url(),
      resourceEntries,
    });
    const screenshot = await captureEvidenceScreenshot(
      testInfo,
      `phase11-stage-${viewport.name}-voting.png`,
      page,
    );

    return {
      geometry,
      imageResponses,
      resourceEntries,
      route: "/stage",
      screenshot,
      viewportName: viewport.name,
    };
  } finally {
    await context.close();
  }
}

async function collectMobileVoteGeometry(page: Page) {
  const viewport = page.viewportSize();
  const cards = await collectLocatorBoxes(page.getByTestId("ballot-chart-card"));
  const sixthBox = await page.getByTestId("ballot-chart-card").nth(5).boundingBox();
  const seventhBox = await page.getByTestId("ballot-chart-card").nth(6).boundingBox();
  const imagePaths = await page
    .getByTestId("ballot-chart-card")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-chart-image-path")),
    );

  expect(viewport).not.toBeNull();
  expect(cards).toHaveLength(7);
  expect(sixthBox).not.toBeNull();
  expect(seventhBox).not.toBeNull();
  expectNoBoxOverlap(cards, "phase 11 mobile ballot card");
  expect(seventhBox!.y).toBeGreaterThan(sixthBox!.y);
  expect(Math.abs(seventhBox!.x + seventhBox!.width / 2 - viewport!.width / 2)).toBeLessThanOrEqual(
    8,
  );

  for (const card of cards) {
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(viewport!.width + 1);
  }

  for (const imagePath of imagePaths) {
    expectLocalCachedChartPath(imagePath, page.url());
  }

  await expectNoHorizontalOverflow(page);

  return {
    cards,
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
    imagePaths: imagePaths.map((imagePath) => decodeUrl(imagePath ?? "")),
    viewport,
  };
}

async function collectMobileVoteEvidence(options: {
  baseURL: string;
  browser: Browser;
  testInfo: TestInfo;
  votePlayerName: string;
}) {
  const { baseURL, browser, testInfo, votePlayerName } = options;
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    viewport: { height: MOBILE_VOTE_VIEWPORT.height, width: MOBILE_VOTE_VIEWPORT.width },
  });
  const page = await context.newPage();
  const votePage = new VotePage(page, baseURL);

  try {
    const imageResponses = await collectImageResponses(page, async () => {
      await votePage.beginBallot({
        playerName: votePlayerName,
        waitForCardsAfterConfirm: true,
      });
    });
    const geometry = await collectMobileVoteGeometry(page);
    const resourceEntries = await collectResourceEntries(page);
    expectSuccessfulImageResponses(imageResponses);
    expectChartImageLoadEvidence({
      imagePaths: geometry.imagePaths,
      imageResponses,
      pageUrl: page.url(),
      resourceEntries,
    });
    const screenshot = await captureEvidenceScreenshot(
      testInfo,
      `phase11-mobile-vote-${MOBILE_VOTE_VIEWPORT.name}-ballot.png`,
      page,
    );

    return {
      geometry,
      imageResponses,
      resourceEntries,
      route: "/vote",
      screenshot,
      viewportName: MOBILE_VOTE_VIEWPORT.name,
    };
  } finally {
    await context.close();
  }
}

function expectNoRemoteChartArtwork(evidence: {
  mobileVote: Awaited<ReturnType<typeof collectMobileVoteEvidence>>;
  stage: Awaited<ReturnType<typeof collectStageEvidenceForViewport>>[];
}) {
  const allChartPaths = [
    ...evidence.mobileVote.geometry.imagePaths,
    ...evidence.stage.flatMap((stageEvidence) => stageEvidence.geometry.imagePaths),
  ];

  expect(allChartPaths.length).toBeGreaterThan(0);

  for (const imagePath of allChartPaths) {
    expect(imagePath).toContain("/chart-images/cache/");
    expect(imagePath).not.toContain(FALLBACK_CHART_IMAGE_PATH);
    expect(imagePath).not.toMatch(/^https?:\/\/(?![^/]+\/chart-images\/cache\/)/);
  }
}

export async function collectPhase11VisualEvidence(options: Phase11EvidenceOptions) {
  const stage = [];

  for (const viewport of PROJECTOR_VIEWPORTS) {
    stage.push(
      await collectStageEvidenceForViewport({
        baseURL: options.baseURL,
        browser: options.browser,
        testInfo: options.testInfo,
        viewport,
      }),
    );
  }

  const mobileVote = await collectMobileVoteEvidence({
    baseURL: options.baseURL,
    browser: options.browser,
    testInfo: options.testInfo,
    votePlayerName: options.votePlayerName,
  });
  const evidence = {
    metadata: evidenceMetadata(options.baseURL),
    mobileVote,
    qrMinSizePx: STAGE_QR_MIN_SIZE_PX,
    roundNumber: options.roundNumber,
    stage,
  };

  expectNoRemoteChartArtwork(evidence);

  await writeJsonEvidence(options.testInfo, "phase11-deployed-visual-evidence.json", evidence);
}
