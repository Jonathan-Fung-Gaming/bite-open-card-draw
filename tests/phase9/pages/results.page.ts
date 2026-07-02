import { expect, type Page } from "@playwright/test";
import { HOSTED_REFRESH_TIMEOUT_MS, goto } from "../fixtures/phase9-env";

export class ResultsPage {
  constructor(
    readonly page: Page,
    readonly baseURL: string,
  ) {}

  async goto() {
    await goto(this.page, this.baseURL, "/results");
  }

  async expectFinalCharts(roundNumber: number) {
    await expect
      .poll(
        async () => {
          await this.page.reload({ waitUntil: "domcontentloaded" });

          const headingVisible = await this.page
            .getByRole("heading", { name: `ROUND ${roundNumber} FINAL CHARTS` })
            .isVisible()
            .catch(() => false);
          const selectedCardCount = await this.page
            .getByTestId("stage-chart-card")
            .count()
            .catch(() => 0);
          const fullCountsVisible = await this.page
            .getByText("Full ban counts", { exact: true })
            .isVisible()
            .catch(() => false);

          return headingVisible && selectedCardCount === 2 && fullCountsVisible;
        },
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toBe(true);
  }
}
