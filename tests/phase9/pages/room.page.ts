import { expect, type Page } from "@playwright/test";
import { goto } from "../fixtures/phase9-env";

export class RoomPage {
  constructor(
    readonly page: Page,
    readonly baseURL: string,
  ) {}

  async goto() {
    await goto(this.page, this.baseURL, "/room");
  }

  async reload() {
    await this.page.reload({ waitUntil: "domcontentloaded" });
  }

  async expectLandingOptions() {
    await expect(this.page.getByRole("link", { name: "I am a player voting" })).toBeVisible();
    await expect(this.page.getByRole("link", { name: "View charts only" })).toBeVisible();
  }
}
