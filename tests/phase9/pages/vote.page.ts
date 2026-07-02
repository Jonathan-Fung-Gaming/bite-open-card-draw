import { expect, type Page } from "@playwright/test";
import { HOSTED_REFRESH_TIMEOUT_MS, goto } from "../fixtures/phase9-env";

export class VotePage {
  constructor(
    readonly page: Page,
    readonly baseURL: string,
  ) {}

  async goto() {
    await goto(this.page, this.baseURL, "/vote");
  }

  async reload() {
    await this.page.reload({ waitUntil: "domcontentloaded" });
  }

  async expectPlayerSelector() {
    await expect(this.page.getByLabel("Select your start.gg username")).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
  }

  async expectClosedRevealHoldingState() {
    await expect(this.page.getByText("Voting is closed.")).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await expect(this.page.getByText("Results are being revealed on stage.")).toBeVisible();
  }
}
