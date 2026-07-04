import type { APIRequestContext, Browser, Page, TestInfo } from "@playwright/test";
import {
  expectPublicClosedState,
  expectPublicComputedState,
  expectPublicDrawState,
  expectPublicFinalReveal,
  expectPublicInitialVotingState,
  expectPublicRevealPhaseState,
  expectPublicVotingState,
} from "../assertions/public-ui.assert";
import {
  closePreparedRehearsalBallotPages,
  prepareRehearsalBallotPages,
  submitRehearsalBallots,
  type PreparedRehearsalBallotPage,
} from "./ballot-submission.flow";
import { drawRound } from "./draw-round.flow";
import { computeAndRevealRoundResults, verifyRoundCsvExport } from "./results-reveal.flow";
import { closeVotingForRound, openVotingForRound } from "./voting-window.flow";
import {
  createSupabasePhase9Diagnostics,
  expectSupabaseRoundEligibilitySnapshot,
} from "../fixtures/supabase-state";
import {
  createSmokeRoundExpectations,
  type RehearsalRoundExpectation,
} from "../fixtures/rehearsal-plan";
import { AdminPage } from "../pages/admin.page";
import { ChartsPage } from "../pages/charts.page";
import { ResultsPage } from "../pages/results.page";
import { RoomPage } from "../pages/room.page";
import { StagePage } from "../pages/stage.page";
import { VotePage } from "../pages/vote.page";

export type RehearsalPublicPages = {
  charts: ChartsPage;
  results: ResultsPage;
  room: RoomPage;
  stage: StagePage;
  vote: VotePage;
  close: () => Promise<void>;
};

export async function openRehearsalPublicPages(browser: Browser, baseURL: string) {
  const stageRawPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const roomRawPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const voteRawPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const chartsRawPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const resultsRawPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const publicPages: RehearsalPublicPages = {
    stage: new StagePage(stageRawPage, baseURL),
    room: new RoomPage(roomRawPage, baseURL),
    vote: new VotePage(voteRawPage, baseURL),
    charts: new ChartsPage(chartsRawPage, baseURL),
    results: new ResultsPage(resultsRawPage, baseURL),
    close: async () => {
      await stageRawPage.close();
      await roomRawPage.close();
      await voteRawPage.close();
      await chartsRawPage.close();
      await resultsRawPage.close();
    },
  };

  await publicPages.stage.goto();
  await publicPages.room.goto();
  await publicPages.vote.goto();
  await publicPages.charts.goto();
  await publicPages.results.goto();

  return publicPages;
}

type RunHostedRoundOptions = {
  adminPage: AdminPage;
  baseURL: string;
  browser: Browser;
  browserDownloadPath?: string;
  expectation: RehearsalRoundExpectation;
  publicPages: RehearsalPublicPages;
  request: APIRequestContext;
  roundNumber: number;
};

