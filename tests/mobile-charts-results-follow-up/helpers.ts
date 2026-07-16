import { expect, type Locator, type Page } from "@playwright/test";
import { TIEBREAK_REVEAL_DURATION_MS } from "../../src/lib/results/reveal-timing";
import { clickAdminActionAndWait, goto, loginAndTakeHost } from "../e2e/admin-helpers";
import { hostRunButton, releaseHostIfHeld, startFreshRehearsal } from "../phase2/helpers";

export const MOBILE_VIEWPORTS = [
  { height: 568, width: 320 },
  { height: 640, width: 360 },
  { height: 844, width: 390 },
] as const;

type Box = { height: number; width: number; x: number; y: number };

export async function settleVisuals(page: Page) {
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

export async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

export async function expectDocumentFitsViewport(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(1);
}

export async function expectWithinViewport(page: Page, locator: Locator, label: string) {
  const box = await locator.boundingBox();
  const viewport = await page.evaluate(() => {
    const visualViewport = window.visualViewport;

    return {
      bottom: visualViewport
        ? visualViewport.offsetTop + visualViewport.height
        : window.innerHeight,
      right: visualViewport ? visualViewport.offsetLeft + visualViewport.width : window.innerWidth,
    };
  });

  expect(box, `${label} must have layout`).not.toBeNull();
  expect(box!.x, `${label} left edge`).toBeGreaterThanOrEqual(-1);
  expect(box!.y, `${label} top edge`).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, `${label} right edge`).toBeLessThanOrEqual(viewport.right + 1);
  expect(box!.y + box!.height, `${label} bottom edge`).toBeLessThanOrEqual(viewport.bottom + 1);
}

export async function expectTabLabelIsSingleLine(tab: Locator, expectedLabel: string) {
  await expect(tab).toHaveText(expectedLabel);
  const metrics = await tab.evaluate((element) => {
    const style = getComputedStyle(element);

    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      tagName: element.tagName,
      text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
      whiteSpace: style.whiteSpace,
    };
  });

  expect(metrics.tagName).toBe("BUTTON");
  expect(metrics.text).toBe(expectedLabel);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.whiteSpace).not.toBe("normal");
}

export async function activeChartsPanel(page: Page) {
  const activeTab = page.getByRole("tab", { selected: true });
  await expect(activeTab).toHaveCount(1);
  const controls = await activeTab.getAttribute("aria-controls");

  expect(controls).toBeTruthy();
  return page.locator(`#${controls}`);
}

export async function expectActiveChartsSetFits(page: Page) {
  const panel = await activeChartsPanel(page);
  const cards = panel.getByTestId("stage-chart-card");
  const realCards = panel.locator('[data-testid="stage-chart-card"][data-has-chart="true"]');

  await expect(panel).toBeVisible();
  await expect(cards).toHaveCount(7);
  await expect(realCards).toHaveCount(7);
  await expectWithinViewport(page, panel, "active /charts set panel");
  await expectNoHorizontalOverflow(page);
  await expectDocumentFitsViewport(page);
}

export async function expectCanonicalRevealDoesNotLeak(page: Page) {
  const panel = page.locator('[data-testid="stage-set-row"][data-set-order="1"]').first();
  const cards = panel.getByTestId("stage-chart-card");
  const realCards = panel.locator('[data-testid="stage-chart-card"][data-has-chart="true"]');
  const placeholders = panel.locator('[data-testid="stage-chart-card"][data-has-chart="false"]');

  await expect(panel).toBeVisible();
  await expect(cards).toHaveCount(7);
  await expect.poll(() => realCards.count()).toBeGreaterThan(0);

  const revealedCount = await realCards.count();

  expect(revealedCount).toBeLessThan(7);
  await expect(placeholders).toHaveCount(7 - revealedCount);
  await expect(placeholders.locator('[data-testid="chart-card-title"]')).toHaveCount(0);
  await expect(placeholders.locator('[data-testid="chart-card-artist"]')).toHaveCount(0);
}

async function waitForEnabledHostRunButton(page: Page, name: string | RegExp, index = 0) {
  await expect
    .poll(() =>
      hostRunButton(page, name)
        .nth(index)
        .isEnabled()
        .catch(() => false),
    )
    .toBe(true);
}

export async function prepareFreshRoundWithFirstDraw(adminPage: Page) {
  await loginAndTakeHost(adminPage, "Mobile charts/results follow-up evidence");
  await startFreshRehearsal(adminPage, "Mobile charts/results follow-up evidence");
  await waitForEnabledHostRunButton(adminPage, "Draw Set", 0);
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(0));
}

