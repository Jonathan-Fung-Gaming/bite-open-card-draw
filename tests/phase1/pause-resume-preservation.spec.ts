import { expect, test, type BrowserContext, type Page, type Response } from "@playwright/test";
import {
  clickAdminActionAndWait,
  getAdminPassword,
  goto,
  loginAndTakeHost,
  openRehearsalControls,
} from "../e2e/admin-helpers";

const ADMIN_PASSWORD = getAdminPassword();
const IDENTITY_STORAGE_KEY = "bite-open-card-draw:startgg-identity:v1";
const REROLL_COPY =
  /chart draw changed|chart sets changed|previous ballot was invalidated|submit a new ballot/i;

type PublicErrorMonitor = {
  errors: string[];
  pendingRscChecks: Set<Promise<void>>;
};

type PublicProjection = {
  activeDrawKey: string;
  generation: number;
};

function hostRunButton(page: Page, name: string | RegExp) {
  return page.getByTestId("admin-host-run-controls").getByRole("button", { name });
}

async function confirmIdentity(page: Page, playerName: string) {
  await page.getByLabel("Select your start.gg username").selectOption({ label: playerName });
  await page.getByLabel(`I confirm that I am ${playerName}`).check();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByTestId("ballot-chart-card")).toHaveCount(7);
}

async function submitNoBansBallot(page: Page, playerName: string) {
  await confirmIdentity(page, playerName);
  await page.getByLabel("No bans for this set").check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("No bans for this set").check();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit Ballot" }).click();
  await expect(page.getByText("Ballot successfully submitted.")).toBeVisible();
  await expect(page.getByText("No bans for this set", { exact: true })).toHaveCount(2);
}

async function readProjection(page: Page): Promise<PublicProjection> {
  const guard = page.getByTestId("vote-route-freshness-guard");
  const generation = Number(await guard.getAttribute("data-accepted-public-state-generation"));
  const activeDrawKey = await guard.getAttribute("data-accepted-active-draw-key");

  expect(Number.isSafeInteger(generation)).toBe(true);
  expect(activeDrawKey).toBeTruthy();

  return { activeDrawKey: activeDrawKey!, generation };
}

async function waitForNewGeneration(page: Page, previousGeneration: number) {
  const guard = page.getByTestId("vote-route-freshness-guard");

  await expect
    .poll(async () => Number(await guard.getAttribute("data-accepted-public-state-generation")), {
      timeout: 30_000,
    })
    .toBeGreaterThan(previousGeneration);

  return readProjection(page);
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

function responseLabel(response: Response) {
  try {
    const url = new URL(response.url());
    return `${url.pathname}${url.searchParams.has("_rsc") ? "?_rsc" : ""}`;
  } catch {
    return "unknown response";
  }
}

async function inspectRscResponse(response: Response, errors: string[]) {
  const contentType = response.headers()["content-type"] ?? "";
  const isRsc = response.url().includes("_rsc=") || contentType.includes("text/x-component");

  if (!isRsc) {
    return;
  }

  if (!response.ok()) {
    errors.push(`RSC ${response.status()} ${responseLabel(response)}`);
    return;
  }

  const body = await response.text();

  if (/[A-Za-z0-9]+:E\{[^\n]*"digest"/.test(body)) {
    errors.push(`RSC error frame ${responseLabel(response)}`);
  }
}

function monitorPublicErrors(page: Page, monitor: PublicErrorMonitor) {
  page.on("pageerror", (error) => monitor.errors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      monitor.errors.push(`${response.status()} ${responseLabel(response)}`);
    }

    const pending = inspectRscResponse(response, monitor.errors)
      .catch(() => undefined)
      .finally(() => monitor.pendingRscChecks.delete(pending));
    monitor.pendingRscChecks.add(pending);
  });
}

async function startFreshOpenRound(adminPage: Page) {
  const rehearsalForm = adminPage
    .getByTestId("admin-rehearsal-controls")
    .locator("form", { has: adminPage.getByRole("button", { name: "Start Rehearsal" }) })
    .first();

  await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await rehearsalForm
    .getByPlaceholder("Audit reason")
    .fill("Phase 1 pause resume generation preservation");
  await clickAdminActionAndWait(
    adminPage,
    rehearsalForm.getByRole("button", { name: "Start Rehearsal" }),
  );
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(0));
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(1));
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Open Voting"));
}

async function releaseHostIfHeld(adminPage: Page) {
  if (adminPage.isClosed()) {
    return;
  }

  const release = hostRunButton(adminPage, "Release");

  if ((await release.count()) > 0 && (await release.isEnabled().catch(() => false))) {
    await clickAdminActionAndWait(adminPage, release);
  }
}

