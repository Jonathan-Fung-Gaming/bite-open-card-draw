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
  openAdminPanel,
  openRehearsalControls,
} from "./admin-helpers";

test.describe.configure({ mode: "serial" });

const ADMIN_PASSWORD = getAdminPassword();
const FALLBACK_CHART_IMAGE_PATH = "/chart-images/fallback-card.svg";
const LOGO_ALT_TEXT = "Pump It Up Open Stage tournament logo";
const LOGO_ROUTE_BYTE_LIMIT = 400_000;
const BALLOT_DRAFT_STORAGE_KEY = "bite-open-card-draw:ballot-drafts:v1";
const STAGE_QR_MIN_SIZE_PX = 176;
const STAGE_PROJECTOR_VIEWPORT = { height: 1080, width: 1920 } as const;
const STAGE_VIEWPORT_TOLERANCE_PX = 4;

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

function hostRunButton(page: Page, name: string | RegExp, options: { exact?: boolean } = {}) {
  return page
    .getByTestId("admin-host-run-controls")
    .getByRole("button", { name, ...options });
}

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

async function expectStageResultRowsSortedMostToLeastBanned(page: Page) {
  const rows = page.getByTestId("result-row");

  await expect(rows).toHaveCount(7, {
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });

  const banCounts = await rows.evaluateAll((elements) =>
    elements.map((element) => Number(element.getAttribute("data-ban-count"))),
  );

  expect(banCounts).toEqual([...banCounts].sort((left, right) => right - left));
}

async function expectStageAcceptedResultPhase(page: Page, phase: string) {
  await expect(page.getByTestId("stage-result-phase-guard")).toHaveAttribute(
    "data-accepted-result-phase",
    phase,
    { timeout: HOSTED_REFRESH_TIMEOUT_MS },
  );
}

async function expectStageResultRowsRevealProgressively(page: Page) {
  const rows = page.getByTestId("result-row");

  await expect(rows).toHaveCount(7, { timeout: HOSTED_REFRESH_TIMEOUT_MS });

  const initiallyVisible = await rows.evaluateAll(
    (elements) =>
      elements.filter((element) => element.getAttribute("data-result-row-visible") === "true")
        .length,
  );

  expect(initiallyVisible).toBeGreaterThanOrEqual(1);
  expect(initiallyVisible).toBeLessThan(7);

  await expect
    .poll(
      () =>
        rows.evaluateAll(
          (elements) =>
            elements.filter((element) => element.getAttribute("data-result-row-visible") === "true")
              .length,
        ),
      { timeout: 9_000 },
    )
    .toBe(7);
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

async function setStageProjectorViewport(page: Page) {
  await page.setViewportSize(STAGE_PROJECTOR_VIEWPORT);
}

async function expectStageProjectorTextMetrics(page: Page, label: string) {
  const checks = [
    { maxLines: 1.2, minFontPx: 14, selector: "header p" },
    { maxLines: 1.2, minFontPx: 32, selector: "header h1" },
    { maxLines: 1.2, minFontPx: 28, selector: '[data-testid="result-row-difficulty"]' },
    { maxLines: 3.2, minFontPx: 22, selector: '[data-testid="result-row-title"]' },
    { maxLines: 2.2, minFontPx: 18, selector: '[data-testid="result-row-artist"]' },
    { maxLines: 1.2, minFontPx: 24, selector: '[data-testid="result-row-ban-count"]' },
    { maxLines: 1.2, minFontPx: 24, selector: '[data-testid="rune-wheel"] > p:first-child' },
    { maxLines: 2.2, minFontPx: 30, selector: '[data-testid="rune-wheel-status"]' },
    {
      maxLines: 2.2,
      minFontPx: 44,
      selector:
        '[data-testid="stage-final-chart-list"] [data-testid="stage-chart-card"] [data-testid="stage-chart-title"]',
    },
    {
      maxLines: 1.2,
      minFontPx: 20,
      selector:
        '[data-testid="stage-final-chart-list"] [data-testid="stage-chart-card"] [data-testid="stage-chart-artist"]',
    },
  ];

  for (const check of checks) {
    const metrics = await page.locator(check.selector).evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const fontSize = Number.parseFloat(style.fontSize);
          const parsedLineHeight = Number.parseFloat(style.lineHeight);
          const lineHeight =
            Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
              ? parsedLineHeight
              : fontSize * 1.2;
          const range = document.createRange();

          range.selectNodeContents(element);

          const textRect = range.getBoundingClientRect();

          range.detach();

          return {
            clientWidth: element.clientWidth,
            fontSize,
            lineCount: (textRect.height > 0 ? textRect.height : rect.height) / lineHeight,
            scrollWidth: element.scrollWidth,
            text: element.textContent?.trim() ?? "",
            visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden",
          };
        })
        .filter((metric) => metric.visible),
    );

    for (const metric of metrics) {
      expect(
        metric.fontSize,
        `${label} ${check.selector} should use projector-sized type for "${metric.text}"`,
      ).toBeGreaterThanOrEqual(check.minFontPx);
      expect(
        metric.lineCount,
        `${label} ${check.selector} should avoid unnecessary wrapping for "${metric.text}"`,
      ).toBeLessThanOrEqual(check.maxLines);
      expect(
        metric.scrollWidth,
        `${label} ${check.selector} should not clip text for "${metric.text}"`,
      ).toBeLessThanOrEqual(metric.clientWidth + STAGE_VIEWPORT_TOLERANCE_PX);
    }
  }
}