export async function finishCurrentRoundDrawsAndOpenVoting(adminPage: Page) {
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(1));
  await expect(
    adminPage.getByTestId("admin-host-run-controls").getByText("Ready to vote", { exact: true }),
  ).toBeVisible();
  await clickAdminActionAndWait(
    adminPage,
    hostRunButton(adminPage, "Open Voting").filter({ visible: true }).first(),
  );
  await expect(
    adminPage.getByTestId("admin-host-run-controls").getByText("Voting open", { exact: true }),
  ).toBeVisible();
}

export async function prepareFinalRound(adminPage: Page) {
  await loginAndTakeHost(adminPage, "Mobile charts/results follow-up final evidence");
  await startFreshRehearsal(adminPage, "Mobile charts/results follow-up final evidence");
  await waitForEnabledHostRunButton(adminPage, "Draw Set", 0);
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(0));
  await waitForEnabledHostRunButton(adminPage, "Draw Set", 1);
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
  await clickAdminActionAndWait(
    adminPage,
    hostRunButton(adminPage, "Confirm Stage Reveal Complete"),
  );
  await expect(
    adminPage.getByTestId("admin-host-run-controls").getByText("Phones and results released"),
  ).toBeVisible();
}

export async function releaseFollowUpHost(adminPage: Page) {
  await releaseHostIfHeld(adminPage);
}

export async function expectWinnerMetadataOverlaysImages(page: Page) {
  const cards = page.getByTestId("stage-chart-card");

  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    const imageBox = await card.getByTestId("stage-chart-image").boundingBox();

    expect(imageBox, "winner image must have layout").not.toBeNull();
    for (const testId of [
      "selected-chart-difficulty",
      "selected-chart-title",
      "selected-chart-artist",
    ]) {
      const metadataBox = await card.getByTestId(testId).boundingBox();

      expect(metadataBox, `${testId} must have layout`).not.toBeNull();
      expect(metadataBox!.x).toBeGreaterThanOrEqual(imageBox!.x - 1);
      expect(metadataBox!.y).toBeGreaterThanOrEqual(imageBox!.y - 1);
      expect(metadataBox!.x + metadataBox!.width).toBeLessThanOrEqual(
        imageBox!.x + imageBox!.width + 1,
      );
      expect(metadataBox!.y + metadataBox!.height).toBeLessThanOrEqual(
        imageBox!.y + imageBox!.height + 1,
      );
    }
  }
}

export async function expectCompactBanPanelRows(panel: Locator, expectedDifficulty: string) {
  await expect(panel.getByText("Song", { exact: true })).toBeVisible();
  await expect(panel.getByText("Bans", { exact: true })).toBeVisible();
  const rows = panel.getByTestId("results-mobile-ban-row");

  await expect(rows).toHaveCount(7);
  const countTexts = await rows.getByTestId("results-mobile-ban-count").allTextContents();

  expect(countTexts).toHaveLength(7);
  for (const text of countTexts) {
    expect(text.trim()).toMatch(/^\d+$/);
  }

  for (const text of await rows.allTextContents()) {
    expect(text).not.toMatch(new RegExp(`\\b${expectedDifficulty}\\b`));
    expect(text).not.toMatch(/Selected|Least bans|%/i);
  }
}

export async function expectReadableCompactResultType(page: Page, panel: Locator) {
  const title = panel.getByTestId("results-mobile-ban-row").first().locator("p").nth(0);
  const artist = panel.getByTestId("results-mobile-ban-row").first().locator("p").nth(1);
  const count = panel.getByTestId("results-mobile-ban-count").first();
  const sizes = await Promise.all(
    [title, artist, count].map((locator) =>
      locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ),
  );

  expect(sizes[0]).toBeGreaterThanOrEqual(12);
  expect(sizes[1]).toBeGreaterThanOrEqual(11);
  expect(sizes[2]).toBeGreaterThanOrEqual(16);
  await expectNoHorizontalOverflow(page);
}

export async function expectImageAndPanelFit(page: Page, image: Locator, panel: Locator) {
  const imageBox = await image.boundingBox();
  const panelBox = await panel.boundingBox();

  expect(imageBox, "expanded winner image must have layout").not.toBeNull();
  expect(panelBox, "expanded compact ban panel must have layout").not.toBeNull();

  const union = {
    height:
      Math.max(imageBox!.y + imageBox!.height, panelBox!.y + panelBox!.height) -
      Math.min(imageBox!.y, panelBox!.y),
    width:
      Math.max(imageBox!.x + imageBox!.width, panelBox!.x + panelBox!.width) -
      Math.min(imageBox!.x, panelBox!.x),
    x: Math.min(imageBox!.x, panelBox!.x),
    y: Math.min(imageBox!.y, panelBox!.y),
  } satisfies Box;

  await expectWithinViewport(page, image, "expanded winner image");
  await expectWithinViewport(page, panel, "expanded compact ban panel");

  const viewport = await page.evaluate(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    width: window.visualViewport?.width ?? window.innerWidth,
  }));

  expect(union.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(union.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
}

export { goto };
