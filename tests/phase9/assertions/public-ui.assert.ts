import { expect, type Page } from "@playwright/test";
import { ChartsPage } from "../pages/charts.page";
import { ResultsPage } from "../pages/results.page";
import { RoomPage } from "../pages/room.page";
import { StagePage } from "../pages/stage.page";
import { VotePage } from "../pages/vote.page";
import type { RehearsalRoundExpectation } from "../fixtures/rehearsal-plan";

type RehearsalPublicPages = {
  charts: ChartsPage;
  results: ResultsPage;
  room: RoomPage;
  stage: StagePage;
  vote: VotePage;
};

function revealPhaseLabel(phase: string) {
  switch (phase) {
    case "set_1_counts":
      return "Set 1 counts";
    case "set_1_resolved":
      return "Set 1 selected";
    case "set_2_counts":
      return "Set 2 counts";
    case "set_2_resolved":
      return "Set 2 selected";
    default:
      return null;
  }
}

async function expectNoFinalResultSpoilers(page: Page) {
  await expect(page.getByRole("heading", { name: /ROUND \d+ FINAL CHARTS/ })).toHaveCount(0);
  await expect(page.getByTestId("stage-final-chart-list")).toHaveCount(0);
  await expect(page.getByTestId("phone-final-chart-card")).toHaveCount(0);
}

async function expectNoFinalStageReveal(page: Page) {
  await expect(page.getByRole("heading", { name: /ROUND \d+ FINAL CHARTS/ })).toHaveCount(0);
  await expect(page.getByTestId("stage-final-chart-list")).toHaveCount(0);
}

async function expectNoChartByChartResultCounts(page: Page) {
  await expect(page.getByText("Full ban counts", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Least banned to most banned", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ban Counts" })).toHaveCount(0);
  await expect(page.getByTestId("rune-wheel")).toHaveCount(0);
  await expect(page.getByTestId("fallback-tiebreak-reveal")).toHaveCount(0);
}

async function expectNoSelectedChartLabels(page: Page) {
  await expect(page.getByTestId("result-selected-label")).toHaveCount(0);
}

async function expectNoResultSpoilers(page: Page) {
  await expectNoFinalResultSpoilers(page);
  await expectNoSelectedChartLabels(page);
  await expectNoChartByChartResultCounts(page);
}

async function expectRoomRoutePrivacy(roomPage: RoomPage) {
  await roomPage.reload();
  await roomPage.expectLandingOptions();
  await expect(roomPage.page.getByText(/Ballots submitted:|Ban selections cast:/)).toHaveCount(0);
  await expect(roomPage.page.getByLabel("Select your start.gg username")).toHaveCount(0);
  await expect(roomPage.page.getByRole("button", { name: "Submit Ballot" })).toHaveCount(0);
  await expectNoResultSpoilers(roomPage.page);
}

async function expectPublicPhoneRoutesHoldForStageReveal(publicPages: RehearsalPublicPages) {
  await publicPages.vote.reload();
  await publicPages.vote.expectClosedRevealHoldingState();
  await expectNoResultSpoilers(publicPages.vote.page);

  await publicPages.charts.reload();
  await expect(publicPages.charts.page.getByTestId("view-only-status")).toContainText(
    "Results being revealed",
  );
  await expect(publicPages.charts.page.getByLabel("Select your start.gg username")).toHaveCount(0);
  await expect(publicPages.charts.page.getByRole("button", { name: "Submit Ballot" })).toHaveCount(
    0,
  );
  await expectNoResultSpoilers(publicPages.charts.page);

  await publicPages.results.reload();
  await expect(publicPages.results.page.getByText("Voting is closed.")).toBeVisible();
  await expect(
    publicPages.results.page.getByText("Results are being revealed on stage."),
  ).toBeVisible();
  await expectNoResultSpoilers(publicPages.results.page);

  await expectRoomRoutePrivacy(publicPages.room);
}

async function expectRehearsalAggregateTotals(
  page: Page,
  expectation: RehearsalRoundExpectation,
  options: { banSelectionCount?: number; submittedPlayerCount?: number } = {},
) {
  const submittedPlayerCount = options.submittedPlayerCount ?? expectation.submittedPlayerCount;
  const banSelectionCount = options.banSelectionCount ?? expectation.expectedBanSelectionCount;

  await expect(
    page.getByText(
      `Ballots submitted: ${submittedPlayerCount} / ${expectation.activePlayerCount}`,
    ),
  ).toBeVisible();
  await expect(page.getByText(`Ban selections cast: ${banSelectionCount}`)).toBeVisible();
}

export async function expectPublicDrawState(stagePage: StagePage, chartsPage: ChartsPage) {
  await stagePage.expectTwoRowsOfSevenCharts();
  await chartsPage.expectViewOnlyMode();
}

