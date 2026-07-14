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
  if (!(error instanceof Error)) {
    return false;
  }

  return [
    "Supabase rate limit failed: TypeError: fetch failed",
    "TypeError: fetch failed",
    "522",
    "Connection timed out",
    "supabase.co",
  ].some((message) => error.message.includes(message));
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
    const hostControlObservationTimeoutMs = getSupabaseE2eConfig()
      ? HOSTED_REFRESH_TIMEOUT_MS
      : HOSTED_ACTION_TIMEOUT_MS;
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
        await expect(
          this.page.getByTestId("admin-host-run-controls").getByText("Voting Controls").first(),
        ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
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
        if (await hostControlIsActive()) {
          return;
        }

        await this.openForceHostTakeoverDetails();
        const forceHostForm = this.page
          .getByTestId("admin-force-host-takeover-panel")
          .locator("form")
          .first();

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
          { timeout: hostControlObservationTimeoutMs },
        )
        .toBe(true);
      return;
    }

    await expect
      .poll(async () => hostControlIsActive(), { timeout: hostControlObservationTimeoutMs })
      .toBe(true);
  }

  async expectActiveHostForEvidence() {
    await this.visit();
    await expect(this.page.getByText("Host control active", { exact: true }).first()).toBeVisible({
      timeout: HOSTED_ACTION_TIMEOUT_MS,
    });
    await expect(this.page.getByRole("button", { name: "Release" })).toBeEnabled();
    await expect(
      this.page.getByTestId("admin-host-run-controls").getByText("Voting Controls").first(),
    ).toBeVisible();
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
    await this.openSecondaryPanels();
    const pendingNames: string[] = [];

    for (const name of names) {
      const row = this.rosterRow(name);

      await expect(row).toHaveCount(1, { timeout: HOSTED_REFRESH_TIMEOUT_MS });

      if ((await row.getAttribute("data-active")) === "false") {
        continue;
      }

      pendingNames.push(name);
    }

    await this.page.evaluate((playerNames) => {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-testid='admin-roster-row']"),
      );

      for (const name of playerNames) {
        const row = rows.find((candidate) => candidate.dataset.playerUsername === name);
        const button = row?.querySelector<HTMLButtonElement>(
          `button[aria-label=${JSON.stringify(`Mark inactive ${name}`)}]`,
        );

        button?.click();
      }
    }, pendingNames);

    await expect
      .poll(
        async () =>
          Promise.all(
            pendingNames.map(async (name) => {
              const row = this.rosterRow(name);

              return {
                active: await row.getAttribute("data-active"),
                pending: await row.getAttribute("data-pending"),
              };
            }),
          ),
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toEqual(pendingNames.map(() => ({ active: "false", pending: "false" })));
  }

  async bulkImportPlayers(names: readonly string[]) {
    if (names.length === 0) {
      return;
    }

    await this.loginAndTakeHost();
    await this.openSecondaryPanels();

    const bulkImportForm = this.page.locator("form", {
      has: this.page.getByPlaceholder("Bulk import start.gg usernames"),
    });

    await expect(bulkImportForm).toHaveCount(1, { timeout: HOSTED_REFRESH_TIMEOUT_MS });
    await bulkImportForm.getByPlaceholder("Bulk import start.gg usernames").fill(names.join("\n"));
    await clickServerAction(
      this.page,
      bulkImportForm.getByRole("button", { name: "Bulk Import" }),
      0,
      {
        requireServerActionResponse: true,
        responseTimeoutMs: 60_000,
        submitForm: true,
      },
    );
  }

  async addInactivePlayerToCurrentRound(name: string, reason: string) {
    await this.loginAndTakeHost();
    await this.openSupportPanels();

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

    await this.openSecondaryPanels();
    const rehearsalDetails = this.page.getByTestId("admin-rehearsal-controls");
    await expect(rehearsalDetails).toHaveCount(1, { timeout: HOSTED_REFRESH_TIMEOUT_MS });

    if (!(await rehearsalDetails.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await rehearsalDetails.locator("summary").click();
    }

    const rehearsalForm = rehearsalDetails
      .locator("form", { has: this.page.getByRole("button", { name: "Start Rehearsal" }) })
      .first();

    await expect(rehearsalForm.getByRole("button", { name: "Start Rehearsal" })).toBeEnabled({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
    await rehearsalForm.getByPlaceholder("Audit reason").fill(reason);
    await clickServerAction(
      this.page,
      rehearsalForm.getByRole("button", { name: "Start Rehearsal" }),
      10_000,
    );
    await this.expectSupabaseRehearsalMode();
  }

  private async expectSupabaseRehearsalMode() {
    await this.visit();
    await this.openSecondaryPanels();
    await expect(this.page.getByText("Rehearsal mode", { exact: true }).first()).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await expect
      .poll(
        async () => {
          if (!(await this.visit())) {
            return false;
          }

          return this.page
            .getByTestId("admin-roster-row")
            .filter({ hasText: "Rehearsal Player 01" })
            .first()
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
    await this.openSecondaryPanels();

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
    const drawButton = setSection.getByRole("button", { name: "Draw Set" });

    await expect(drawButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });

    await clickServerAction(this.page, drawButton, 5_000, {
      postDataIncludes: [
        "roundNumber",
        `\r\n${roundNumber}\r\n`,
        "setOrder",
        `\r\n${setOrder}\r\n`,
      ],
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

          return refreshedSetSection
            .getByText(/Draw 1/)
            .first()
            .isVisible();
        },
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toBe(true);
  }

  async drawCurrentRound(roundNumber: number) {
    await this.drawRoundSet(roundNumber, 1);
    await this.drawRoundSet(roundNumber, 2);
    if (!(await expectSupabaseRoundDrawsReady(roundNumber))) {
      await this.expectTextAfterNavigation("Ready to vote");
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

  async confirmStageRevealComplete() {
    await this.loginAndTakeHost();

    const confirmButton = this.page.getByRole("button", {
      name: "Confirm Stage Reveal Complete",
    });

    await expect(confirmButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
    await clickServerAction(this.page, confirmButton);
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
          if (
            currentState?.votingStatus !== "results_revealed" &&
            currentState?.votingStatus !== "round_complete"
          ) {
            console.log(`[phase9] round ${roundNumber}: confirm final reveal complete`);
            await this.confirmStageRevealComplete();
          }

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
        await this.confirmStageRevealComplete();
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

    await this.openForceHostTakeoverDetails();
    const forceHostForm = this.page
      .getByTestId("admin-force-host-takeover-panel")
      .locator("form")
      .first();

    await expect(forceHostForm).toHaveCount(1, { timeout: HOSTED_REFRESH_TIMEOUT_MS });
    await forceHostForm.getByLabel("Audit reason").fill(reason);
    await forceHostForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
    const forceHostButton = forceHostForm.getByRole("button", { name: "Force Host Takeover" });

    await expect(forceHostButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
    await clickServerAction(this.page, forceHostButton, 5_000, {
      postDataIncludes: ["forceHostTakeover", reason],
      requireServerActionResponse: true,
      responseTimeoutMs: 60_000,
    });
    await expect(this.page.getByRole("button", { name: "Release" })).toBeEnabled({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
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
    await this.openSecondaryPanels();

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

  private async openAdminPanel(testId: string) {
    const panel = this.page.getByTestId(testId);

    await expect(panel).toHaveCount(1, { timeout: HOSTED_REFRESH_TIMEOUT_MS });

    const isOpen = await panel.evaluate((element) => (element as HTMLDetailsElement).open);

    if (!isOpen) {
      await panel.locator("summary").first().click();
    }
  }

  async openSecondaryPanels() {
    await this.openAdminPanel("admin-secondary-panels");
  }

  private async openSupportPanels() {
    await this.openAdminPanel("admin-support-panels");
  }

  private async openForceHostTakeoverDetails() {
    const details = this.page.getByTestId("admin-force-host-takeover-panel");

    await expect(details).toHaveCount(1, { timeout: HOSTED_REFRESH_TIMEOUT_MS });

    const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open);

    if (!isOpen) {
      await details.locator("summary").first().click();
    }

    await expect
      .poll(async () => details.evaluate((element) => (element as HTMLDetailsElement).open))
      .toBe(true);
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

    try {
      await expect
        .poll(
          async () => {
            const visited = await this.visit().catch((error: unknown) => {
              if (!isTransientSupabaseFetchFailure(error)) {
                throw error;
              }

              return false;
            });

            if (!visited) {
              return false;
            }

            return this.page
              .getByRole("button", { name: "Release" })
              .isEnabled()
              .catch(() => false);
          },
          { timeout: HOSTED_REFRESH_TIMEOUT_MS },
        )
        .toBe(true);

      return true;
    } catch (error) {
      const hostCookie = await this.getContextCookie(HOST_TOKEN_COOKIE);
      const hostLockDebug = await getSupabaseHostLockDebug(sessionId, hostToken);

      throw new Error(
        `Installed Supabase host lock for admin session ${sessionId}, but page stayed inactive; hostCookie=${hostCookie ? "present" : "missing"}; hostLock=${JSON.stringify(hostLockDebug)}; observedError=${error instanceof Error ? error.message : "unknown"}.`,
      );
    }
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
