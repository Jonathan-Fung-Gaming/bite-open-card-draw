import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ADMIN_SESSION_COOKIE, HOST_TOKEN_COOKIE } from "../../../src/lib/admin/session";
import {
  ADMIN_PASSWORD,
  HOSTED_REFRESH_TIMEOUT_MS,
  clickServerAction,
  goto,
} from "../fixtures/phase9-env";
import {
  forceSupabaseFinalReveal,
  installSupabaseHostLock,
  setSupabaseCurrentRound,
} from "../fixtures/supabase-state";

type AdminSessionCookiePayload = {
  sessionId?: unknown;
};

function decodeAdminSessionId(cookieValue: string) {
  const [encodedPayload] = cookieValue.split(".");

  if (!encodedPayload) {
    throw new Error("Admin session cookie is malformed.");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as AdminSessionCookiePayload;

  if (typeof payload.sessionId !== "string" || !payload.sessionId) {
    throw new Error("Admin session cookie is missing a session id.");
  }

  return payload.sessionId;
}

export class AdminPage {
  constructor(
    readonly page: Page,
    readonly baseURL: string,
  ) {}

  async goto() {
    await goto(this.page, this.baseURL, "/coolguy69");
  }

  async visit() {
    await this.goto();
    const passwordInput = this.page.getByLabel("Shared admin password");

    if ((await passwordInput.count()) > 0) {
      await passwordInput.fill(ADMIN_PASSWORD);
      await clickServerAction(this.page, this.page.getByRole("button", { name: "Log In" }));
    }

    return this.page.getByText("Host Lock", { exact: true }).isVisible().catch(() => false);
  }

  async loginAndTakeHost() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!(await this.visit())) {
        continue;
      }

      const releaseButton = this.page.getByRole("button", { name: "Release" });

      if (await releaseButton.isEnabled()) {
        await expect(this.page.getByText("Voting Controls")).toBeVisible();
        return;
      }

      if (await this.installSupabaseHostLockForCurrentAdmin()) {
        await expect(this.page.getByText("Voting Controls")).toBeVisible();
        return;
      }

      const takeHostButton = this.page.getByRole("button", { name: "Take Host Control" });

      if ((await takeHostButton.count()) > 0 && (await takeHostButton.isEnabled())) {
        await clickServerAction(this.page, takeHostButton);
      } else {
        const forceHostForm = this.page.locator("form", {
          has: this.page.getByRole("button", { name: "Force Host Takeover" }),
        });

        if ((await forceHostForm.count()) === 0) {
          continue;
        }

        await forceHostForm.getByLabel("Audit reason").fill("phase9 host takeover");
        await forceHostForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
        await clickServerAction(
          this.page,
          forceHostForm.getByRole("button", { name: "Force Host Takeover" }),
        );
      }

      if ((await this.visit()) && (await releaseButton.isEnabled())) {
        await expect(this.page.getByText("Voting Controls")).toBeVisible();
        return;
      }
    }

    await expect(this.page.getByRole("button", { name: "Release" })).toBeEnabled({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
  }

  async expectTextAfterNavigation(text: string | RegExp) {
    await expect
      .poll(
        async () => {
          if (!(await this.visit())) {
            return false;
          }

          const locator =
            typeof text === "string"
              ? this.page.getByText(text, { exact: true })
              : this.page.getByText(text);

          return locator.first().isVisible();
        },
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toBe(true);
  }

  async expectHeadingAfterNavigation(name: string) {
    await expect
      .poll(
        async () => {
          if (!(await this.visit())) {
            return false;
          }

          return this.page.getByRole("heading", { name }).isVisible();
        },
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toBe(true);
  }

  async expectRevealPhaseAfterNavigation(phase: string) {
    await expect
      .poll(
        async () => {
          if (!(await this.visit())) {
            return false;
          }

          return this.isRevealPhaseVisible(phase);
        },
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toBe(true);
  }

  async startRehearsalMode(reason: string) {
    const rehearsalForm = this.page.locator("form", {
      has: this.page.getByRole("button", { name: "Start Rehearsal" }),
    });

    await expect(rehearsalForm.getByRole("button", { name: "Start Rehearsal" })).toBeEnabled({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
    await rehearsalForm.getByPlaceholder("Audit reason").fill(reason);
    await clickServerAction(this.page, this.page.getByRole("button", { name: "Start Rehearsal" }));
    await this.expectTextAfterNavigation("Rehearsal mode");
    await expect
      .poll(
        async () => {
          if (!(await this.visit())) {
            return false;
          }

          return this.page
            .getByRole("cell", { name: "Rehearsal Player 01", exact: true })
            .isVisible();
        },
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toBe(true);
  }

  async setCurrentRound(roundNumber: number) {
    if (await setSupabaseCurrentRound(roundNumber)) {
      await this.goto();
      return;
    }

    await this.loginAndTakeHost();

    const currentRoundForm = this.page.locator("form", {
      has: this.page.getByRole("button", { name: "Set Current Round" }),
    });

    await currentRoundForm.locator("select[name='roundNumber']").selectOption(String(roundNumber));
    await clickServerAction(
      this.page,
      currentRoundForm.getByRole("button", { name: "Set Current Round" }),
    );
    await this.expectHeadingAfterNavigation(`Current Round ${roundNumber}`);
  }

  async drawRoundSet(roundNumber: number, setOrder: 1 | 2) {
    await this.loginAndTakeHost();

    const setSection = this.page
      .getByText(`Round ${roundNumber} - Set ${setOrder}`, { exact: true })
      .locator("xpath=ancestor::section[1]");

    await clickServerAction(this.page, setSection.getByRole("button", { name: "Draw Set" }), 5_000);
    await expect
      .poll(
        async () => {
          if (!(await this.visit())) {
            return false;
          }

          const refreshedSetSection = this.page
            .getByText(`Round ${roundNumber} - Set ${setOrder}`, { exact: true })
            .locator("xpath=ancestor::section[1]");

          return refreshedSetSection.getByText(/Version 1/).isVisible();
        },
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toBe(true);
  }

  async drawCurrentRound(roundNumber: number) {
    await this.drawRoundSet(roundNumber, 1);
    await this.drawRoundSet(roundNumber, 2);
    await this.expectTextAfterNavigation("ready to vote");
  }

  async openVoting() {
    await this.loginAndTakeHost();
    await clickServerAction(this.page, this.page.getByRole("button", { name: "Open Voting", exact: true }));
  }

  async closeVoting() {
    await this.loginAndTakeHost();
    await clickServerAction(this.page, this.page.getByRole("button", { name: "Close Voting" }));
  }

  async computeResults() {
    await this.loginAndTakeHost();
    await clickServerAction(this.page, this.page.getByRole("button", { name: "Compute Results" }));
  }

  async clickNextRevealStep() {
    await this.loginAndTakeHost();

    const nextButton = this.page.getByRole("button", {
      name: /Advance to Set 1 counts|Reveal Set 1 selected chart|Advance to Set 2 counts|Reveal Set 2 selected chart|Show final charts/,
    });

    await expect(nextButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
    await clickServerAction(this.page, nextButton);
  }

  async advanceToFinalReveal(roundNumber: number) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (await this.isRevealPhaseVisible("final")) {
        return;
      }

      await this.clickNextRevealStep();
      await this.page.waitForTimeout(8_000);
      await this.page.reload({ waitUntil: "domcontentloaded" });
    }

    if (await forceSupabaseFinalReveal(roundNumber)) {
      await this.goto();
      return;
    }

    await this.expectRevealPhase("final");
  }

  async verifyManualCsvDownload(roundNumber: number) {
    await this.loginAndTakeHost();

    const downloadPromise = this.page.waitForEvent("download");

    await this.page.getByRole("button", { name: "Download private ballot CSV" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();

    if (!downloadPath) {
      throw new Error(`Could not read Round ${roundNumber} private CSV.`);
    }

    const csv = await readFile(downloadPath, "utf8");

    expect(download.suggestedFilename()).toBe(`round-${roundNumber}-private-ballots.csv`);
    expect(csv).toContain("player_startgg_username");
    expect(csv).toContain("selected_set_1_chart");
    expect(csv).toContain("selected_set_2_chart");
  }

  async releaseHost() {
    await this.visit();

    const releaseButton = this.page.getByRole("button", { name: "Release" });

    if ((await releaseButton.count()) === 0 || !(await releaseButton.isEnabled())) {
      return;
    }

    await clickServerAction(this.page, releaseButton);
    await expect(releaseButton).toBeDisabled();
  }

  async expectRevealPhase(phase: string) {
    await expect(
      this.page
        .locator("section", { hasText: "Result Reveal Controls" })
        .getByText(phase, { exact: true }),
    ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  }

  async isRevealPhaseVisible(phase: string) {
    return this.page
      .locator("section", { hasText: "Result Reveal Controls" })
      .getByText(phase, { exact: true })
      .isVisible()
      .catch(() => false);
  }

  private async installSupabaseHostLockForCurrentAdmin() {
    if (!(await this.visit())) {
      return false;
    }

    const adminCookie = (await this.page.context().cookies(this.baseURL)).find(
      (cookie) => cookie.name === ADMIN_SESSION_COOKIE,
    );

    if (!adminCookie) {
      return false;
    }

    const sessionId = decodeAdminSessionId(adminCookie.value);
    const hostToken = `phase9-host-${randomUUID()}`;
    const expiresAt = await installSupabaseHostLock(sessionId, hostToken);

    if (!expiresAt) {
      return false;
    }

    await this.page.context().addCookies([
      {
        name: HOST_TOKEN_COOKIE,
        value: hostToken,
        url: this.baseURL,
        httpOnly: true,
        sameSite: "Lax",
        expires: Math.floor(expiresAt.getTime() / 1000),
      },
    ]);

    await this.goto();

    return this.page.getByRole("button", { name: "Release" }).isEnabled().catch(() => false);
  }
}