async function expectStageFitsProjectorViewport(page: Page, label: string) {
  await expect.poll(async () => page.viewportSize()).toEqual(STAGE_PROJECTOR_VIEWPORT);
  await expectNoHorizontalOverflow(page);
  await expectNoStageVerticalScroll(page);

  const fit = await page.evaluate((tolerance) => {
    const viewport = {
      height: window.innerHeight,
      width: window.innerWidth,
    };
    const visibleContent = Array.from(document.querySelectorAll("main, main *, header, header *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return {
          bottom: Math.round(rect.bottom * 100) / 100,
          className: element.getAttribute("class") ?? "",
          height: Math.round(rect.height * 100) / 100,
          left: Math.round(rect.left * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          tagName: element.tagName.toLowerCase(),
          testId: element.getAttribute("data-testid") ?? "",
          text: element.textContent?.trim().slice(0, 120) ?? "",
          top: Math.round(rect.top * 100) / 100,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden",
          width: Math.round(rect.width * 100) / 100,
        };
      })
      .filter((entry) => entry.visible);
    const offenders = visibleContent.filter(
      (entry) =>
        entry.left < -tolerance ||
        entry.top < -tolerance ||
        entry.right > viewport.width + tolerance ||
        entry.bottom > viewport.height + tolerance,
    );
    const contentBottom = visibleContent.reduce(
      (bottom, entry) => Math.max(bottom, entry.bottom),
      0,
    );
    const wheel = document.querySelector('[data-testid="rune-wheel"] .rune-wheel-shell');
    const wheelRect = wheel?.getBoundingClientRect();
    const finalCards = Array.from(
      document.querySelectorAll('[data-testid="stage-final-chart-list"] [data-testid="stage-chart-card"]'),
    ).map((element) => {
      const rect = element.getBoundingClientRect();

      return {
        height: rect.height,
        width: rect.width,
      };
    });

    return {
      contentBottom,
      finalCards,
      offenders: offenders.slice(0, 8),
      viewport,
      wheel: wheelRect
        ? {
            height: wheelRect.height,
            width: wheelRect.width,
          }
        : null,
    };
  }, STAGE_VIEWPORT_TOLERANCE_PX);

  expect(fit.offenders, `${label} visible content should stay inside 1080p viewport`).toEqual([]);
  expect(
    fit.contentBottom,
    `${label} should use meaningful vertical space on the projector`,
  ).toBeGreaterThanOrEqual(fit.viewport.height * 0.55);

  if (fit.wheel) {
    expect(fit.wheel.width, `${label} rune wheel width`).toBeGreaterThanOrEqual(520);
    expect(fit.wheel.height, `${label} rune wheel height`).toBeGreaterThanOrEqual(520);
  }

  for (const card of fit.finalCards) {
    expect(card.height, `${label} final chart card height`).toBeGreaterThanOrEqual(560);
    expect(card.width, `${label} final chart card width`).toBeGreaterThanOrEqual(760);
  }

  await expectStageProjectorTextMetrics(page, label);
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
  const hostRun = page.getByTestId("admin-host-run-controls");
  const secondaryPanels = page.getByTestId("admin-secondary-panels");
  const supportPanels = page.getByTestId("admin-support-panels");
  const hostControl = hostRun.getByTestId("admin-host-control-panel");
  const draw = hostRun.getByRole("heading", { name: "Draw Cards" });
  const voting = hostRun.getByRole("heading", { name: "Start And Monitor Voting" });
  const results = hostRun.getByRole("heading", { name: "Calculate And Reveal Results" });

  await expect(hostRun).toContainText("Host Run Controls");
  await expect
    .poll(async () => hostRun.evaluate((element) => (element as HTMLDetailsElement).open))
    .toBe(true);
  await expect
    .poll(async () => secondaryPanels.evaluate((element) => (element as HTMLDetailsElement).open))
    .toBe(false);
  await expect
    .poll(async () => supportPanels.evaluate((element) => (element as HTMLDetailsElement).open))
    .toBe(false);

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
  await expect(hostRun).toContainText("Draw Cards");
  await expect(hostRun).toContainText("Open Voting");
  await expect(hostRun).toContainText("Compute Results");
  await expect(hostRun).toContainText("Download private ballot CSV");
  await expect(hostRun).toContainText("Advance To Round");
  await expect(page.getByText(/This will replace only this chart in the active/)).toBeHidden();
  await expect(page.getByTestId("admin-live-counts").locator("ol li")).toHaveCount(0);

  const hostControlTop = await visualTop(hostControl);
  const drawTop = await visualTop(draw);
  const votingTop = await visualTop(voting);
  const resultsTop = await visualTop(results);

  expect(hostControlTop).toBeLessThan(drawTop);
  expect(drawTop).toBeLessThan(votingTop);
  expect(votingTop).toBeLessThan(resultsTop);
}

