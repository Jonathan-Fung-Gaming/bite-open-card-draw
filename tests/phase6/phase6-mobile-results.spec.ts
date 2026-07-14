import { expect, test, type Locator, type Page } from "@playwright/test";
import { TIEBREAK_REVEAL_DURATION_MS } from "../../src/lib/results/reveal-timing";
import { clickAdminActionAndWait, goto, loginAndTakeHost } from "../e2e/admin-helpers";
import { writeJsonEvidence } from "../e2e/evidence-artifacts";
import { hostRunButton, releaseHostIfHeld, startFreshRehearsal } from "../phase2/helpers";

test.describe.configure({ mode: "serial" });

const MOBILE_VIEWPORTS = [
  { height: 568, width: 320 },
  { height: 640, width: 360 },
  { height: 844, width: 390 },
] as const;
const DESKTOP_VIEWPORTS = [
  { height: 900, width: 1280 },
  { height: 900, width: 1440 },
] as const;
const LONG_UNBROKEN_TITLE = "PHASESIXMOBILEUNBROKENCHARTTITLEWITHOUTANYSPACESMUSTWRAPCOMPLETELY123";
const LONG_CJK_ARTIST =
  "超長いアーティスト名が省略されず完全に折り返されることを確認する Phase Six Artist";

type Box = { height: number; width: number; x: number; y: number };

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

function roundedBox(box: Box | null) {
  return box
    ? {
        height: rounded(box.height),
        width: rounded(box.width),
        x: rounded(box.x),
        y: rounded(box.y),
      }
    : null;
}

async function settleVisuals(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((image) => {
        if (image.complete) {
          return image.decode().catch(() => undefined);
        }

        return new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function prepareFinalRound(adminPage: Page) {
  await loginAndTakeHost(adminPage, "Phase 6 mobile results evidence");
  await startFreshRehearsal(adminPage, "Phase 6 mobile results evidence");
  await expect(adminPage.getByText("Rehearsal mode", { exact: true }).first()).toBeVisible();
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(0));
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(1));
  await clickAdminActionAndWait(
    adminPage,
    hostRunButton(adminPage, "Open Voting").filter({ visible: true }).first(),
  );
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Close Voting"));
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Compute Results"));
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Advance to Set 1 counts"));
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Reveal Set 1 selected chart"));
  await adminPage.waitForTimeout(TIEBREAK_REVEAL_DURATION_MS + 250);
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Advance to Set 2 counts"));
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Reveal Set 2 selected chart"));
  await adminPage.waitForTimeout(TIEBREAK_REVEAL_DURATION_MS + 250);
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Show final charts"));

  const holdingPage = await adminPage.context().newPage();

  try {
    await goto(holdingPage, "/results");
    await expect(holdingPage.getByText("Results are being revealed on stage.")).toBeVisible();
    await expect(holdingPage.getByTestId("stage-chart-card")).toHaveCount(0);
    await expect(holdingPage.getByText("Show Ban Counts", { exact: true })).toHaveCount(0);
  } finally {
    await holdingPage.close();
  }

  await clickAdminActionAndWait(
    adminPage,
    hostRunButton(adminPage, "Confirm Stage Reveal Complete"),
  );
  await expect(
    adminPage.getByTestId("admin-host-run-controls").getByText("Phones and results released"),
  ).toBeVisible();
}

async function collectDesktopGeometry(page: Page) {
  const cards = page.getByTestId("stage-chart-card");
  const titles = page.getByTestId("selected-chart-title");
  const artists = page.getByTestId("selected-chart-artist");
  const difficulties = page.getByTestId("selected-chart-difficulty");
  const countHeading = page.getByRole("heading", { name: "Ban counts" });
  const details = page.locator("details:visible");
  const winnerGrid = cards.first().locator("..");
  const infoPanel = titles.first().locator("..").locator("..");
  const section = page.locator("main > section");

  await expect(cards).toHaveCount(2);
  await expect(details).toHaveCount(2);
  await expect(page.getByText("Show Ban Counts", { exact: true })).toBeHidden();

  return {
    cards: await Promise.all(
      (await cards.all()).map(async (card) => roundedBox(await card.boundingBox())),
    ),
    countHeadingFontSize: await countHeading.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    ),
    difficultyFontSizes: await difficulties.evaluateAll((elements) =>
      elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ),
    artistFontSizes: await artists.evaluateAll((elements) =>
      elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ),
    header: roundedBox(await page.getByTestId("round-header").boundingBox()),
    infoPanel: await infoPanel.evaluate((element) => {
      const style = getComputedStyle(element);

      return {
        minHeight: Number.parseFloat(style.minHeight),
        paddingTop: Number.parseFloat(style.paddingTop),
      };
    }),
    section: await section.evaluate((element) => {
      const style = getComputedStyle(element);

      return {
        paddingLeft: Number.parseFloat(style.paddingLeft),
        paddingTop: Number.parseFloat(style.paddingTop),
      };
    }),
    summaryFontSizes: await details
      .locator("summary")
      .evaluateAll((elements) =>
        elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      ),
    titleFontSizes: await titles.evaluateAll((elements) =>
      elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ),
    winnerGrid: await winnerGrid.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();

      return {
        box: {
          height: box.height,
          width: box.width,
          x: box.x,
          y: box.y,
        },
        columnGap: Number.parseFloat(style.columnGap),
        gridTemplateColumns: style.gridTemplateColumns,
      };
    }),
  };
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

