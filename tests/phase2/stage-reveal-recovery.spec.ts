import { expect, test, type BrowserContext } from "@playwright/test";
import { clickAdminActionAndWait, goto, loginAndTakeHost } from "../e2e/admin-helpers";
import {
  expectAllStageChartsVisible,
  hostRunButton,
  releaseHostIfHeld,
  setPhase2VotingState,
  startFreshOpenRound,
  startFreshRehearsal,
} from "./helpers";

test("@phase2 pre-vote reload resumes canonical Set 1 then Set 2 progress", async ({
  page: adminPage,
}) => {
  try {
    await loginAndTakeHost(adminPage);
    await startFreshRehearsal(adminPage, "Phase 2 pre-vote canonical reveal recovery");

    const stagePage = await adminPage.context().newPage();

    await goto(stagePage, "/stage");
    const countdownDisplay = stagePage.getByTestId("stage-countdown-display");

    await expect(countdownDisplay).toHaveText("--:--");
    await stagePage.evaluate(() => {
      type Phase2Window = Window & {
        __phase2CountdownHistory?: string[];
        __phase2CountdownObserver?: MutationObserver;
      };
      const target = window as Phase2Window;
      const display = document.querySelector('[data-testid="stage-countdown-display"]');

      target.__phase2CountdownObserver?.disconnect();
      target.__phase2CountdownHistory = [display?.textContent?.trim() ?? "missing"];
      target.__phase2CountdownObserver = new MutationObserver(() => {
        target.__phase2CountdownHistory?.push(display?.textContent?.trim() ?? "missing");
      });

      if (display) {
        target.__phase2CountdownObserver.observe(display, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }
    });

    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(0));
    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(1));
    await expect(countdownDisplay).toHaveText("10:00");
    const countdownHistory = await stagePage.evaluate(() => {
      type Phase2Window = Window & { __phase2CountdownHistory?: string[] };
      return (window as Phase2Window).__phase2CountdownHistory ?? [];
    });

    expect(countdownHistory).not.toContain("00:00");

    const rows = stagePage.getByTestId("stage-set-row");
    const realCards = stagePage.locator('[data-testid="stage-chart-card"][data-has-chart="true"]');

    await expect(stagePage.getByTestId("stage-chart-rows")).toHaveAttribute(
      "data-reveal-visibility",
      "canonical",
    );
    await expect.poll(() => realCards.count()).toBeGreaterThan(0);
    const beforeReload = await realCards.count();

    const setOneBefore = await rows
      .nth(0)
      .locator('[data-testid="stage-chart-card"][data-has-chart="true"]')
      .count();
    const setTwoBefore = await rows
      .nth(1)
      .locator('[data-testid="stage-chart-card"][data-has-chart="true"]')
      .count();

    if (setOneBefore < 7) {
      expect(setTwoBefore).toBe(0);
    }

    await expect(
      stagePage.locator('[data-testid="stage-set-row"][data-reveal-transition-active="true"]'),
    ).toHaveCount(1);
    await stagePage.reload({ waitUntil: "domcontentloaded" });
    await expect(stagePage.locator('[data-animate-reveal="true"]')).toHaveCount(0);
    await expect.poll(() => realCards.count()).toBeGreaterThanOrEqual(beforeReload);

    const setOneAfter = await rows
      .nth(0)
      .locator('[data-testid="stage-chart-card"][data-has-chart="true"]')
      .count();
    const setTwoAfter = await rows
      .nth(1)
      .locator('[data-testid="stage-chart-card"][data-has-chart="true"]')
      .count();

    if (setOneAfter < 7) {
      expect(setTwoAfter).toBe(0);
    }
  } finally {
    await releaseHostIfHeld(adminPage);
  }
});

test("@phase2 voting-era stage reloads never replay the card reveal", async ({
  browser,
  page: adminPage,
}, testInfo) => {
  let freshStageContext: BrowserContext | null = null;

  try {
    await loginAndTakeHost(adminPage);
    await startFreshOpenRound(adminPage, "Phase 2 voting-era stage reveal recovery");

    const stagePage = await adminPage.context().newPage();

    await goto(stagePage, "/stage");
    await expect(
      stagePage.locator("header").getByText("Voting open", { exact: true }),
    ).toBeVisible();
    await expectAllStageChartsVisible(stagePage);

    await stagePage.reload({ waitUntil: "domcontentloaded" });
    await expectAllStageChartsVisible(stagePage);

    await stagePage.evaluate(() => window.sessionStorage.clear());
    await stagePage.reload({ waitUntil: "domcontentloaded" });
    await expectAllStageChartsVisible(stagePage);

    freshStageContext = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL),
      viewport: { height: 1080, width: 1920 },
    });
    const freshStagePage = await freshStageContext.newPage();

    await goto(freshStagePage, "/stage");
    await expectAllStageChartsVisible(freshStagePage);

    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Pause"));
    await expect(
      adminPage.getByTestId("admin-host-run-controls").getByText("Voting paused", { exact: true }),
    ).toBeVisible();
    await expect(
      stagePage.locator("header").getByText("Voting paused", { exact: true }),
    ).toBeVisible();
    await expect(
      freshStagePage.locator("header").getByText("Voting paused", { exact: true }),
    ).toBeVisible();
    await expectAllStageChartsVisible(stagePage);
    await expectAllStageChartsVisible(freshStagePage);

    await stagePage.evaluate(() => window.sessionStorage.clear());
    await stagePage.reload({ waitUntil: "domcontentloaded" });
    await expectAllStageChartsVisible(stagePage);

    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Resume"));
    await expect(
      adminPage.getByTestId("admin-host-run-controls").getByText("Voting open", { exact: true }),
    ).toBeVisible();

    const finalWarning = await setPhase2VotingState(adminPage, "final_30_seconds");

    expect(finalWarning.status).toBe("final_30_seconds");
    await expect(
      stagePage.locator("header").getByText("Final 30 seconds", { exact: true }),
    ).toBeVisible();
    await stagePage.reload({ waitUntil: "domcontentloaded" });
    await expectAllStageChartsVisible(stagePage);

    const extension = await setPhase2VotingState(adminPage, "extension_1_minute");

    expect(extension.status).toBe("extension_1_minute");
    expect(extension.generation).toBeGreaterThan(finalWarning.generation);
    await expect(
      stagePage.locator("header").getByText("Official one-minute extension", { exact: true }),
    ).toBeVisible();
    await stagePage.evaluate(() => window.sessionStorage.clear());
    await stagePage.reload({ waitUntil: "domcontentloaded" });
    await expectAllStageChartsVisible(stagePage);
    await freshStagePage.reload({ waitUntil: "domcontentloaded" });
    await expectAllStageChartsVisible(freshStagePage);
  } finally {
    await freshStageContext?.close().catch(() => undefined);
    await releaseHostIfHeld(adminPage);
  }
});