async function expectAdminPanelOpenStatePersists(page: Page, testId: string) {
  await openAdminPanel(page, testId);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(async () =>
      page.getByTestId(testId).evaluate((element) => (element as HTMLDetailsElement).open),
    )
    .toBe(true);
  await page.getByTestId(testId).locator("summary").first().click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(async () =>
      page.getByTestId(testId).evaluate((element) => (element as HTMLDetailsElement).open),
    )
    .toBe(false);
}

async function expectOxaniumFontLoaded(page: Page) {
  const fontState = await page.evaluate(() => {
    const style = window.getComputedStyle(document.body);

    return {
      family: style.fontFamily,
      variable: style.getPropertyValue("--font-oxanium"),
    };
  });

  expect(fontState.variable.toLowerCase()).toContain("oxanium");
  expect(fontState.family.toLowerCase()).toContain("oxanium");
}

async function expectDifficultyComparableToTitle(cards: Locator, label: string) {
  const sizes = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const difficulty =
        element.querySelector('[data-testid="selected-chart-difficulty"]');
      const title =
        element.querySelector('[data-testid="stage-chart-title"]') ??
        element.querySelector('[data-testid="selected-chart-title"]');

      return {
        difficulty: difficulty
          ? Number.parseFloat(window.getComputedStyle(difficulty).fontSize)
          : 0,
        title: title ? Number.parseFloat(window.getComputedStyle(title).fontSize) : 0,
      };
    }),
  );

  for (const size of sizes) {
    expect(size.difficulty, `${label} difficulty size`).toBeGreaterThanOrEqual(size.title * 0.85);
  }
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
    page.getByTestId("admin-host-run-controls").getByText(phase, { exact: true }),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
}