test("@phase1 generation-only pause and resume preserve saved and draft ballots", async ({
  page: adminPage,
}) => {
  const browser = adminPage.context().browser();

  if (!browser) {
    throw new Error("Phase 1 pause/resume evidence requires a browser instance.");
  }

  const participantContexts: BrowserContext[] = [];
  const monitor: PublicErrorMonitor = { errors: [], pendingRscChecks: new Set() };
  let savedPage: Page | null = null;
  let draftPage: Page | null = null;

  try {
    await loginAndTakeHost(adminPage);
    await openRehearsalControls(adminPage);
    await startFreshOpenRound(adminPage);

    const savedContext = await browser.newContext();
    const draftContext = await browser.newContext();
    participantContexts.push(savedContext, draftContext);
    savedPage = await savedContext.newPage();
    draftPage = await draftContext.newPage();
    monitorPublicErrors(savedPage, monitor);
    monitorPublicErrors(draftPage, monitor);
    await goto(savedPage, "/vote");
    await goto(draftPage, "/vote");

    await submitNoBansBallot(savedPage, "Rehearsal Player 01");
    await confirmIdentity(draftPage, "Rehearsal Player 02");
    const selectedDraftCard = draftPage.getByTestId("ballot-chart-card").first();
    const selectedDraftChartId = await selectedDraftCard.getAttribute("data-chart-id");

    expect(selectedDraftChartId).toBeTruthy();
    await selectedDraftCard.click();
    await expect(selectedDraftCard).toHaveAttribute("aria-pressed", "true");
    await expect(draftPage.getByTestId("ban-selection-counter")).toHaveText("1/2 bans selected");

    const savedBefore = await readProjection(savedPage);
    const draftBefore = await readProjection(draftPage);
    expect(draftBefore).toEqual(savedBefore);

    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Pause"));
    await expect(
      adminPage.getByTestId("admin-host-run-controls").getByText("Voting paused", { exact: true }),
    ).toBeVisible();

    const [savedPaused, draftPaused] = await Promise.all([
      waitForNewGeneration(savedPage, savedBefore.generation),
      waitForNewGeneration(draftPage, draftBefore.generation),
    ]);
    expect(savedPaused.generation).toBe(savedBefore.generation + 1);
    expect(draftPaused.generation).toBe(savedPaused.generation);
    expect(savedPaused.activeDrawKey).toBe(savedBefore.activeDrawKey);
    expect(draftPaused.activeDrawKey).toBe(savedBefore.activeDrawKey);

    await expect(
      savedPage.getByText(
        "Voting is paused. Your saved ballot remains valid; edits resume when voting resumes.",
      ),
    ).toBeVisible();
    await expect(
      draftPage.getByText("Voting is paused. Your selections are still here;", { exact: false }),
    ).toBeVisible();
    await expect(draftPage.locator(`[data-chart-id="${selectedDraftChartId}"]`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(draftPage.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    await expect(savedPage.getByRole("button", { name: /^Edit / })).toHaveCount(0);
    await expectStoredIdentity(savedPage, "Rehearsal Player 01", true);
    await expectStoredIdentity(draftPage, "Rehearsal Player 02", false);
    await expect(savedPage.getByText(REROLL_COPY)).toHaveCount(0);
    await expect(draftPage.getByText(REROLL_COPY)).toHaveCount(0);

    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Resume"));
    await expect(
      adminPage.getByTestId("admin-host-run-controls").getByText("Voting open", { exact: true }),
    ).toBeVisible();

    const [savedResumed, draftResumed] = await Promise.all([
      waitForNewGeneration(savedPage, savedPaused.generation),
      waitForNewGeneration(draftPage, draftPaused.generation),
    ]);
    expect(savedResumed.generation).toBe(savedPaused.generation + 1);
    expect(draftResumed.generation).toBe(savedResumed.generation);
    expect(savedResumed.activeDrawKey).toBe(savedBefore.activeDrawKey);
    expect(draftResumed.activeDrawKey).toBe(savedBefore.activeDrawKey);

    await expect(savedPage.getByText("Ballot successfully submitted.")).toBeVisible();
    await expect(savedPage.getByText("No bans for this set", { exact: true })).toHaveCount(2);
    await expect(savedPage.getByRole("button", { name: /^Edit / }).first()).toBeEnabled();
    await expect(savedPage.getByText("Voting as Rehearsal Player 01")).toBeVisible();
    await expect(draftPage.getByText("Voting as Rehearsal Player 02")).toBeVisible();
    await expect(draftPage.locator(`[data-chart-id="${selectedDraftChartId}"]`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(draftPage.getByTestId("ban-selection-counter")).toHaveText("1/2 bans selected");
    await expect(draftPage.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
    await expectStoredIdentity(savedPage, "Rehearsal Player 01", true);
    await expectStoredIdentity(draftPage, "Rehearsal Player 02", false);
    await expect(savedPage.getByText(REROLL_COPY)).toHaveCount(0);
    await expect(draftPage.getByText(REROLL_COPY)).toHaveCount(0);

    await Promise.allSettled([...monitor.pendingRscChecks]);
    expect(monitor.errors).toEqual([]);
  } finally {
    await Promise.allSettled([...monitor.pendingRscChecks]);
    await Promise.all(participantContexts.map((context) => context.close().catch(() => undefined)));
    await releaseHostIfHeld(adminPage);
  }
});
