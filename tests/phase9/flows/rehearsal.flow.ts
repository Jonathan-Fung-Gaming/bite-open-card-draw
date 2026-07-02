import type { APIRequestContext, Browser, Page, TestInfo } from "@playwright/test";
import { expectPublicDrawState, expectPublicFinalReveal } from "../assertions/public-ui.assert";
import { submitRehearsalBallots } from "./ballot-submission.flow";
import { drawRound } from "./draw-round.flow";
import { computeAndRevealRoundResults, verifyRoundCsvExport } from "./results-reveal.flow";
import { closeVotingForRound, openVotingForRound } from "./voting-window.flow";
import { createSupabasePhase9Diagnostics } from "../fixtures/supabase-state";
import { AdminPage } from "../pages/admin.page";
import { ChartsPage } from "../pages/charts.page";
import { ResultsPage } from "../pages/results.page";
import { StagePage } from "../pages/stage.page";

export type RehearsalPublicPages = {
  charts: ChartsPage;
  results: ResultsPage;
  stage: StagePage;
  close: () => Promise<void>;
};

export async function openRehearsalPublicPages(browser: Browser, baseURL: string) {
  const stageRawPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const chartsRawPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const resultsRawPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const publicPages: RehearsalPublicPages = {
    stage: new StagePage(stageRawPage, baseURL),
    charts: new ChartsPage(chartsRawPage, baseURL),
    results: new ResultsPage(resultsRawPage, baseURL),
    close: async () => {
      await stageRawPage.close();
      await chartsRawPage.close();
      await resultsRawPage.close();
    },
  };

  await publicPages.stage.goto();
  await publicPages.charts.goto();
  await publicPages.results.goto();

  return publicPages;
}

type RunHostedRoundOptions = {
  adminPage: AdminPage;
  baseURL: string;
  browser: Browser;
  browserDownloadPath?: string;
  publicPages: RehearsalPublicPages;
  request: APIRequestContext;
  roundNumber: number;
};

export async function runHostedRound({
  adminPage,
  baseURL,
  browser,
  browserDownloadPath,
  publicPages,
  request,
  roundNumber,
}: RunHostedRoundOptions) {
  console.log(`[phase9] round ${roundNumber}: draw`);
  await drawRound(adminPage, roundNumber);
  console.log(`[phase9] round ${roundNumber}: assert public draw state`);
  await expectPublicDrawState(publicPages.stage, publicPages.charts);
  console.log(`[phase9] round ${roundNumber}: open voting`);
  await openVotingForRound(adminPage, roundNumber);
  await submitRehearsalBallots({ baseURL, browser, roundNumber });
  console.log(`[phase9] round ${roundNumber}: close voting`);
  await closeVotingForRound(adminPage, roundNumber);
  console.log(`[phase9] round ${roundNumber}: compute and reveal`);
  await computeAndRevealRoundResults(adminPage, roundNumber);
  console.log(`[phase9] round ${roundNumber}: assert final reveal`);
  await expectPublicFinalReveal(publicPages.stage, publicPages.results, roundNumber);
  console.log(`[phase9] round ${roundNumber}: verify CSV`);
  await verifyRoundCsvExport({
    adminPage,
    baseURL,
    browserDownloadPath,
    request,
    roundNumber,
  });
}

type RunHostedRehearsalOptions = {
  adminPage: AdminPage;
  baseURL: string;
  browser: Browser;
  publicPages: RehearsalPublicPages;
  request: APIRequestContext;
  rounds: number[];
  browserDownloadPathForRound?: (roundNumber: number) => string | undefined;
};

export async function runHostedRehearsal({
  adminPage,
  baseURL,
  browser,
  publicPages,
  request,
  rounds,
  browserDownloadPathForRound,
}: RunHostedRehearsalOptions) {
  for (const roundNumber of rounds) {
    await runHostedRound({
      adminPage,
      baseURL,
      browser,
      browserDownloadPath: browserDownloadPathForRound?.(roundNumber),
      publicPages,
      request,
      roundNumber,
    });
  }
}

export async function releaseHostAndClosePages(
  adminPage: AdminPage,
  publicPages: RehearsalPublicPages | null,
  originalError?: unknown,
) {
  let releaseError: unknown = null;

  try {
    await publicPages?.close();
  } finally {
    try {
      await adminPage.releaseHost();
    } catch (error) {
      releaseError = error;
      console.warn(
        `[phase9] could not release host during cleanup: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  if (!originalError && releaseError) {
    throw releaseError;
  }
}

export async function startHostedRehearsal(adminPage: AdminPage, reason: string) {
  await adminPage.loginAndTakeHost();
  await adminPage.startRehearsalMode(reason);
}

async function attachScreenshot(testInfo: TestInfo, name: string, page: Page) {
  if (page.isClosed()) {
    return;
  }

  const screenshot = await page.screenshot({ timeout: 5_000 }).catch(() => null);

  if (screenshot) {
    await testInfo.attach(name, { body: screenshot, contentType: "image/png" });
  }
}

export async function attachRehearsalDiagnostics(options: {
  adminPage: AdminPage;
  publicPages: RehearsalPublicPages | null;
  testInfo: TestInfo;
}) {
  const { adminPage, publicPages, testInfo } = options;
  const diagnostics = await createSupabasePhase9Diagnostics().catch((error: unknown) => ({
    error: error instanceof Error ? error.message : "Could not create Phase 9 diagnostics.",
  }));

  await testInfo.attach("phase9-state.json", {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: "application/json",
  });

  await attachScreenshot(testInfo, "phase9-admin.png", adminPage.page);

  if (publicPages) {
    await attachScreenshot(testInfo, "phase9-stage.png", publicPages.stage.page);
    await attachScreenshot(testInfo, "phase9-charts.png", publicPages.charts.page);
    await attachScreenshot(testInfo, "phase9-results.png", publicPages.results.page);
  }
}

export function createAdminPage(page: Page, baseURL: string) {
  return new AdminPage(page, baseURL);
}
