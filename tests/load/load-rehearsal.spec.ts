import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { writeJsonEvidence } from "../e2e/evidence-artifacts";
import {
  expectPrivateCsvExport,
  expectPrivateCsvFinalContent,
} from "../phase9/fixtures/private-csv";

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
function positiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const PLAYER_COUNT = positiveIntegerEnv("E2E_LOAD_PLAYER_COUNT", 100);
const ROUTE_PLAYER_COUNT = positiveIntegerEnv("E2E_LOAD_ROUTE_PLAYER_COUNT", 12);
const ROUTE_PLAYER_CONCURRENCY = Math.min(
  positiveIntegerEnv("E2E_LOAD_ROUTE_PLAYER_CONCURRENCY", 2),
  ROUTE_PLAYER_COUNT,
);
const SPECTATOR_COUNT = positiveIntegerEnv("E2E_LOAD_SPECTATOR_COUNT", 12);
const LOAD_CONCURRENCY = positiveIntegerEnv("E2E_LOAD_CONCURRENCY", 5);
const LOAD_CHUNK_DELAY_MS = Number(process.env.E2E_LOAD_CHUNK_DELAY_MS ?? 750);
const EDIT_EVERY_N_PLAYERS = 5;
const HOSTED_REFRESH_TIMEOUT_MS = 90_000;
const SPECTATOR_PATHS = ["/room", "/charts", "/results"] as const;

function playerName(index: number) {
  return `Load Player ${String(index + 1).padStart(3, "0")}`;
}

function route(baseURL: string, path: string) {
  return new URL(path, baseURL).toString();
}

async function clickAdminActionAndWait(page: Page, target: Locator) {
  const responsePromise = page
    .waitForResponse(
      (response) => {
        const url = new URL(response.url());

        return url.pathname === "/coolguy69" && response.request().method() === "POST";
      },
      { timeout: 60_000 },
    )
    .catch(() => null);

  await target.click();
  const response = await responsePromise;

  if (response && response.status() >= 400) {
    throw new Error(`Admin action returned HTTP ${response.status()}.`);
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

  const actionError = new URL(page.url()).searchParams.get("error");

  if (actionError) {
    throw new Error(actionError);
  }
}

async function goto(page: Page, baseURL: string, path: string) {
  const targetUrl = route(baseURL, path);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      lastError = error;

      if (
        !(error instanceof Error) ||
        !error.message.includes("interrupted by another navigation")
      ) {
        throw error;
      }

      await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);

      if (new URL(page.url()).pathname === path) {
        return;
      }

      await page.waitForTimeout(250);
    }
  }

  throw lastError;
}

async function submitAdminFormAndWait(page: Page, form: Locator) {
  const responsePromise = page
    .waitForResponse(
      (response) => {
        const url = new URL(response.url());

        return url.pathname === "/coolguy69" && response.request().method() === "POST";
      },
      { timeout: 60_000 },
    )
    .catch(() => null);

  await form.evaluate((element) => {
    (element as HTMLFormElement).requestSubmit();
  });
  const response = await responsePromise;

  if (response && response.status() >= 400) {
    throw new Error(`Admin action returned HTTP ${response.status()}.`);
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);

  const actionError = new URL(page.url()).searchParams.get("error");

  if (actionError) {
    throw new Error(actionError);
  }
}

async function releaseButtonIsEnabled(page: Page) {
  const releaseButton = page.getByRole("button", { name: "Release" });

  if ((await releaseButton.count()) === 0) {
    return false;
  }

  return releaseButton.isEnabled().catch(() => false);
}

async function waitForActiveHost(page: Page, timeout = HOSTED_REFRESH_TIMEOUT_MS) {
  try {
    await expect
      .poll(async () => releaseButtonIsEnabled(page), {
        intervals: [250, 500, 1_000],
        timeout,
      })
      .toBe(true);
    await expect(page.getByText("Voting Controls")).toBeVisible();
    return true;
  } catch {
    return false;
  }
}

