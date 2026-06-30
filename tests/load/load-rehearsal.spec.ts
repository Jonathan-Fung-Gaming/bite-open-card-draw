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
const PLAYER_COUNT = 100;
const LOAD_CONCURRENCY = Number(process.env.E2E_LOAD_CONCURRENCY ?? 6);
const HOSTED_REFRESH_TIMEOUT_MS = 15_000;

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
  await page.getByLabel("Shared admin password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByRole("heading", { name: "coolguy69" })).toBeVisible();
  await page.getByRole("button", { name: /^(Force Host Takeover|Take Host Control)$/ }).click();
  await expect(page.getByText("Voting Controls")).toBeVisible();
}

async function drawRoundAndOpenVoting(page: Page) {
  await page.getByRole("button", { name: "Draw Set" }).nth(0).click();
  await expect(page.getByText(/Version 1/).first()).toBeVisible();
  await page.getByRole("button", { name: "Draw Set" }).nth(1).click();
  await expect(page.getByText("ready to vote")).toBeVisible();
  await page.getByRole("button", { name: "Open Voting", exact: true }).click();
  await expect(page.getByText("voting open")).toBeVisible();
}

async function submitAndEditBallot(
  request: APIRequestContext,
  baseURL: string,
  startggUsername: string,
) {
  for (const revision of [1, 2] as const) {
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

async function submitLoadChunk(request: APIRequestContext, baseURL: string, players: string[]) {
  await Promise.all(players.map((player) => submitAndEditBallot(request, baseURL, player)));
}

async function expectAdminRevealPhase(page: Page, phase: string) {
  await expect(
    page
      .locator("section", { hasText: "Result Reveal Controls" })
      .getByText(phase, { exact: true }),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
}

async function advanceRevealAndWaitForAdminPhase(page: Page, phase: string) {
  const nextButton = page.getByRole("button", { name: "Next Reveal Step" });

  await expect(nextButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await nextButton.click();
  await expectAdminRevealPhase(page, phase);
}

async function advanceToFinalReveal(page: Page) {
  await advanceRevealAndWaitForAdminPhase(page, "set 1 counts");
  await advanceRevealAndWaitForAdminPhase(page, "set 1 resolved");
  await page.waitForTimeout(6_000);
  await advanceRevealAndWaitForAdminPhase(page, "set 2 counts");
  await advanceRevealAndWaitForAdminPhase(page, "set 2 resolved");
  await page.waitForTimeout(6_000);
  await advanceRevealAndWaitForAdminPhase(page, "final");
}

test("100-player browser rehearsal submits, edits, and exports final CSV", async ({
  page,
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(360_000);

  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  const players = Array.from({ length: PLAYER_COUNT }, (_, index) => playerName(index));

  await loginAndTakeHost(page, baseURL);
  await page.getByPlaceholder("Bulk import start.gg usernames").fill(players.join("\n"));
  await page.getByRole("button", { name: "Bulk Import" }).click();
  await expect(page.getByRole("cell", { name: playerName(0) })).toBeVisible();
  await expect(page.getByRole("cell", { name: playerName(PLAYER_COUNT - 1) })).toBeVisible();

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
    await submitLoadChunk(request, baseURL, chunk);

    if ((index + chunk.length) % 25 === 0 || index + chunk.length === players.length) {
      await stagePage.reload({ waitUntil: "domcontentloaded" });
      await expect(
        stagePage.locator("header").getByText(/Voting open|Final 30 seconds/),
      ).toBeVisible();
    }
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(`${PLAYER_COUNT} / ${PLAYER_COUNT}`)).toBeVisible();

  await chartsSpectator.reload({ waitUntil: "domcontentloaded" });
  await expect(chartsSpectator.getByTestId("view-only-status")).toContainText(
    /Voting open|Final 30 seconds/,
  );

  await page.getByRole("button", { name: "Close Voting" }).click();
  await expect(page.getByText("voting closed")).toBeVisible();
  await page.getByRole("button", { name: "Compute Results" }).click();
  await expect(page.getByText("results computed")).toBeVisible();

  await advanceToFinalReveal(page);
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
});
