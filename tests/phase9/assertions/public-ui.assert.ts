import { ChartsPage } from "../pages/charts.page";
import { ResultsPage } from "../pages/results.page";
import { StagePage } from "../pages/stage.page";

export async function expectPublicDrawState(stagePage: StagePage, chartsPage: ChartsPage) {
  await stagePage.expectTwoRowsOfSevenCharts();
  await chartsPage.expectViewOnlyMode();
}

export async function expectPublicFinalReveal(
  stagePage: StagePage,
  resultsPage: ResultsPage,
  roundNumber: number,
) {
  await stagePage.expectFinalCharts(roundNumber);
  await resultsPage.expectFinalCharts(roundNumber);
}
