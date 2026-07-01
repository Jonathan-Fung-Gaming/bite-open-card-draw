import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

function getAdminPassword() {
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!password) {
    throw new Error("Missing E2E_ADMIN_PASSWORD from Playwright config.");
  }

  return password;
}

const ADMIN_PASSWORD = getAdminPassword();

function getTestRouteHeaders() {
  const token = process.env.E2E_TEST_ROUTE_TOKEN;

  if (!token) {
    throw new Error("Missing E2E_TEST_ROUTE_TOKEN from Playwright config.");
  }

  return { "x-tournament-test-token": token };
}
const PLAYER_COUNT = 50;
const LOAD_CONCURRENCY = Number(process.env.E2E_LOAD_CONCURRENCY ?? 3);
const LOAD_CHUNK_DELAY_MS = Number(process.env.E2E_LOAD_CHUNK_DELAY_MS ?? 750);
const EDIT_EVERY_N_PLAYERS = 5;
const HOSTED_REFRESH_TIMEOUT_MS = 90_000;

function playerName(index: number) {
  return `Load Player ${String(index + 1).padStart(3, "0")}`;
}

function route(baseURL: string, path: string) {
  return new URL(path, baseURL).toString();
}

async function goto(page: Page, baseURL: string, path: string) {
  await page.goto(route(baseURL, path), { waitUntil: "domcontentloaded" });
}

