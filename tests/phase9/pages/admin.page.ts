import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ADMIN_SESSION_COOKIE, HOST_TOKEN_COOKIE } from "../../../src/lib/admin/session";
import {
  ADMIN_PASSWORD,
  HOSTED_ACTION_TIMEOUT_MS,
  HOSTED_REFRESH_TIMEOUT_MS,
  clickServerAction,
  goto,
} from "../fixtures/phase9-env";
import {
  expectSupabaseFinalRevealComplete,
  expectSupabaseRoundDrawsReady,
  expectSupabaseRoundSetDrawReady,
  expectSupabaseRevealPhase,
  getSupabaseE2eConfig,
  getSupabaseHostLockDebug,
  getSupabaseRevealState,
  installSupabaseHostLock,
  installSupabaseRehearsalState,
  setSupabaseCurrentRound,
  waitForSupabaseTiebreakRevealIfNeeded,
} from "../fixtures/supabase-state";

type AdminSessionCookiePayload = {
  sessionId?: unknown;
};

const HOST_TOKEN_COOKIE_MAX_AGE_MS = 30 * 60_000;

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
    await this.page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    this.assertNoAdminError();

    const passwordInput = this.page.getByLabel("Shared admin password");

    if ((await passwordInput.count()) > 0) {
      await passwordInput.fill(ADMIN_PASSWORD);
      await clickServerAction(this.page, this.page.getByRole("button", { name: "Log In" }));
      this.assertNoAdminError();
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
        await this.installSupabaseHostLockForCurrentAdmin();
        await expect(this.page.getByText("Voting Controls")).toBeVisible();
        return;
      }

      const installedSupabaseHost = await this.installSupabaseHostLockForCurrentAdmin();

      if (installedSupabaseHost) {
        await expect(this.page.getByText("Voting Controls")).toBeVisible();
        return;
      }

      if (getSupabaseE2eConfig()) {
        throw new Error("Supabase host lock direct install completed but admin page stayed inactive.");
      }

      const takeHostButton = this.page.getByRole("button", { name: "Take Host Control" });

      if ((await takeHostButton.count()) > 0 && (await takeHostButton.isEnabled())) {
        await takeHostButton.click();
      } else {
        const forceHostForm = this.page.locator("form", {
          has: this.page.getByRole("button", { name: "Force Host Takeover" }),
        });

        if ((await forceHostForm.count()) === 0) {
          continue;
        }

        await forceHostForm.getByLabel("Audit reason").fill("phase9 host takeover");
        await forceHostForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
        await forceHostForm.getByRole("button", { name: "Force Host Takeover" }).click();
      }

      await this.page.waitForTimeout(3_000);
      await expect
        .poll(
          async () => {
            if (!(await this.visit())) {
              return false;
            }

            return this.page.getByRole("button", { name: "Release" }).isEnabled();
          },
          { timeout: HOSTED_ACTION_TIMEOUT_MS },
        )
        .toBe(true);
      await expect(this.page.getByText("Voting Controls")).toBeVisible();
      return;
    }

    await expect(this.page.getByRole("button", { name: "Release" })).toBeEnabled({
      timeout: HOSTED_ACTION_TIMEOUT_MS,
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
    if (
      await installSupabaseRehearsalState({
        adminSessionId: await this.getCurrentAdminSessionId(),
        reason,
      })
    ) {
      await this.expectSupabaseRehearsalMode();
      return;
    }

    const rehearsalForm = this.page.locator("form", {
      has: this.page.getByRole("button", { name: "Start Rehearsal" }),
    });

    await expect(rehearsalForm.getByRole("button", { name: "Start Rehearsal" })).toBeEnabled({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
    await rehearsalForm.getByPlaceholder("Audit reason").fill(reason);
    await clickServerAction(
      this.page,
      this.page.getByRole("button", { name: "Start Rehearsal" }),
      10_000,
    );
    await this.expectSupabaseRehearsalMode();
  }

  private async expectSupabaseRehearsalMode() {
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

    await clickServerAction(this.page, setSection.getByRole("button", { name: "Draw Set" }), 5_000, {
      requireServerActionResponse: true,
      responseTimeoutMs: 60_000,
      submitForm: true,
    });

    if (await expectSupabaseRoundSetDrawReady(roundNumber, setOrder)) {
      await this.goto();
      return;
    }

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
    if (!(await expectSupabaseRoundDrawsReady(roundNumber))) {
      await this.expectTextAfterNavigation("ready to vote");
    }
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
    const targetPhases = [
      "computed",
      "set_1_counts",
      "set_1_resolved",
      "set_2_counts",
      "set_2_resolved",
      "final",
    ];

    if (await getSupabaseRevealState(roundNumber)) {
      while (true) {
        const currentState = await getSupabaseRevealState(roundNumber);
        const currentPhase = currentState?.revealPhase;

        if (currentPhase === "final") {
          await expectSupabaseFinalRevealComplete(roundNumber);
          return;
        }

        const currentIndex = currentPhase ? targetPhases.indexOf(currentPhase) : -1;
        const nextPhase = targetPhases[currentIndex + 1];

        if (!nextPhase) {
          throw new Error(`Round ${roundNumber} is in unknown reveal phase ${currentPhase}.`);
        }

        console.log(`[phase9] round ${roundNumber}: advance reveal ${currentPhase} -> ${nextPhase}`);
        await this.clickNextRevealStep();
        await expectSupabaseRevealPhase(roundNumber, nextPhase);
        await waitForSupabaseTiebreakRevealIfNeeded(roundNumber, nextPhase);
      }
    }

    for (const phase of targetPhases.slice(1)) {
      if (await this.isRevealPhaseVisible("final")) {
        return;
      }

      console.log(`[phase9] round ${roundNumber}: advance reveal to ${phase}`);
      await this.clickNextRevealStep();

      if (!(await expectSupabaseRevealPhase(roundNumber, phase))) {
        await this.expectRevealPhaseAfterNavigation(phase.replaceAll("_", " "));
      }

      if (phase === "set_1_resolved" || phase === "set_2_resolved") {
        await this.page.waitForTimeout(6_000);
      }

      if (phase === "final") {
        return;
      }
    }

    await this.expectRevealPhase("final");
  }

  async verifyManualCsvDownload(roundNumber: number, savePath: string) {
    await this.loginAndTakeHost();

    const expectedFilename = `round-${roundNumber}-private-ballots.csv`;
    const downloadPromise = this.page
      .waitForEvent("download", {
        timeout: 20_000,
      });
    const downloadButton = this.page.getByRole("button", { name: "Download private ballot CSV" });

    await expect(downloadButton).toBeEnabled({ timeout: HOSTED_ACTION_TIMEOUT_MS });
    await downloadButton.click();
    const download = await downloadPromise;

    await download.saveAs(savePath);
    const csv = await readFile(savePath, "utf8");

    expect(download.suggestedFilename()).toBe(expectedFilename);
    expect(csv).toContain("player_startgg_username");
    expect(csv).toContain("selected_set_1_chart");
    expect(csv).toContain("selected_set_2_chart");
  }

  async releaseHost() {
    if (this.page.isClosed()) {
      return;
    }

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

    const sessionId = await this.getCurrentAdminSessionId();

    if (!sessionId) {
      return false;
    }

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
        expires: Math.floor((Date.now() + HOST_TOKEN_COOKIE_MAX_AGE_MS) / 1000),
      },
    ]);

    await this.goto();

    const releaseEnabled = await this.page
      .getByRole("button", { name: "Release" })
      .isEnabled()
      .catch(() => false);

    if (!releaseEnabled && getSupabaseE2eConfig()) {
      const hostCookie = (await this.page.context().cookies(this.baseURL)).find(
        (cookie) => cookie.name === HOST_TOKEN_COOKIE,
      );
      const hostLockDebug = await getSupabaseHostLockDebug(sessionId, hostToken);

      throw new Error(
        `Installed Supabase host lock for admin session ${sessionId}, but page stayed inactive; hostCookie=${hostCookie ? "present" : "missing"}; hostLock=${JSON.stringify(hostLockDebug)}.`,
      );
    }

    return releaseEnabled;
  }

  private async getCurrentAdminSessionId() {
    const adminCookie = (await this.page.context().cookies(this.baseURL)).find(
      (cookie) => cookie.name === ADMIN_SESSION_COOKIE,
    );

    return adminCookie ? decodeAdminSessionId(adminCookie.value) : null;
  }

  private assertNoAdminError() {
    const actionError = new URL(this.page.url()).searchParams.get("error");

    if (actionError) {
      throw new Error(actionError);
    }
  }
}
