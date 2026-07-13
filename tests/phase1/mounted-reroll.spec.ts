import { expect, test, type BrowserContext, type Page, type Response } from "@playwright/test";
import {
  clickAdminActionAndWait,
  getAdminPassword,
  goto,
  loginAndTakeHost,
  openRehearsalControls,
} from "../e2e/admin-helpers";

const ADMIN_PASSWORD = getAdminPassword();
const BALLOT_DRAFT_STORAGE_KEY = "bite-open-card-draw:ballot-drafts:v1";
const IDENTITY_STORAGE_KEY = "bite-open-card-draw:startgg-identity:v1";

type PublicErrorMonitor = {
  errors: string[];
  pendingRscChecks: Set<Promise<void>>;
};

function hostRunButton(page: Page, name: string | RegExp) {
  return page.getByTestId("admin-host-run-controls").getByRole("button", { name });
}

async function confirmIdentity(page: Page, playerName: string) {
  await page.getByLabel("Select your start.gg username").selectOption({ label: playerName });
  await page.getByLabel(`I confirm that I am ${playerName}`).check();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByTestId("ballot-chart-card")).toHaveCount(7, { timeout: 10_000 });
}

function requestLabel(url: string) {
  try {
    const parsed = new URL(url);

    return `${parsed.pathname}${parsed.searchParams.has("_rsc") ? "?_rsc" : ""}`;
  } catch {
    return "unknown request";
  }
}

async function inspectRscResponse(response: Response, errors: string[]) {
  const contentType = response.headers()["content-type"] ?? "";
  const isRsc = response.url().includes("_rsc=") || contentType.includes("text/x-component");

  if (!isRsc) {
    return;
  }

  if (!response.ok()) {
    errors.push(`RSC ${response.status()} ${requestLabel(response.url())}`);
    return;
  }

  const body = await response.text();

  if (/[A-Za-z0-9]+:E\{[^\n]*"digest"/.test(body)) {
    errors.push(`RSC error frame ${requestLabel(response.url())}`);
  }
}

function monitorPublicErrors(page: Page, monitor: PublicErrorMonitor) {
  page.on("pageerror", (error) => monitor.errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      monitor.errors.push(`console: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "unknown failure";

    if (errorText.includes("ERR_ABORTED") || errorText.includes("NS_BINDING_ABORTED")) {
      return;
    }

    monitor.errors.push(`requestfailed: ${errorText} ${requestLabel(request.url())}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      monitor.errors.push(`${response.status()} ${requestLabel(response.url())}`);
    }

    const pending = inspectRscResponse(response, monitor.errors)
      .catch(() => undefined)
      .finally(() => monitor.pendingRscChecks.delete(pending));

    monitor.pendingRscChecks.add(pending);
  });
}

async function flushPublicErrorMonitor(monitor: PublicErrorMonitor) {
  await Promise.allSettled([...monitor.pendingRscChecks]);
}

async function expectNoNextErrorOverlay(page: Page) {
  await expect(
    page.locator(
      [
        "[data-nextjs-dialog-overlay]",
        "[data-nextjs-error-overlay]",
        'nextjs-portal [role="dialog"]',
      ].join(","),
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Application error: a client-side exception|Unhandled Runtime Error/i),
  ).toHaveCount(0);
}

async function expectStoredIdentity(page: Page, playerName: string, locked: boolean) {
  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const stored = window.localStorage.getItem(storageKey);

        return stored ? (JSON.parse(stored) as unknown) : null;
      }, IDENTITY_STORAGE_KEY),
    )
    .toMatchObject({ locked, startggUsername: playerName });
}

async function storedDraftContains(page: Page, value: string) {
  return page.evaluate(
    ({ storageKey, expectedValue }) =>
      window.localStorage.getItem(storageKey)?.includes(expectedValue) ?? false,
    { storageKey: BALLOT_DRAFT_STORAGE_KEY, expectedValue: value },
  );
}

async function releaseHostIfHeld(page: Page) {
  if (page.isClosed()) {
    return;
  }

  const releaseButton = hostRunButton(page, "Release");

  if ((await releaseButton.count()) > 0 && (await releaseButton.isEnabled().catch(() => false))) {
    await clickAdminActionAndWait(page, releaseButton);
  }
}

