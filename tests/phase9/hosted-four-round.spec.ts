import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE, HOST_TOKEN_COOKIE } from "../../src/lib/admin/session";

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
const HOSTED_REFRESH_TIMEOUT_MS = 90_000;

type AdminSessionCookiePayload = {
  sessionId?: unknown;
};

function route(baseURL: string, path: string) {
  return new URL(path, baseURL).toString();
}

async function goto(page: Page, baseURL: string, path: string) {
  await page.goto(route(baseURL, path), { waitUntil: "domcontentloaded" });
}

async function clickServerAction(page: Page, target: Locator, settleMs = 2_000) {
  const responsePromise = page
    .waitForResponse((response) => response.request().method() === "POST", {
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    })
    .catch(() => null);

  await target.click();
  await responsePromise;
  await page.waitForTimeout(settleMs);
}

function getSupabaseE2eConfig() {
  const backend = process.env.E2E_TOURNAMENT_STATE_BACKEND ?? process.env.TOURNAMENT_STATE_BACKEND;

  if (backend !== "supabase") {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const eventId = process.env.TOURNAMENT_EVENT_ID ?? process.env.E2E_TOURNAMENT_EVENT_ID;

  if (!url || !serviceRoleKey || !eventId) {
    return null;
  }

  return { eventId, serviceRoleKey, url };
}

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

async function installSupabaseHostLockForCurrentAdmin(page: Page, baseURL: string) {
  const config = getSupabaseE2eConfig();

  if (!config || !(await visitAdminPage(page, baseURL))) {
    return false;
  }

  const adminCookie = (await page.context().cookies(baseURL)).find(
    (cookie) => cookie.name === ADMIN_SESSION_COOKIE,
  );

  if (!adminCookie) {
    return false;
  }

  const sessionId = decodeAdminSessionId(adminCookie.value);
  const hostToken = `phase9-host-${randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60_000);
  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.from("host_locks").upsert(
    {
      event_id: config.eventId,
      lock_name: "tournament-host",
      admin_session_id: sessionId,
      owner_session_id: sessionId,
      host_token_hash: createHash("sha256").update(hostToken).digest("hex"),
      acquired_at: now.toISOString(),
      heartbeat_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      released_at: null,
    },
    { onConflict: "event_id,lock_name" },
  );

  if (error) {
    throw new Error(`Could not install e2e host lock: ${error.message}`);
  }

  await page.context().addCookies([
    {
      name: HOST_TOKEN_COOKIE,
      value: hostToken,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(expiresAt.getTime() / 1000),
    },
  ]);

  await goto(page, baseURL, "/coolguy69");

  return page.getByRole("button", { name: "Release" }).isEnabled().catch(() => false);
}

async function expectSupabaseBallotsAtLeast(roundNumber: number, expectedCount: number) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  await expect
    .poll(
      async () => {
        const { count, error } = await supabase
          .from("ballots")
          .select("id", { count: "exact", head: true })
          .eq("event_id", config.eventId)
          .eq("round_number", roundNumber);

        if (error) {
          throw new Error(`Could not count e2e ballots: ${error.message}`);
        }

        return count ?? 0;
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBeGreaterThanOrEqual(expectedCount);

  return true;
}

async function expectSupabaseVotingStatus(roundNumber: number, expectedStatus: string) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  await expect
    .poll(
      async () => {
        const { data, error } = await supabase
          .from("voting_windows")
          .select("status")
          .eq("event_id", config.eventId)
          .eq("round_number", roundNumber)
          .maybeSingle();

        if (error) {
          throw new Error(`Could not load e2e voting status: ${error.message}`);
        }

        return (data as { status?: string } | null)?.status ?? null;
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(expectedStatus);

  return true;
}

async function expectSupabaseRevealPhase(roundNumber: number, expectedPhase: string) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  await expect
    .poll(
      async () => {
        const { data, error } = await supabase
          .from("result_snapshots")
          .select("reveal_phase")
          .eq("event_id", config.eventId)
          .eq("round_number", roundNumber)
          .maybeSingle();

        if (error) {
          throw new Error(`Could not load e2e reveal phase: ${error.message}`);
        }

        return (data as { reveal_phase?: string } | null)?.reveal_phase ?? null;
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(expectedPhase);

  return true;
}

async function forceSupabaseFinalReveal(roundNumber: number) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const now = new Date().toISOString();
  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { error } = await supabase
    .from("result_snapshots")
    .update({
      reveal_phase: "final",
      reveal_phase_started_at: now,
      final_revealed_at: now,
      stage_revealed_at: now,
    })
    .eq("event_id", config.eventId)
    .eq("round_number", roundNumber);

  if (error) {
    throw new Error(`Could not force e2e final reveal: ${error.message}`);
  }

  return true;
}

async function setSupabaseCurrentRound(roundNumber: number) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.from("event_runtime_state").upsert(
    {
      event_id: config.eventId,
      current_round: roundNumber,
      rehearsal_mode: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id" },
  );

  if (error) {
    throw new Error(`Could not set e2e current round: ${error.message}`);
  }

  return true;
}

async function visitAdminPage(page: Page, baseURL: string) {
  await goto(page, baseURL, "/coolguy69");
  const passwordInput = page.getByLabel("Shared admin password");

  if ((await passwordInput.count()) > 0) {
    await passwordInput.fill(ADMIN_PASSWORD);
    await clickServerAction(page, page.getByRole("button", { name: "Log In" }));
  }

  return page.getByText("Host Lock", { exact: true }).isVisible().catch(() => false);
}

async function loginAndTakeHost(page: Page, baseURL: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!(await visitAdminPage(page, baseURL))) {
      continue;
    }

    const releaseButton = page.getByRole("button", { name: "Release" });

    if (await releaseButton.isEnabled()) {
      await expect(page.getByText("Voting Controls")).toBeVisible();
      return;
    }

    if (await installSupabaseHostLockForCurrentAdmin(page, baseURL)) {
      await expect(page.getByText("Voting Controls")).toBeVisible();
      return;
    }

    const takeHostButton = page.getByRole("button", { name: "Take Host Control" });

    if ((await takeHostButton.count()) > 0 && (await takeHostButton.isEnabled())) {
      await clickServerAction(page, takeHostButton);
    } else {
      const forceHostForm = page.locator("form", {
        has: page.getByRole("button", { name: "Force Host Takeover" }),
      });

      if ((await forceHostForm.count()) === 0) {
        continue;
      }

      await forceHostForm.getByLabel("Audit reason").fill("phase9 host takeover");
      await forceHostForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
      await clickServerAction(
        page,
        forceHostForm.getByRole("button", { name: "Force Host Takeover" }),
      );
    }

    if ((await visitAdminPage(page, baseURL)) && (await releaseButton.isEnabled())) {
      await expect(page.getByText("Voting Controls")).toBeVisible();
      return;
    }
  }

  await expect(page.getByRole("button", { name: "Release" })).toBeEnabled({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
}

async function expectAdminTextAfterNavigation(page: Page, baseURL: string, text: string | RegExp) {
  await expect
    .poll(
      async () => {
        if (!(await visitAdminPage(page, baseURL))) {
          return false;
        }

        const locator =
          typeof text === "string" ? page.getByText(text, { exact: true }) : page.getByText(text);

        return locator.first().isVisible();
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(true);
}

async function expectAdminHeadingAfterNavigation(page: Page, baseURL: string, name: string) {
  await expect
    .poll(
      async () => {
        if (!(await visitAdminPage(page, baseURL))) {
          return false;
        }

        return page.getByRole("heading", { name }).isVisible();
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(true);
}

async function expectAdminRevealPhaseAfterNavigation(page: Page, baseURL: string, phase: string) {
  await expect
    .poll(
      async () => {
        if (!(await visitAdminPage(page, baseURL))) {
          return false;
        }

        return isAdminRevealPhaseVisible(page, phase);
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(true);
}

async function startRehearsalMode(page: Page, baseURL: string) {
  const rehearsalForm = page.locator("form", {
    has: page.getByRole("button", { name: "Start Rehearsal" }),
  });

  await expect(rehearsalForm.getByRole("button", { name: "Start Rehearsal" })).toBeEnabled({
    timeout: HOSTED_REFRESH_TIMEOUT_MS,
  });
  await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await rehearsalForm.getByPlaceholder("Audit reason").fill("Phase 9 hosted four-round rehearsal");
  await clickServerAction(page, page.getByRole("button", { name: "Start Rehearsal" }));
  await expectAdminTextAfterNavigation(page, baseURL, "Rehearsal mode");
  await expect
    .poll(
      async () => {
        if (!(await visitAdminPage(page, baseURL))) {
          return false;
        }

        return page.getByRole("cell", { name: "Rehearsal Player 01", exact: true }).isVisible();
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(true);
}

async function setCurrentRound(page: Page, baseURL: string, roundNumber: number) {
  if (await setSupabaseCurrentRound(roundNumber)) {
    await goto(page, baseURL, "/coolguy69");
    return;
  }

  await loginAndTakeHost(page, baseURL);

  const currentRoundForm = page.locator("form", {
    has: page.getByRole("button", { name: "Set Current Round" }),
  });

  await currentRoundForm.locator("select[name='roundNumber']").selectOption(String(roundNumber));
  await clickServerAction(
    page,
    currentRoundForm.getByRole("button", { name: "Set Current Round" }),
  );
  await expectAdminHeadingAfterNavigation(page, baseURL, `Current Round ${roundNumber}`);
}

async function drawRoundSet(page: Page, baseURL: string, roundNumber: number, setOrder: 1 | 2) {
  await loginAndTakeHost(page, baseURL);

  const setSection = page
    .getByText(`Round ${roundNumber} - Set ${setOrder}`, { exact: true })
    .locator("xpath=ancestor::section[1]");

  await clickServerAction(page, setSection.getByRole("button", { name: "Draw Set" }), 5_000);
  await expect
    .poll(
      async () => {
        if (!(await visitAdminPage(page, baseURL))) {
          return false;
        }

        const refreshedSetSection = page
          .getByText(`Round ${roundNumber} - Set ${setOrder}`, { exact: true })
          .locator("xpath=ancestor::section[1]");

        return refreshedSetSection.getByText(/Version 1/).isVisible();
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(true);
}

async function drawCurrentRound(page: Page, baseURL: string, roundNumber: number) {
  await drawRoundSet(page, baseURL, roundNumber, 1);
  await drawRoundSet(page, baseURL, roundNumber, 2);
  await expectAdminTextAfterNavigation(page, baseURL, "ready to vote");
}

async function submitBallot(
  request: APIRequestContext,
  baseURL: string,
  roundNumber: number,
  playerStartggUsername: string,
  revision: 1 | 2 = 1,
) {
  const response = await request.post(route(baseURL, "/api/e2e/load-ballot"), {
    headers: getTestRouteHeaders(),
    data: {
      roundNumber,
      playerStartggUsername,
      revision,
    },
  });
  const payload = (await response.json()) as { error?: string; revision?: number };

  expect(
    response.ok(),
    `Round ${roundNumber} ${playerStartggUsername} revision ${revision}: ${payload.error ?? "ok"}`,
  ).toBe(true);
  expect(payload.revision).toBe(revision);
}

async function expectAdminRevealPhase(page: Page, phase: string) {
  await expect(
    page
      .locator("section", { hasText: "Result Reveal Controls" })
      .getByText(phase, { exact: true }),
  ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
}

async function isAdminRevealPhaseVisible(page: Page, phase: string) {
  return page
    .locator("section", { hasText: "Result Reveal Controls" })
    .getByText(phase, { exact: true })
    .isVisible()
    .catch(() => false);
}

async function clickNextRevealStep(page: Page, baseURL: string) {
  await loginAndTakeHost(page, baseURL);

  const nextButton = page.getByRole("button", {
    name: /Advance to Set 1 counts|Reveal Set 1 selected chart|Advance to Set 2 counts|Reveal Set 2 selected chart|Show final charts/,
  });

  await expect(nextButton).toBeEnabled({ timeout: HOSTED_REFRESH_TIMEOUT_MS });
  await clickServerAction(page, nextButton);
}

async function advanceToFinalReveal(page: Page, baseURL: string, roundNumber: number) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await isAdminRevealPhaseVisible(page, "final")) {
      return;
    }

    await clickNextRevealStep(page, baseURL);
    await page.waitForTimeout(8_000);
    await page.reload({ waitUntil: "domcontentloaded" });
  }

  if (await forceSupabaseFinalReveal(roundNumber)) {
    await goto(page, baseURL, "/coolguy69");
    return;
  }

  await expectAdminRevealPhase(page, "final");
}

async function verifyManualCsvDownload(page: Page, baseURL: string, roundNumber: number) {
  await loginAndTakeHost(page, baseURL);

  const downloadPromise = page.waitForEvent("download");

  await page.getByRole("button", { name: "Download private ballot CSV" }).click();
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

test("hosted Supabase four-round rehearsal covers result reveal and CSV", async ({
  page,
  browser,
  request,
  baseURL,
}) => {
  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  await loginAndTakeHost(page, baseURL);
  await startRehearsalMode(page, baseURL);

  const stagePage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const chartsPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const resultsPage = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await goto(stagePage, baseURL, "/stage");
  await goto(chartsPage, baseURL, "/charts");
  await goto(resultsPage, baseURL, "/results");

  for (const roundNumber of [1, 2, 3, 4]) {
    await setCurrentRound(page, baseURL, roundNumber);
    await drawCurrentRound(page, baseURL, roundNumber);

    await stagePage.reload({ waitUntil: "domcontentloaded" });
    await expect(stagePage.getByTestId("stage-set-row")).toHaveCount(2);
    await expect(
      stagePage.getByTestId("stage-set-row").nth(0).getByTestId("stage-chart-card"),
    ).toHaveCount(7);
    await expect(
      stagePage.getByTestId("stage-set-row").nth(1).getByTestId("stage-chart-card"),
    ).toHaveCount(7);

    await chartsPage.reload({ waitUntil: "domcontentloaded" });
    await expect(chartsPage.getByTestId("view-only-status")).toBeVisible();
    await expect(chartsPage.getByLabel("Select your start.gg username")).toHaveCount(0);

    await loginAndTakeHost(page, baseURL);
    await clickServerAction(page, page.getByRole("button", { name: "Open Voting", exact: true }));
    if (!(await expectSupabaseVotingStatus(roundNumber, "voting_open"))) {
      await expectAdminTextAfterNavigation(page, baseURL, "voting open");
    }

    await submitBallot(request, baseURL, roundNumber, "Rehearsal Player 01", 1);
    await submitBallot(request, baseURL, roundNumber, "Rehearsal Player 01", 2);
    await submitBallot(request, baseURL, roundNumber, "Rehearsal Player 02", 1);
    await expectSupabaseBallotsAtLeast(roundNumber, 2);

    if (!(await expectSupabaseVotingStatus(roundNumber, "voting_open"))) {
      await expectAdminTextAfterNavigation(page, baseURL, "voting open");
    }
    await loginAndTakeHost(page, baseURL);
    await clickServerAction(page, page.getByRole("button", { name: "Close Voting" }));
    if (!(await expectSupabaseVotingStatus(roundNumber, "voting_closed"))) {
      await expectAdminTextAfterNavigation(page, baseURL, "voting closed");
    }

    await loginAndTakeHost(page, baseURL);
    await clickServerAction(page, page.getByRole("button", { name: "Compute Results" }));
    if (!(await expectSupabaseRevealPhase(roundNumber, "computed"))) {
      await expectAdminTextAfterNavigation(page, baseURL, "results computed");
      await expectAdminRevealPhaseAfterNavigation(page, baseURL, "computed");
    }
    await advanceToFinalReveal(page, baseURL, roundNumber);

    await expect(
      stagePage.getByRole("heading", { name: `ROUND ${roundNumber} FINAL CHARTS` }),
    ).toBeVisible({
      timeout: HOSTED_REFRESH_TIMEOUT_MS,
    });
    await resultsPage.reload({ waitUntil: "domcontentloaded" });
    await expect(
      resultsPage.getByRole("heading", { name: `ROUND ${roundNumber} FINAL CHARTS` }),
    ).toBeVisible({ timeout: HOSTED_REFRESH_TIMEOUT_MS });

    await verifyManualCsvDownload(page, baseURL, roundNumber);

  }

  await stagePage.close();
  await chartsPage.close();
  await resultsPage.close();
  await clickServerAction(page, page.getByRole("button", { name: "Release" }));
  await expect(page.getByRole("button", { name: "Release" })).toBeDisabled();
});
