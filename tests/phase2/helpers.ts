import { expect, type Locator, type Page } from "@playwright/test";
import {
  clickAdminActionAndWait,
  getAdminPassword,
  openRehearsalControls,
} from "../e2e/admin-helpers";

const ADMIN_PASSWORD = getAdminPassword();

export function hostRunButton(page: Page, name: string | RegExp) {
  return page.getByTestId("admin-host-run-controls").getByRole("button", { name });
}

export async function startFreshRehearsal(adminPage: Page, reason: string) {
  await openRehearsalControls(adminPage);

  const rehearsalForm = adminPage
    .getByTestId("admin-rehearsal-controls")
    .locator("form", { has: adminPage.getByRole("button", { name: "Start Rehearsal" }) })
    .first();

  await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await rehearsalForm.getByPlaceholder("Audit reason").fill(reason);
  await clickAdminActionAndWait(
    adminPage,
    rehearsalForm.getByRole("button", { name: "Start Rehearsal" }),
  );
}

export async function startFreshReadyRound(adminPage: Page, reason: string) {
  await startFreshRehearsal(adminPage, reason);
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(0));
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(1));
  await expect(
    adminPage.getByTestId("admin-host-run-controls").getByText("Ready to vote", { exact: true }),
  ).toBeVisible();
}

export async function startFreshOpenRound(adminPage: Page, reason: string) {
  await startFreshReadyRound(adminPage, reason);
  await clickAdminActionAndWait(
    adminPage,
    adminPage
      .getByTestId("admin-host-run-controls")
      .getByRole("button", { name: "Open Voting", exact: true }),
  );
  await expect(
    adminPage.getByTestId("admin-host-run-controls").getByText("Voting open", { exact: true }),
  ).toBeVisible();
}

export async function releaseHostIfHeld(adminPage: Page) {
  if (adminPage.isClosed()) {
    return;
  }

  const release = hostRunButton(adminPage, "Release");

  if ((await release.count()) > 0 && (await release.isEnabled().catch(() => false))) {
    await clickAdminActionAndWait(adminPage, release);
  }
}

export async function setPhase2VotingState(
  page: Page,
  status: "final_30_seconds" | "extension_1_minute",
) {
  const token = process.env.E2E_TEST_ROUTE_TOKEN;

  if (!token) {
    throw new Error("E2E_TEST_ROUTE_TOKEN is required for the Phase 2 lifecycle fixture.");
  }

  const response = await page.request.post("/api/e2e/phase2-voting-state", {
    headers: { "x-tournament-test-token": token },
    data: { roundNumber: 1, status },
  });

  expect(response.ok()).toBe(true);
  return response.json() as Promise<{ generation: number; remainingMs: number; status: string }>;
}

export async function expectAllStageChartsVisible(page: Page) {
  const rows = page.getByTestId("stage-set-row");
  const realCards = page.locator('[data-testid="stage-chart-card"][data-has-chart="true"]');
  const placeholders = page.locator('[data-testid="stage-chart-card"][data-has-chart="false"]');
  const assertionStartedAt = Date.now();

  await expect(realCards).toHaveCount(14, { timeout: 2_500 });
  expect(Date.now() - assertionStartedAt).toBeLessThan(3_000);
  await expect(placeholders).toHaveCount(0);
  await expect(rows).toHaveCount(2);

  for (let setIndex = 0; setIndex < 2; setIndex += 1) {
    const row = rows.nth(setIndex);

    await expect(row).toHaveAttribute("data-set-order", String(setIndex + 1));
    await expect(row).toHaveAttribute("data-reveal-complete", "true");
    await expect(row).toHaveAttribute("data-reveal-transition-active", "false");
    await expect(
      row.locator('[data-testid="stage-chart-card"][data-has-chart="true"]'),
    ).toHaveCount(7);
  }
}

export async function readCountdownSeconds(locator: Locator) {
  await expect(locator).toBeVisible();
  const text = (await locator.textContent())?.trim() ?? "";
  const match = /^(\d{2}):(\d{2})$/.exec(text);

  if (!match) {
    throw new Error(`Expected a MM:SS countdown, received "${text}".`);
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

export async function readCountdownPair(stagePage: Page, phonePage: Page) {
  const [stageSeconds, phoneSeconds] = await Promise.all([
    readCountdownSeconds(stagePage.getByTestId("stage-countdown-display")),
    readCountdownSeconds(phonePage.getByTestId("phone-countdown-display")),
  ]);

  return { phoneSeconds, stageSeconds };
}
