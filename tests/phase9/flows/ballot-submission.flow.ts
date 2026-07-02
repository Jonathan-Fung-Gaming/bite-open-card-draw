import { expect, type Browser, type Page } from "@playwright/test";
import {
  HOSTED_REFRESH_TIMEOUT_MS,
  clickServerAction,
  goto,
} from "../fixtures/phase9-env";
import { expectSupabaseRehearsalBallots } from "../fixtures/supabase-state";

export async function submitRehearsalBallots(
  options: {
    baseURL: string;
    browser: Browser;
    roundNumber: number;
  },
) {
  const { baseURL, browser, roundNumber } = options;

  console.log(`[phase9] round ${roundNumber}: submit rehearsal ballots`);
  await submitRehearsalBallotsThroughVoteUi(browser, baseURL, roundNumber);
}

async function submitRehearsalBallotsThroughVoteUi(
  browser: Browser,
  baseURL: string,
  roundNumber: number,
) {
  console.log(`[phase9] round ${roundNumber}: submit ballots through /vote UI`);

  const playerOnePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerTwoPage = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await submitNoBanVote(playerOnePage, baseURL, roundNumber, "Rehearsal Player 01");
    await reviseWithTwoBansPerSet(playerOnePage, [0, 1]);
    await submitBanVote(playerTwoPage, baseURL, roundNumber, "Rehearsal Player 02", [2, 3]);
  } finally {
    await playerOnePage.close().catch(() => undefined);
    await playerTwoPage.close().catch(() => undefined);
  }

  await expectSupabaseRehearsalBallots(roundNumber);
}

async function selectBans(page: Page, indexes: number[]) {
  for (const index of indexes) {
    const card = page.getByTestId("ballot-chart-card").nth(index);

    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
  }
}

async function submitCurrentBallot(page: Page, expectedMessage: string | RegExp) {
  await clickServerAction(page, page.getByRole("button", { name: "Submit Ballot" }), 0, {
    requireServerActionResponse: true,
    responseTimeoutMs: 60_000,
  });
  await expect(page.getByText(expectedMessage)).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function submitBanVote(
  page: Page,
  baseURL: string,
  roundNumber: number,
  playerStartggUsername: string,
  bannedIndexes: number[],
) {
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

  await selectBans(page, bannedIndexes);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByTestId("ballot-chart-card")).toHaveCount(7, {
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await selectBans(page, bannedIndexes);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: `Round ${roundNumber} Ballot` })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await submitCurrentBallot(page, "Ballot Saved");
}

async function submitNoBanVote(
  page: Page,
  baseURL: string,
  roundNumber: number,
  playerStartggUsername: string,
) {
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
  await expect(page.getByTestId("ballot-chart-card")).toHaveCount(7, {
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await page.getByLabel("No bans for this set").check();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: `Round ${roundNumber} Ballot` })).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await submitCurrentBallot(page, "Ballot Saved");
}

async function reviseWithTwoBansPerSet(page: Page, bannedIndexes: number[]) {
  await page.getByRole("button", { name: /^Edit / }).first().click();
  await expect(page.getByTestId("ballot-chart-card")).toHaveCount(7, {
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });

  await selectBans(page, bannedIndexes);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByTestId("ballot-chart-card")).toHaveCount(7, {
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await selectBans(page, bannedIndexes);
  await page.getByRole("button", { name: "Review" }).click();
  await submitCurrentBallot(page, "Saved revision 2.");
}