async function loginAndTakeHost(page: Page, baseURL: string) {
  await goto(page, baseURL, "/coolguy69");
  const passwordInput = page.getByLabel("Shared admin password");

  if ((await passwordInput.count()) > 0) {
    await passwordInput.fill(ADMIN_PASSWORD);
    await clickAdminActionAndWait(page, page.getByRole("button", { name: "Log In" }));
  }

  await expect(page.getByRole("heading", { name: "coolguy69" })).toBeVisible();

  if (await waitForActiveHost(page, 1_000)) {
    return;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const takeHostButton = page.getByRole("button", { name: "Take Host Control" });

    if ((await takeHostButton.count()) > 0 && (await takeHostButton.isEnabled())) {
      await clickAdminActionAndWait(page, takeHostButton);
    } else {
      const forceHostButton = page.getByRole("button", { name: "Force Host Takeover" });
      const forceHostForm = page.locator("form", {
        has: forceHostButton,
      });

      await expect(forceHostButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
      await forceHostForm.getByLabel("Audit reason").fill("load e2e host takeover");
      await forceHostForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
      await clickAdminActionAndWait(page, forceHostButton);
    }

    if (await waitForActiveHost(page, 8_000)) {
      return;
    }

    await goto(page, baseURL, "/coolguy69");
  }

  await expect(page.getByRole("button", { name: "Release" })).toBeEnabled({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

function drawSetForm(page: Page, setIndex: number) {
  return page
    .locator("form", {
      has: page.getByRole("button", { name: "Draw Set" }),
    })
    .nth(setIndex);
}

async function drawRoundAndOpenVoting(page: Page, baseURL: string) {
  await expect(drawSetForm(page, 0).getByRole("button", { name: "Draw Set" })).toBeEnabled({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await submitAdminFormAndWait(page, drawSetForm(page, 0));
  await expect(page.getByText(/Version 1/).first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });

  await expect(drawSetForm(page, 1).getByRole("button", { name: "Draw Set" })).toBeEnabled({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await submitAdminFormAndWait(page, drawSetForm(page, 1));
  await expect(page.getByText("ready to vote")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });

  await loginAndTakeHost(page, baseURL);
  const openVotingButton = page.getByRole("button", { name: "Open Voting", exact: true });

  await expect(openVotingButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await openVotingButton.click();
  await expect(page.getByText("voting open")).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function submitAndEditBallot(
  request: APIRequestContext,
  baseURL: string,
  startggUsername: string,
  shouldEdit: boolean,
  eligibleCount: number,
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
    const payload = (await response.json()) as {
      eligibleCount?: number;
      error?: string;
      playerStartggUsername?: string;
      revision?: number;
      status?: string;
      submittedCount?: number;
    };

    expect(response.ok(), `${startggUsername} revision ${revision}: ${payload.error ?? "ok"}`).toBe(
      true,
    );
    expect(payload.playerStartggUsername).toBe(startggUsername);
    expect(payload.revision).toBe(revision);
    expect(payload.eligibleCount).toBe(eligibleCount);
    expect(payload.submittedCount).toBeGreaterThanOrEqual(1);
    expect(["voting_open", "final_30_seconds", "extension_1_minute"]).toContain(payload.status);
  }
}

async function submitLoadChunk(
  request: APIRequestContext,
  baseURL: string,
  players: string[],
  startingIndex: number,
  eligibleCount: number,
) {
  await Promise.all(
    players.map((player, index) =>
      submitAndEditBallot(
        request,
        baseURL,
        player,
        (startingIndex + index + 1) % EDIT_EVERY_N_PLAYERS === 0,
        eligibleCount,
      ),
    ),
  );
}

async function submitNoBanVoteThroughPlayerRoute(
  browser: Browser,
  baseURL: string,
  startggUsername: string,
) {
  const routePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const startedAt = Date.now();

  try {
    await goto(routePage, baseURL, "/room");
    await routePage.getByRole("link", { name: "I am a player voting" }).click();
    await expect(routePage).toHaveURL(/\/vote/);
    await routePage.getByLabel("Select your start.gg username").selectOption({
      label: startggUsername,
    });
    await expect(
      routePage.getByText(`Are you sure you are voting as ${startggUsername}?`),
    ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
    const confirmButton = routePage.getByRole("button", { name: "Confirm" });

    await expect(confirmButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
    await confirmButton.click();
    await expect(routePage.getByTestId("ballot-chart-card")).toHaveCount(7, {
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await routePage.getByLabel("No bans for this set").check();
    await routePage.getByRole("button", { name: "Next", exact: true }).click();
    await expect(routePage.getByTestId("ballot-chart-card")).toHaveCount(7, {
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await routePage.getByLabel("No bans for this set").check();
    await routePage.getByRole("button", { name: "Review" }).click();
    await routePage.getByRole("button", { name: "Submit Ballot" }).click();
    await expect(routePage.getByText("Ballot successfully submitted.")).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });

    return {
      durationMs: Date.now() - startedAt,
      playerStartggUsername: startggUsername,
      route: "/room -> /vote",
      submitted: true,
    };
  } finally {
    await routePage.close().catch(() => undefined);
  }
}

async function submitPlayerRouteBallots(browser: Browser, baseURL: string, players: string[]) {
  const results: Array<Awaited<ReturnType<typeof submitNoBanVoteThroughPlayerRoute>>> = [];

  for (let index = 0; index < players.length; index += ROUTE_PLAYER_CONCURRENCY) {
    const chunk = players.slice(index, index + ROUTE_PLAYER_CONCURRENCY);

    results.push(
      ...(await Promise.all(
        chunk.map((player) => submitNoBanVoteThroughPlayerRoute(browser, baseURL, player)),
      )),
    );
  }

  return results;
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

        return page
          .getByText(text, typeof text === "string" ? { exact: true } : undefined)
          .first()
          .isVisible();
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(true);
}

async function expectActivePlayerCount(page: Page, count: number) {
  await expect(page.getByText(`Active ${count}`, { exact: true }).first()).toBeVisible({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function openSpectatorTraffic(browser: Browser, baseURL: string) {
  const spectators = await Promise.all(
    Array.from({ length: SPECTATOR_COUNT }, async (_, index) => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const path = SPECTATOR_PATHS[index % SPECTATOR_PATHS.length] ?? "/charts";

      await goto(page, baseURL, path);

      return { page, path };
    }),
  );

  const roomSpectator = spectators.find((spectator) => spectator.path === "/room")?.page;
  const chartsSpectator = spectators.find((spectator) => spectator.path === "/charts")?.page;
  const resultsSpectator = spectators.find((spectator) => spectator.path === "/results")?.page;

  if (!roomSpectator || !chartsSpectator || !resultsSpectator) {
    throw new Error("Load rehearsal requires room, charts, and results spectator pages.");
  }

  await expect(roomSpectator.getByRole("link", { name: "View charts only" })).toBeVisible();
  await roomSpectator.getByRole("link", { name: "View charts only" }).click();
  await expect(roomSpectator).toHaveURL(/\/charts/);
  await expect(roomSpectator.getByTestId("view-only-status")).toContainText("Voting open");
  await expect(roomSpectator.getByLabel("Select your start.gg username")).toHaveCount(0);
  await expect(roomSpectator.getByRole("button", { name: "Submit Ballot" })).toHaveCount(0);
  await expect(chartsSpectator.getByTestId("view-only-status")).toContainText("Voting open");
  await expect(resultsSpectator.getByRole("heading", { name: "Round 1 Results" })).toBeVisible();

  return { chartsSpectator, pages: spectators.map((spectator) => spectator.page) };
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

async function setupLoadRound(page: Page, baseURL: string, players: string[]) {
  await loginAndTakeHost(page, baseURL);
  const bulkImportForm = page.locator("form", {
    has: page.getByPlaceholder("Bulk import start.gg usernames"),
  });

  await bulkImportForm.getByPlaceholder("Bulk import start.gg usernames").fill(players.join("\n"));
  await submitAdminFormAndWait(page, bulkImportForm);
  await expectActivePlayerCount(page, players.length);

  await loginAndTakeHost(page, baseURL);
  await drawRoundAndOpenVoting(page, baseURL);
}

async function closeVotingComputeAndReveal(page: Page, baseURL: string, stagePage: Page) {
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
}

function expectedApiRevision(playerIndex: number) {
  return (playerIndex + 1) % EDIT_EVERY_N_PLAYERS === 0 ? 2 : 1;
}

test("100-player API-injection load keeps public routes active and exports final CSV @api-injection", async ({
  page,
  browser,
  request,
  baseURL,
}, testInfo) => {
  test.setTimeout(600_000);
  test.info().annotations.push(
    {
      type: "PFR-005",
      description:
        "100 eligible players submit through the test-only load-ballot API while public routes stay active.",
    },
    {
      type: "PFR-030",
      description:
        "API-injection load evidence is labeled separately from normal player-route evidence.",
    },
  );

  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  const players = Array.from({ length: PLAYER_COUNT }, (_, index) => playerName(index));
  await setupLoadRound(page, baseURL, players);

  const stagePage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  let spectatorTraffic: Awaited<ReturnType<typeof openSpectatorTraffic>> | null = null;

  try {
    await goto(stagePage, baseURL, "/stage");
    await expect(stagePage.locator("header").getByText("Voting open")).toBeVisible();
    spectatorTraffic = await openSpectatorTraffic(browser, baseURL);

    for (let index = 0; index < players.length; index += LOAD_CONCURRENCY) {
      const chunk = players.slice(index, index + LOAD_CONCURRENCY);
      const submittedCount = index + chunk.length;

      await submitLoadChunk(request, baseURL, chunk, index, PLAYER_COUNT);

      if (submittedCount % 10 === 0 || submittedCount === players.length) {
        await stagePage.reload({ waitUntil: "domcontentloaded" });
        await expect(
          stagePage.locator("header").getByText(/Voting open|Final 30 seconds|Voting closed/),
        ).toBeVisible();
      }

      if (submittedCount < players.length) {
        await page.waitForTimeout(LOAD_CHUNK_DELAY_MS);
      }
    }

    await loginAndTakeHost(page, baseURL);
    await expect(page.getByText(`${PLAYER_COUNT} / ${PLAYER_COUNT}`)).toBeVisible();

    await spectatorTraffic.chartsSpectator.reload({ waitUntil: "domcontentloaded" });
    await expect(spectatorTraffic.chartsSpectator.getByTestId("view-only-status")).toContainText(
      /Voting open|Final 30 seconds|Results being revealed/,
    );

    await closeVotingComputeAndReveal(page, baseURL, stagePage);

    const expectedRevisionByPlayer = new Map<string, number>([
      [playerName(0), expectedApiRevision(0)],
      [playerName(PLAYER_COUNT - 1), expectedApiRevision(PLAYER_COUNT - 1)],
    ]);
    const csv = await expectPrivateCsvExport({
      baseURL,
      expectedRows: PLAYER_COUNT,
      expectedRevisionByPlayer,
      expectedSubmittedRows: PLAYER_COUNT,
      request,
      requiredPlayers: [playerName(0), playerName(PLAYER_COUNT - 1)],
      roundNumber: 1,
    });
    const csvSummary = expectPrivateCsvFinalContent(csv, {
      expectedRevisionByPlayer,
      expectedRows: PLAYER_COUNT,
      expectedSubmittedRows: PLAYER_COUNT,
      requiredPlayers: [playerName(0), playerName(PLAYER_COUNT - 1)],
      roundNumber: 1,
    });
    const exportedPlayers = csv.match(/Load Player \d{3}/g) ?? [];

    expect(new Set(exportedPlayers).size).toBe(PLAYER_COUNT);
    expect(csv).toContain("manual_override");
    expect(csv).toContain("selected_set_1_chart");
    expect(csv).toContain("selected_set_2_chart");
    await writeJsonEvidence(testInfo, "pfr-100-player-api-injection-load-evidence.json", {
      apiInjectionPlayerCount: PLAYER_COUNT,
      backend: process.env.E2E_TOURNAMENT_STATE_BACKEND ?? process.env.TOURNAMENT_STATE_BACKEND,
      csvBytes: Buffer.byteLength(csv, "utf8"),
      csvFilename: "round-1-private-ballots.csv",
      csvSummary,
      generatedAt: new Date().toISOString(),
      privateCsvExport: "test-route:/api/e2e/private-csv",
      playerCount: PLAYER_COUNT,
      profile: "api-injection",
      routePlayerCount: 0,
      routePlayerStartPath: null,
      routePlayerSubmitPath: null,
      routeSubmissions: [],
      serverMode: process.env.E2E_SERVER_MODE,
      spectatorCount: SPECTATOR_COUNT,
      spectatorPaths: SPECTATOR_PATHS,
      submissionProfile: "api-injection",
      apiInjectionEndpoint: "/api/e2e/load-ballot",
      testRoutesEnabled: process.env.TOURNAMENT_TEST_ALLOW_E2E_ROUTES,
    });
  } finally {
    await stagePage.close().catch(() => undefined);
    await Promise.all(
      (spectatorTraffic?.pages ?? []).map((spectatorPage) => spectatorPage.close()),
    );
    await page
      .getByRole("button", { name: "Release" })
      .click()
      .catch(() => undefined);
  }
});

test("route-player load uses room-to-vote submissions with spectator traffic @player-route", async ({
  page,
  browser,
  request,
  baseURL,
}, testInfo) => {
  test.setTimeout(600_000);
  test.info().annotations.push(
    {
      type: "PFR-014",
      description:
        "Normal player-route load evidence uses /room -> /vote submissions instead of the test-only load-ballot API.",
    },
    {
      type: "PFR-030",
      description:
        "Spectator and view-only routes stay active while route-player ballots are submitted.",
    },
  );

  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  const players = Array.from({ length: ROUTE_PLAYER_COUNT }, (_, index) => playerName(index));
  await setupLoadRound(page, baseURL, players);

  const stagePage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  let spectatorTraffic: Awaited<ReturnType<typeof openSpectatorTraffic>> | null = null;

  try {
    await goto(stagePage, baseURL, "/stage");
    await expect(stagePage.locator("header").getByText("Voting open")).toBeVisible();
    spectatorTraffic = await openSpectatorTraffic(browser, baseURL);

    const routeSubmissionResults = await submitPlayerRouteBallots(browser, baseURL, players);

    await loginAndTakeHost(page, baseURL);
    await expect(page.getByText(`${ROUTE_PLAYER_COUNT} / ${ROUTE_PLAYER_COUNT}`)).toBeVisible();

    await spectatorTraffic.chartsSpectator.reload({ waitUntil: "domcontentloaded" });
    await expect(spectatorTraffic.chartsSpectator.getByTestId("view-only-status")).toContainText(
      /Voting open|Final 30 seconds|Results being revealed/,
    );

    await closeVotingComputeAndReveal(page, baseURL, stagePage);

    const expectedRevisionByPlayer = new Map<string, number>([
      [playerName(0), 1],
      [playerName(ROUTE_PLAYER_COUNT - 1), 1],
    ]);
    const csv = await expectPrivateCsvExport({
      baseURL,
      expectedRows: ROUTE_PLAYER_COUNT,
      expectedRevisionByPlayer,
      expectedSubmittedRows: ROUTE_PLAYER_COUNT,
      request,
      requiredPlayers: [playerName(0), playerName(ROUTE_PLAYER_COUNT - 1)],
      roundNumber: 1,
    });
    const csvSummary = expectPrivateCsvFinalContent(csv, {
      expectedRevisionByPlayer,
      expectedRows: ROUTE_PLAYER_COUNT,
      expectedSubmittedRows: ROUTE_PLAYER_COUNT,
      requiredPlayers: [playerName(0), playerName(ROUTE_PLAYER_COUNT - 1)],
      roundNumber: 1,
    });
    const exportedPlayers = csv.match(/Load Player \d{3}/g) ?? [];

    expect(new Set(exportedPlayers).size).toBe(ROUTE_PLAYER_COUNT);
    expect(routeSubmissionResults).toHaveLength(ROUTE_PLAYER_COUNT);
    expect(routeSubmissionResults.every((result) => result.route === "/room -> /vote")).toBe(true);
    await writeJsonEvidence(testInfo, "pfr-route-player-load-evidence.json", {
      apiInjectionPlayerCount: 0,
      backend: process.env.E2E_TOURNAMENT_STATE_BACKEND ?? process.env.TOURNAMENT_STATE_BACKEND,
      csvBytes: Buffer.byteLength(csv, "utf8"),
      csvFilename: "round-1-private-ballots.csv",
      csvSummary,
      generatedAt: new Date().toISOString(),
      privateCsvExport: "test-route:/api/e2e/private-csv",
      playerCount: ROUTE_PLAYER_COUNT,
      profile: "player-route",
      routePlayerConcurrency: ROUTE_PLAYER_CONCURRENCY,
      routePlayerCount: ROUTE_PLAYER_COUNT,
      routePlayerStartPath: "/room",
      routePlayerSubmitPath: "/vote",
      routeSubmissions: routeSubmissionResults,
      serverMode: process.env.E2E_SERVER_MODE,
      spectatorCount: SPECTATOR_COUNT,
      spectatorPaths: SPECTATOR_PATHS,
      submissionProfile: "player-route",
      apiInjectionEndpoint: null,
      testRoutesEnabled: process.env.TOURNAMENT_TEST_ALLOW_E2E_ROUTES,
    });
  } finally {
    await stagePage.close().catch(() => undefined);
    await Promise.all(
      (spectatorTraffic?.pages ?? []).map((spectatorPage) => spectatorPage.close()),
    );
    await page
      .getByRole("button", { name: "Release" })
      .click()
      .catch(() => undefined);
  }
});
