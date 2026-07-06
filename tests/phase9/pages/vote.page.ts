import { expect, type Page, type Route } from "@playwright/test";
import {
  HOSTED_REFRESH_TIMEOUT_MS,
  clickServerAction,
  goto,
} from "../fixtures/phase9-env";

export type BallotBanPlan = readonly [readonly number[], readonly number[]];

export type SelectedBallotCard = {
  chartId: string;
  chartName: string;
  setIndex: number;
};

type SubmitBallotOptions = {
  banPlan?: BallotBanPlan;
  expectDuplicateWarning?: boolean;
  expectedMessage?: string | RegExp;
  playerName: string;
  startFromRoom?: boolean;
  useCurrentRoom?: boolean;
  waitForCardsAfterConfirm?: boolean;
};

const NO_BAN_PLAN: BallotBanPlan = [[], []] as const;

export class VotePage {
  constructor(
    readonly page: Page,
    readonly baseURL: string,
  ) {}

  async goto() {
    await goto(this.page, this.baseURL, "/vote");
  }

  async gotoRoom() {
    await goto(this.page, this.baseURL, "/room");
  }

  async reload() {
    await this.page.reload({ waitUntil: "domcontentloaded" });
  }

  async expectPlayerSelector() {
    await expect(this.page.getByLabel("Select your start.gg username")).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
  }

  async gotoFromRoom() {
    await this.gotoRoom();
    await this.continueFromRoomToVote();
  }

  async continueFromRoomToVote() {
    await this.page.getByRole("link", { name: "I am a player voting" }).click();
    await this.expectPlayerSelector();
  }

  async expectEligiblePlayers(names: readonly string[]) {
    const expectedNames = [...names].sort((left, right) => left.localeCompare(right));

    await expect
      .poll(
        async () => {
          await this.goto();

          return this.eligiblePlayerNames();
        },
        { timeout: HOSTED_REFRESH_TIMEOUT_MS },
      )
      .toEqual(expectedNames);
  }

  async submitBallot({
    banPlan = NO_BAN_PLAN,
    expectDuplicateWarning = false,
    expectedMessage = "Ballot successfully submitted.",
    playerName,
    startFromRoom = true,
    useCurrentRoom = false,
    waitForCardsAfterConfirm = true,
  }: SubmitBallotOptions) {
    await this.beginBallot({
      expectDuplicateWarning,
      playerName,
      startFromRoom,
      useCurrentRoom,
      waitForCardsAfterConfirm,
    });

    return this.finishCurrentBallot(banPlan, expectedMessage);
  }

  async beginBallot(options: {
    expectDuplicateWarning?: boolean;
    playerName: string;
    startFromRoom?: boolean;
    useCurrentRoom?: boolean;
    waitForCardsAfterConfirm?: boolean;
  }) {
    const {
      expectDuplicateWarning = false,
      playerName,
      startFromRoom = true,
      useCurrentRoom = false,
      waitForCardsAfterConfirm = true,
    } = options;

    if (useCurrentRoom) {
      await this.continueFromRoomToVote();
    } else if (startFromRoom) {
      await this.gotoFromRoom();
    } else {
      await this.goto();
      await this.expectPlayerSelector();
    }

    await this.selectPlayer(playerName);
    if (expectDuplicateWarning) {
      await this.expectDuplicateBallotWarning(playerName);
    }
    await this.confirmSelectedPlayer({ waitForCards: waitForCardsAfterConfirm });
  }

  async finishCurrentBallot(
    banPlan: BallotBanPlan,
    expectedMessage: string | RegExp = "Ballot successfully submitted.",
  ) {
    const selectedCards = await this.completeBallotChoices(banPlan);

    await this.submitCurrentBallot(expectedMessage);

    return {
      selectedCards,
    };
  }