async function advanceRevealAndWaitForAdminPhase(page: Page, phase: string) {
  await hostRunButton(
    page,
    /Advance to Set 1 counts|Reveal Set 1 selected chart|Advance to Set 2 counts|Reveal Set 2 selected chart|Show final charts/,
  ).click();
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

async function expectStageDoesNotReturnToDrawMode(stagePage: Page, roundNumber: number) {
  for (let sample = 0; sample < 3; sample += 1) {
    await expect(
      stagePage.getByRole("heading", { name: `Round ${roundNumber} Draw` }),
    ).toHaveCount(0);
    await expect(stagePage.getByTestId("stage-chart-rows")).toHaveCount(0);
    await expect(
      stagePage
        .getByRole("heading", { name: `Round ${roundNumber} Results Reveal` })
        .or(stagePage.getByRole("heading", { name: `ROUND ${roundNumber} FINAL CHARTS` })),
    ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
    await stagePage.waitForTimeout(1_500);
  }
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
  await openAdminPanel(page, "admin-secondary-panels");

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
  await expectOxaniumFontLoaded(page);
  await expect(page.getByTestId("admin-host-lock-context")).toContainText("No active host");
  await expect(page.getByTestId("host-heartbeat-confidence")).toContainText("No active heartbeat");
  await clickAdminActionAndWait(page, page.getByRole("button", { name: "Take Host Control" }));
  await expect(
    hostRunButton(page, "Release"),
  ).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await expect(page).toHaveTitle("Host Console | Pump It Up Open Stage");
  await expectAdminEventDayFlow(page);
  await expectAdminPanelOpenStatePersists(page, "admin-secondary-panels");
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
  const readonlyForceDetails = readonlyPage.getByTestId("admin-force-host-takeover-panel");

  if (!(await readonlyForceDetails.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await readonlyForceDetails.locator("summary").click();
  }

  await expect(readonlyPage.getByRole("button", { name: "Force Host Takeover" })).toBeVisible();
  await readonlyContext.close();
  await captureEvidenceScreenshot(testInfo, "uxr-phase1-admin-event-day-flow.png", page);
  await openAdminPanel(page, "admin-secondary-panels");
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
  await setStageProjectorViewport(stagePage);
  await goto(stagePage, "/stage");
  await expect(stagePage).toHaveTitle("Stage Display | Pump It Up Open Stage");
  await expect(stagePage.locator("header").getByText("Awaiting host draw")).toBeVisible();

  const chartsPage = await page.context().newPage();
  await goto(chartsPage, "/charts");
  await expect(chartsPage).toHaveTitle("View Charts | Pump It Up Open Stage");
  await expect(chartsPage.getByText("Awaiting first chart set").first()).toBeVisible();

  await hostRunButton(page, "Draw Set").nth(0).click();
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

  const firstChartRerollDetails = page.getByTestId("admin-chart-reroll-panel").first();
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

  await hostRunButton(page, "Draw Set").nth(1).click();
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("ready to vote", { exact: true }),
  ).toBeVisible();
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

  await hostRunButton(page, "Open Voting", { exact: true }).click();
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("voting open", { exact: true }),
  ).toBeVisible();
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

  await openAdminPanel(page, "admin-secondary-panels");
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
  await expect(phonePage.getByText("Ballot successfully submitted.")).toBeVisible();
  await expect(phonePage.getByTestId("saved-ban-chart-card")).toHaveCount(2);
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
  await expect(phonePage.getByText("Ballot successfully submitted.")).toBeVisible();

  await phonePage.reload({ waitUntil: "domcontentloaded" });
  await expect(phonePage.getByText("Ballot successfully submitted.")).toBeVisible({
    timeout: 7000,
  });
  await phonePage.getByRole("button", { name: "Edit S16" }).click();
  await expect(phonePage.getByTestId("saved-edit-draft-warning")).toContainText(
    "saved ballot stays active",
  );
  const failedEditCards = phonePage.getByTestId("ballot-chart-card");
  await failedEditCards.nth(0).click();
  await failedEditCards.nth(2).click();
  await phonePage.getByRole("button", { name: "Next", exact: true }).click();
  await phonePage.getByRole("button", { name: "Review" }).click();
  await expect(phonePage.getByTestId("saved-edit-draft-warning")).toContainText(
    "saved ballot stays active",
  );
  await failNextVoteSubmitRequest(phonePage);
  await phonePage.getByRole("button", { name: "Submit Ballot" }).click();
  await expect(phonePage.getByText(/Your saved ballot is still active\./)).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(phonePage.getByText("Ballot successfully submitted.")).toBeVisible();
  await phonePage.reload({ waitUntil: "domcontentloaded" });
  await expect(phonePage.getByText("Ballot successfully submitted.")).toBeVisible({
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

  await hostRunButton(page, "Close Voting").click();
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("voting closed", { exact: true }),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await expect(phonePage.getByText("Voting is closed.")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(phonePage.getByText("Results are being revealed on stage.")).toBeVisible();
  await captureEvidenceScreenshot(testInfo, "uxr-013-mobile-vote-closed-revealing.png", phonePage);
  await expect(resultsPage.getByText("Voting is closed.")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(resultsPage.getByText("Results are being revealed on stage.")).toBeVisible();
  await hostRunButton(page, "Compute Results").click();
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("results computed", { exact: true }),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await expectAdminRevealPhase(page, "computed");
  await expectPublicRoutesHideFinalSpoilersBeforeReveal(page);

  await advanceRevealAndWaitForAdminPhase(page, "set 1 counts");
  await expectStageDoesNotReturnToDrawMode(stagePage, 1);
  await expectStageAcceptedResultPhase(stagePage, "set_1_counts");
  await expectStageResultRowsRevealProgressively(stagePage);
  await expectStageResultRowsSortedMostToLeastBanned(stagePage);
  await expectStageFitsProjectorViewport(stagePage, "set 1 counts");
  await expect(stagePage.getByTestId("result-selected-label")).toHaveCount(0);
  await advanceRevealAndWaitForAdminPhase(page, "set 1 resolved");
  await expectStageDoesNotReturnToDrawMode(stagePage, 1);
  await expectStageAcceptedResultPhase(stagePage, "set_1_resolved");
  await expect(stagePage.getByTestId("stage-auto-refresh")).toHaveAttribute(
    "data-defer-during-tiebreak",
    "true",
    { timeout: HOSTED_REFRESH_TIMEOUT_MS },
  );
  expect(
    Number(
      await stagePage.getByTestId("stage-auto-refresh").getAttribute("data-refresh-interval-ms"),
    ),
  ).toBe(500);
  await waitForVisibleTiebreakReveal(stagePage, 1);
  await expectStageFitsProjectorViewport(stagePage, "set 1 resolved");
  await advanceRevealAndWaitForAdminPhase(page, "set 2 counts");
  await expectStageAcceptedResultPhase(stagePage, "set_2_counts");
  await expect(stagePage.locator("header").getByText("Set 2 counts")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expectStageResultRowsRevealProgressively(stagePage);
  await expectStageResultRowsSortedMostToLeastBanned(stagePage);
  await expectStageFitsProjectorViewport(stagePage, "set 2 counts");
  await expect(stagePage.getByTestId("result-selected-label")).toHaveCount(0);
  await expectNoStageVerticalScroll(stagePage);
  await advanceRevealAndWaitForAdminPhase(page, "set 2 resolved");
  await expectStageAcceptedResultPhase(stagePage, "set_2_resolved");
  await waitForVisibleTiebreakReveal(stagePage, 1);
  await expectStageFitsProjectorViewport(stagePage, "set 2 resolved");
  await expectNoStageVerticalScroll(stagePage);
  await expectPhoneRoutesHoldFinalResults({ chartsPage, resultsPage, votePage: phonePage });
  await captureEvidenceScreenshot(testInfo, "uxr-008-vote-holding-before-final.png", phonePage);
  await captureEvidenceScreenshot(
    testInfo,
    "uxr-008-results-holding-before-final.png",
    resultsPage,
  );
  await advanceRevealAndWaitForAdminPhase(page, "final");
  await expectStageAcceptedResultPhase(stagePage, "final");
  await expect(stagePage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await expect(
    stagePage.getByTestId("stage-final-chart-list").getByTestId("stage-chart-card"),
  ).toHaveCount(2);
  await expectStageFitsProjectorViewport(stagePage, "final charts");
  await expectPhoneRoutesHoldFinalResults({ chartsPage, resultsPage, votePage: phonePage });
  const privateCsvDownloadPromise = page.waitForEvent("download");
  await clickAdminActionAndWait(
    page,
    hostRunButton(page, "Confirm Stage Reveal Complete"),
  );
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("Phones and results released"),
  ).toBeVisible();
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

  await expectAdminRevealPhase(page, "final");
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
  await expectDifficultyComparableToTitle(
    page.getByTestId("phone-final-chart-card"),
    "phone final",
  );
  await expectFinalBanCountDetailsRemainOpenAfterWait(page);

  await goto(page, "/coolguy69");
  const downloadButton = hostRunButton(page, "Download private ballot CSV");
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

  await clickAdminActionAndWait(page, hostRunButton(page, "Release"));
  await expect(hostRunButton(page, "Release")).toBeDisabled();
});

test("unsaved vote draft survives pause and resume reloads", async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  await loginAndTakeHost(page);
  await openRehearsalControls(page);
  const rehearsalForm = page
    .getByTestId("admin-rehearsal-controls")
    .locator("form", { has: page.getByRole("button", { name: "Start Rehearsal" }) })
    .first();

  await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await rehearsalForm.getByPlaceholder("Audit reason").fill("e2e pause draft preservation");
  await clickAdminActionAndWait(
    page,
    rehearsalForm.getByRole("button", { name: "Start Rehearsal" }),
  );
  await expect(page.getByText("Rehearsal mode")).toBeVisible();

  await clickAdminActionAndWait(page, hostRunButton(page, "Draw Set").nth(0));
  await clickAdminActionAndWait(page, hostRunButton(page, "Draw Set").nth(1));
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("ready to vote", { exact: true }),
  ).toBeVisible();
  await clickAdminActionAndWait(
    page,
    hostRunButton(page, "Open Voting", { exact: true }),
  );
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("voting open", { exact: true }),
  ).toBeVisible();

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

  await clickAdminActionAndWait(page, hostRunButton(page, "Pause"));
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("voting paused", { exact: true }),
  ).toBeVisible();
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

  await clickAdminActionAndWait(page, hostRunButton(page, "Resume"));
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("voting open", { exact: true }),
  ).toBeVisible();
  await phonePage.reload({ waitUntil: "domcontentloaded" });
  await expect(phonePage.getByText("Voting as Rehearsal Player 01")).toBeVisible();
  await expect(phonePage.getByTestId("ban-selection-counter")).toHaveText("1/2 bans selected");
  await expect(phonePage.getByTestId("ballot-chart-card").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(phonePage.getByRole("button", { name: "Next", exact: true })).toBeEnabled();

  await phonePage.close();
  await clickAdminActionAndWait(page, hostRunButton(page, "Release"));
});

test("stage tiebreak wheel hides the winner until the ten-second reveal completes", async ({
  page,
}) => {
  await loginAndTakeHost(page);
  await openRehearsalControls(page);
  const tiebreakRehearsalForm = page
    .getByTestId("admin-rehearsal-controls")
    .locator("form", { has: page.getByRole("button", { name: "Start Rehearsal" }) })
    .first();
  await tiebreakRehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await tiebreakRehearsalForm.getByPlaceholder("Audit reason").fill("e2e rehearsal tiebreak");
  await tiebreakRehearsalForm.getByRole("button", { name: "Start Rehearsal" }).click();
  await expect(page.getByText("Rehearsal mode", { exact: true }).first()).toBeVisible();

  const stagePage = await page.context().newPage();
  await setStageProjectorViewport(stagePage);
  await goto(stagePage, "/stage");

  await hostRunButton(page, "Draw Set").nth(0).click();
  await hostRunButton(page, "Draw Set").nth(1).click();
  await expectStageRows(stagePage);
  await expectRenderedRealStageImage(stagePage);

  const seedTiebreakForm = page.locator("form", {
    has: page.getByRole("button", { name: "Seed Tiebreak" }),
  });
  await seedTiebreakForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await seedTiebreakForm.getByPlaceholder("Audit reason").fill("e2e forced tiebreak");
  await page.getByRole("button", { name: "Seed Tiebreak" }).click();
  await hostRunButton(page, "Close Voting").click();
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("voting closed", { exact: true }),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await hostRunButton(page, "Compute Results").click();
  await expect(
    page.getByTestId("admin-host-run-controls").getByText("results computed", { exact: true }),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await expectAdminRevealPhase(page, "computed");
  await advanceRevealAndWaitForAdminPhase(page, "set 1 counts");
  await expect(stagePage.getByTestId("result-selected-label")).toHaveCount(0, { timeout: 500 });
  await advanceRevealAndWaitForAdminPhase(page, "set 1 resolved");
  await expectStageAcceptedResultPhase(stagePage, "set_1_resolved");

  await expect(stagePage.getByTestId("rune-wheel-slot")).toHaveCount(12);
  await expect(stagePage.getByTestId("rune-wheel")).not.toContainText("Sealed rune");
  await expect(stagePage.getByTestId("rune-wheel-slot").first()).not.toContainText(/\d|S\d/);
  await expectStageFitsProjectorViewport(stagePage, "focused tiebreak wheel");

  await expect(stagePage.getByTestId("rune-wheel")).toHaveAttribute(
    "data-winner-revealed",
    "true",
    {
      timeout: 13_000,
    },
  );
  await expect
    .poll(() =>
      stagePage
        .getByTestId("rune-wheel-slot")
        .evaluateAll(
          (slots) =>
            slots.filter((slot) => slot.getAttribute("data-slot-winner") === "true").length,
        ),
    )
    .toBe(1);
  await expect(stagePage.getByTestId("rune-wheel-status")).toContainText(
    "Selected chart:",
  );
  await expect(stagePage.getByTestId("result-selected-label")).toHaveCount(0);

  await clickAdminActionAndWait(page, hostRunButton(page, "Release"));
  await expect(hostRunButton(page, "Release")).toBeDisabled();
});