export async function expectPublicVotingState(
  publicPages: RehearsalPublicPages,
  roundNumber: number,
  expectation: RehearsalRoundExpectation,
) {
  await publicPages.stage.reload();
  await expect(
    publicPages.stage.page.locator("header").getByText(/Voting open|Final 30 seconds/),
  ).toBeVisible();
  await expectRehearsalAggregateTotals(publicPages.stage.page, expectation);
  await expectNoResultSpoilers(publicPages.stage.page);

  await publicPages.vote.reload();
  await publicPages.vote.expectPlayerSelector();
  await expect(
    publicPages.vote.page.getByText(
      `Ballots submitted: ${expectation.submittedPlayerCount} / ${expectation.activePlayerCount}`,
    ),
  ).toBeVisible();
  await expect(publicPages.vote.page.getByRole("button", { name: "Submit Ballot" })).toHaveCount(
    0,
  );
  await expectNoResultSpoilers(publicPages.vote.page);

  await publicPages.charts.reload();
  await expect(publicPages.charts.page.getByTestId("view-only-status")).toContainText(
    /Voting open|Final 30 seconds/,
  );
  await expect(publicPages.charts.page.getByLabel("Select your start.gg username")).toHaveCount(0);
  await expect(publicPages.charts.page.getByRole("button", { name: "Submit Ballot" })).toHaveCount(
    0,
  );
  await expectNoResultSpoilers(publicPages.charts.page);

  await publicPages.results.reload();
  await expect(
    publicPages.results.page.getByRole("heading", { name: "Voting in progress" }),
  ).toBeVisible();
  await expectNoResultSpoilers(publicPages.results.page);
  await expect(publicPages.results.page.getByText(`Round ${roundNumber} Results`)).toBeVisible();

  await expectRoomRoutePrivacy(publicPages.room);
}

export async function expectPublicInitialVotingState(
  publicPages: RehearsalPublicPages,
  roundNumber: number,
  expectation: RehearsalRoundExpectation,
) {
  await publicPages.stage.reload();
  await expect(publicPages.stage.page.locator("header").getByText("Voting open")).toBeVisible();
  await expectRehearsalAggregateTotals(publicPages.stage.page, expectation, {
    banSelectionCount: 0,
    submittedPlayerCount: 0,
  });
  await expectNoResultSpoilers(publicPages.stage.page);

  await publicPages.vote.reload();
  await publicPages.vote.expectPlayerSelector();
  await expect(
    publicPages.vote.page.getByText(`Ballots submitted: 0 / ${expectation.activePlayerCount}`),
  ).toBeVisible();
  await expect(publicPages.vote.page.getByRole("button", { name: "Submit Ballot" })).toHaveCount(
    0,
  );
  await expectNoResultSpoilers(publicPages.vote.page);

  await publicPages.charts.reload();
  await expect(publicPages.charts.page.getByTestId("view-only-status")).toContainText(
    "Voting open",
  );
  await expect(publicPages.charts.page.getByLabel("Select your start.gg username")).toHaveCount(0);
  await expect(publicPages.charts.page.getByRole("button", { name: "Submit Ballot" })).toHaveCount(
    0,
  );
  await expectNoResultSpoilers(publicPages.charts.page);

  await publicPages.results.reload();
  await expect(
    publicPages.results.page.getByRole("heading", { name: "Voting in progress" }),
  ).toBeVisible();
  await expectNoResultSpoilers(publicPages.results.page);
  await expect(publicPages.results.page.getByText(`Round ${roundNumber} Results`)).toBeVisible();
}

export async function expectPublicClosedState(
  publicPages: RehearsalPublicPages,
  roundNumber: number,
  expectation: RehearsalRoundExpectation,
) {
  await publicPages.stage.reload();
  await expect(publicPages.stage.page.locator("header").getByText("Voting closed")).toBeVisible();
  await expectRehearsalAggregateTotals(publicPages.stage.page, expectation);
  await expectNoResultSpoilers(publicPages.stage.page);

  await expectPublicPhoneRoutesHoldForStageReveal(publicPages);
  await expect(publicPages.results.page.getByText(`Round ${roundNumber} Results`)).toBeVisible();
}

export async function expectPublicComputedState(
  publicPages: RehearsalPublicPages,
  roundNumber: number,
) {
  await publicPages.stage.reload();
  await expect(
    publicPages.stage.page.getByRole("heading", { name: "Awaiting Host Reveal" }),
  ).toBeVisible();
  await expectNoResultSpoilers(publicPages.stage.page);

  await expectPublicPhoneRoutesHoldForStageReveal(publicPages);
  await expect(publicPages.results.page.getByText(`Round ${roundNumber} Results`)).toBeVisible();
}

export async function expectPublicRevealPhaseState(
  publicPages: RehearsalPublicPages,
  roundNumber: number,
  phase: string,
) {
  await publicPages.stage.reload();
  await expect(
    publicPages.stage.page.getByRole("heading", { name: `Round ${roundNumber} Results Reveal` }),
  ).toBeVisible();

  const label = revealPhaseLabel(phase);

  if (label) {
    await expect(publicPages.stage.page.locator("header").getByText(label)).toBeVisible();
  }

  await expectNoFinalStageReveal(publicPages.stage.page);
  await expectPublicPhoneRoutesHoldForStageReveal(publicPages);
}

export async function expectPublicFinalReveal(
  publicPages: RehearsalPublicPages,
  roundNumber: number,
) {
  await publicPages.stage.expectFinalCharts(roundNumber);

  await publicPages.charts.reload();
  await expect(
    publicPages.charts.page.getByRole("heading", { name: `ROUND ${roundNumber} FINAL CHARTS` }),
  ).toBeVisible();
  await expect(publicPages.charts.page.getByTestId("stage-chart-card")).toHaveCount(2);
  await expect(publicPages.charts.page.getByText("Full ban counts", { exact: true })).toBeVisible();

  await publicPages.results.expectFinalCharts(roundNumber);

  await publicPages.vote.reload();
  await expect(
    publicPages.vote.page.getByRole("heading", { name: `Round ${roundNumber} Final Charts` }),
  ).toBeVisible();
  await expect(publicPages.vote.page.getByTestId("phone-final-chart-card")).toHaveCount(2);
  await expect(publicPages.vote.page.getByText("Full ban counts", { exact: true })).toBeVisible();

  await expectRoomRoutePrivacy(publicPages.room);
}