async function visibleMobileDisclosure(page: Page) {
  return page.locator('details[data-testid="results-ban-count-disclosure"]:visible');
}

type ReadabilityEvidence = {
  clientHeight: number;
  clientWidth: number;
  fontSize: number;
  lineClamp: string;
  scrollHeight: number;
  scrollWidth: number;
  text: string;
  textOverflow: string;
  whiteSpace: string;
};

function assertReadableEvidence(evidence: ReadabilityEvidence[], label: string) {
  for (const item of evidence) {
    expect(item.text.length, `${label} should contain full text`).toBeGreaterThan(0);
    expect(item.fontSize, `${label} font size`).toBeGreaterThanOrEqual(12);
    expect(item.lineClamp, `${label} line clamp`).toBe("none");
    expect(item.textOverflow, `${label} text overflow`).not.toBe("ellipsis");
    expect(item.whiteSpace, `${label} white space`).toBe("normal");
    expect(item.scrollWidth, `${label} horizontal clipping`).toBeLessThanOrEqual(
      item.clientWidth + 1,
    );
    expect(item.scrollHeight, `${label} vertical clipping`).toBeLessThanOrEqual(
      item.clientHeight + 1,
    );
  }
}

async function expectTextReadable(locator: Locator, label: string) {
  const evidence = await locator.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);

      return {
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        fontSize: Number.parseFloat(style.fontSize),
        lineClamp: style.getPropertyValue("-webkit-line-clamp"),
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        text: element.textContent?.trim() ?? "",
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      };
    }),
  );

  assertReadableEvidence(evidence, label);
}

