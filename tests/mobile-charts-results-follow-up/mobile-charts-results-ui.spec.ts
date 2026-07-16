import { expect, test } from "@playwright/test";
import {
  activeChartsPanel,
  expectActiveChartsSetFits,
  expectCanonicalRevealDoesNotLeak,
  expectCompactBanPanelRows,
  expectImageAndPanelFit,
  expectNoHorizontalOverflow,
  expectReadableCompactResultType,
  expectTabLabelIsSingleLine,
  expectWinnerMetadataOverlaysImages,
  finishCurrentRoundDrawsAndOpenVoting,
  goto,
  MOBILE_VIEWPORTS,
  prepareFinalRound,
  prepareFreshRoundWithFirstDraw,
  releaseFollowUpHost,
  settleVisuals,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test("@mobile-charts-results-follow-up /charts mobile cleanup, reveal, tab scroll, and fit", async ({
  page: adminPage,
  baseURL,
}, testInfo) => {
  expect(baseURL).toBeTruthy();
  await prepareFreshRoundWithFirstDraw(adminPage);
  const chartsPage = await adminPage.context().newPage();

  try {
    await chartsPage.setViewportSize({ height: 568, width: 320 });
    await goto(chartsPage, "/charts");
    await settleVisuals(chartsPage);
    await expect(chartsPage.getByTestId("view-only-status")).toHaveCount(0);
    await expectTabLabelIsSingleLine(chartsPage.getByRole("tab").nth(0), "VIEW SET 1 (S16)");
    await expectTabLabelIsSingleLine(chartsPage.getByRole("tab").nth(1), "VIEW SET 2 (S17)");
    await expectCanonicalRevealDoesNotLeak(chartsPage);
    await expectNoHorizontalOverflow(chartsPage);

    await finishCurrentRoundDrawsAndOpenVoting(adminPage);

    for (const viewport of MOBILE_VIEWPORTS) {
      await chartsPage.setViewportSize(viewport);
      await goto(chartsPage, "/charts");
      await settleVisuals(chartsPage);
      await expect(chartsPage.getByTestId("view-only-status")).toHaveCount(0);
      await expectTabLabelIsSingleLine(chartsPage.getByRole("tab").nth(0), "VIEW SET 1 (S16)");
      await expectTabLabelIsSingleLine(chartsPage.getByRole("tab").nth(1), "VIEW SET 2 (S17)");

      const setTwoTab = chartsPage.getByRole("tab", { name: "VIEW SET 2 (S17)" });

      await chartsPage.evaluate(() => window.scrollTo(0, 0));
      const beforeScrollY = await chartsPage.evaluate(() => window.scrollY);
      await setTwoTab.click();
      await expect(setTwoTab).toHaveAttribute("aria-selected", "true");
      expect(await chartsPage.evaluate(() => window.scrollY)).toBe(beforeScrollY);
      expect(new URL(chartsPage.url()).hash).toBe("");

      const panel = await activeChartsPanel(chartsPage);

      await expect(panel).toHaveAttribute("id", "view-only-set-2");
      await expectActiveChartsSetFits(chartsPage);
      if (viewport.width === 390) {
        await chartsPage.screenshot({
          path: testInfo.outputPath("charts-mobile-390-set-2.png"),
        });
      }
    }
  } finally {
    await chartsPage.close();
    await releaseFollowUpHost(adminPage);
  }
});

test("@mobile-charts-results-follow-up /results mobile image disclosure, fit, and stage isolation", async ({
  page: adminPage,
  baseURL,
}, testInfo) => {
  expect(baseURL).toBeTruthy();
  await prepareFinalRound(adminPage);
  const resultsPage = await adminPage.context().newPage();
  const chartsPage = await adminPage.context().newPage();
  const stagePage = await adminPage.context().newPage();

  try {
    for (const viewport of MOBILE_VIEWPORTS) {
      await resultsPage.setViewportSize(viewport);
      await goto(resultsPage, "/results");
      await resultsPage.evaluate(() => {
        for (const key of Object.keys(window.sessionStorage)) {
          if (key.startsWith("bite-open-card-draw:results-expanded-set:")) {
            window.sessionStorage.removeItem(key);
          }
        }
      });
      await resultsPage.reload({ waitUntil: "domcontentloaded" });
      await settleVisuals(resultsPage);
      await expect(resultsPage.getByText("Show Ban Counts", { exact: true })).toHaveCount(0);
      await expect(resultsPage.getByTestId("results-ban-count-disclosure")).toHaveCount(0);
      await expect(resultsPage.getByTestId("results-mobile-ban-prompt")).toHaveText(
        "CLICK A CHART TO VIEW BAN COUNTS",
      );
      await expect(resultsPage.getByTestId("results-mobile-ban-prompt")).toBeInViewport();
      const promptBox = await resultsPage.getByTestId("results-mobile-ban-prompt").boundingBox();

      expect(promptBox?.height).toBeLessThanOrEqual(34);
      await expectWinnerMetadataOverlaysImages(resultsPage);
      if (viewport.width === 390) {
        await resultsPage.screenshot({
          path: testInfo.outputPath("results-mobile-390-collapsed.png"),
        });
      }

      const toggles = resultsPage.getByTestId("results-mobile-winner-toggle");
      const panels = resultsPage.getByTestId("results-mobile-ban-panel");

      await expect(toggles).toHaveCount(2);
      await expect(panels).toHaveCount(0);
      await expect(toggles.nth(0)).toHaveAttribute("aria-expanded", "false");
      await expect(toggles.nth(1)).toHaveAttribute("aria-expanded", "false");
      await expect(
        resultsPage.locator('[data-testid="results-mobile-ban-panel"][data-expanded="true"]'),
      ).toHaveCount(0);

      await resultsPage.evaluate(() => window.scrollTo(0, 0));
      await toggles.nth(0).click();
      await expect(toggles.nth(0)).toHaveAttribute("aria-expanded", "true");
      await expect(toggles.nth(1)).toHaveAttribute("aria-expanded", "false");
      await expect(resultsPage.getByTestId("results-mobile-ban-prompt")).toHaveCount(0);
      const firstExpanded = resultsPage.locator(
        '[data-testid="results-mobile-ban-panel"][data-expanded="true"]',
      );

      await expect(firstExpanded).toHaveCount(1);
      await expectCompactBanPanelRows(firstExpanded, "S16");
      await expectReadableCompactResultType(resultsPage, firstExpanded);
      await expectImageAndPanelFit(
        resultsPage,
        toggles.nth(0).getByTestId("stage-chart-image"),
        firstExpanded,
      );
      if (viewport.width === 390) {
        await resultsPage.screenshot({
          path: testInfo.outputPath("results-mobile-390-set-1-expanded.png"),
        });
      }

      await toggles.nth(0).click();
      await expect(toggles.nth(0)).toHaveAttribute("aria-expanded", "false");
      await expect(resultsPage.getByTestId("results-mobile-ban-prompt")).toHaveText(
        "CLICK A CHART TO VIEW BAN COUNTS",
      );
      await expect(
        resultsPage.locator('[data-testid="results-mobile-ban-panel"][data-expanded="true"]'),
      ).toHaveCount(0);

      await toggles.nth(1).click();
      await expect(toggles.nth(0)).toHaveAttribute("aria-expanded", "false");
      await expect(toggles.nth(1)).toHaveAttribute("aria-expanded", "true");
      await expect(resultsPage.getByTestId("results-mobile-ban-prompt")).toHaveCount(0);
      const secondExpanded = resultsPage.locator(
        '[data-testid="results-mobile-ban-panel"][data-expanded="true"]',
      );

      await expect(secondExpanded).toHaveCount(1);
      await expectCompactBanPanelRows(secondExpanded, "S17");
      await expectReadableCompactResultType(resultsPage, secondExpanded);
      await expectImageAndPanelFit(
        resultsPage,
        toggles.nth(1).getByTestId("stage-chart-image"),
        secondExpanded,
      );
      await expectNoHorizontalOverflow(resultsPage);

      await chartsPage.setViewportSize(viewport);
      await goto(chartsPage, "/charts");
      await settleVisuals(chartsPage);
      await expect(chartsPage.getByTestId("mobile-public-result-summary")).toBeVisible();
      await expectWinnerMetadataOverlaysImages(chartsPage);
      const chartsToggles = chartsPage.getByTestId("results-mobile-winner-toggle");

      await expect(chartsToggles).toHaveCount(2);
      await chartsToggles.nth(0).click();
      const chartsExpanded = chartsPage.locator(
        '[data-testid="results-mobile-ban-panel"][data-expanded="true"]',
      );

      await expectCompactBanPanelRows(chartsExpanded, "S16");
      await expectReadableCompactResultType(chartsPage, chartsExpanded);
      if (viewport.width === 390) {
        await chartsPage.screenshot({
          path: testInfo.outputPath("charts-mobile-390-results-expanded.png"),
        });
      }
    }

    if (testInfo.project.name === "mobile-charts-results-follow-up-webkit") {
      await resultsPage.setViewportSize({ height: 664, width: 390 });
      await goto(resultsPage, "/results");
      await settleVisuals(resultsPage);
      await resultsPage.getByTestId("results-mobile-winner-toggle").nth(0).click();
      await expect(
        resultsPage.locator('[data-testid="results-mobile-ban-panel"][data-expanded="true"]'),
      ).toBeVisible();
      await resultsPage.screenshot({
        path: testInfo.outputPath("results-iphone-13-safari-expanded.png"),
      });

      await chartsPage.setViewportSize({ height: 664, width: 390 });
      await goto(chartsPage, "/charts");
      await settleVisuals(chartsPage);
      await chartsPage.getByTestId("results-mobile-winner-toggle").nth(0).click();
      await expect(
        chartsPage.locator('[data-testid="results-mobile-ban-panel"][data-expanded="true"]'),
      ).toBeVisible();
      await chartsPage.screenshot({
        path: testInfo.outputPath("charts-iphone-13-safari-expanded.png"),
      });
    }

    await stagePage.setViewportSize({ height: 844, width: 390 });
    await goto(stagePage, "/stage");
    await settleVisuals(stagePage);
    await expect(stagePage.getByTestId("stage-final-chart-list")).toBeVisible();
    await expect(
      stagePage.getByTestId("stage-final-chart-list").getByTestId("stage-chart-card"),
    ).toHaveCount(2);
    await expect(stagePage.getByTestId("results-mobile-winner-toggle")).toHaveCount(0);
    await expect(stagePage.getByTestId("results-mobile-ban-panel")).toHaveCount(0);
    await expect(stagePage.getByTestId("results-mobile-ban-prompt")).toHaveCount(0);
    await expect(stagePage.getByText("Show Ban Counts", { exact: true })).toHaveCount(0);
  } finally {
    await resultsPage.close();
    await chartsPage.close();
    await stagePage.close();
    await releaseFollowUpHost(adminPage);
  }
});
