import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expectPublicDrawState, expectPublicFinalReveal } from "../assertions/public-ui.assert";
import { submitRehearsalBallots } from "./ballot-submission.flow";
import { drawRound } from "./draw-round.flow";
import { computeAndRevealRoundResults, verifyRoundCsvExport } from "./results-reveal.flow";
import { closeVotingForRound, openVotingForRound } from "./voting-window.flow";
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
  publicPages: RehearsalPublicPages;
  request: APIRequestContext;
  roundNumber: number;
};

export async function runHostedRound({
  adminPage,
  baseURL,
  publicPages,
  request,
  roundNumber,
}: RunHostedRoundOptions) {
  await drawRound(adminPage, roundNumber);
  await expectPublicDrawState(publicPages.stage, publicPages.charts);
  await openVotingForRound(adminPage, roundNumber);
  await submitRehearsalBallots(request, baseURL, roundNumber);
  await closeVotingForRound(adminPage, roundNumber);
  await computeAndRevealRoundResults(adminPage, roundNumber);
  await expectPublicFinalReveal(publicPages.stage, publicPages.results, roundNumber);
  await verifyRoundCsvExport(adminPage, roundNumber);
}

type RunHostedRehearsalOptions = {
  adminPage: AdminPage;
  baseURL: string;
  publicPages: RehearsalPublicPages;
  request: APIRequestContext;
  rounds: number[];
};

export async function runHostedRehearsal({
  adminPage,
  baseURL,
  publicPages,
  request,
  rounds,
}: RunHostedRehearsalOptions) {
  for (const roundNumber of rounds) {
    await runHostedRound({ adminPage, baseURL, publicPages, request, roundNumber });
  }
}

export async function releaseHostAndClosePages(adminPage: AdminPage, publicPages: RehearsalPublicPages) {
  try {
    await publicPages.close();
  } finally {
    await adminPage.releaseHost();
  }
}

export async function startHostedRehearsal(adminPage: AdminPage, reason: string) {
  await adminPage.loginAndTakeHost();
  await adminPage.startRehearsalMode(reason);
}

export function createAdminPage(page: Page, baseURL: string) {
  return new AdminPage(page, baseURL);
}