  async expectDuplicateBallotWarning(playerName: string) {
    await expect(
      this.page.getByText(
        new RegExp(`A ballot already exists for this start\\.gg username.*${escapeRegExp(playerName)}`),
      ),
    ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  }

  async expectPresenceWarning(playerName: string) {
    await expect(
      this.page.getByText(
        new RegExp(`Another active device has already claimed ${escapeRegExp(playerName)}`),
      ),
    ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  }

  async expectSavedBallot(options: {
    expectedTexts?: readonly string[];
    playerName: string;
  }) {
    await expect(this.page.getByText("Ballot successfully submitted.")).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await expect(this.page.getByText(`Voting as ${options.playerName}`)).toBeVisible();

    for (const text of options.expectedTexts ?? []) {
      await expect(this.page.getByText(text, { exact: true }).first()).toBeVisible();
    }
  }

  async editSavedBallotAndForceSubmitFailure(banPlan: BallotBanPlan) {
    await this.page.getByRole("button", { name: /^Edit / }).first().click();
    await expect(this.page.getByTestId("ballot-chart-card")).toHaveCount(7, {
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await this.completeBallotChoices(banPlan);
    await this.failNextSubmitRequest();
    await this.page.getByRole("button", { name: "Submit Ballot" }).click();
    await expect(this.page.getByText(/Your saved ballot is still active\./)).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
  }

  async expectClosedRevealHoldingState() {
    await expect(this.page.getByText("Voting is closed.")).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await expect(this.page.getByText("Results are being revealed on stage.")).toBeVisible();
  }

  private async eligiblePlayerNames() {
    return this.page
      .getByLabel("Select your start.gg username")
      .locator("option")
      .evaluateAll((options) =>
        (options as HTMLOptionElement[])
          .filter((option) => option.value)
          .map((option) => option.textContent?.trim() ?? "")
          .filter(Boolean),
      );
  }

  private async selectPlayer(playerName: string) {
    await this.page.getByLabel("Select your start.gg username").selectOption({
      label: playerName,
    });
    await expect(this.page.getByText(`Are you sure you are voting as ${playerName}?`)).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
  }

  private async confirmSelectedPlayer(options: { waitForCards?: boolean } = {}) {
    const confirmButton = this.page.getByRole("button", { name: "Confirm" });

    await expect(confirmButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
    await confirmButton.click();
    if (options.waitForCards !== false) {
      await expect(this.page.getByTestId("ballot-chart-card")).toHaveCount(7, {
        timeout: HOSTED_REFRESH_TIMEOUT_MS,
      });
    }
  }

  private async completeBallotChoices(banPlan: BallotBanPlan) {
    const selectedCards: SelectedBallotCard[] = [];

    for (const [setIndex, bannedIndexes] of banPlan.entries()) {
      await expect(this.page.getByTestId("ballot-chart-card")).toHaveCount(7, {
        timeout: HOSTED_REFRESH_TIMEOUT_MS,
      });
      selectedCards.push(...(await this.completeCurrentSet(setIndex, bannedIndexes)));
      await this.page
        .getByRole("button", { name: setIndex === 1 ? "Review" : "Next", exact: true })
        .click();
    }

    return selectedCards;
  }

  private async completeCurrentSet(setIndex: number, bannedIndexes: readonly number[]) {
    if (bannedIndexes.length === 0) {
      await this.page.getByLabel("No bans for this set").check();
      return [];
    }

    const selectedCards: SelectedBallotCard[] = [];

    for (const index of bannedIndexes) {
      const card = this.page.getByTestId("ballot-chart-card").nth(index);
      const chartId = await card.getAttribute("data-chart-id");
      const chartName = await card.getAttribute("data-chart-name");

      if (!chartId || !chartName) {
        throw new Error(`Ballot card ${index} is missing chart identity test metadata.`);
      }

      await card.click();
      await expect(card).toHaveAttribute("aria-pressed", "true");
      selectedCards.push({ chartId, chartName, setIndex });
    }

    return selectedCards;
  }

  private async submitCurrentBallot(expectedMessage: string | RegExp) {
    await clickServerAction(this.page, this.page.getByRole("button", { name: "Submit Ballot" }), 0, {
      requireServerActionResponse: true,
      responseTimeoutMs: 60_000,
      skipMinimumSettle: true,
    });

    const locator =
      typeof expectedMessage === "string"
        ? this.page.getByText(expectedMessage, { exact: true })
        : this.page.getByText(expectedMessage);

    await expect(locator).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  }

  private async failNextSubmitRequest() {
    let aborted = false;
    const routeHandler = async (route: Route) => {
      const request = route.request();
      const isServerActionPost =
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/vote" &&
        (Boolean(request.headers()["next-action"]) || (request.postData() ?? "").includes("$ACTION"));

      if (!aborted && isServerActionPost) {
        aborted = true;
        await route.abort("failed");
        await this.page.unroute("**/*", routeHandler);
        return;
      }

      await route.continue();
    };

    await this.page.route("**/*", routeHandler);
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