async function loginAndTakeHost(page: Page, baseURL: string) {
  await goto(page, baseURL, "/coolguy69");
  const passwordInput = page.getByLabel("Shared admin password");

  if ((await passwordInput.count()) > 0) {
    await passwordInput.fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();
  }

  await expect(page.getByRole("heading", { name: "coolguy69" })).toBeVisible();
  const releaseButton = page.getByRole("button", { name: "Release" });

  if (await releaseButton.isEnabled()) {
    await expect(page.getByText("Voting Controls")).toBeVisible();
    return;
  }

  const takeHostButton = page.getByRole("button", { name: "Take Host Control" });

  if ((await takeHostButton.count()) > 0 && (await takeHostButton.isEnabled())) {
    await takeHostButton.click();
  } else {
    const forceHostForm = page.locator("form", {
      has: page.getByRole("button", { name: "Force Host Takeover" }),
    });

    await forceHostForm.getByLabel("Audit reason").fill("load e2e host takeover");
    await forceHostForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
    await forceHostForm.getByRole("button", { name: "Force Host Takeover" }).click();
  }

  await expect(page.getByText("Voting Controls")).toBeVisible();
  await expect(releaseButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
}

async function drawRoundAndOpenVoting(page: Page) {
  await page.getByRole("button", { name: "Draw Set" }).nth(0).click();
  await expect(page.getByText(/Version 1/).first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await page.getByRole("button", { name: "Draw Set" }).nth(1).click();
  await expect(page.getByText("ready to vote")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await page.getByRole("button", { name: "Open Voting", exact: true }).click();
  await expect(page.getByText("voting open")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function submitAndEditBallot(
  request: APIRequestContext,
  baseURL: string,
  startggUsername: string,
  shouldEdit: boolean,
) {
  const revisions = shouldEdit ? ([1, 2] as const) : ([1] as const);

  for (const revision of revisions) {
    const response = await request.post(route(baseURL, "/api/e2e/load-ballot"), {
      headers: getTestRouteHeaders(),
      data: {
        roundNumber: 1,
        playerStartggUsername: startggUsername,
        revision,
      },
    });
    const payload = (await response.json()) as { error?: string; revision?: number };

    expect(response.ok(), `${startggUsername} revision ${revision}: ${payload.error ?? "ok"}`).toBe(
      true,
    );
    expect(payload.revision).toBe(revision);
  }
}

async function submitLoadChunk(
  request: APIRequestContext,
  baseURL: string,
  players: string[],
  startingIndex: number,
) {
  await Promise.all(
    players.map((player, index) =>
      submitAndEditBallot(
        request,
        baseURL,
        player,
        (startingIndex + index + 1) % EDIT_EVERY_N_PLAYERS === 0,
      ),
    ),
  );
}

async function expectAdminTextAfterNavigation(page: Page, baseURL: string, text: string | RegExp) {
  await expect
    .poll(
      async () => {
        await goto(page, baseURL, "/coolguy69");

        const passwordInput = page.getByLabel("Shared admin password");

        if ((await passwordInput.count()) > 0) {
          await passwordInput.fill(ADMIN_PASSWORD);
          await page.getByRole("button", { name: "Log In" }).click();
          await expect(page.getByRole("heading", { name: "coolguy69" })).toBeVisible();
        }

        return page.getByText(text).isVisible();
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(true);
}

async function advanceRevealStep(page: Page, baseURL: string, settleMs: number) {
  await loginAndTakeHost(page, baseURL);

  const nextButton = page.getByRole("button", {
    name: /Advance to Set 1 counts|Reveal Set 1 selected chart|Advance to Set 2 counts|Reveal Set 2 selected chart|Show final charts/,
  });

  await expect(nextButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await nextButton.click();
  await page.waitForTimeout(settleMs);
}

async function adminRevealPhaseIsVisible(page: Page, phase: string) {
  return page
    .locator("section", { hasText: "Result Reveal Controls" })
    .getByText(phase, { exact: true })
    .isVisible();
}

async function advanceToFinalReveal(page: Page, baseURL: string) {
  await advanceRevealStep(page, baseURL, 2_000);
  await advanceRevealStep(page, baseURL, 7_000);
  await advanceRevealStep(page, baseURL, 2_000);
  await advanceRevealStep(page, baseURL, 7_000);
  await advanceRevealStep(page, baseURL, 5_000);

  await loginAndTakeHost(page, baseURL);

  if (!(await adminRevealPhaseIsVisible(page, "final"))) {
    await advanceRevealStep(page, baseURL, 5_000);
  }

  await expect
    .poll(
      async () => {
        await goto(page, baseURL, "/coolguy69");
        return adminRevealPhaseIsVisible(page, "final");
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(true);
}

test("50-player sporadic browser rehearsal submits, edits, and exports final CSV", async ({
  page,
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(600_000);

  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  const players = Array.from({ length: PLAYER_COUNT }, (_, index) => playerName(index));

  await loginAndTakeHost(page, baseURL);
  await page.getByPlaceholder("Bulk import start.gg usernames").fill(players.join("\n"));
  await page.getByRole("button", { name: "Bulk Import" }).click();
  await expect(page.getByRole("cell", { name: playerName(0), exact: true })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: playerName(PLAYER_COUNT - 1), exact: true }),
  ).toBeVisible();

  await drawRoundAndOpenVoting(page);

  const stagePage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const roomSpectator = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const chartsSpectator = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const resultsSpectator = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await goto(stagePage, baseURL, "/stage");
  await expect(stagePage.locator("header").getByText("Voting open")).toBeVisible();
  await goto(roomSpectator, baseURL, "/room");
  await expect(roomSpectator.getByRole("link", { name: "View charts only" })).toBeVisible();
  await goto(chartsSpectator, baseURL, "/charts");
  await expect(chartsSpectator.getByTestId("view-only-status")).toContainText("Voting open");
  await goto(resultsSpectator, baseURL, "/results");
  await expect(resultsSpectator.getByRole("heading", { name: "Round 1 Results" })).toBeVisible();

  for (let index = 0; index < players.length; index += LOAD_CONCURRENCY) {
    const chunk = players.slice(index, index + LOAD_CONCURRENCY);
    await submitLoadChunk(request, baseURL, chunk, index);

    if ((index + chunk.length) % 10 === 0 || index + chunk.length === players.length) {
      await stagePage.reload({ waitUntil: "domcontentloaded" });
      await expect(
        stagePage.locator("header").getByText(/Voting open|Final 30 seconds|Voting closed/),
      ).toBeVisible();
    }

    if (index + chunk.length < players.length) {
      await page.waitForTimeout(LOAD_CHUNK_DELAY_MS);
    }
  }

  await loginAndTakeHost(page, baseURL);
  await expect(page.getByText(`${PLAYER_COUNT} / ${PLAYER_COUNT}`)).toBeVisible();

  await chartsSpectator.reload({ waitUntil: "domcontentloaded" });
  await expect(chartsSpectator.getByTestId("view-only-status")).toContainText(
    /Voting open|Final 30 seconds|Results being revealed/,
  );

  if (!(await page.getByText("voting closed").isVisible())) {
    await expect(page.getByRole("button", { name: "Close Voting" })).toBeEnabled({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await page.getByRole("button", { name: "Close Voting" }).click();
    await page.waitForTimeout(5_000);
    await expectAdminTextAfterNavigation(page, baseURL, "voting closed");
  }
  await expectAdminTextAfterNavigation(page, baseURL, "voting closed");
  await expect(page.getByRole("button", { name: "Compute Results" })).toBeEnabled({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await page.getByRole("button", { name: "Compute Results" }).click();
  await page.waitForTimeout(5_000);
  await expectAdminTextAfterNavigation(page, baseURL, "results computed");

  await advanceToFinalReveal(page, baseURL);
  await expect(stagePage.getByRole("heading", { name: "ROUND 1 FINAL CHARTS" })).toBeVisible({
    timeout: 15_000,
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download private ballot CSV" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  if (!downloadPath) {
    throw new Error("Could not read downloaded private CSV.");
  }

  const csv = await readFile(downloadPath, "utf8");
  const exportedPlayers = csv.match(/Load Player \d{3}/g) ?? [];

  expect(download.suggestedFilename()).toBe("round-1-private-ballots.csv");
  expect(new Set(exportedPlayers).size).toBe(PLAYER_COUNT);
  expect(csv).toContain("manual_override");
  expect(csv).toContain("selected_set_1_chart");
  expect(csv).toContain("selected_set_2_chart");

  await stagePage.close();
  await roomSpectator.close();
  await chartsSpectator.close();
  await resultsSpectator.close();
  await page.getByRole("button", { name: "Release" }).click();
  await expect(page.getByRole("button", { name: "Release" })).toBeDisabled();
});