async function collectMobileFit(page: Page) {
  const cards = page.getByTestId("stage-chart-card");
  const details = await visibleMobileDisclosure(page);
  const summary = details.locator("summary");
  const images = cards.getByTestId("stage-chart-image");

  await expect(cards).toHaveCount(2);
  await expect(details).toHaveCount(1);
  await expect(summary).toContainText("Show Ban Counts");
  await expect(summary).toHaveAccessibleName("Show Ban Counts");
  await expect(images).toHaveCount(2);
  await expect
    .poll(() =>
      images.evaluateAll((elements) =>
        elements.every((element) => (element as HTMLImageElement).naturalWidth > 0),
      ),
    )
    .toBe(true);
  await expectTextReadable(page.getByTestId("selected-chart-title"), "winner title");
  await expectTextReadable(page.getByTestId("selected-chart-artist"), "winner artist");
  await expectTextReadable(page.getByTestId("selected-chart-difficulty"), "winner difficulty");
  await expectNoHorizontalOverflow(page);

  const fit = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="stage-chart-card"]'));
    const grid = document.querySelector('[data-testid="results-winner-grid"]');
    const disclosure = document.querySelector(
      'details[data-testid="results-ban-count-disclosure"]',
    );
    const summary = disclosure?.querySelector("summary");
    const viewport = window.visualViewport;

    if (!grid || !disclosure || !summary || !viewport || cards.length !== 2) {
      throw new Error("Missing Phase 6 mobile geometry target.");
    }

    const cardBoxes = cards.map((card) => card.getBoundingClientRect());
    const gridBox = grid.getBoundingClientRect();
    const disclosureBox = disclosure.getBoundingClientRect();
    const summaryBox = summary.getBoundingClientRect();

    return {
      cards: cardBoxes.map((box) => ({
        bottom: box.bottom,
        height: box.height,
        width: box.width,
        x: box.x,
        y: box.y,
      })),
      disclosure: {
        height: disclosureBox.height,
        summaryBottom: summaryBox.bottom,
        summaryHeight: summaryBox.height,
        y: disclosureBox.y,
      },
      grid: {
        bottom: gridBox.bottom,
        height: gridBox.height,
        y: gridBox.y,
      },
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollY: window.scrollY,
      viewport: {
        bottom: viewport.offsetTop + viewport.height,
        height: viewport.height,
        scale: viewport.scale,
        width: viewport.width,
      },
    };
  });

  expect(fit.scrollY).toBe(0);
  expect(fit.cards[0]!.y).toBeCloseTo(fit.cards[1]!.y, 0);
  expect(fit.cards[0]!.x + fit.cards[0]!.width).toBeLessThanOrEqual(fit.cards[1]!.x + 1);
  expect(fit.disclosure.y).toBeGreaterThanOrEqual(fit.grid.bottom);
  expect(fit.disclosure.y - fit.grid.bottom).toBeLessThanOrEqual(12);
  expect(fit.disclosure.summaryHeight).toBeGreaterThanOrEqual(44);
  expect(fit.viewport.scale).toBe(1);
  expect(fit.horizontalOverflow).toBeLessThanOrEqual(1);

  for (const card of fit.cards) {
    expect(card.bottom).toBeLessThanOrEqual(fit.viewport.bottom + 1);
  }
  expect(fit.disclosure.summaryBottom).toBeLessThanOrEqual(fit.viewport.bottom + 1);

  return fit;
}

async function stressWrappedNames(page: Page) {
  return page.evaluate(
    ({ artist, title }) => {
      const titles = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="selected-chart-title"]'),
      );
      const artists = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="selected-chart-artist"]'),
      );

      for (const element of titles) {
        element.textContent = title;
      }
      for (const element of artists) {
        element.textContent = artist;
      }

      const viewport = window.visualViewport;
      const summary = document.querySelector<HTMLElement>(
        'details[data-testid="results-ban-count-disclosure"] summary',
      );

      if (!viewport || !summary) {
        throw new Error("Missing stress-test viewport or disclosure.");
      }

      const readability = (elements: HTMLElement[]) =>
        elements.map((element) => {
          const style = getComputedStyle(element);

          return {
            clientHeight: element.clientHeight,
            clientWidth: element.clientWidth,
            fontSize: Number.parseFloat(style.fontSize),
            lineClamp: style.getPropertyValue("-webkit-line-clamp"),
            scrollHeight: element.scrollHeight,
            scrollWidth: element.scrollWidth,
            text: element.textContent?.trim() ?? "",
            textOverflow: style.textOverflow,
            whiteSpace: style.whiteSpace,
          };
        });

      return {
        artistText: artists.map((element) => element.textContent),
        artistReadability: readability(artists),
        cards: Array.from(document.querySelectorAll('[data-testid="stage-chart-card"]')).map(
          (element) => element.getBoundingClientRect().bottom,
        ),
        summaryBottom: summary.getBoundingClientRect().bottom,
        titleText: titles.map((element) => element.textContent),
        titleReadability: readability(titles),
        viewportBottom: viewport.offsetTop + viewport.height,
      };
    },
    { artist: LONG_CJK_ARTIST, title: LONG_UNBROKEN_TITLE },
  );
}