export async function runHostedRound({
  adminPage,
  baseURL,
  browser,
  browserDownloadPath,
  expectation,
  publicPages,
  request,
  roundNumber,
}: RunHostedRoundOptions) {
  console.log(`[phase9] round ${roundNumber}: prepare roster`);
  await prepareRosterForRound(adminPage, expectation);
  console.log(`[phase9] round ${roundNumber}: draw`);
  await drawRound(adminPage, roundNumber);
  console.log(`[phase9] round ${roundNumber}: assert public draw state`);
  await expectPublicDrawState(publicPages.stage, publicPages.charts);
  const preparedBallots: PreparedRehearsalBallotPage[] = await prepareRehearsalBallotPages({
    baseURL,
    browser,
    expectation,
    roundNumber,
  });

  try {
    console.log(`[phase9] round ${roundNumber}: open voting`);
    await openVotingForRound(adminPage, roundNumber);
    await assertRoundEligibility(publicPages.vote, adminPage, roundNumber, expectation);
    console.log(`[phase9] round ${roundNumber}: assert initial public voting denominator`);
    await expectPublicInitialVotingState(publicPages, roundNumber, expectation);
    await submitRehearsalBallots({
      baseURL,
      browser,
      expectation,
      preparedBallots,
      roundNumber,
    });
  } finally {
    await closePreparedRehearsalBallotPages(preparedBallots);
  }
  console.log(`[phase9] round ${roundNumber}: assert public voting privacy`);
  await expectPublicVotingState(publicPages, roundNumber, expectation);
  console.log(`[phase9] round ${roundNumber}: assert admin live counts are gated`);
  await adminPage.expectLiveCountsHiddenByDefaultAndRevealable();
  console.log(`[phase9] round ${roundNumber}: close voting`);
  await closeVotingForRound(adminPage, roundNumber);
  console.log(`[phase9] round ${roundNumber}: assert public closed privacy`);
  await expectPublicClosedState(publicPages, roundNumber, expectation);
  console.log(`[phase9] round ${roundNumber}: compute and reveal`);
  await computeAndRevealRoundResults(adminPage, roundNumber, {
    afterComputed: async () => {
      console.log(`[phase9] round ${roundNumber}: assert public computed privacy`);
      await expectPublicComputedState(publicPages, roundNumber);
    },
    afterRevealPhase: async (phase) => {
      if (phase === "final") {
        return;
      }

      console.log(`[phase9] round ${roundNumber}: assert public ${phase} privacy`);
      await expectPublicRevealPhaseState(publicPages, roundNumber, phase);
    },
  });
  console.log(`[phase9] round ${roundNumber}: assert final reveal`);
  await expectPublicFinalReveal(publicPages, roundNumber);
  console.log(`[phase9] round ${roundNumber}: verify CSV`);
  await verifyRoundCsvExport({
    adminPage,
    baseURL,
    browserDownloadPath,
    expectation,
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
  roundExpectations?: readonly RehearsalRoundExpectation[];
};

export async function runHostedRehearsal({
  adminPage,
  baseURL,
  browser,
  publicPages,
  request,
  rounds,
  browserDownloadPathForRound,
  roundExpectations,
}: RunHostedRehearsalOptions) {
  const expectations = roundExpectations ?? createSmokeRoundExpectations(rounds);

  await ensureRehearsalRoster(adminPage, expectations);

  for (const roundNumber of rounds) {
    const expectation = expectations.find((round) => round.roundNumber === roundNumber);

    if (!expectation) {
      throw new Error(`Missing rehearsal expectation for Round ${roundNumber}.`);
    }

    await runHostedRound({
      adminPage,
      baseURL,
      browser,
      browserDownloadPath: browserDownloadPathForRound?.(roundNumber),
      expectation,
      publicPages,
      request,
      roundNumber,
    });
  }
}

function uniquePlayers(expectations: readonly RehearsalRoundExpectation[]) {
  return [...new Set(expectations.flatMap((expectation) => expectation.requiredCsvPlayers))];
}

async function ensureRehearsalRoster(
  adminPage: AdminPage,
  expectations: readonly RehearsalRoundExpectation[],
) {
  const requiredPlayers = uniquePlayers(expectations);

  if (requiredPlayers.length === 0) {
    throw new Error("Rehearsal requires at least one expected player.");
  }

  await adminPage.bulkImportPlayers(requiredPlayers);
  await adminPage.expectActiveCount(expectations[0]?.activePlayerCount ?? requiredPlayers.length);
}

async function prepareRosterForRound(
  adminPage: AdminPage,
  expectation: RehearsalRoundExpectation,
) {
  if (expectation.playersToMarkInactiveBeforeRound.length > 0) {
    console.log(
      `[phase9] round ${expectation.roundNumber}: mark ${expectation.playersToMarkInactiveBeforeRound.length} players inactive before voting`,
    );
    await adminPage.markPlayersInactive(expectation.playersToMarkInactiveBeforeRound);
  }

  await adminPage.expectActiveCount(expectation.activePlayerCount);
}

async function assertRoundEligibility(
  votePage: VotePage,
  adminPage: AdminPage,
  roundNumber: number,
  expectation: RehearsalRoundExpectation,
) {
  await adminPage.expectVotingEligibleCount(expectation.activePlayerCount);
  await expectSupabaseRoundEligibilitySnapshot(roundNumber, expectation);
  await votePage.expectEligiblePlayers(expectation.activePlayers);
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
    await attachScreenshot(testInfo, "phase9-room.png", publicPages.room.page);
    await attachScreenshot(testInfo, "phase9-vote.png", publicPages.vote.page);
    await attachScreenshot(testInfo, "phase9-charts.png", publicPages.charts.page);
    await attachScreenshot(testInfo, "phase9-results.png", publicPages.results.page);
  }
}

export function createAdminPage(page: Page, baseURL: string) {
  return new AdminPage(page, baseURL);
}
