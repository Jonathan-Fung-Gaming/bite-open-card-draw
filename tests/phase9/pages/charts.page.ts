import { expect, type Page } from "@playwright/test";
import { goto } from "../fixtures/phase9-env";

export class ChartsPage {
  constructor(
    readonly page: Page,
    readonly baseURL: string,
  ) {}

  async goto() {
    await goto(this.page, this.baseURL, "/charts");
  }

  async expectViewOnlyMode() {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expect(this.page.getByTestId("view-only-status")).toBeVisible();
    await expect(this.page.getByLabel("Select your start.gg username")).toHaveCount(0);
  }
}
