import { readFile, stat } from "node:fs/promises";
import {
  expect,
  test,
  type Browser,
  type Download,
  type Locator,
  type Page,
  type Route,
  type TestInfo,
} from "@playwright/test";
import { captureEvidenceScreenshot, writeJsonEvidence } from "./evidence-artifacts";
import { PUBLIC_INSPECTION_REFRESH_INTERVAL_MS } from "../../src/lib/vote/phone-view";
import { expectPrivateCsvFinalContent } from "../phase9/fixtures/private-csv";
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
const FALLBACK_CHART_IMAGE_PATH = "/chart-images/fallback-card.svg";
const LOGO_ALT_TEXT = "Pump It Up Open Stage tournament logo";
const LOGO_ROUTE_BYTE_LIMIT = 400_000;
const BALLOT_DRAFT_STORAGE_KEY = "bite-open-card-draw:ballot-drafts:v1";
const STAGE_QR_MIN_SIZE_PX = 176;

function sanitizeFilenameSegment(value: string) {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "event"
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PRIVATE_CSV_EVENT_ID = sanitizeFilenameSegment(
  process.env.E2E_TOURNAMENT_EVENT_ID ?? process.env.TOURNAMENT_EVENT_ID ?? "e2e-memory-dev-smoke",
);
const PRIVATE_CSV_FILENAME_PATTERN = new RegExp(
  `^${escapeRegExp(PRIVATE_CSV_EVENT_ID)}-round-1-private-ballots-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z-[a-f0-9]{8}\\.csv$`,
);
const PHASE5_LONG_USERNAME =
  "Phase5_Long_StartGG_Username_With_No_Breakpoints_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PHASE5_LONG_CHART_FIXTURE =
  "Phase5DeterministicLiveCountChartNameWithoutNaturalBreakpointsABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

type EvidenceBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type LogoResponseEvidence = {
  bodyBytes: number | null;
  contentType: string | null;
  decodedUrl: string;
  status: number;
  url: string;
};

function expectRealCachedImagePath(source: string | null) {
  expect(source).toBeTruthy();
  expect(source).toContain("/chart-images/cache/");
  expect(source).not.toContain(FALLBACK_CHART_IMAGE_PATH);
}

async function readDownloadText(download: Download) {
  const path = await download.path();

  if (!path) {
    throw new Error("Playwright download did not provide a local file path.");
  }

  return readFile(path, "utf8");
}

async function failNextVoteSubmitRequest(page: Page) {
  let aborted = false;
  const routeHandler = async (route: Route) => {
    const request = route.request();
    const isServerActionPost =
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/vote" &&
      (Boolean(request.headers()["next-action"]) || (request.postData() ?? "").includes("$ACTION"));

    if (!aborted && isServerActionPost) {
      aborted = true;
      await route.abort("failed");
      await page.unroute("**/*", routeHandler);
      return;
    }

    await route.continue();
  };

  await page.route("**/*", routeHandler);
}

async function expectStageRows(page: Page) {
  const rows = page.getByTestId("stage-set-row");

  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-set-order", "1");
  await expect(rows.nth(1)).toHaveAttribute("data-set-order", "2");
  await expect(rows.nth(0).getByTestId("stage-chart-card")).toHaveCount(7);
  await expect(rows.nth(1).getByTestId("stage-chart-card")).toHaveCount(7);
}

async function expectResultRowsSortedLeastToMostBanned(page: Page) {
  const rows = page.getByTestId("result-row");

  await expect(rows).toHaveCount(7, {
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });

  const banCounts = await rows.evaluateAll((elements) =>
    elements.map((element) => Number(element.getAttribute("data-ban-count"))),
  );

  expect(banCounts).toEqual([...banCounts].sort((left, right) => left - right));
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

async function expectFallbackImageRendered(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await expect
    .poll(async () =>
      locator.evaluate((element) => {
        const image = element as HTMLImageElement;
        const src = image.currentSrc || image.src;

        return (
          element.getAttribute("data-chart-image-fallback") === "true" &&
          image.naturalWidth > 0 &&
          src.includes("/chart-images/fallback-card.svg")
        );
      }),
    )
    .toBe(true);
}

async function expectSelectedResultCardsReadable(page: Page, expectedCount = 2) {
  const titles = page.getByTestId("selected-chart-title");
  const artists = page.getByTestId("selected-chart-artist");
  const difficulties = page.getByTestId("selected-chart-difficulty");
  const images = page.getByTestId("stage-chart-image");

  await expect(titles).toHaveCount(expectedCount, { timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await expect(artists).toHaveCount(expectedCount);
  await expect(difficulties).toHaveCount(expectedCount);
  await expect(images).toHaveCount(expectedCount);
  await expect
    .poll(async () =>
      images.evaluateAll((elements) =>
        elements.every((element) => (element as HTMLImageElement).naturalWidth > 0),
      ),
    )
    .toBe(true);

  for (const locator of [titles, artists, difficulties]) {
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
      expect(item.text.length).toBeGreaterThan(0);
      expect(item.fontSize).toBeGreaterThanOrEqual(12);
      expect(item.scrollWidth).toBeLessThanOrEqual(item.clientWidth + 2);
    }
  }
}

async function expectReadableVotingAccess(page: Page) {
  const qrLink = page.getByTestId("room-qr-link");
  const qrCode = page.getByTestId("room-qr-code");
  const qrPanel = page.getByTestId("room-qr-panel");
  const roomUrl = new URL("/room", page.url()).toString();
  const shortRoomUrl = `${new URL(roomUrl).host}/room`;
  const stageUrl = page.url();
  const votingBandBox = await page.getByTestId("stage-voting-band").boundingBox();
  const chartRowsBox = await page.getByTestId("stage-chart-rows").boundingBox();
  const qrPanelBox = await qrPanel.boundingBox();
  const qrBox = await qrLink.boundingBox();
  const timerBox = await page.getByTestId("stage-countdown-display").boundingBox();
  const qrPathCount = await qrCode.locator("svg path").count();

  await expect(qrLink).toBeVisible();
  await expect(qrLink).not.toHaveAttribute("href", /.+/);
  await expect(qrLink).toHaveAttribute("data-qr-target", roomUrl);
  await expect(qrCode.locator("svg")).toBeVisible();
  await expect(page.getByTestId("room-short-url")).toHaveText(shortRoomUrl);
  await expect(page.getByTestId("stage-countdown-display")).toHaveText(/\d{2}:\d{2}/);
  expect(await qrLink.evaluate((element) => element.tagName.toLowerCase())).toBe("div");
  expect(qrPathCount).toBeGreaterThan(0);
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
  expect(timerBox?.width).toBeGreaterThan(160);
  expect(timerBox?.height).toBeGreaterThanOrEqual(60);
  expect(qrBox!.x).toBeGreaterThan(timerBox!.x + timerBox!.width - 8);
  expect(votingBandBox!.y + votingBandBox!.height).toBeLessThanOrEqual(chartRowsBox!.y);
  expect(qrBox!.y).toBeLessThan(chartRowsBox!.y);
  expect(timerBox!.y).toBeLessThan(chartRowsBox!.y);

  await qrLink.click();
  await expect.poll(async () => page.url()).toBe(stageUrl);
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

async function visualTop(locator: Locator) {
  const box = await locator.first().boundingBox();

  expect(box).not.toBeNull();

  return box!.y;
}

async function expectAdminEventDayFlow(page: Page) {
  const hostControl = page.getByTestId("admin-host-control-panel");
  const readiness = page.getByTestId("admin-readiness");
  const draw = page
    .getByRole("heading", { name: "Draw Current Round" })
    .locator("xpath=ancestor::section[1]");
  const stageReveal = page.getByTestId("admin-stage-reveal-check");
  const voting = page
    .getByText("Voting Controls", { exact: true })
    .locator("xpath=ancestor::section[1]");
  const manualCorrection = page.locator("form", {
    has: page.getByRole("heading", { name: "Manual Ballot Correction" }),
  });
  const results = page
    .getByText("Result Reveal Controls", { exact: true })
    .locator("xpath=ancestor::section[1]");
  const chartEligibility = page
    .getByText("Chart Eligibility", { exact: true })
    .locator("xpath=ancestor::section[1]");
  const selectedPoolDetails = chartEligibility.locator("details").first();

  await expect(hostControl).toContainText("Host Lock");
  await expect(hostControl.getByTestId("admin-host-lock-context")).toContainText(
    "This browser is active host",
  );
  await expect(hostControl.getByTestId("admin-host-lock-context")).toContainText("Active owner");
  await expect(hostControl.getByTestId("admin-host-lock-context")).toContainText(
    "Takeover clarity",
  );
  await expect(hostControl.getByTestId("host-heartbeat-confidence")).toContainText(
    "Heartbeat confidence",
  );
  await expect(hostControl.getByRole("button", { name: "Release" })).toBeVisible();
  await expect(readiness).toContainText("Host control");
  await expect(readiness).toContainText("Active players");
  await expect(page.getByTestId("admin-readiness-active-player-count")).toHaveAttribute(
    "data-count",
    /\d+/,
  );
  await expect(readiness).toContainText("Draw current round");
  await expect(stageReveal).toContainText("Reveal Drawn Charts");
  await expect(voting).toContainText("Open Voting");
  await expect(manualCorrection).toContainText("Manual Ballot Correction");
  await expect(results).toContainText("Compute Results");
  await expect(results).toContainText("Download private ballot CSV");
  await expect(chartEligibility).toContainText("Required Pools");
  await expect(page.getByText(/This will replace only this chart in the active/)).toBeHidden();
  await expect(page.getByTestId("admin-live-counts").locator("ol li")).toHaveCount(0);
  await expect
    .poll(async () =>
      selectedPoolDetails.evaluate((element) => (element as HTMLDetailsElement).open),
    )
    .toBe(false);

  const hostControlTop = await visualTop(hostControl);
  const readinessTop = await visualTop(readiness);
  const drawTop = await visualTop(draw);
  const stageRevealTop = await visualTop(stageReveal);
  const votingTop = await visualTop(voting);
  const manualTop = await visualTop(manualCorrection);
  const resultsTop = await visualTop(results);
  const chartEligibilityTop = await visualTop(chartEligibility);

  expect(hostControlTop).toBeLessThan(readinessTop);
  expect(readinessTop).toBeLessThan(drawTop);
  expect(drawTop).toBeLessThan(stageRevealTop);
  expect(stageRevealTop).toBeLessThan(votingTop);
  expect(votingTop).toBeLessThan(manualTop);
  expect(manualTop).toBeLessThan(resultsTop);
  expect(resultsTop).toBeLessThan(chartEligibilityTop);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );

  if (overflow <= 4) {
    return;
  }

  const offenders = await page.evaluate(() =>
    Array.from(document.querySelectorAll("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const overflowPx = element.scrollWidth - element.clientWidth;

        return {
          className: element.getAttribute("class") ?? "",
          overflowPx,
          tagName: element.tagName.toLowerCase(),
          text: element.textContent?.trim().slice(0, 120) ?? "",
          width: Math.round(rect.width),
        };
      })
      .filter((entry) => entry.overflowPx > 4)
      .sort((left, right) => right.overflowPx - left.overflowPx)
      .slice(0, 8),
  );

  expect(
    overflow,
    `Horizontal overflow offenders: ${JSON.stringify(offenders, null, 2)}`,
  ).toBeLessThanOrEqual(4);
}

async function expectVisibleContainersDoNotOverflow(locator: Locator, label: string) {
  const rows = await locator.evaluateAll((elements) =>
    elements
      .map((element, index) => {
        const rect = element.getBoundingClientRect();

        return {
          clientWidth: element.clientWidth,
          index,
          scrollWidth: element.scrollWidth,
          visible: rect.width > 0 && rect.height > 0,
        };
      })
      .filter((entry) => entry.visible),
  );

  for (const row of rows) {
    expect(
      row.scrollWidth,
      `${label} ${row.index} should contain horizontal content`,
    ).toBeLessThanOrEqual(row.clientWidth + 4);
  }
}

async function expectAdminSecondaryPanelsContained(page: Page) {
  await expectNoHorizontalOverflow(page);
  await expectVisibleContainersDoNotOverflow(
    page.getByTestId("admin-host-control-panel"),
    "host lock panel",
  );
  await expectVisibleContainersDoNotOverflow(page.getByTestId("admin-roster-row"), "roster row");
  await expectVisibleContainersDoNotOverflow(
    page.getByTestId("admin-draw-control-card"),
    "draw control card",
  );
  await expectVisibleContainersDoNotOverflow(
    page.getByTestId("admin-chart-exclusion-row"),
    "chart exclusion row",
  );
  await expectVisibleContainersDoNotOverflow(
    page.getByTestId("admin-live-counts"),
    "live counts panel",
  );
  await expectVisibleContainersDoNotOverflow(
    page.locator("form", {
      has: page.getByRole("heading", { name: "Manual Ballot Correction" }),
    }),
    "manual ballot panel",
  );
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

async function collectStageProjectorGeometry(page: Page) {
  const entries = {
    chartRows: page.getByTestId("stage-chart-rows"),
    qr: page.getByTestId("room-qr-link"),
    timer: page.getByTestId("stage-countdown-display"),
    votingBand: page.getByTestId("stage-voting-band"),
  };
  const boxes: Record<string, EvidenceBox> = {};

  for (const [name, locator] of Object.entries(entries)) {
    const box = await locator.boundingBox();

    expect(box, `${name} should have a projector bounding box`).not.toBeNull();
    boxes[name] = toEvidenceBox(box!);
  }

  expect(intersectionArea(boxes.qr!, boxes.timer!)).toBeLessThanOrEqual(1);
  expect(boxes.votingBand!.y + boxes.votingBand!.height).toBeLessThanOrEqual(
    boxes.chartRows!.y + 1,
  );

  return boxes;
}

async function collectMobileVoteGeometry(page: Page) {
  const viewport = page.viewportSize();
  const cards = await collectLocatorBoxes(page.getByTestId("ballot-chart-card"));
  const bodyOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );

  expect(viewport).not.toBeNull();
  expect(cards).toHaveLength(7);
  expectNoBoxOverlap(cards, "mobile ballot card");

  for (const card of cards) {
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  }

  return {
    bodyOverflow,
    cards,
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

function decodeUrl(url: string) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function isLogoUrl(url: string) {
  return decodeUrl(url).includes("tournament-logo");
}

function isWebLogoUrl(url: string) {
  return decodeUrl(url).includes("/brand/tournament-logo-web.png");
}

function isSourceLogoUrl(url: string) {
  const decodedUrl = decodeUrl(url);

  return (
    decodedUrl.includes("/brand/tournament-logo.png") &&
    !decodedUrl.includes("/brand/tournament-logo-web.png")
  );
}

async function collectLogoRoutePerformanceEvidence(
  browser: Browser,
  baseURL: string | undefined,
  testInfo: TestInfo,
) {
  if (!baseURL) {
    throw new Error("Missing Playwright baseURL for logo route performance evidence.");
  }

  const sourceLogo = await stat("public/brand/tournament-logo.png");
  const webLogo = await stat("public/brand/tournament-logo-web.png");
  const routeTargets = [
    {
      name: "phone-vote",
      path: "/vote",
      viewport: { height: 844, width: 390 },
    },
    {
      name: "projector-stage",
      path: "/stage",
      viewport: { height: 1080, width: 1920 },
    },
  ];
  const routes = [];

  for (const target of routeTargets) {
    const context = await browser.newContext({
      baseURL,
      isMobile: target.name.startsWith("phone"),
      viewport: target.viewport,
    });
    const routePage = await context.newPage();
    const logoResponses: LogoResponseEvidence[] = [];
    const responseReads: Promise<void>[] = [];

    routePage.on("response", (response) => {
      if (!isLogoUrl(response.url())) {
        return;
      }

      responseReads.push(
        response
          .body()
          .then((body) => {
            logoResponses.push({
              bodyBytes: body.length,
              contentType: response.headers()["content-type"] ?? null,
              decodedUrl: decodeUrl(response.url()),
              status: response.status(),
              url: response.url(),
            });
          })
          .catch(() => {
            logoResponses.push({
              bodyBytes: null,
              contentType: response.headers()["content-type"] ?? null,
              decodedUrl: decodeUrl(response.url()),
              status: response.status(),
              url: response.url(),
            });
          }),
      );
    });

    await goto(routePage, target.path);
    await expect(routePage.getByAltText(LOGO_ALT_TEXT).first()).toBeVisible();
    await routePage.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    await Promise.all(responseReads);

    const resourceEntries = await routePage.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter((entry) => decodeURIComponent(entry.name).includes("tournament-logo"))
        .map((entry) => {
          const resource = entry as PerformanceResourceTiming;

          return {
            decodedName: decodeURIComponent(resource.name),
            durationMs: Math.round(resource.duration * 100) / 100,
            encodedBodySize: resource.encodedBodySize,
            transferSize: resource.transferSize,
          };
        }),
    );
    const webLogoEvidenceCount =
      logoResponses.filter((response) => isWebLogoUrl(response.decodedUrl)).length +
      resourceEntries.filter((entry) => isWebLogoUrl(entry.decodedName)).length;

    expect(
      webLogoEvidenceCount,
      `${target.name} should request the optimized logo`,
    ).toBeGreaterThan(0);
    expect(
      logoResponses.filter((response) => isSourceLogoUrl(response.decodedUrl)),
      `${target.name} should not request the large source logo`,
    ).toHaveLength(0);

    for (const response of logoResponses.filter((entry) => isWebLogoUrl(entry.decodedUrl))) {
      if (response.bodyBytes !== null) {
        expect(response.bodyBytes).toBeLessThanOrEqual(LOGO_ROUTE_BYTE_LIMIT);
      }
    }

    routes.push({
      logoResponses,
      resourceEntries,
      route: target.path,
      routeName: target.name,
      viewport: target.viewport,
    });

    await context.close();
  }

  await writeJsonEvidence(testInfo, "pfr-logo-route-performance.json", {
    generatedAt: new Date().toISOString(),
    routeByteLimit: LOGO_ROUTE_BYTE_LIMIT,
    routes,
    sourceLogoBytes: sourceLogo.size,
    webLogoBytes: webLogo.size,
  });
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
  await page
    .getByRole("button", {
      name: /Advance to Set 1 counts|Reveal Set 1 selected chart|Advance to Set 2 counts|Reveal Set 2 selected chart|Show final charts/,
    })
    .click();
  await expectAdminRevealPhase(page, phase);
}

async function expectNoFinalResultSpoilers(page: Page) {
  await expect(page.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toHaveCount(0);
  await expect(page.getByText("Full ban counts")).toHaveCount(0);
  await expect(page.getByText("Least banned to most banned")).toHaveCount(0);
  await expect(page.getByTestId("stage-final-chart-list")).toHaveCount(0);
  await expect(page.getByTestId("phone-final-chart-card")).toHaveCount(0);
  await expect(page.getByTestId("result-selected-label")).toHaveCount(0);
}

async function expectPublicRoutesHideFinalSpoilersBeforeReveal(page: Page) {
  const publicPage = await page.context().newPage();

  try {
    await goto(publicPage, "/vote");
    await expect(publicPage.getByText("Voting is closed.")).toBeVisible();
    await expect(publicPage.getByText("Results are being revealed on stage.")).toBeVisible();
    await expectNoFinalResultSpoilers(publicPage);

    await goto(publicPage, "/charts");
    await expect(publicPage.getByTestId("view-only-status")).toContainText(
      "Results being revealed",
    );
    await expectNoFinalResultSpoilers(publicPage);

    await goto(publicPage, "/results");
    await expect(publicPage.getByText("Voting is closed.")).toBeVisible();
    await expect(publicPage.getByText("Results are being revealed on stage.")).toBeVisible();
    await expectNoFinalResultSpoilers(publicPage);

    await goto(publicPage, "/stage");
    await expect(publicPage.getByRole("heading", { name: "Awaiting Host Reveal" })).toBeVisible();
    await expectNoFinalResultSpoilers(publicPage);
  } finally {
    await publicPage.close();
  }
}

async function expectDetailsOpen(details: Locator) {
  await expect
    .poll(async () => details.evaluate((element) => (element as HTMLDetailsElement).open))
    .toBe(true);
}

async function expectFinalBanCountDetailsRemainOpenAfterWait(page: Page, waitMs = 1_500) {
  const details = page.locator("details", { hasText: "ban counts" });

  await expect(details).toHaveCount(2);

  for (const index of [0, 1]) {
    const detail = details.nth(index);

    if (!(await detail.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await detail.locator("summary").click();
    }
    await expectDetailsOpen(detail);
    await expect(detail.locator("li")).toHaveCount(7);
    await expect(detail.getByTestId("result-selected-label")).toHaveCount(1);
  }

  await page.waitForTimeout(waitMs);

  for (const index of [0, 1]) {
    await expectDetailsOpen(details.nth(index));
  }
}

type OpenPublicPages = {
  chartsPage: Page;
  resultsPage: Page;
  stagePage: Page;
  votePage: Page;
};

async function expectPhoneRoutesHoldFinalResults({
  chartsPage,
  resultsPage,
  votePage,
}: Pick<OpenPublicPages, "chartsPage" | "resultsPage" | "votePage">) {
  await expect(votePage.getByText("Voting is closed.")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(votePage.getByText("Results are being revealed on stage.")).toBeVisible();
  await expectNoFinalResultSpoilers(votePage);

  await expect(chartsPage.getByTestId("view-only-status")).toContainText("Results being revealed", {
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expectNoFinalResultSpoilers(chartsPage);

  await expect(resultsPage.getByText("Voting is closed.")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(resultsPage.getByText("Results are being revealed on stage.")).toBeVisible();
  await expectNoFinalResultSpoilers(resultsPage);
}

async function expectOpenPublicPagesShowFinal({
  chartsPage,
  resultsPage,
  stagePage,
  votePage,
}: OpenPublicPages) {
  await expect(stagePage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(
    stagePage.getByTestId("stage-final-chart-list").getByTestId("stage-chart-card"),
  ).toHaveCount(2);
  await expect(chartsPage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(resultsPage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(votePage.getByText("Full ban counts")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function expectOpenPublicPagesShowChart(pages: OpenPublicPages, chartName: string) {
  await expect(
    pages.stagePage.getByTestId("stage-final-chart-list").getByText(chartName, { exact: true }),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await expect(pages.chartsPage.getByText(chartName, { exact: true }).first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(pages.resultsPage.getByText(chartName, { exact: true }).first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(pages.votePage.getByText(chartName, { exact: true }).first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function expectOpenPublicPagesAfterReset({
  chartsPage,
  resultsPage,
  stagePage,
  votePage,
}: OpenPublicPages) {
  await stagePage.bringToFront();
  await expect(stagePage.getByRole("heading", { name: "Round 1 Draw" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await chartsPage.bringToFront();
  await expect(chartsPage.getByText("Awaiting first chart set").first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await resultsPage.bringToFront();
  await expect(resultsPage.getByRole("heading", { name: "Round 1 Results" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await votePage.bringToFront();
  await expect(votePage.getByText("The host is drawing the two chart sets.")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });

  for (const publicPage of [stagePage, chartsPage, resultsPage, votePage]) {
    await expectNoFinalResultSpoilers(publicPage);
  }
}

async function expectOpenPublicPagesAfterRoundAdvance({
  chartsPage,
  resultsPage,
  stagePage,
  votePage,
}: OpenPublicPages) {
  await stagePage.bringToFront();
  await expect(stagePage.getByRole("heading", { name: "Round 2 Draw" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await chartsPage.bringToFront();
  await expect(chartsPage.getByRole("heading", { name: "Round 2 - S18" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await resultsPage.bringToFront();
  await expect(resultsPage.getByRole("heading", { name: "Round 2 Results" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await votePage.bringToFront();
  await expect(votePage.locator("header").getByText("Round 2")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function setCurrentRoundFromAdmin(page: Page, roundNumber: string) {
  const currentRoundForm = page.locator("form", {
    has: page.getByRole("button", { name: "Set Current Round" }),
  });

  await currentRoundForm.locator('select[name="roundNumber"]').selectOption(roundNumber);
  await clickAdminActionAndWait(
    page,
    currentRoundForm.getByRole("button", { name: "Set Current Round" }),
  );
}

async function currentStageFinalChartNames(stagePage: Page) {
  return stagePage
    .getByTestId("stage-final-chart-list")
    .getByTestId("stage-chart-title")
    .allTextContents();
}

function chartNameFromOverrideLabel(label: string) {
  const separatorIndex = label.indexOf(" - ");

  return separatorIndex >= 0 ? label.slice(separatorIndex + 3).trim() : label.trim();
}

async function selectDifferentOverrideTarget(adminPage: Page, currentChartNames: string[]) {
  const overrideForm = adminPage.locator("form", {
    has: adminPage.getByRole("button", { name: "Override Result" }),
  });
  const options = await overrideForm
    .locator('select[name="resultTarget"] option')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        label: element.textContent?.trim() ?? "",
        value: (element as HTMLOptionElement).value,
      })),
    );
  const candidates = options
    .filter(
      (option) =>
        option.value && !currentChartNames.includes(chartNameFromOverrideLabel(option.label)),
    )
    .sort(
      (left, right) =>
        chartNameFromOverrideLabel(right.label).length -
        chartNameFromOverrideLabel(left.label).length,
    );
  const target = candidates[0];

  if (!target) {
    throw new Error("Could not find a non-selected result override target.");
  }

  await overrideForm.locator('select[name="resultTarget"]').selectOption(target.value);

  return {
    chartName: chartNameFromOverrideLabel(target.label),
    form: overrideForm,
  };
}

test("full round smoke flow reaches final reveal and downloads private CSV", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(420_000);

  await collectLogoRoutePerformanceEvidence(browser, baseURL, testInfo);

  await goto(page, "/stage");
  await expect(page).toHaveTitle("Stage Display | Pump It Up Open Stage");
  await expect(page.getByText("Round 1 Draw")).toBeVisible();

  await goto(page, "/room");
  await expect(page).toHaveTitle("Tournament Room | Pump It Up Open Stage");
  await expect(page.getByTestId("room-current-status")).toContainText("Round 1 awaiting draw");
  await expect(page.getByRole("link", { name: "I am a player voting" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View charts only" })).toBeVisible();
  const mobileWaitingPage = await page.context().newPage();
  await mobileWaitingPage.setViewportSize({ width: 390, height: 844 });
  await goto(mobileWaitingPage, "/vote");
  await expect(
    mobileWaitingPage.getByText("The host is drawing the two chart sets."),
  ).toBeVisible();
  await captureEvidenceScreenshot(
    testInfo,
    "uxr-013-mobile-vote-waiting-not-drawn.png",
    mobileWaitingPage,
  );

  await goto(page, "/coolguy69");
  await page.getByLabel("Shared admin password").fill(ADMIN_PASSWORD);
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Log In" }));
  await expect(page.getByRole("heading", { name: "coolguy69" })).toBeVisible();
  await expect(page.getByTestId("admin-host-lock-context")).toContainText("No active host");
  await expect(page.getByTestId("host-heartbeat-confidence")).toContainText("No active heartbeat");
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Take Host Control" }));
  await expect(page.getByRole("button", { name: "Release" })).toBeEnabled({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(page).toHaveTitle("Host Console | Pump It Up Open Stage");
  await expectAdminEventDayFlow(page);
  const readonlyContext = await browser.newContext({
    acceptDownloads: true,
    baseURL,
  });
  const readonlyPage = await readonlyContext.newPage();

  await goto(readonlyPage, "/coolguy69");
  await readonlyPage.getByLabel("Shared admin password").fill(ADMIN_PASSWORD);
  await clickAdminActionAndWait(readonlyPage, readonlyPage.getByRole("button", { name: "Log In" }));
  await expect(readonlyPage.getByTestId("admin-host-lock-context")).toContainText(
    "Read-only admin",
  );
  await expect(readonlyPage.getByTestId("admin-host-lock-context")).toContainText(
    "Force takeover is gated",
  );
  await expect(readonlyPage.getByTestId("host-heartbeat-confidence")).toContainText(
    "Read-only until takeover",
  );
  await expect(readonlyPage.getByRole("button", { name: "Force Host Takeover" })).toBeVisible();
  await readonlyContext.close();
  await captureEvidenceScreenshot(testInfo, "uxr-phase1-admin-event-day-flow.png", page);
  await page
    .getByPlaceholder("Bulk import start.gg usernames")
    .fill(`Alpha\nBravo\nCharlie\nDelta\n${PHASE5_LONG_USERNAME}`);
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Bulk Import" }));
  await expect(page.getByTestId("admin-roster-row").filter({ hasText: "Alpha" })).toBeVisible();
  await expect(
    page.getByTestId("admin-roster-row").filter({ hasText: PHASE5_LONG_USERNAME }),
  ).toBeVisible();
  await clickAdminActionAndWait(
    page,
    page
      .getByTestId("admin-roster-row")
      .filter({ hasText: PHASE5_LONG_USERNAME })
      .getByRole("button", { name: "Mark Inactive" }),
  );
  await expect(
    page.getByTestId("admin-roster-row").filter({ hasText: PHASE5_LONG_USERNAME }),
  ).toHaveAttribute("data-active", "false");

  const chartEligibility = page
    .getByText("Chart Eligibility", { exact: true })
    .locator("xpath=ancestor::section[1]");
  const selectedPoolDetails = chartEligibility.locator("details").first();

  if (!(await selectedPoolDetails.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await selectedPoolDetails.locator("summary").click();
  }

  await expect(chartEligibility).toContainText("Pneumonoultramicroscopicsilicovolcanoconiosis");
  await expectAdminSecondaryPanelsContained(page);
  await captureEvidenceScreenshot(testInfo, "uxr-032-admin-desktop-long-names.png", page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAdminSecondaryPanelsContained(page);
  await captureEvidenceScreenshot(testInfo, "uxr-032-admin-narrow-long-names.png", page);
  await page.setViewportSize({ width: 1280, height: 720 });

  const stagePage = await page.context().newPage();
  await goto(stagePage, "/stage");
  await expect(stagePage).toHaveTitle("Stage Display | Pump It Up Open Stage");
  await expect(stagePage.locator("header").getByText("Awaiting host draw")).toBeVisible();

  const chartsPage = await page.context().newPage();
  await goto(chartsPage, "/charts");
  await expect(chartsPage).toHaveTitle("View Charts | Pump It Up Open Stage");
  await expect(chartsPage.getByText("Awaiting first chart set").first()).toBeVisible();

  await page.getByRole("button", { name: "Draw Set" }).nth(0).click();
  await expect(page.getByText(/Version 1/).first()).toBeVisible();
  await expect(stagePage.getByText(/Version 1 \/ (Revealing|Pool)/)).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(chartsPage.getByText("Draw complete").first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(chartsPage.getByTestId("view-only-status")).toContainText("One chart set drawn");
  await expect(chartsPage.getByTestId("view-only-status")).toContainText(
    "The drawn chart set is visible now",
  );

  const firstChartRerollDetails = page
    .locator("details")
    .filter({ has: page.getByText("Reroll chart", { exact: true }) })
    .first();
  await firstChartRerollDetails.locator("summary").click();
  const firstChartRerollForm = firstChartRerollDetails.locator("form").first();
  await expect(firstChartRerollForm.getByTestId("dangerous-action-summary")).toContainText(
    "replace only this chart in the active draw",
  );
  await firstChartRerollForm.getByLabel("Audit reason").fill("e2e stage reroll");
  await firstChartRerollForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
  await clickAdminActionAndWait(
    page,
    firstChartRerollForm.getByRole("button", { name: "Confirm Chart Reroll" }),
  );
  await expect(page.getByText(/Version 2/).first()).toBeVisible();
  await expect(stagePage.getByText(/Version 2 \/ (Revealing|Pool)/)).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(chartsPage.getByText("Draw complete").first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });

  await page.getByRole("button", { name: "Draw Set" }).nth(1).click();
  await expect(page.getByText("ready to vote")).toBeVisible();
  await expect(chartsPage.getByTestId("view-only-status")).toContainText("Ready to vote", {
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(stagePage.getByText(/Version 1 \/ (Revealing [0-7] \/ 7|Pool)/)).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await page
    .getByTestId("admin-draw-chart-name")
    .first()
    .evaluate((element, text) => {
      element.textContent = text;
    }, PHASE5_LONG_CHART_FIXTURE);
  await expectAdminSecondaryPanelsContained(page);
  await captureEvidenceScreenshot(testInfo, "uxr-032-admin-draw-controls-long-name.png", page);
  await goto(mobileWaitingPage, "/vote");
  await expect(
    mobileWaitingPage.getByText("The host has not opened the 10-minute voting window yet."),
  ).toBeVisible();
  await captureEvidenceScreenshot(
    testInfo,
    "uxr-013-mobile-vote-waiting-not-open.png",
    mobileWaitingPage,
  );
  await mobileWaitingPage.close();
  await expectStageRows(stagePage);
  await expectRenderedRealStageImage(stagePage);
  await expectStageRows(chartsPage);
  await expectRenderedRealStageImage(chartsPage);

  await page.getByRole("button", { name: "Open Voting", exact: true }).click();
  await expect(page.getByText("voting open")).toBeVisible();
  await expect(stagePage.locator("header").getByText("Voting open")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expectReadableVotingAccess(stagePage);
  await expectNoStageVerticalScroll(stagePage);
  const stageVotingGeometry = await collectStageProjectorGeometry(stagePage);

  await captureEvidenceScreenshot(testInfo, "pfr-projector-stage-voting.png", stagePage);
  await writeJsonEvidence(
    testInfo,
    "pfr-projector-stage-voting-geometry.json",
    stageVotingGeometry,
  );

  const liveCountsPanel = page.getByTestId("admin-live-counts");

  await liveCountsPanel.getByRole("button", { name: "Show live counts" }).click();
  await expect(liveCountsPanel.locator("ol li")).toHaveCount(14);
  await liveCountsPanel.getByRole("button", { name: "Refresh live counts" }).click();
  await expect(liveCountsPanel.locator("ol li")).toHaveCount(14);
  await liveCountsPanel
    .locator("ol li span")
    .first()
    .evaluate((element, text) => {
      element.textContent = text;
    }, PHASE5_LONG_CHART_FIXTURE);
  await expectAdminSecondaryPanelsContained(page);
  await captureEvidenceScreenshot(testInfo, "uxr-030-admin-live-counts-long-name.png", page);
  await liveCountsPanel.getByRole("button", { name: "Hide live counts" }).click();
  await expect(liveCountsPanel.locator("ol li")).toHaveCount(0);
  await expect(liveCountsPanel.getByRole("button", { name: "Show live counts" })).toBeVisible();

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
  await expect(phonePage.getByTestId("ballot-chart-card")).toHaveCount(7);
  await expectCenteredSeventhCard(phonePage);
  const mobileVoteGeometry = await collectMobileVoteGeometry(phonePage);

  await captureEvidenceScreenshot(testInfo, "pfr-mobile-vote-ballot.png", phonePage);
  await writeJsonEvidence(testInfo, "pfr-mobile-vote-ballot-geometry.json", mobileVoteGeometry);
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
  await phonePage.getByRole("button", { name: "Next", exact: true }).click();
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
  await phonePage.getByRole("button", { name: "Next", exact: true }).click();
  await phonePage.getByRole("button", { name: "Review" }).click();
  await phonePage.getByRole("button", { name: "Submit Ballot" }).click();
  await expect(phonePage.getByText("Saved revision 2.")).toBeVisible();

  await phonePage.reload({ waitUntil: "domcontentloaded" });
  await expect(phonePage.getByText("Ballot Saved")).toBeVisible({ timeout: 7000 });
  await expect(phonePage.getByText("Loaded saved revision 2.")).toBeVisible();
  await expect(phonePage.getByText("Server-confirmed timestamp:")).toBeVisible();
  await phonePage.getByRole("button", { name: "Edit S16" }).click();
  await expect(phonePage.getByTestId("saved-edit-draft-warning")).toContainText(
    "previous server-confirmed ballot remains valid",
  );
  const failedEditCards = phonePage.getByTestId("ballot-chart-card");
  await failedEditCards.nth(0).click();
  await failedEditCards.nth(2).click();
  await phonePage.getByRole("button", { name: "Next", exact: true }).click();
  await phonePage.getByRole("button", { name: "Review" }).click();
  await expect(phonePage.getByTestId("saved-edit-draft-warning")).toContainText(
    "previous server-confirmed ballot remains valid",
  );
  await failNextVoteSubmitRequest(phonePage);
  await phonePage.getByRole("button", { name: "Submit Ballot" }).click();
  await expect(phonePage.getByText(/Previous server-confirmed ballot remains valid\./)).toBeVisible(
    {
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    },
  );
  await expect(phonePage.getByText("Ballot Saved")).toBeVisible();
  await phonePage.reload({ waitUntil: "domcontentloaded" });
  await expect(phonePage.getByText("Loaded saved revision 2.")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });

  const duplicatePhonePage = await browser.newPage();
  await duplicatePhonePage.goto(new URL("/vote", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await duplicatePhonePage
    .getByLabel("Select your start.gg username")
    .selectOption({ label: "Alpha" });
  await expect(duplicatePhonePage.getByText("Are you sure you are voting as Alpha?")).toBeVisible();
  await expect(duplicatePhonePage.getByTestId("ballot-chart-card")).toHaveCount(0);
  await expect(
    duplicatePhonePage.getByText("A ballot already exists for this start.gg username"),
  ).toBeVisible({ timeout: 7000 });
  await expect(duplicatePhonePage.getByRole("button", { name: "Confirm" })).toBeEnabled();
  await duplicatePhonePage.getByRole("button", { name: "Confirm" }).click();
  await expect(
    duplicatePhonePage.getByText("Another active device has already claimed Alpha"),
  ).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(duplicatePhonePage.getByRole("button", { name: "Confirm" })).toBeEnabled();
  await expect(duplicatePhonePage.getByTestId("ballot-chart-card")).toHaveCount(0);
  await duplicatePhonePage.getByRole("button", { name: "Confirm" }).click();
  await expect(duplicatePhonePage.getByTestId("ballot-chart-card").first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await duplicatePhonePage.close();

  const resultsPage = await page.context().newPage();
  await goto(resultsPage, "/results");

  await page.getByRole("button", { name: "Close Voting" }).click();
  await expect(page.getByText("voting closed")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(phonePage.getByText("Voting is closed.")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(phonePage.getByText("Results are being revealed on stage.")).toBeVisible();
  await captureEvidenceScreenshot(testInfo, "uxr-013-mobile-vote-closed-revealing.png", phonePage);
  await expect(resultsPage.getByText("Voting is closed.")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(resultsPage.getByText("Results are being revealed on stage.")).toBeVisible();
  await page.getByRole("button", { name: "Compute Results" }).click();
  await expect(page.getByText("results computed")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expectAdminRevealPhase(page, "computed");
  await expectPublicRoutesHideFinalSpoilersBeforeReveal(page);

  await advanceRevealAndWaitForAdminPhase(page, "set 1 counts");
  await expectResultRowsSortedLeastToMostBanned(stagePage);
  await expect(stagePage.getByTestId("result-selected-label")).toHaveCount(0);
  await advanceRevealAndWaitForAdminPhase(page, "set 1 resolved");
  await expect(stagePage.getByTestId("stage-auto-refresh")).toHaveAttribute(
    "data-defer-during-tiebreak",
    "true",
    { timeout: HOSTED_REFRESH_TIMEOUT_MS },
  );
  expect(
    Number(
      await stagePage.getByTestId("stage-auto-refresh").getAttribute("data-refresh-interval-ms"),
    ),
  ).toBeGreaterThan(5_000);
  await waitForVisibleTiebreakReveal(stagePage, 1);
  await advanceRevealAndWaitForAdminPhase(page, "set 2 counts");
  await expect(stagePage.locator("header").getByText("Set 2 counts")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expectResultRowsSortedLeastToMostBanned(stagePage);
  await expect(stagePage.getByTestId("result-selected-label")).toHaveCount(0);
  await expectNoStageVerticalScroll(stagePage);
  await advanceRevealAndWaitForAdminPhase(page, "set 2 resolved");
  await waitForVisibleTiebreakReveal(stagePage, 1);
  await expectNoStageVerticalScroll(stagePage);
  await expectPhoneRoutesHoldFinalResults({ chartsPage, resultsPage, votePage: phonePage });
  await captureEvidenceScreenshot(testInfo, "uxr-008-vote-holding-before-final.png", phonePage);
  await captureEvidenceScreenshot(
    testInfo,
    "uxr-008-results-holding-before-final.png",
    resultsPage,
  );
  await advanceRevealAndWaitForAdminPhase(page, "final");
  await expect(stagePage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(
    stagePage.getByTestId("stage-final-chart-list").getByTestId("stage-chart-card"),
  ).toHaveCount(2);
  await expectPhoneRoutesHoldFinalResults({ chartsPage, resultsPage, votePage: phonePage });
  const privateCsvDownloadPromise = page.waitForEvent("download");
  await clickAdminActionAndWait(
    page,
    page.getByRole("button", { name: "Confirm Stage Reveal Complete" }),
  );
  await expect(page.getByText("Phones and results released")).toBeVisible();
  await expectOpenPublicPagesShowFinal({
    chartsPage,
    resultsPage,
    stagePage,
    votePage: phonePage,
  });
  await captureEvidenceScreenshot(testInfo, "uxr-009-open-stage-final.png", stagePage);
  await captureEvidenceScreenshot(testInfo, "uxr-009-open-vote-final.png", phonePage);
  await captureEvidenceScreenshot(testInfo, "uxr-009-open-charts-final.png", chartsPage);
  await captureEvidenceScreenshot(testInfo, "uxr-009-open-results-final.png", resultsPage);
  const mobileResultsPage = await page.context().newPage();
  await mobileResultsPage.setViewportSize({ width: 390, height: 844 });
  await goto(mobileResultsPage, "/results");
  await expect(
    mobileResultsPage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" }),
  ).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expectSelectedResultCardsReadable(mobileResultsPage);
  await captureEvidenceScreenshot(testInfo, "uxr-004-mobile-results-final.png", mobileResultsPage);
  await mobileResultsPage.close();

  const fallbackResultsContext = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    viewport: { height: 844, width: 390 },
  });

  await fallbackResultsContext.route("**/chart-images/cache/**", (route) => route.abort("failed"));
  try {
    const fallbackResultsPage = await fallbackResultsContext.newPage();

    await goto(fallbackResultsPage, "/results");
    await expect(
      fallbackResultsPage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" }),
    ).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await expectFallbackImageRendered(fallbackResultsPage.getByTestId("stage-chart-image").first());
    await captureEvidenceScreenshot(
      testInfo,
      "uxr-002-mobile-results-image-fallback.png",
      fallbackResultsPage,
    );
  } finally {
    await fallbackResultsContext.close();
  }
  const privateCsvDownload = await privateCsvDownloadPromise;
  const privateCsvText = await readDownloadText(privateCsvDownload);
  const csvExpectation = {
    expectedRevisionByPlayer: { Alpha: 2 },
    expectedRows: 4,
    expectedSubmittedRows: 1,
    requiredPlayers: ["Alpha", "Bravo", "Charlie", "Delta"],
    roundNumber: 1,
  };
  const privateCsvSummary = expectPrivateCsvFinalContent(privateCsvText, csvExpectation);

  expect(privateCsvDownload.suggestedFilename()).toMatch(PRIVATE_CSV_FILENAME_PATTERN);
  await writeJsonEvidence(testInfo, "pfr-private-csv-auto-summary.json", privateCsvSummary);

  await expect(
    page
      .locator("section", { hasText: "Result Reveal Controls" })
      .getByText("final", { exact: true }),
  ).toBeVisible();
  await expect(stagePage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(chartsPage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expectRenderedRealStageImage(chartsPage);
  await expectFinalBanCountDetailsRemainOpenAfterWait(
    chartsPage,
    PUBLIC_INSPECTION_REFRESH_INTERVAL_MS + 1_500,
  );
  await chartsPage.reload({ waitUntil: "domcontentloaded" });
  await expect(chartsPage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible();
  await expectFinalBanCountDetailsRemainOpenAfterWait(chartsPage);
  await expect(phonePage.getByText("Full ban counts")).toBeVisible({ timeout: 7000 });
  await expectRenderedRealBackgroundImage(phonePage.getByTestId("phone-final-chart-card").first());
  await expectFinalBanCountDetailsRemainOpenAfterWait(phonePage);
  await phonePage.reload({ waitUntil: "domcontentloaded" });
  await expect(phonePage.getByText("Full ban counts")).toBeVisible({ timeout: 7000 });
  await expectFinalBanCountDetailsRemainOpenAfterWait(phonePage);

  await goto(page, "/stage");
  await expect(page.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible();
  const finalStageCards = page
    .getByTestId("stage-final-chart-list")
    .getByTestId("stage-chart-card");
  await expect(finalStageCards).toHaveCount(2);
  expect((await finalStageCards.first().boundingBox())?.height).toBeGreaterThan(300);
  expect((await finalStageCards.nth(1).boundingBox())?.height).toBeGreaterThan(300);
  await expectRenderedRealStageImage(page);
  const finalStageGeometry = {
    cards: await collectLocatorBoxes(finalStageCards),
    viewport: page.viewportSize(),
  };

  expectNoBoxOverlap(finalStageGeometry.cards, "final stage card");
  await captureEvidenceScreenshot(testInfo, "pfr-projector-stage-final.png", page);
  await writeJsonEvidence(testInfo, "pfr-projector-stage-final-geometry.json", finalStageGeometry);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible();
  await expect(
    page.getByTestId("stage-final-chart-list").getByTestId("stage-chart-card"),
  ).toHaveCount(2);

  await goto(page, "/charts");
  await expect(page.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible();
  await expectRenderedRealStageImage(page);
  await expectFinalBanCountDetailsRemainOpenAfterWait(page);

  await goto(page, "/results");
  await expect(page.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible();
  await expectRenderedRealStageImage(page);
  await expectFinalBanCountDetailsRemainOpenAfterWait(page);

  await goto(page, "/vote");
  await expect(page.getByText("Full ban counts")).toBeVisible();
  await expectFinalBanCountDetailsRemainOpenAfterWait(page);

  await goto(page, "/coolguy69");
  const downloadButton = page.getByRole("button", { name: "Download private ballot CSV" });
  await expect(downloadButton).toBeEnabled();
  const manualCsvDownloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const manualCsvDownload = await manualCsvDownloadPromise;
  const manualCsvText = await readDownloadText(manualCsvDownload);
  const manualCsvSummary = expectPrivateCsvFinalContent(manualCsvText, csvExpectation);

  expect(manualCsvDownload.suggestedFilename()).toMatch(PRIVATE_CSV_FILENAME_PATTERN);
  expect(manualCsvText).toBe(privateCsvText);
  await writeJsonEvidence(testInfo, "pfr-private-csv-manual-summary.json", manualCsvSummary);
  await expect(
    page.getByText(
      new RegExp(
        `^Downloaded ${escapeRegExp(PRIVATE_CSV_EVENT_ID)}-round-1-private-ballots-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z-[a-f0-9]{8}\\.csv\\.$`,
      ),
    ),
  ).toBeVisible();

  await setCurrentRoundFromAdmin(page, "2");
  await expect(page.getByText("Current Round 2")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await goto(resultsPage, "/results");
  await expect(resultsPage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(resultsPage.getByTestId("previous-round-results-notice")).toContainText(
    "Showing Round 1. Round 2 is not final yet.",
  );
  await captureEvidenceScreenshot(
    testInfo,
    "uxr-019-results-previous-round-fallback.png",
    resultsPage,
  );
  await setCurrentRoundFromAdmin(page, "1");
  await expect(page.getByText("Current Round 1")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });

  const currentFinalNames = await currentStageFinalChartNames(stagePage);
  const { chartName: correctedChartName, form: overrideForm } = await selectDifferentOverrideTarget(
    page,
    currentFinalNames,
  );
  await overrideForm.locator("#override-reason").fill("e2e final correction freshness");
  await overrideForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
  await clickAdminActionAndWait(
    page,
    overrideForm.getByRole("button", { name: "Override Result" }),
  );
  await expectOpenPublicPagesShowChart(
    { chartsPage, resultsPage, stagePage, votePage: phonePage },
    correctedChartName,
  );
  const correctedMobileResultsPage = await page.context().newPage();
  await correctedMobileResultsPage.setViewportSize({ width: 390, height: 844 });
  await goto(correctedMobileResultsPage, "/results");
  await expect(
    correctedMobileResultsPage.getByTestId("selected-chart-title").filter({
      hasText: correctedChartName,
    }),
  ).toHaveCount(1, { timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await expectSelectedResultCardsReadable(correctedMobileResultsPage);
  await captureEvidenceScreenshot(
    testInfo,
    "uxr-004-mobile-results-corrected-long-name.png",
    correctedMobileResultsPage,
  );
  await correctedMobileResultsPage.close();
  await writeJsonEvidence(testInfo, "uxr-009-open-route-correction.json", {
    correctedChartName,
    correctedChartNameLength: correctedChartName.length,
    previousFinalNames: currentFinalNames,
  });

  const resetForm = page.locator("form", {
    has: page.getByRole("button", { name: "Reset Round" }),
  });
  await resetForm.locator('select[name="roundNumber"]').selectOption("1");
  await resetForm.locator("#reset-round-reason").fill("e2e reset freshness");
  await resetForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
  await clickAdminActionAndWait(page, resetForm.getByRole("button", { name: "Reset Round" }));
  await expectOpenPublicPagesAfterReset({
    chartsPage,
    resultsPage,
    stagePage,
    votePage: phonePage,
  });

  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Advance Round" }));
  await expect(page.getByText("Current Round 2")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expectOpenPublicPagesAfterRoundAdvance({
    chartsPage,
    resultsPage,
    stagePage,
    votePage: phonePage,
  });

  await setCurrentRoundFromAdmin(page, "1");
  await expect(page.getByText("Current Round 1")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });

  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Release" }));
  await expect(page.getByRole("button", { name: "Release" })).toBeDisabled();
});

test("unsaved vote draft survives pause and resume reloads", async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  await loginAndTakeHost(page);
  await openRehearsalControls(page);
  const rehearsalForm = page.locator("form", {
    has: page.getByRole("button", { name: "Start Rehearsal" }),
  });

  await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await rehearsalForm.getByPlaceholder("Audit reason").fill("e2e pause draft preservation");
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Start Rehearsal" }));
  await expect(page.getByText("Rehearsal mode")).toBeVisible();

  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Draw Set" }).nth(0));
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Draw Set" }).nth(1));
  await expect(page.getByText("ready to vote")).toBeVisible();
  await clickAdminActionAndWait(
    page,
    page.getByRole("button", { name: "Open Voting", exact: true }),
  );
  await expect(page.getByText("voting open")).toBeVisible();

  const phonePage = await page.context().newPage();

  await goto(phonePage, "/vote");
  await phonePage
    .getByLabel("Select your start.gg username")
    .selectOption({ label: "Rehearsal Player 01" });
  await phonePage.getByRole("button", { name: "Confirm" }).click();
  await expect(phonePage.getByTestId("ballot-chart-card")).toHaveCount(7);
  const firstCard = phonePage.getByTestId("ballot-chart-card").first();

  await firstCard.click();
  await expect(firstCard).toHaveAttribute("aria-pressed", "true");
  await expect(phonePage.getByTestId("ban-selection-counter")).toHaveText("1/2 bans selected");
  await expect
    .poll(() =>
      phonePage.evaluate(
        (storageKey) => window.localStorage.getItem(storageKey) ?? "",
        BALLOT_DRAFT_STORAGE_KEY,
      ),
    )
    .toContain("bannedChartIds");

  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Pause" }));
  await expect(page.getByText("voting paused")).toBeVisible();
  await phonePage.reload({ waitUntil: "domcontentloaded" });
  await expect(
    phonePage.getByText("Voting is paused. The host has frozen the timer and ballot changes."),
  ).toBeVisible();
  await captureEvidenceScreenshot(testInfo, "uxr-013-mobile-vote-paused.png", phonePage);
  await expect(phonePage.getByTestId("ban-selection-counter")).toHaveText("1/2 bans selected");
  await expect(phonePage.getByTestId("ballot-chart-card").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(phonePage.getByRole("button", { name: "Next", exact: true })).toBeDisabled();

  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Resume" }));
  await expect(page.getByText("voting open")).toBeVisible();
  await phonePage.reload({ waitUntil: "domcontentloaded" });
  await expect(phonePage.getByText("Voting as Rehearsal Player 01")).toBeVisible();
  await expect(phonePage.getByTestId("ban-selection-counter")).toHaveText("1/2 bans selected");
  await expect(phonePage.getByTestId("ballot-chart-card").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(phonePage.getByRole("button", { name: "Next", exact: true })).toBeEnabled();

  await phonePage.close();
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Release" }));
});

test("stage tiebreak wheel hides the winner until the five-second reveal completes", async ({
  page,
}) => {
  await loginAndTakeHost(page);
  await openRehearsalControls(page);
  await page
    .locator("form", { has: page.getByRole("button", { name: "Start Rehearsal" }) })
    .getByPlaceholder("Admin password")
    .fill(ADMIN_PASSWORD);
  await page
    .locator("form", { has: page.getByRole("button", { name: "Start Rehearsal" }) })
    .getByPlaceholder("Audit reason")
    .fill("e2e rehearsal tiebreak");
  await page.getByRole("button", { name: "Start Rehearsal" }).click();
  await expect(page.getByText("Rehearsal mode", { exact: true }).first()).toBeVisible();

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
  await expect(page.getByText("voting closed")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await page.getByRole("button", { name: "Compute Results" }).click();
  await expect(page.getByText("results computed")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expectAdminRevealPhase(page, "computed");
  await advanceRevealAndWaitForAdminPhase(page, "set 1 counts");
  await expect(stagePage.getByTestId("result-selected-label")).toHaveCount(0, { timeout: 500 });
  await advanceRevealAndWaitForAdminPhase(page, "set 1 resolved");

  await expect(stagePage.getByTestId("rune-wheel-slot")).toHaveCount(12);
  await expect(stagePage.getByTestId("rune-wheel")).not.toContainText("Sealed rune");

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

  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Release" }));
  await expect(page.getByRole("button", { name: "Release" })).toBeDisabled();
});
