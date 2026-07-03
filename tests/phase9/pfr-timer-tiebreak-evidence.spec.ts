import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  ADMIN_PASSWORD,
  HOSTED_REFRESH_TIMEOUT_MS,
  clickServerAction,
  goto,
  requireBaseURL,
} from "./fixtures/phase9-env";
import {
  attachRehearsalDiagnostics,
  createAdminPage,
  releaseHostAndClosePages,
  startHostedRehearsal,
} from "./flows/rehearsal.flow";
import { closeVotingForRound, openVotingForRound } from "./flows/voting-window.flow";
import type { AdminPage } from "./pages/admin.page";
import { StagePage } from "./pages/stage.page";

const ROUND_NUMBER = 1;
const ROUND_ONE_SET_LABELS = ["S16", "S17"] as const;

async function attachJsonEvidence(testInfo: TestInfo, name: string, payload: unknown) {
  await testInfo.attach(name, {
    body: `${JSON.stringify(payload, null, 2)}\n`,
    contentType: "application/json",
  });
}

function parseTimerSeconds(timerText: string) {
  const match = timerText.trim().match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    throw new Error(`Could not parse timer text "${timerText}".`);
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

async function readStageTimerText(page: Page) {
  const text = await page.getByTestId("stage-countdown-display").textContent();

  if (!text) {
    throw new Error("Stage timer was empty.");
  }

  return text.trim();
}

async function readStageTimerSeconds(page: Page) {
  return parseTimerSeconds(await readStageTimerText(page));
}

async function expectStageTimerDecreases(page: Page, initialSeconds: number) {
  await expect
    .poll(async () => readStageTimerSeconds(page), {
      intervals: [500, 750, 1_000],
      timeout: 5_000,
    })
    .toBeLessThan(initialSeconds);
}

async function clickAdminControl(adminPage: AdminPage, name: string) {
  await adminPage.loginAndTakeHost();
  await clickServerAction(
    adminPage.page,
    adminPage.page.getByRole("button", { name, exact: true }),
    0,
  );
}

async function submitNoBanBallot(page: Page, baseURL: string, playerStartggUsername: string) {
  await goto(page, baseURL, "/vote");
  await page.getByLabel("Select your start.gg username").selectOption({
    label: playerStartggUsername,
  });
  await expect(
    page.getByText(`Are you sure you are voting as ${playerStartggUsername}?`),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("ballot-chart-card")).toHaveCount(7, {
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });

  await page.getByLabel("No bans for this set").check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByTestId("ballot-chart-card")).toHaveCount(7);
  await page.getByLabel("No bans for this set").check();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: `Round ${ROUND_NUMBER} Ballot` })).toBeVisible();
  await clickServerAction(page, page.getByRole("button", { name: "Submit Ballot" }), 0, {
    requireServerActionResponse: true,
    responseTimeoutMs: 60_000,
  });
  await expect(page.getByText("Ballot Saved")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function expectSavedBallotEditsVisible(page: Page) {
  for (const label of ROUND_ONE_SET_LABELS) {
    await expect(page.getByRole("button", { name: `Edit ${label}` })).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
  }

  await expect(page.getByRole("button", { name: "Change vote" })).toBeVisible();
}

async function expectSavedBallotEditsHidden(page: Page) {
  for (const label of ROUND_ONE_SET_LABELS) {
    await expect(page.getByRole("button", { name: `Edit ${label}` })).toHaveCount(0);
  }

  await expect(page.getByRole("button", { name: "Change vote" })).toHaveCount(0);
}

async function reopenVotingForOneMinute(adminPage: AdminPage) {
  await adminPage.loginAndTakeHost();

  const reopenForm = adminPage.page.locator("form", {
    has: adminPage.page.getByRole("button", { name: "Reopen Voting" }),
  });

  await expect(reopenForm.getByRole("button", { name: "Reopen Voting" })).toBeEnabled({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await reopenForm.locator("select[name='durationMinutes']").selectOption("1");
  await reopenForm.getByLabel("Audit reason").fill("PFR-019 browser timer reopen evidence");
  await reopenForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
  await clickServerAction(
    adminPage.page,
    reopenForm.getByRole("button", { name: "Reopen Voting" }),
    0,
  );
  await adminPage.expectTextAfterNavigation("voting open");
}

async function seedRehearsalTiebreak(adminPage: AdminPage) {
  await adminPage.loginAndTakeHost();

  const seedForm = adminPage.page.locator("form", {
    has: adminPage.page.getByRole("button", { name: "Seed Tiebreak" }),
  });

  await seedForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await seedForm.getByPlaceholder("Audit reason").fill("PFR-023 browser tiebreak evidence");
  await clickServerAction(adminPage.page, seedForm.getByRole("button", { name: "Seed Tiebreak" }));
}

async function advanceRevealStep(adminPage: AdminPage) {
  await adminPage.loginAndTakeHost();

  const nextButton = adminPage.page.getByRole("button", {
    name: /Advance to Set 1 counts|Reveal Set 1 selected chart|Advance to Set 2 counts|Reveal Set 2 selected chart|Show final charts/,
  });

  await expect(nextButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await clickServerAction(adminPage.page, nextButton, 0);
}

async function readRuneSlotLabels(page: Page) {
  return page.getByTestId("rune-wheel-slot").evaluateAll((slots) =>
    slots.map((slot) => {
      const label = slot.querySelectorAll("p")[1]?.textContent?.trim();

      if (!label) {
        throw new Error("Rune-wheel slot is missing its chart label.");
      }

      return label;
    }),
  );
}

function countLabels(labels: string[]) {
  return labels.reduce<Record<string, number>>((counts, label) => {
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});
}

test("PFR-019 browser timer evidence covers pause, resume, manual close, and reopen", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const resolvedBaseURL = requireBaseURL(baseURL);
  const adminPage = createAdminPage(page, resolvedBaseURL);
  const stageRawPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const phonePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const stagePage = new StagePage(stageRawPage, resolvedBaseURL);
  const evidence: Record<string, unknown> = {};
  let testError: unknown = null;

  try {
    await startHostedRehearsal(adminPage, "PFR-019 focused browser timer evidence");
    await adminPage.drawCurrentRound(ROUND_NUMBER);
    await stagePage.goto();
    await openVotingForRound(adminPage, ROUND_NUMBER);
    await stagePage.reload();
    await expect(stageRawPage.locator("header").getByText("Voting open")).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });

    evidence.openTimerText = await readStageTimerText(stageRawPage);

    await submitNoBanBallot(phonePage, resolvedBaseURL, "Rehearsal Player 01");
    await expectSavedBallotEditsVisible(phonePage);

    await clickAdminControl(adminPage, "Pause");
    await adminPage.expectTextAfterNavigation("voting paused");
    await stagePage.reload();
    await expect(stageRawPage.locator("header").getByText("Voting paused")).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    const pausedTimerText = await readStageTimerText(stageRawPage);

    await phonePage.reload({ waitUntil: "domcontentloaded" });
    await expect(
      phonePage.getByText("Voting is paused. Your saved ballot remains valid; edits resume"),
    ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
    await expectSavedBallotEditsHidden(phonePage);
    await stageRawPage.waitForTimeout(2_200);
    const pausedTimerTextAfterWait = await readStageTimerText(stageRawPage);

    expect(pausedTimerTextAfterWait).toBe(pausedTimerText);

    await clickAdminControl(adminPage, "Resume");
    await adminPage.expectTextAfterNavigation("voting open");
    await stagePage.reload();
    const resumedTimerSeconds = await readStageTimerSeconds(stageRawPage);

    await expectStageTimerDecreases(stageRawPage, resumedTimerSeconds);
    const resumedTimerTextAfterWait = await readStageTimerText(stageRawPage);

    await phonePage.reload({ waitUntil: "domcontentloaded" });
    await expectSavedBallotEditsVisible(phonePage);

    await closeVotingForRound(adminPage, ROUND_NUMBER);
    await stagePage.reload();
    await expect(stageRawPage.locator("header").getByText("Voting closed")).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await phonePage.reload({ waitUntil: "domcontentloaded" });
    await expect(phonePage.getByText("Voting is closed.")).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await expect(phonePage.getByText("Results are being revealed on stage.")).toBeVisible();
    await expectSavedBallotEditsHidden(phonePage);

    await reopenVotingForOneMinute(adminPage);
    await stagePage.reload();
    await expect(stageRawPage.locator("header").getByText("Voting open")).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    const reopenedTimerText = await readStageTimerText(stageRawPage);
    const reopenedTimerSeconds = parseTimerSeconds(reopenedTimerText);

    expect(reopenedTimerSeconds).toBeGreaterThan(0);
    expect(reopenedTimerSeconds).toBeLessThanOrEqual(60);

    await phonePage.reload({ waitUntil: "domcontentloaded" });
    await expect(phonePage.getByText("Ballot Saved")).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await expectSavedBallotEditsVisible(phonePage);

    evidence.pausedTimerText = pausedTimerText;
    evidence.pausedTimerTextAfterWait = pausedTimerTextAfterWait;
    evidence.resumedTimerTextAfterWait = resumedTimerTextAfterWait;
    evidence.reopenedTimerText = reopenedTimerText;
    evidence.reopenedTimerSeconds = reopenedTimerSeconds;
    evidence.phoneEditsHiddenWhilePaused = true;
    evidence.phoneClosedCopyVisibleAfterManualClose = true;
    evidence.phoneEditsVisibleAfterReopen = true;

    await attachJsonEvidence(testInfo, "pfr-019-browser-timer-evidence.json", evidence);
  } catch (error) {
    testError = error;
    await attachRehearsalDiagnostics({ adminPage, publicPages: null, testInfo });
    throw error;
  } finally {
    await phonePage.close().catch(() => undefined);
    await stageRawPage.close().catch(() => undefined);
    await releaseHostAndClosePages(adminPage, null, testError);
  }
});

test("PFR-023 browser tiebreak evidence keeps winner sealed until reveal completion", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const resolvedBaseURL = requireBaseURL(baseURL);
  const adminPage = createAdminPage(page, resolvedBaseURL);
  const stageRawPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const stagePage = new StagePage(stageRawPage, resolvedBaseURL);
  let testError: unknown = null;

  try {
    await startHostedRehearsal(adminPage, "PFR-023 focused browser tiebreak evidence");
    await adminPage.drawCurrentRound(ROUND_NUMBER);
    await stagePage.goto();
    await seedRehearsalTiebreak(adminPage);
    await closeVotingForRound(adminPage, ROUND_NUMBER);
    await adminPage.computeResults();
    await adminPage.expectRevealPhaseAfterNavigation("computed");

    await advanceRevealStep(adminPage);
    await adminPage.expectRevealPhaseAfterNavigation("set 1 counts");
    await advanceRevealStep(adminPage);
    await stagePage.reload();

    const wheel = stageRawPage.getByTestId("rune-wheel");

    await expect(wheel).toHaveAttribute("data-winner-revealed", "false", { timeout: 1_500 });
    await expect(stageRawPage.getByTestId("rune-wheel-slot")).toHaveCount(12);
    await expect(stageRawPage.getByTestId("rune-wheel-status")).toHaveText(
      "Backend winner sealed. Reveal in progress.",
    );
    await expect(stageRawPage.getByTestId("result-selected-label")).toHaveCount(0, { timeout: 500 });

    const hiddenSlotLabels = await readRuneSlotLabels(stageRawPage);
    const hiddenSlotCounts = countLabels(hiddenSlotLabels);

    expect(Object.keys(hiddenSlotCounts)).toHaveLength(2);
    expect(Object.values(hiddenSlotCounts).sort((left, right) => left - right)).toEqual([6, 6]);

    await expect(wheel).toHaveAttribute("data-winner-revealed", "true", { timeout: 8_000 });
    await expect(stageRawPage.getByTestId("rune-wheel-status")).toContainText(
      "Backend winner revealed:",
    );
    await expect(stageRawPage.getByTestId("result-selected-label")).toHaveCount(1);

    const revealedStatusText =
      (await stageRawPage.getByTestId("rune-wheel-status").textContent())?.trim() ?? "";

    await attachJsonEvidence(testInfo, "pfr-023-browser-tiebreak-evidence.json", {
      hiddenWinnerAttribute: "false",
      hiddenSelectedLabelCount: 0,
      slotCount: hiddenSlotLabels.length,
      slotCountsByChart: hiddenSlotCounts,
      revealedWinnerAttribute: "true",
      revealedSelectedLabelCount: 1,
      revealedStatusText,
    });
  } catch (error) {
    testError = error;
    await attachRehearsalDiagnostics({ adminPage, publicPages: null, testInfo });
    throw error;
  } finally {
    await stageRawPage.close().catch(() => undefined);
    await releaseHostAndClosePages(adminPage, null, testError);
  }
});