test("@phase6 desktop final results retain their established geometry and typography", async ({
  page: adminPage,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phase6-desktop-chromium");
  expect(baseURL).toBeTruthy();
  await prepareFinalRound(adminPage);

  try {
    const resultsPage = await adminPage.context().newPage();

    try {
      const evidence = [];

      for (const viewport of DESKTOP_VIEWPORTS) {
        await resultsPage.setViewportSize(viewport);
        await goto(resultsPage, "/results");
        await expect(
          resultsPage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" }),
        ).toBeVisible();
        await settleVisuals(resultsPage);
        const geometry = await collectDesktopGeometry(resultsPage);

        expect(geometry.titleFontSizes).toEqual([48, 48]);
        expect(geometry.artistFontSizes).toEqual([24, 24]);
        expect(geometry.difficultyFontSizes).toEqual([48, 48]);
        expect(geometry.countHeadingFontSize).toBe(36);
        expect(geometry.summaryFontSizes).toEqual([24, 24]);
        expect(geometry.infoPanel).toEqual({ minHeight: 192, paddingTop: 20 });
        expect(geometry.section).toEqual({ paddingLeft: 20, paddingTop: 20 });
        expect(geometry.header).toEqual({ height: 145, width: viewport.width, x: 0, y: 0 });
        expect(geometry.winnerGrid.columnGap).toBe(16);
        expect(geometry.winnerGrid.box.width).toBeCloseTo(1240, 1);
        expect(geometry.winnerGrid.box.x).toBeCloseTo((viewport.width - 1240) / 2, 1);
        expect(geometry.winnerGrid.box.y).toBeCloseTo(165, 1);
        for (const card of geometry.cards) {
          expect(card?.height).toBeCloseTo(geometry.winnerGrid.box.height, 1);
          expect(card?.height).toBeGreaterThanOrEqual(545);
          expect(card?.width).toBeCloseTo(612, 1);
          expect(card?.y).toBeCloseTo(165, 1);
        }
        await expectNoHorizontalOverflow(resultsPage);
        await resultsPage.screenshot({
          fullPage: false,
          path: testInfo.outputPath(`phase6-results-desktop-${viewport.width}.png`),
        });
        evidence.push({ geometry, viewport });
      }

      await writeJsonEvidence(testInfo, "phase6-results-desktop-geometry.json", evidence);
    } finally {
      await resultsPage.close();
    }
  } finally {
    await releaseHostIfHeld(adminPage);
  }
});

test("@phase6 mobile final results fit and remain accessible in Chromium and WebKit", async ({
  page: adminPage,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name === "phase6-desktop-chromium");
  expect(baseURL).toBeTruthy();
  await prepareFinalRound(adminPage);
  let resultsPage = await adminPage.context().newPage();

  try {
    const evidence = [];

    for (const [viewportIndex, viewport] of MOBILE_VIEWPORTS.entries()) {
      if (viewportIndex > 0) {
        await resultsPage.close();
        resultsPage = await adminPage.context().newPage();
      }

      await resultsPage.setViewportSize(viewport);
      await goto(resultsPage, "/results");
      await expect(
        resultsPage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" }),
      ).toBeVisible();
      await settleVisuals(resultsPage);
      await expect(resultsPage.getByTestId("round-header")).toHaveAttribute(
        "data-mobile-compact",
        "true",
      );
      const details = await visibleMobileDisclosure(resultsPage);
      const summary = details.locator("summary");

      if ((await details.getAttribute("open")) !== null) {
        await summary.click();
        await expect(details).not.toHaveAttribute("open", "");
      }
      await resultsPage.evaluate(() => window.scrollTo(0, 0));
      const fit = await collectMobileFit(resultsPage);

      if (viewport.width === 320) {
        await summary.focus();
        await expect(summary).toBeFocused();
        await summary.press("Enter");
        await expect(details).toHaveAttribute("open", "");
        await summary.press("Space");
        await expect(details).not.toHaveAttribute("open", "");
      }
      await resultsPage.screenshot({
        fullPage: false,
        path: testInfo.outputPath(
          `phase6-${testInfo.project.name}-results-normal-${viewport.width}x${viewport.height}.png`,
        ),
      });
      if (viewportIndex === 0) {
        await resultsPage.waitForResponse(
          (response) =>
            response.request().method() === "GET" &&
            new URL(response.url()).pathname === "/results" &&
            new URL(response.url()).searchParams.has("_rsc"),
          { timeout: 5_000 },
        );
        await settleVisuals(resultsPage);
        const nextRefresh = resultsPage.waitForResponse(
          (response) =>
            response.request().method() === "GET" &&
            new URL(response.url()).pathname === "/results" &&
            new URL(response.url()).searchParams.has("_rsc"),
          { timeout: 5_000 },
        );

        await summary.tap();
        await expect(details).toHaveAttribute("open", "");
        await nextRefresh;
        await expect(details).toHaveAttribute("open", "");
        const lists = details.getByTestId("results-ban-count-list");

        await expect(lists).toHaveCount(2);
        for (const index of [0, 1]) {
          await expect(lists.nth(index).locator("li")).toHaveCount(7);
          const counts = await lists
            .nth(index)
            .locator('[data-testid="public-result-row"] > div:last-child > p:first-child')
            .allTextContents();
          const numericCounts = counts.map((text) => Number.parseInt(text, 10));

          expect(numericCounts).toEqual([...numericCounts].sort((left, right) => left - right));
        }
        await expect(details.getByTestId("result-selected-label")).toHaveCount(2);
        await expect(details).not.toContainText("%");
        await expectNoHorizontalOverflow(resultsPage);
        const storageKey = await details.getAttribute("data-storage-key");

        expect(storageKey).toMatch(/^bite-open-card-draw:results-ban-counts:/);
        expect(
          await resultsPage.evaluate((key) => window.sessionStorage.getItem(key!), storageKey),
        ).toBe("open");
        await details.locator("li").last().scrollIntoViewIfNeeded();
        await expect(details.locator("li").last()).toBeVisible();
        expect(
          await resultsPage.evaluate(() => getComputedStyle(document.body).overflowY),
        ).not.toBe("hidden");
      }

      await resultsPage.reload({ waitUntil: "domcontentloaded" });
      await expect(
        resultsPage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" }),
      ).toBeVisible();
      await resultsPage.evaluate(() => window.scrollTo(0, 0));
      await settleVisuals(resultsPage);
      const stress = await stressWrappedNames(resultsPage);

      expect(stress.titleText).toEqual([LONG_UNBROKEN_TITLE, LONG_UNBROKEN_TITLE]);
      expect(stress.artistText).toEqual([LONG_CJK_ARTIST, LONG_CJK_ARTIST]);
      for (const bottom of stress.cards) {
        expect(bottom).toBeLessThanOrEqual(stress.viewportBottom + 1);
      }
      expect(stress.summaryBottom).toBeLessThanOrEqual(stress.viewportBottom + 1);
      assertReadableEvidence(stress.titleReadability, "stress title");
      assertReadableEvidence(stress.artistReadability, "stress artist");
      await resultsPage.screenshot({
        fullPage: false,
        path: testInfo.outputPath(
          `phase6-${testInfo.project.name}-results-stress-${viewport.width}x${viewport.height}.png`,
        ),
      });
      evidence.push({ fit, stress, viewport });
    }

    await writeJsonEvidence(
      testInfo,
      `phase6-${testInfo.project.name}-mobile-results-geometry.json`,
      evidence,
    );

    await clickAdminActionAndWait(
      adminPage,
      adminPage.getByRole("button", { name: "Advance To Round 2" }),
    );
    await resultsPage.close();
    resultsPage = await adminPage.context().newPage();
    await resultsPage.setViewportSize({ height: 568, width: 320 });
    await goto(resultsPage, "/results");
    await expect(resultsPage.getByTestId("previous-round-results-notice")).toContainText(
      "Showing Round 1. Round 2 is not final yet.",
    );
    await expect(resultsPage.getByText("Show Ban Counts", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(resultsPage);
  } finally {
    if (!resultsPage.isClosed()) {
      await resultsPage.close();
    }
    await releaseHostIfHeld(adminPage);
  }
});
