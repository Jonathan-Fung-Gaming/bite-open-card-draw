import { expect, test, type Page } from "@playwright/test";
import { clickAdminActionAndWait } from "../e2e/admin-helpers";
import { forceHost, loginAdmin, takeHost } from "../phase3/helpers";

async function ensureHost(page: Page) {
  await loginAdmin(page);

  if (
    await page
      .getByRole("button", { name: "Take Host Control" })
      .isVisible()
      .catch(() => false)
  ) {
    await takeHost(page);
    return;
  }

  if (
    await page
      .getByRole("button", { name: "Release" })
      .isVisible()
      .catch(() => false)
  ) {
    return;
  }

  await forceHost(page, "Phase 4 memory UI evidence");
}

async function bulkImport(page: Page, names: readonly string[]) {
  const form = page.locator("form", {
    has: page.getByPlaceholder("Bulk import start.gg usernames"),
  });

  await form.getByPlaceholder("Bulk import start.gg usernames").fill(names.join("\n"));
  await clickAdminActionAndWait(page, form.getByRole("button", { name: "Bulk Import" }));
  await expect(page.getByTestId("admin-roster-row").filter({ hasText: names[0] })).toBeVisible();
}

function rosterRow(page: Page, username: string) {
  return page.locator(
    `[data-testid="admin-roster-row"][data-player-username=${JSON.stringify(username)}]`,
  );
}

