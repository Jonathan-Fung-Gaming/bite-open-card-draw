import { expect, type Page } from "@playwright/test";
import { HOSTED_REFRESH_TIMEOUT_MS, goto } from "../fixtures/phase9-env";

export class StagePage {
  constructor(
    readonly page: Page,
    readonly baseURL: string,
  ) {}

  async goto() {
    await goto(this.page, this.baseURL, "/stage");
  }

  async reload() {
    await this.page.reload({ waitUntil: "domcontentloaded" });
  }

  async expectTwoRowsOfSevenCharts() {
    await this.reload();
    await expect(this.page.getByTestId("stage-set-row")).toHaveCount(2);
    await expect(
      this.page.getByTestId("stage-set-row").nth(0).getByTestId("stage-chart-card"),
    ).toHaveCount(7);
    await expect(
      this.page.getByTestId("stage-set-row").nth(1).getByTestId("stage-chart-card"),
    ).toHaveCount(7);
  }

  async expectFinalCharts(roundNumber: number) {
    await expect
      .poll(
        async () => {
          await this.reload();

          const headingVisible = await this.page
            .getByRole("heading", { name: `ROUND ${roundNumber} FINAL CHARTS` })
            .isVisible()
            .catch(() => false);
          const finalCardCount = await this.page
            .getByTestId("stage-final-chart-list")
            .getByTestId("stage-chart-card")
            .count()
            .catch(() => 0);

          return headingVisible && finalCardCount === 2;
        },
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toBe(true);
  }
}
