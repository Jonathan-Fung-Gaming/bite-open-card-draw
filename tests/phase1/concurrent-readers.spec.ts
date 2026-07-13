import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  clickAdminActionAndWait,
  getAdminPassword,
  goto,
  loginAndTakeHost,
  openRehearsalControls,
} from "../e2e/admin-helpers";

const ADMIN_PASSWORD = getAdminPassword();
const READER_COUNT = 3;
const READER_DEADLINE_MS = 30_000;

type PublicProjection = {
  activeDrawKey: string;
  generation: number;
};

function hostRunButton(page: Page, name: string | RegExp) {
  return page.getByTestId("admin-host-run-controls").getByRole("button", { name });
}

async function readAcceptedProjection(page: Page): Promise<PublicProjection> {
  const guard = page.getByTestId("vote-route-freshness-guard");
  await expect(guard).toHaveCount(1);

  const generation = Number(await guard.getAttribute("data-accepted-public-state-generation"));
  const activeDrawKey = await guard.getAttribute("data-accepted-active-draw-key");

  expect(Number.isSafeInteger(generation)).toBe(true);
  expect(generation).toBeGreaterThanOrEqual(0);
  expect(activeDrawKey).toBeTruthy();

  return { activeDrawKey: activeDrawKey!, generation };
}

function projectionKey(projection: PublicProjection) {
  return `${projection.generation}::${projection.activeDrawKey}`;
}

async function startFreshOpenRound(adminPage: Page) {
  const rehearsalForm = adminPage
    .getByTestId("admin-rehearsal-controls")
    .locator("form", { has: adminPage.getByRole("button", { name: "Start Rehearsal" }) })
    .first();

  await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await rehearsalForm
    .getByPlaceholder("Audit reason")
    .fill("Phase 1 concurrent public reader evidence");
  await clickAdminActionAndWait(
    adminPage,
    rehearsalForm.getByRole("button", { name: "Start Rehearsal" }),
  );
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(0));
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(1));
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Open Voting"));
}

async function rerollFirstSet(adminPage: Page) {
  const form = adminPage
    .getByText("Reroll this set", { exact: true })
    .first()
    .locator("..")
    .locator("form");
  const details = form.locator("xpath=ancestor::details[1]");

  if (!(await details.getAttribute("open"))) {
    await details.locator("summary").click();
  }

  await form.getByLabel("Audit reason").fill("Phase 1 concurrent reader set reroll");
  await form.getByLabel("Admin password").fill(ADMIN_PASSWORD);
  await clickAdminActionAndWait(
    adminPage,
    form.getByRole("button", { name: "Confirm Set Reroll" }),
  );
  await expect(
    adminPage.getByTestId("admin-host-run-controls").getByText("Ready to vote", { exact: true }),
  ).toBeVisible();
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

test("@phase1 concurrent independent public readers observe only coherent reroll generations", async ({
  page: adminPage,
}) => {
  const browser = adminPage.context().browser();

  if (!browser) {
    throw new Error("Phase 1 concurrent-reader evidence requires a browser instance.");
  }

  const readerContexts: BrowserContext[] = [];
  const readerPages: Page[] = [];
  const observations: PublicProjection[][] = Array.from({ length: READER_COUNT }, () => []);
  let verifierPage: Page | null = null;
  let expectedAfter: PublicProjection | null = null;
  let stopSampling = false;
  let samplingTasks: Promise<void>[] = [];

  try {
    await loginAndTakeHost(adminPage);
    await openRehearsalControls(adminPage);
    await startFreshOpenRound(adminPage);

    for (let index = 0; index < READER_COUNT; index += 1) {
      const context = await browser.newContext();
      const page = await context.newPage();
      readerContexts.push(context);
      readerPages.push(page);
      await goto(page, "/vote");
      observations[index]?.push(await readAcceptedProjection(page));
    }

    const before = observations[0]?.[0];

    if (!before) {
      throw new Error("Concurrent readers did not capture the initial public projection.");
    }

    expect(new Set(observations.map((entries) => projectionKey(entries[0]!)))).toEqual(
      new Set([projectionKey(before)]),
    );
    expect(before.activeDrawKey.split("|")).toHaveLength(2);

    samplingTasks = readerPages.map(async (page, readerIndex) => {
      const deadline = Date.now() + READER_DEADLINE_MS;

      while (!stopSampling && Date.now() < deadline) {
        await page.reload({ waitUntil: "domcontentloaded" });
        const projection = await readAcceptedProjection(page);
        observations[readerIndex]?.push(projection);

        if (expectedAfter && projectionKey(projection) === projectionKey(expectedAfter)) {
          return;
        }

        await page.waitForTimeout(100);
      }

      if (!stopSampling) {
        throw new Error(
          `Reader ${readerIndex + 1} did not observe the committed reroll projection.`,
        );
      }
    });

    await adminPage.waitForTimeout(250);
    await rerollFirstSet(adminPage);

    verifierPage = await adminPage.context().newPage();
    await goto(verifierPage, "/vote");
    expectedAfter = await readAcceptedProjection(verifierPage);

    expect(expectedAfter.generation).toBe(before.generation + 1);
    expect(expectedAfter.activeDrawKey).not.toBe(before.activeDrawKey);
    expect(expectedAfter.activeDrawKey.split("|")).toHaveLength(2);

    await Promise.all(samplingTasks);
    stopSampling = true;

    const permittedProjectionKeys = new Set([projectionKey(before), projectionKey(expectedAfter)]);

    for (const [readerIndex, readerObservations] of observations.entries()) {
      expect(
        readerObservations.length,
        `reader ${readerIndex + 1} observation count`,
      ).toBeGreaterThan(1);
      expect(
        readerObservations.some(
          (projection) => projectionKey(projection) === projectionKey(expectedAfter!),
        ),
        `reader ${readerIndex + 1} should observe the committed reroll`,
      ).toBe(true);

      for (const projection of readerObservations) {
        expect(
          permittedProjectionKeys.has(projectionKey(projection)),
          `reader ${readerIndex + 1} observed mixed projection ${projectionKey(projection)}`,
        ).toBe(true);
      }
    }
  } finally {
    stopSampling = true;
    await Promise.allSettled(samplingTasks);
    await verifierPage?.close().catch(() => undefined);
    await Promise.all(readerContexts.map((context) => context.close().catch(() => undefined)));
    await releaseHostIfHeld(adminPage);
  }
});