test("@phase1 mounted desktop and phone ballots replace a post-vote reroll without losing identity", async ({
  browser,
  page: adminPage,
}, testInfo) => {
  const monitor: PublicErrorMonitor = { errors: [], pendingRscChecks: new Set() };
  let desktopPage: Page | null = null;
  let phoneContext: BrowserContext | null = null;
  let phonePage: Page | null = null;

  try {
    await loginAndTakeHost(adminPage);
    await openRehearsalControls(adminPage);

    const rehearsalForm = adminPage
      .getByTestId("admin-rehearsal-controls")
      .locator("form", { has: adminPage.getByRole("button", { name: "Start Rehearsal" }) })
      .first();

    await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
    await rehearsalForm.getByPlaceholder("Audit reason").fill("Phase 1 mounted reroll evidence");
    await clickAdminActionAndWait(
      adminPage,
      rehearsalForm.getByRole("button", { name: "Start Rehearsal" }),
    );
    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(0));
    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(1));
    await clickAdminActionAndWait(
      adminPage,
      adminPage
        .getByTestId("admin-host-run-controls")
        .getByRole("button", { name: "Open Voting", exact: true }),
    );

    const baseURL = String(testInfo.project.use.baseURL);
    desktopPage = await adminPage.context().newPage();
    phoneContext = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
    });
    phonePage = await phoneContext.newPage();

    monitorPublicErrors(desktopPage, monitor);
    monitorPublicErrors(phonePage, monitor);
    await goto(desktopPage, "/vote");
    await goto(phonePage, "/vote");
    await confirmIdentity(desktopPage, "Rehearsal Player 01");
    await confirmIdentity(phonePage, "Rehearsal Player 02");

    const desktopGuard = desktopPage.getByTestId("vote-route-freshness-guard");
    const initialGeneration = Number(
      await desktopGuard.getAttribute("data-accepted-public-state-generation"),
    );
    const oldChartId = await phonePage
      .getByTestId("ballot-chart-card")
      .first()
      .getAttribute("data-chart-id");

    if (!oldChartId) {
      throw new Error("The mounted phone ballot did not expose its first chart id.");
    }

    await phonePage.getByTestId("ballot-chart-card").first().click();
    await desktopPage.getByTestId("ballot-chart-card").first().click();
    await expect(phonePage.getByTestId("ballot-chart-card").first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(desktopPage.getByTestId("ballot-chart-card").first()).toHaveAttribute(
      "data-chart-id",
      oldChartId,
    );
    await expect
      .poll(() => storedDraftContains(phonePage!, oldChartId), { timeout: 10_000 })
      .toBe(true);

    await desktopPage.getByRole("button", { name: "Next", exact: true }).click();
    await desktopPage.getByLabel("No bans for this set").check();
    await desktopPage.getByRole("button", { name: "Review" }).click();
    await desktopPage.getByRole("button", { name: "Submit Ballot" }).click();
    await expect(desktopPage.getByText("Ballot successfully submitted.")).toBeVisible();
    await expect(desktopPage.getByTestId("saved-ban-chart-card")).toHaveCount(1);
    await expectStoredIdentity(desktopPage, "Rehearsal Player 01", true);
    await expectStoredIdentity(phonePage, "Rehearsal Player 02", false);

    const rerollForm = adminPage
      .locator(`form:has(input[name="chartId"][value="${oldChartId}"])`)
      .first();
    const rerollPanel = rerollForm.locator("xpath=ancestor::details[1]");

    await rerollPanel.locator("summary").click();
    await rerollForm.getByLabel("Audit reason").fill("Phase 1 post-vote chart reroll");
    await rerollForm.getByLabel("Admin password").fill(ADMIN_PASSWORD);
    await clickAdminActionAndWait(
      adminPage,
      rerollForm.getByRole("button", { name: "Confirm Chart Reroll" }),
    );
    await expect(
      adminPage.getByTestId("admin-host-run-controls").getByText("Ready to vote", { exact: true }),
    ).toBeVisible();
    await clickAdminActionAndWait(
      adminPage,
      adminPage
        .getByTestId("admin-host-run-controls")
        .getByRole("button", { name: "Open Voting", exact: true }),
    );

    await expect(phonePage.getByText("Voting as Rehearsal Player 02")).toBeVisible({
      timeout: 30_000,
    });
    await expect(phonePage.getByTestId("ballot-chart-card")).toHaveCount(7, {
      timeout: 30_000,
    });
    await expect(phonePage.locator(`[data-chart-id="${oldChartId}"]`)).toHaveCount(0);
    await expect(
      phonePage.locator('[data-testid="ballot-chart-card"][aria-pressed="true"]'),
    ).toHaveCount(0);

    await expect(desktopPage.getByText("Ballot successfully submitted.")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(desktopPage.getByText("0 ban selection(s)")).toBeVisible({ timeout: 30_000 });
    await desktopPage
      .getByRole("button", { name: /^Edit / })
      .first()
      .click();
    await expect(desktopPage.getByTestId("ballot-chart-card")).toHaveCount(7, {
      timeout: 30_000,
    });
    await expect(desktopPage.locator(`[data-chart-id="${oldChartId}"]`)).toHaveCount(0);
    await expect(
      desktopPage.locator('[data-testid="ballot-chart-card"][aria-pressed="true"]'),
    ).toHaveCount(0);

    await expectStoredIdentity(desktopPage, "Rehearsal Player 01", true);
    await expectStoredIdentity(phonePage, "Rehearsal Player 02", false);
    await expect
      .poll(() => storedDraftContains(desktopPage!, oldChartId), { timeout: 30_000 })
      .toBe(false);
    await expect
      .poll(() => storedDraftContains(phonePage!, oldChartId), { timeout: 30_000 })
      .toBe(false);
    await expect
      .poll(
        async () =>
          Number(await desktopGuard.getAttribute("data-accepted-public-state-generation")),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(initialGeneration);

    await expectNoNextErrorOverlay(desktopPage);
    await expectNoNextErrorOverlay(phonePage);
    await flushPublicErrorMonitor(monitor);
    expect(monitor.errors).toEqual([]);
  } finally {
    await releaseHostIfHeld(adminPage);
    await phoneContext?.close();

    if (desktopPage && !desktopPage.isClosed()) {
      await desktopPage.close();
    }
  }
});
