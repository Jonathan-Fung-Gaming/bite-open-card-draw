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

type AdvanceRevealOptions = {
  afterRevealPhase?: (phase: string) => Promise<void>;
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

function isAdminActionsOnly() {
  return process.env.E2E_USE_ADMIN_ACTIONS_ONLY === "true";
}

function isTransientSupabaseFetchFailure(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("Supabase rate limit failed: TypeError: fetch failed")
  );
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
    let lastTransientError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.goto();
        await this.page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
        this.assertNoAdminError();

        const passwordInput = this.page.getByLabel("Shared admin password");

        if ((await passwordInput.count()) > 0) {
          await passwordInput.fill(ADMIN_PASSWORD);
          await clickServerAction(
            this.page,
            this.page.getByRole("button", { name: "Log In" }),
            5_000,
            {
              submitForm: true,
            },
          );
          this.assertNoAdminError();
        }

        return this.page
          .getByText("Host Lock", { exact: true })
          .isVisible()
          .catch(() => false);
      } catch (error) {
        if (!isTransientSupabaseFetchFailure(error) || attempt === 2) {
          throw error;
        }

        lastTransientError = error;
        await this.page.waitForTimeout(1_000 * (attempt + 1));
      }
    }

    throw lastTransientError instanceof Error
      ? lastTransientError
      : new Error("Admin visit failed.");
  }

  async loginAndTakeHost() {
    const hostControlIsActive = async () =>
      (await this.page
        .getByText("Host control active", { exact: true })
        .first()
        .isVisible()
        .catch(() => false)) &&
      (await this.page
        .getByRole("button", { name: "Release" })
        .isEnabled()
        .catch(() => false));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!(await this.visit())) {
        continue;
      }

      if (await hostControlIsActive()) {
        return;
      }

      const installedSupabaseHost = isAdminActionsOnly()
        ? false
        : await this.installSupabaseHostLockForCurrentAdmin();

      if (installedSupabaseHost) {
        await expect(this.page.getByText("Voting Controls")).toBeVisible();
        return;
      }

      if (getSupabaseE2eConfig() && !isAdminActionsOnly()) {
        throw new Error(
          "Supabase host lock direct install completed but admin page stayed inactive.",
        );
      }

      const takeHostButton = this.page.getByRole("button", { name: "Take Host Control" });

      if ((await takeHostButton.count()) > 0 && (await takeHostButton.isEnabled())) {
        await clickServerAction(this.page, takeHostButton, 5_000, {
          requireServerActionResponse: true,
          responseTimeoutMs: 60_000,
        });
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
          5_000,
          {
            requireServerActionResponse: true,
            responseTimeoutMs: 60_000,
          },
        );
      }

      await this.page.waitForTimeout(3_000);
      await expect
        .poll(
          async () => {
            if (!(await this.visit())) {
              return false;
            }

            return hostControlIsActive();
          },
          { timeout: HOSTED_ACTION_TIMEOUT_MS },
        )
        .toBe(true);
      return;
    }

    await expect
      .poll(async () => hostControlIsActive(), { timeout: HOSTED_ACTION_TIMEOUT_MS })
      .toBe(true);
  }

  async expectActiveHostForEvidence() {
    await this.visit();
    await expect(this.page.getByText("Host control active", { exact: true }).first()).toBeVisible({
      timeout: HOSTED_ACTION_TIMEOUT_MS,
    });
    await expect(this.page.getByRole("button", { name: "Release" })).toBeEnabled();
    await expect(this.page.getByText("Voting Controls")).toBeVisible();
  }

  async expectActiveCount(count: number) {
    await expect
      .poll(
        async () => {
          if (!(await this.visit())) {
            return null;
          }

          return this.page.getByTestId("admin-active-player-count").getAttribute("data-count");
        },
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toBe(String(count));
  }

  async expectVotingEligibleCount(count: number) {
    await expect
      .poll(
        async () => {
          if (!(await this.visit())) {
            return null;
          }

          return this.page.getByTestId("admin-voting-eligible-count").getAttribute("data-count");
        },
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toBe(String(count));
  }

  async expectPlayersActive(names: readonly string[], active: boolean) {
    const expectedState = String(active);

    await expect
      .poll(
        async () => {
          if (!(await this.visit())) {
            return null;
          }

          const states = [];

          for (const name of names) {
            const row = this.rosterRow(name);

            if ((await row.count()) !== 1) {
              states.push(null);
              continue;
            }

            states.push(await row.getAttribute("data-active"));
          }

          return states;
        },
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toEqual(names.map(() => expectedState));
  }

  async markPlayersInactive(names: readonly string[]) {
    await this.loginAndTakeHost();

    for (const name of names) {
      await this.visit();
      const row = this.rosterRow(name);

      await expect(row).toHaveCount(1, { timeout: HOSTED_REFRESH_TIMEOUT_MS });

      if ((await row.getAttribute("data-active")) === "false") {
        continue;
      }

      await clickServerAction(this.page, row.getByRole("button", { name: "Mark Inactive" }), 0, {
        requireServerActionResponse: true,
        responseTimeoutMs: 60_000,
        submitForm: true,
      });

      await expect
        .poll(
          async () => {
            await this.visit();
            return this.rosterRow(name).getAttribute("data-active");
          },
          { timeout: HOSTED_REFRESH_TIMEOUT_MS },
        )
        .toBe("false");
    }
  }

  async bulkImportPlayers(names: readonly string[]) {
    if (names.length === 0) {
      return;
    }

    await this.loginAndTakeHost();

    const bulkImportForm = this.page.locator("form", {
      has: this.page.getByPlaceholder("Bulk import start.gg usernames"),
    });

    await expect(bulkImportForm).toHaveCount(1, { timeout: HOSTED_REFRESH_TIMEOUT_MS });
    await bulkImportForm.getByPlaceholder("Bulk import start.gg usernames").fill(names.join("\n"));
    await clickServerAction(this.page, bulkImportForm.getByRole("button", { name: "Bulk Import" }), 0, {
      requireServerActionResponse: true,
      responseTimeoutMs: 60_000,
      submitForm: true,
    });
  }

  async addInactivePlayerToCurrentRound(name: string, reason: string) {
    await this.loginAndTakeHost();

    const eligibilityForm = this.page.locator("form", {
      has: this.page.getByRole("button", { name: "Confirm Eligibility Change" }),
    });

    await expect(
      eligibilityForm.getByRole("button", { name: "Confirm Eligibility Change" }),
    ).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
    await eligibilityForm.locator("select[name='playerId']").selectOption({ label: name });
    await eligibilityForm.locator("textarea[name='reason']").fill(reason);
    await eligibilityForm.locator("input[name='adminPassword']").fill(ADMIN_PASSWORD);
    await expect(eligibilityForm.getByTestId("dangerous-action-summary")).toContainText(
      "add an inactive player to current round eligibility",
    );
    await expect(eligibilityForm.getByTestId("dangerous-action-summary")).toContainText(name);

    await clickServerAction(
      this.page,
      eligibilityForm.getByRole("button", { name: "Confirm Eligibility Change" }),
      0,
      {
        requireServerActionResponse: true,
        responseTimeoutMs: 60_000,
        submitForm: true,
      },
    );
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
      !isAdminActionsOnly() &&
      (await installSupabaseRehearsalState({
        adminSessionId: await this.getCurrentAdminSessionId(),
        reason,
      }))
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
    if (!isAdminActionsOnly() && (await setSupabaseCurrentRound(roundNumber))) {
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

    await clickServerAction(
      this.page,
      setSection.getByRole("button", { name: "Draw Set" }),
      5_000,
      {
        requireServerActionResponse: true,
        responseTimeoutMs: 60_000,
        submitForm: true,
      },
    );

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
    await clickServerAction(
      this.page,
      this.page.getByRole("button", { name: "Open Voting", exact: true }),
      0,
      { skipMinimumSettle: true },
    );
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

  async advanceToFinalReveal(roundNumber: number, options: AdvanceRevealOptions = {}) {
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

        console.log(
          `[phase9] round ${roundNumber}: advance reveal ${currentPhase} -> ${nextPhase}`,
        );
        await this.clickNextRevealStep();
        await expectSupabaseRevealPhase(roundNumber, nextPhase);
        await options.afterRevealPhase?.(nextPhase);
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

      await options.afterRevealPhase?.(phase);

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
    await this.expectRevealPhaseAfterNavigation("final");
    const downloadButton = this.page.getByRole("button", { name: "Download private ballot CSV" });

    await expect(downloadButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
    const [download] = await Promise.all([
      this.page.waitForEvent("download", { timeout: 20_000 }),
      downloadButton.click(),
    ]);

    await download.saveAs(savePath);
    const csv = await readFile(savePath, "utf8");

    expect(download.suggestedFilename()).toMatch(
      new RegExp(
        `^[a-zA-Z0-9._-]+-round-${roundNumber}-private-ballots-[0-9T-]+Z-[a-zA-Z0-9._-]+\\.csv$`,
      ),
    );
    expect(csv).toContain("player_startgg_username");
    expect(csv).toContain("selected_set_1_chart");
    expect(csv).toContain("selected_set_2_chart");

    return {
      csv,
      filename: download.suggestedFilename(),
      savePath,
    };
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

  async getSessionIdForEvidence() {
    return this.getCurrentAdminSessionId();
  }

  async forceHostTakeover(reason: string) {
    await this.visit();

    const forceHostForm = this.page.locator("form", {
      has: this.page.getByRole("button", { name: "Force Host Takeover" }),
    });

    await expect(forceHostForm).toHaveCount(1);
    await forceHostForm.getByLabel("Audit reason").fill(reason);
    await forceHostForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
    await clickServerAction(
      this.page,
      forceHostForm.getByRole("button", { name: "Force Host Takeover" }),
      5_000,
      {
        requireServerActionResponse: true,
        responseTimeoutMs: 60_000,
      },
    );
    await expect(this.page.getByRole("button", { name: "Release" })).toBeEnabled({
      timeout: HOSTED_ACTION_TIMEOUT_MS,
    });
  }

  async expectReadOnlyHostForEvidence() {
    await this.visit();
    await expect(this.page.getByRole("button", { name: "Release" })).toBeDisabled({
      timeout: HOSTED_ACTION_TIMEOUT_MS,
    });
  }

  async expectLiveCountsHiddenByDefaultAndRevealable() {
    await this.loginAndTakeHost();

    const liveCounts = this.page.getByTestId("admin-live-counts");
    const liveCountRows = liveCounts.locator("ol li");

    await expect(liveCounts).toHaveCount(1);
    await expect(liveCountRows).toHaveCount(0);
    await expect(liveCounts.locator("input[type='password']")).toHaveCount(0);

    const rawAdminHtml = await this.page.evaluate(async () => {
      const response = await fetch(window.location.href, { credentials: "include" });

      return {
        ok: response.ok,
        text: await response.text(),
      };
    });
    const liveCountsHtmlStart = rawAdminHtml.text.indexOf('data-testid="admin-live-counts"');
    const initialLiveCountsHtml = rawAdminHtml.text.slice(
      liveCountsHtmlStart,
      liveCountsHtmlStart + 2500,
    );

    expect(rawAdminHtml.ok).toBe(true);
    expect(liveCountsHtmlStart).toBeGreaterThanOrEqual(0);
    expect(initialLiveCountsHtml).not.toContain("<ol");
    expect(initialLiveCountsHtml).not.toContain("<li");
    expect(initialLiveCountsHtml).not.toContain("Refresh live counts");

    await liveCounts.getByRole("button", { name: "Show live counts" }).click();
    await expect(liveCountRows.first()).toBeVisible();

    await this.goto();
    const refreshedLiveCounts = this.page.getByTestId("admin-live-counts");

    await expect(refreshedLiveCounts.locator("ol li")).toHaveCount(0);
    await expect(
      refreshedLiveCounts.getByRole("button", { name: "Show live counts" }),
    ).toBeVisible();
  }

  private async installSupabaseHostLockForCurrentAdmin() {
    if (isAdminActionsOnly()) {
      return false;
    }

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
      const hostCookie = await this.getContextCookie(HOST_TOKEN_COOKIE);
      const hostLockDebug = await getSupabaseHostLockDebug(sessionId, hostToken);

      throw new Error(
        `Installed Supabase host lock for admin session ${sessionId}, but page stayed inactive; hostCookie=${hostCookie ? "present" : "missing"}; hostLock=${JSON.stringify(hostLockDebug)}.`,
      );
    }

    return releaseEnabled;
  }

  private async getCurrentAdminSessionId() {
    const adminCookie = await this.getContextCookie(ADMIN_SESSION_COOKIE);

    return adminCookie ? decodeAdminSessionId(adminCookie.value) : null;
  }

  private async getContextCookie(name: string) {
    const urlCookies = await this.page.context().cookies(this.baseURL);
    const urlCookie = urlCookies.find((cookie) => cookie.name === name);

    if (urlCookie) {
      return urlCookie;
    }

    const allCookies = await this.page.context().cookies();

    return allCookies.find((cookie) => cookie.name === name) ?? null;
  }

  private rosterRow(name: string) {
    return this.page.getByTestId("admin-roster-row").filter({
      has: this.page.getByText(name, { exact: true }),
    });
  }

  private assertNoAdminError() {
    const actionError = new URL(this.page.url()).searchParams.get("error");

    if (actionError) {
      throw new Error(actionError);
    }
  }
}