test("@phase4-memory desktop roster is two-column, inline editable, optimistic, and batch safe", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phase4-desktop-chromium");
  test.setTimeout(240_000);
  await ensureHost(page);

  const prefix = `P4D${Date.now()}`;
  const alpha = `${prefix} Alpha`;
  const bravo = `${prefix} Bravo`;
  const duplicate = `${prefix} Duplicate`;
  const longName = `${prefix}-${"LongRosterName".repeat(7)}`.slice(0, 100);
  const rapidNames = Array.from(
    { length: 30 },
    (_, index) => `${prefix} Rapid ${String(index + 1).padStart(2, "0")}`,
  );

  await bulkImport(page, [alpha, bravo, duplicate, longName, ...rapidNames]);

  const table = page.getByTestId("admin-roster-table");
  const headers = table.getByRole("columnheader");

  await expect(headers).toHaveCount(2);
  await expect(headers).toHaveText(["Username", "Active/inactive control"]);
  await expect(table.getByText("Edit", { exact: true })).toHaveCount(0);

  const alphaRow = rosterRow(page, alpha);
  const alphaTrigger = alphaRow.getByRole("button", { name: `Edit username ${alpha}` });

  await expect(alphaRow.getByRole("cell")).toHaveCount(2);
  await expect(alphaRow.locator('input[name="startggUsername"]')).toHaveCount(0);
  await alphaTrigger.click();
  await expect(alphaRow.locator('input[name="startggUsername"]')).toHaveCount(0);

  await alphaTrigger.dblclick();
  const alphaInput = alphaRow.getByLabel(`Edit start.gg username for ${alpha}`);

  await expect(alphaInput).toBeFocused();
  await alphaInput.press("Escape");
  await expect(alphaTrigger).toBeFocused();

  await alphaTrigger.press("F2");
  await expect(alphaInput).toBeFocused();
  const correctedAlpha = `${alpha} Corrected`;
  await alphaInput.fill(correctedAlpha);
  await alphaInput.press("Enter");
  const correctedRow = rosterRow(page, correctedAlpha);

  await expect(correctedRow).toBeVisible();
  await expect(
    correctedRow.getByRole("button", { name: `Edit username ${correctedAlpha}` }),
  ).toBeFocused();

  const bravoRow = rosterRow(page, bravo);
  const bravoTrigger = bravoRow.getByRole("button", { name: `Edit username ${bravo}` });

  await bravoTrigger.press("Enter");
  const bravoInput = bravoRow.getByLabel(`Edit start.gg username for ${bravo}`);

  await bravoInput.fill("");
  await bravoRow.getByRole("button", { name: "Save Name" }).click();
  await expect(bravoRow.getByRole("alert")).toContainText("username is required");
  await expect(bravoInput).toBeFocused();

  await bravoInput.fill(correctedAlpha);
  await bravoRow.getByRole("button", { name: "Save Name" }).click();
  await expect(bravoRow.getByRole("alert")).toContainText("already exists");
  await expect(bravoInput).toBeFocused();
  await bravoInput.press("Escape");
  await expect(bravoTrigger).toBeFocused();

  const duplicateRow = rosterRow(page, duplicate);

  await duplicateRow.getByRole("button", { name: `Mark inactive ${duplicate}` }).click();
  await expect(duplicateRow).toHaveAttribute("data-active", "false");
  await expect(duplicateRow).toHaveAttribute("data-pending", "false");
  await duplicateRow.getByRole("button", { name: `Edit username ${duplicate}` }).dblclick();
  const duplicateInput = duplicateRow.getByLabel(`Edit start.gg username for ${duplicate}`);

  await duplicateInput.fill(correctedAlpha);
  await duplicateInput.press("Enter");
  const inactiveDuplicateRow = page
    .getByTestId("admin-roster-row")
    .filter({ hasText: correctedAlpha })
    .filter({ has: page.getByText("Inactive", { exact: true }) });

  await expect(inactiveDuplicateRow).toBeVisible();
  const rejectedOptimisticState = await page.evaluate(async (username) => {
    const targetRow = Array.from(
      document.querySelectorAll<HTMLElement>("[data-testid='admin-roster-row']"),
    ).find((row) => row.dataset.playerUsername === username && row.dataset.active === "false");

    targetRow?.querySelector<HTMLButtonElement>("button[aria-label^='Reactivate']")?.click();
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));

    return {
      active: targetRow?.dataset.active,
      pending: targetRow?.dataset.pending,
    };
  }, correctedAlpha);

  expect(rejectedOptimisticState).toEqual({ active: "true", pending: "true" });
  await expect(inactiveDuplicateRow).toHaveAttribute("data-active", "false");
  await expect(inactiveDuplicateRow).toHaveAttribute("data-pending", "false");
  await expect(inactiveDuplicateRow.getByRole("alert")).toContainText(
    "active player already uses that start.gg username",
  );

  const dirtyBravoRow = rosterRow(page, bravo);

  await dirtyBravoRow.getByRole("button", { name: `Edit username ${bravo}` }).dblclick();
  const dirtyBravoInput = dirtyBravoRow.getByLabel(`Edit start.gg username for ${bravo}`);

  await dirtyBravoInput.fill(`${bravo} Unsaved`);
  const correctedActiveRow = page
    .getByTestId("admin-roster-row")
    .filter({ hasText: correctedAlpha })
    .filter({ has: page.getByText("Active", { exact: true }) });
  const correctedActivePlayerId = await correctedActiveRow.getAttribute("data-player-id");

  if (!correctedActivePlayerId) {
    throw new Error("Expected the active renamed player row to expose its stable player id.");
  }

  const stableCorrectedActiveRow = page.locator(
    `[data-testid="admin-roster-row"][data-player-id=${JSON.stringify(correctedActivePlayerId)}]`,
  );

  await correctedActiveRow.getByRole("button", { name: `Mark inactive ${correctedAlpha}` }).click();
  await expect(stableCorrectedActiveRow).toHaveAttribute("data-pending", "false");
  await page.waitForTimeout(1_200);
  await expect(dirtyBravoInput).toHaveValue(`${bravo} Unsaved`);
  await dirtyBravoInput.press("Escape");

  const countBeforeRapid = Number(
    await page.getByTestId("admin-active-player-count").getAttribute("data-count"),
  );
  const startedAt = Date.now();
  const optimistic = await page.evaluate(async (names) => {
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>("[data-testid='admin-roster-row']"),
    );
    const targetRows = rows.filter((row) => names.includes(row.dataset.playerUsername ?? ""));

    for (const row of targetRows) {
      row.querySelector<HTMLButtonElement>("button[aria-label^='Mark inactive']")?.click();
    }

    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));

    return targetRows.map((row) => ({
      active: row.dataset.active,
      pending: row.dataset.pending,
    }));
  }, rapidNames);

  expect(optimistic).toHaveLength(30);
  expect(optimistic.every(({ active, pending }) => active === "false" && pending === "true")).toBe(
    true,
  );
  await expect(page.getByTestId("admin-active-player-count")).toHaveAttribute(
    "data-count",
    String(countBeforeRapid - 30),
  );

  await expect
    .poll(async () =>
      Promise.all(rapidNames.map((name) => rosterRow(page, name).getAttribute("data-pending"))),
    )
    .toEqual(rapidNames.map(() => "false"));
  expect(Date.now() - startedAt).toBeLessThan(5_000);

  await page.setViewportSize({ width: 320, height: 800 });
  const longRow = rosterRow(page, longName);
  const contained = await longRow.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rowOverflow: element.scrollWidth - Math.ceil(rect.width),
    };
  });

  expect(contained.pageOverflow).toBeLessThanOrEqual(1);
  expect(contained.rowOverflow).toBeLessThanOrEqual(1);
});

test("@phase4-memory touch activation keeps the two-column roster contained", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phase4-mobile-chromium");
  await ensureHost(page);
  const username = `P4T${Date.now()} Touch Player`;

  await bulkImport(page, [username]);
  const row = rosterRow(page, username);

  await row.getByRole("button", { name: `Edit username ${username}` }).tap();
  await expect(row.getByLabel(`Edit start.gg username for ${username}`)).toBeFocused();
  await expect(page.getByTestId("admin-roster-table").getByRole("columnheader")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
