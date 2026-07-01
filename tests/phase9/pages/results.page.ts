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
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      this.page.getByRole("heading", { name: `ROUND ${roundNumber} FINAL CHARTS` }),
    ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  }
}
