import { expect, test } from "@playwright/test";
import { loginAdmin, takeHost } from "../phase3/helpers";
import {
  cleanupPhase4HostedEvent,
  expectHostedRosterState,
  expectPhase4NextRoundEligibility,
  expectSanitizedInvalidationBoundary,
  openPhase4NextRoundVoting,
  seedPhase4RoundDraws,
  seedPhase4Players,
} from "./hosted-state";

test("@phase4-hosted rapid roster changes confirm and propagate within targets", async ({
  browser,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phase4-desktop-chromium");
  test.setTimeout(240_000);
  await cleanupPhase4HostedEvent();
  const standbyContext = await browser.newContext();
  const standbyPage = await standbyContext.newPage();

  try {
    await seedPhase4Players();
    await loginAdmin(page);
    await takeHost(page);
    await loginAdmin(standbyPage);

    const table = page.getByTestId("admin-roster-table");

    await expect(table.getByRole("columnheader")).toHaveText([
      "Username",
      "Active/inactive control",
    ]);
    await expect(table.getByRole("columnheader")).toHaveCount(2);
    await expect(table.locator('input[name="startggUsername"]')).toHaveCount(0);

    const lockedRow = page.getByTestId("admin-roster-row").filter({ hasText: "Phase4 Player 48" });

    await expect(lockedRow.getByTestId("admin-roster-username-locked")).toContainText(
      "Username cannot be edited because this player has tournament history.",
    );
    await expect(
      lockedRow.getByRole("button", { name: /Edit username Phase4 Player 48/ }),
    ).toHaveCount(0);
    await expect(standbyPage.getByTestId("admin-active-player-count")).toHaveAttribute(
      "data-count",
      "48",
    );
    await standbyPage.evaluate(() => {
      const state = { propagatedAt: 0, startedAt: 0 };
      const browserWindow = window as typeof window & {
        __phase4RosterPropagation?: typeof state;
      };
      const recordPropagation = () => {
        const count = document
          .querySelector<HTMLElement>("[data-testid='admin-active-player-count']")
          ?.getAttribute("data-count");

        if (count === "18" && state.propagatedAt === 0) {
          state.propagatedAt = performance.now();
          observer.disconnect();
        }
      };
      const observer = new MutationObserver(recordPropagation);

      browserWindow.__phase4RosterPropagation = state;
      observer.observe(document.body, {
        attributeFilter: ["data-count"],
        attributes: true,
        childList: true,
        subtree: true,
      });
    });

    const rapidNames = Array.from(
      { length: 30 },
      (_, index) => `Phase4 Player ${String(index + 1).padStart(2, "0")}`,
    );
    const startedAt = performance.now();
    const confirmationSamplesMs: number[] = [];

    for (let offset = 0; offset < rapidNames.length; offset += 6) {
      const names = rapidNames.slice(offset, offset + 6);

      if (offset + 6 >= rapidNames.length) {
        await standbyPage.evaluate(() => {
          const state = (
            window as typeof window & {
              __phase4RosterPropagation?: { propagatedAt: number; startedAt: number };
            }
          ).__phase4RosterPropagation;

          if (!state) {
            throw new Error("Roster propagation observer was not initialized.");
          }

          state.startedAt = performance.now();
        });
      }

      const batchEvidence = await page.evaluate(async (batchNames) => {
        const confirmationStartedAt = performance.now();
        const rows = Array.from(
          document.querySelectorAll<HTMLElement>("[data-testid='admin-roster-row']"),
        ).filter((row) => batchNames.includes(row.dataset.playerUsername ?? ""));

        for (const row of rows) {
          row.querySelector<HTMLButtonElement>("button[aria-label^='Mark inactive']")?.click();
        }

        await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));

        const optimistic = {
          count: document
            .querySelector<HTMLElement>("[data-testid='admin-active-player-count']")
            ?.getAttribute("data-count"),
          rows: rows.map((row) => ({
            active: row.dataset.active,
            pending: row.dataset.pending,
          })),
        };

        const confirmationMs = await new Promise<number>((resolve, reject) => {
          const allConfirmed = () => rows.every((row) => row.dataset.pending === "false");

          if (allConfirmed()) {
            resolve(performance.now() - confirmationStartedAt);
            return;
          }

          const timeout = window.setTimeout(() => {
            observer.disconnect();
            reject(new Error("Timed out waiting for roster mutation confirmation."));
          }, 10_000);
          const observer = new MutationObserver(() => {
            if (!allConfirmed()) {
              return;
            }

            window.clearTimeout(timeout);
            observer.disconnect();
            resolve(performance.now() - confirmationStartedAt);
          });

          for (const row of rows) {
            observer.observe(row, { attributeFilter: ["data-pending"], attributes: true });
          }
        });

        return { confirmationMs, optimistic };
      }, names);
      const { confirmationMs, optimistic } = batchEvidence;

      expect(optimistic.count).toBe(String(48 - offset - names.length));
      expect(optimistic.rows).toHaveLength(names.length);
      expect(
        optimistic.rows.every(({ active, pending }) => active === "false" && pending === "true"),
      ).toBe(true);

      confirmationSamplesMs.push(confirmationMs);
    }

    const sortedConfirmationSamples = [...confirmationSamplesMs].sort(
      (left, right) => left - right,
    );
    const p50Ms = sortedConfirmationSamples[Math.floor(sortedConfirmationSamples.length * 0.5)];
    const p95Ms = sortedConfirmationSamples[Math.ceil(sortedConfirmationSamples.length * 0.95) - 1];
    const rapidChangesMs = performance.now() - startedAt;

    expect(p95Ms).toBeLessThanOrEqual(1_000);
    expect(rapidChangesMs).toBeLessThan(6_000);

    await standbyPage.waitForFunction(
      () =>
        ((
          window as typeof window & {
            __phase4RosterPropagation?: { propagatedAt: number; startedAt: number };
          }
        ).__phase4RosterPropagation?.propagatedAt ?? 0) > 0,
      undefined,
      { polling: 20, timeout: 3_000 },
    );
    const propagationMs = await standbyPage.evaluate(() => {
      const state = (
        window as typeof window & {
          __phase4RosterPropagation?: { propagatedAt: number; startedAt: number };
        }
      ).__phase4RosterPropagation;

      if (!state || state.startedAt <= 0 || state.propagatedAt <= 0) {
        throw new Error("Roster propagation evidence is incomplete.");
      }

      return state.propagatedAt - state.startedAt;
    });

    expect(propagationMs).toBeLessThanOrEqual(2_000);
    await expectHostedRosterState({
      activeCount: 18,
      auditCount: 5,
      eligibilityCount: 48,
      version: 5,
    });
    await seedPhase4RoundDraws(2);
    await openPhase4NextRoundVoting(2);
    await expectPhase4NextRoundEligibility(2, 18);
    await expectSanitizedInvalidationBoundary();

    const performanceEvidence = {
      changedPlayers: 30,
      confirmationSamplesMs,
      p50Ms,
      p95Ms,
      propagationMs,
      rapidChangesMs,
      requestBatches: 5,
    };

    console.log(`[phase4] roster performance ${JSON.stringify(performanceEvidence)}`);

    await testInfo.attach("phase4-roster-performance.json", {
      body: Buffer.from(JSON.stringify(performanceEvidence, null, 2)),
      contentType: "application/json",
    });
  } finally {
    await page.goto("about:blank");
    await standbyContext.close();
    await cleanupPhase4HostedEvent();
  }
});
