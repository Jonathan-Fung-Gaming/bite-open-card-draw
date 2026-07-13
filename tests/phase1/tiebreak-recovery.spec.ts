import { expect, test, type Page } from "@playwright/test";
import {
  clickAdminActionAndWait,
  getAdminPassword,
  goto,
  loginAndTakeHost,
  openRehearsalControls,
} from "../e2e/admin-helpers";

const ADMIN_PASSWORD = getAdminPassword();
const FORBIDDEN_RESULT_MODE_SELECTORS = [
  '[data-testid="stage-countdown"]',
  '[data-testid="stage-countdown-display"]',
  '[data-testid="stage-chart-rows"]',
];

function hostRunButton(page: Page, name: string | RegExp) {
  return page.getByTestId("admin-host-run-controls").getByRole("button", { name });
}

async function expectAdminRevealPhase(page: Page, phase: string) {
  await expect(
    page.getByTestId("admin-host-run-controls").getByText(phase, { exact: true }),
  ).toBeVisible();
}

async function advanceReveal(page: Page, expectedPhase: string) {
  const button = hostRunButton(
    page,
    /Advance to Set 1 counts|Reveal Set 1 selected chart|Advance to Set 2 counts|Reveal Set 2 selected chart|Show final charts/,
  );

  await expect(button).toBeEnabled();
  await clickAdminActionAndWait(page, button);
  await expectAdminRevealPhase(page, expectedPhase);
}

async function installForbiddenResultModeObserver(page: Page) {
  await page.evaluate((selectors) => {
    type Phase1Window = Window & {
      __phase1ForbiddenResultModeDom?: string[];
      __phase1ForbiddenResultModeObserver?: MutationObserver;
    };
    const target = window as Phase1Window;
    const recordMatches = () => {
      for (const selector of selectors) {
        if (document.querySelector(selector)) {
          target.__phase1ForbiddenResultModeDom?.push(selector);
        }
      }
    };

    target.__phase1ForbiddenResultModeObserver?.disconnect();
    target.__phase1ForbiddenResultModeDom = [];
    recordMatches();
    target.__phase1ForbiddenResultModeObserver = new MutationObserver(recordMatches);
    target.__phase1ForbiddenResultModeObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }, FORBIDDEN_RESULT_MODE_SELECTORS);
}

async function expectNoForbiddenResultModeDom(page: Page) {
  for (const selector of FORBIDDEN_RESULT_MODE_SELECTORS) {
    await expect(page.locator(selector)).toHaveCount(0);
  }

  const observed = await page.evaluate(() => {
    type Phase1Window = Window & { __phase1ForbiddenResultModeDom?: string[] };
    return (window as Phase1Window).__phase1ForbiddenResultModeDom ?? [];
  });

  expect(observed).toEqual([]);
}

async function reloadDuringTiebreak(page: Page) {
  await page.waitForTimeout(3_000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await installForbiddenResultModeObserver(page);

  const wheel = page.getByTestId("rune-wheel").last();

  await expect(wheel).toHaveAttribute("data-reveal-timing-valid", "true");
  await expect(wheel).toHaveAttribute("data-winner-revealed", "false", { timeout: 2_000 });
  await expect
    .poll(async () => Number(await wheel.getAttribute("data-authoritative-reveal-progress")))
    .toBeGreaterThan(0.2);
  await expectNoForbiddenResultModeDom(page);
  await expect(wheel).toHaveAttribute("data-winner-revealed", "true", { timeout: 9_000 });
  await expectNoForbiddenResultModeDom(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  await installForbiddenResultModeObserver(page);
  await expect(page.getByTestId("rune-wheel").last()).toHaveAttribute(
    "data-winner-revealed",
    "true",
    { timeout: 2_000 },
  );
  await expectNoForbiddenResultModeDom(page);
}

test("@phase1 both tiebreaks resume authoritative time and result mode never falls back", async ({
  page: adminPage,
}) => {
  let stagePage: Page | null = null;
  let hostTaken = false;
  let testError: unknown = null;

  try {
    await loginAndTakeHost(adminPage);
    hostTaken = true;
    await openRehearsalControls(adminPage);

    const rehearsalForm = adminPage
      .getByTestId("admin-rehearsal-controls")
      .locator("form", {
        has: adminPage.getByRole("button", { name: "Start Rehearsal" }),
      })
      .first();

    await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
    await rehearsalForm
      .getByPlaceholder("Audit reason")
      .fill("Phase 1 authoritative tiebreak recovery evidence");
    await clickAdminActionAndWait(
      adminPage,
      rehearsalForm.getByRole("button", { name: "Start Rehearsal" }),
    );

    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(0));
    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(1));

    stagePage = await adminPage.context().newPage();
    await stagePage.setViewportSize({ width: 1920, height: 1080 });
    await goto(stagePage, "/stage");

    const seedForm = adminPage.locator("form", {
      has: adminPage.getByRole("button", { name: "Seed Tiebreak" }),
    });
    await seedForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
    await seedForm.getByPlaceholder("Audit reason").fill("Phase 1 force both set tiebreaks");
    await clickAdminActionAndWait(
      adminPage,
      seedForm.getByRole("button", { name: "Seed Tiebreak" }),
    );
    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Close Voting"));
    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Compute Results"));
    await expectAdminRevealPhase(adminPage, "computed");

    await advanceReveal(adminPage, "set 1 counts");
    await installForbiddenResultModeObserver(stagePage);
    await expectNoForbiddenResultModeDom(stagePage);

    await advanceReveal(adminPage, "set 1 resolved");
    await expect(stagePage.getByTestId("rune-wheel").last()).toBeVisible();
    await reloadDuringTiebreak(stagePage);

    await advanceReveal(adminPage, "set 2 counts");
    await expectNoForbiddenResultModeDom(stagePage);
    await advanceReveal(adminPage, "set 2 resolved");
    await expect(stagePage.getByTestId("rune-wheel").last()).toBeVisible();
    await reloadDuringTiebreak(stagePage);

    await advanceReveal(adminPage, "final");
    await expect(stagePage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible();
    await expectNoForbiddenResultModeDom(stagePage);

    const stageGuard = stagePage.getByTestId("stage-route-freshness-guard");
    const preReleaseGeneration = Number(
      await stageGuard.getAttribute("data-accepted-public-state-generation"),
    );

    await clickAdminActionAndWait(
      adminPage,
      hostRunButton(adminPage, "Confirm Stage Reveal Complete"),
    );
    await expect
      .poll(
        async () => Number(await stageGuard.getAttribute("data-accepted-public-state-generation")),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(preReleaseGeneration);
    await expectNoForbiddenResultModeDom(stagePage);
  } catch (error) {
    testError = error;
    throw error;
  } finally {
    await stagePage?.close().catch(() => undefined);

    if (hostTaken && !adminPage.isClosed()) {
      const releaseButton = hostRunButton(adminPage, "Release");
      const canRelease = await releaseButton.isEnabled().catch(() => false);

      if (canRelease) {
        try {
          await clickAdminActionAndWait(adminPage, releaseButton);
        } catch (cleanupError) {
          if (!testError) {
            throw cleanupError;
          }
        }
      }
    }
  }
});
