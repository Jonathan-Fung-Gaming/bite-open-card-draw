import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import {
  clickAdminActionAndWait,
  getAdminPassword,
  loginAndTakeHost,
  openRehearsalControls,
} from "../e2e/admin-helpers";
import { captureEvidenceScreenshot } from "../e2e/evidence-artifacts";
import { requireBaseURL } from "../phase9/fixtures/phase9-env";
import { TIEBREAK_REVEAL_DURATION_MS } from "../../src/lib/results/reveal-timing";
import { writeSafeDiagnosticEvidence } from "./diagnostic-evidence";

test.describe.configure({ mode: "serial" });

const WIDTHS = [320, 360, 390] as const;
const LOGO_ALT = "Pump It Up Open Stage tournament logo";

type Box = { height: number; width: number; x: number; y: number };

function roundedBox(box: Box | null) {
  return box
    ? Object.fromEntries(
        Object.entries(box).map(([key, value]) => [key, Math.round(value * 100) / 100]),
      )
    : null;
}

async function installLayoutShiftObserver(page: Page) {
  await page.addInitScript(() => {
    const samples: Array<{ value: number; logoRelated: boolean }> = [];
    Object.defineProperty(window, "__phase0LayoutShifts", {
      configurable: true,
      value: samples,
    });

    if (!PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
      return;
    }

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          sources?: Array<{ node?: Node | null }>;
          value?: number;
        };

        if (shift.hadRecentInput) {
          continue;
        }

        const logo = document.querySelector('img[alt="Pump It Up Open Stage tournament logo"]');
        const logoContainer = logo?.parentElement;
        const logoRelated = Boolean(
          logoContainer &&
          shift.sources?.some((source) => source.node && logoContainer.contains(source.node)),
        );
        samples.push({ logoRelated, value: shift.value ?? 0 });
      }
    }).observe({ buffered: true, type: "layout-shift" });
  });
}

async function sampleLogoHardReload(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  const logo = page.getByAltText(LOGO_ALT).first();
  await logo.waitFor({ state: "attached" });
  const container = logo.locator("..");
  const earliest = {
    container: roundedBox(await container.boundingBox()),
    image: roundedBox(await logo.boundingBox()),
  };

  await expect
    .poll(async () => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const loaded = {
    container: roundedBox(await container.boundingBox()),
    image: roundedBox(await logo.boundingBox()),
  };

  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForTimeout(250);
  const settled = {
    container: roundedBox(await container.boundingBox()),
    image: roundedBox(await logo.boundingBox()),
  };
  const shifts = await page.evaluate(() => {
    const entries = (
      window as typeof window & {
        __phase0LayoutShifts?: Array<{ value: number; logoRelated: boolean }>;
      }
    ).__phase0LayoutShifts;

    return entries ?? [];
  });

  return {
    earliest,
    loaded,
    settled,
    layoutShiftCount: shifts.filter((entry) => entry.logoRelated).length,
    layoutShiftValue:
      Math.round(
        shifts
          .filter((entry) => entry.logoRelated)
          .reduce((total, entry) => total + entry.value, 0) * 1_000_000,
      ) / 1_000_000,
  };
}

async function locatorGeometry(locator: Locator) {
  const count = await locator.count();
  const boxes = [];

  for (let index = 0; index < count; index += 1) {
    boxes.push(roundedBox(await locator.nth(index).boundingBox()));
  }

  return boxes;
}

async function collectRouteGeometry(page: Page, route: "/charts" | "/vote" | "/results") {
  const viewport = page.viewportSize();
  const documentGeometry = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  if (route === "/charts") {
    return {
      document: documentGeometry,
      viewport,
      hasHorizontalOverflow: documentGeometry.scrollWidth > documentGeometry.clientWidth,
      horizontalOverflowPx: Math.max(
        0,
        documentGeometry.scrollWidth - documentGeometry.clientWidth,
      ),
      geometry: await locatorGeometry(page.getByTestId("stage-set-row")),
    };
  }

  if (route === "/vote") {
    const select = page.getByLabel("Select your start.gg username");
    await expect(select).toHaveCount(1);
    const style = await select.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        appearance: computed.appearance,
        fontSize: Number.parseFloat(computed.fontSize),
        tagName: element.tagName,
      };
    });

    expect(style.tagName).toBe("SELECT");

    return {
      document: documentGeometry,
      viewport,
      hasHorizontalOverflow: documentGeometry.scrollWidth > documentGeometry.clientWidth,
      horizontalOverflowPx: Math.max(
        0,
        documentGeometry.scrollWidth - documentGeometry.clientWidth,
      ),
      geometry: await locatorGeometry(select),
      ...style,
    };
  }

  const resultCards = page.getByTestId("stage-chart-card");
  const pending = page.getByTestId("current-round-results-pending");

  return {
    document: documentGeometry,
    viewport,
    hasHorizontalOverflow: documentGeometry.scrollWidth > documentGeometry.clientWidth,
    horizontalOverflowPx: Math.max(0, documentGeometry.scrollWidth - documentGeometry.clientWidth),
    geometry: await locatorGeometry((await resultCards.count()) > 0 ? resultCards : pending),
  };
}

async function collectAtWidths(
  page: Page,
  testInfo: TestInfo,
  route: "/charts" | "/vote" | "/results",
) {
  const samples = [];

  await installLayoutShiftObserver(page);

  for (const width of WIDTHS) {
    samples.push(
      await test.step(`${route} ${width}px hard-reload geometry`, async () => {
        await page.setViewportSize({ width, height: 844 });
        const logo = await sampleLogoHardReload(page, route);
        const geometry = await collectRouteGeometry(page, route);
        const routeName = route.slice(1);

        await captureEvidenceScreenshot(
          testInfo,
          `${testInfo.project.name}-${routeName}-${width}.png`,
          page,
        );
        return { route, width, ...geometry, logo };
      }),
    );
  }

  return samples;
}

function hostControls(page: Page) {
  return page.getByTestId("admin-host-run-controls");
}

async function runAdminAction(page: Page, name: string | RegExp) {
  const button = hostControls(page).getByRole("button", { name });

  await expect(button).toBeEnabled({ timeout: 120_000 });
  await clickAdminActionAndWait(page, button);
}

async function prepareMemoryVoting(page: Page) {
  await test.step("prepare deterministic memory voting state", async () => {
    await startMemoryRehearsal(page);
    const drawButtons = hostControls(page).getByRole("button", { name: "Draw Set" });

    await expect(drawButtons).toHaveCount(2);
    await clickAdminActionAndWait(page, drawButtons.nth(0));
    await expect(page.getByText(/Draw 1/).first()).toBeVisible({ timeout: 60_000 });
    await clickAdminActionAndWait(page, drawButtons.nth(1));
    await expect(hostControls(page).getByText("Ready to vote", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await runAdminAction(page, "Open Voting");
    await expect(hostControls(page).getByText("Voting open", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
  });
}

async function revealCompleteMemoryResults(page: Page) {
  await test.step("close voting and reveal complete results", async () => {
    await runAdminAction(page, "Close Voting");
    await expect(hostControls(page).getByText("Voting closed", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await runAdminAction(page, "Compute Results");
    await expect(hostControls(page).getByText("Results ready", { exact: true })).toBeVisible({
      timeout: 60_000,
    });

    for (const transition of [
      { button: "Advance to Set 1 counts", phase: "set 1 counts" },
      { button: "Reveal Set 1 selected chart", phase: "set 1 resolved", tiebreak: true },
      { button: "Advance to Set 2 counts", phase: "set 2 counts" },
      { button: "Reveal Set 2 selected chart", phase: "set 2 resolved", tiebreak: true },
      { button: "Show final charts", phase: "final" },
    ]) {
      await test.step(transition.button, async () => {
        await runAdminAction(page, transition.button);
        await expect(hostControls(page).getByText(transition.phase, { exact: true })).toBeVisible({
          timeout: 60_000,
        });

        if (transition.tiebreak) {
          await test.step(`wait ${TIEBREAK_REVEAL_DURATION_MS / 1000}s authoritative tiebreak`, async () =>
            page.waitForTimeout(TIEBREAK_REVEAL_DURATION_MS + 750));
        }
      });
    }

    await runAdminAction(page, "Confirm Stage Reveal Complete");
    await expect(hostControls(page).getByText("Phones and results released")).toBeVisible({
      timeout: 60_000,
    });
  });
}

async function startMemoryRehearsal(page: Page) {
  await loginAndTakeHost(page, "Phase 0 memory visual baseline");
  await openRehearsalControls(page);
  const form = page
    .getByTestId("admin-rehearsal-controls")
    .locator("form", { has: page.getByRole("button", { name: "Start Rehearsal" }) })
    .first();

  await form.getByPlaceholder("Admin password").fill(getAdminPassword());
  await form.getByPlaceholder("Audit reason").fill("Phase 0 memory visual baseline");
  await clickAdminActionAndWait(page, form.getByRole("button", { name: "Start Rehearsal" }));
  await expect(page.getByText("Rehearsal mode", { exact: true }).first()).toBeVisible();
}

test("records logo and 320/360/390 route geometry @phase0-memory", async ({
  page,
  baseURL,
}, testInfo) => {
  test.skip(
    (process.env.E2E_TOURNAMENT_STATE_BACKEND ?? process.env.TOURNAMENT_STATE_BACKEND) !== "memory",
    "Phase 0 responsive baselines use the deterministic memory profile.",
  );

  requireBaseURL(baseURL);
  await prepareMemoryVoting(page);

  try {
    const collectRoute = async (route: "/charts" | "/vote" | "/results") => {
      const publicPage = await page.context().newPage();

      try {
        return await collectAtWidths(publicPage, testInfo, route);
      } finally {
        await publicPage.close();
      }
    };
    const samples = [...(await collectRoute("/charts")), ...(await collectRoute("/vote"))];

    await revealCompleteMemoryResults(page);
    samples.push(...(await collectRoute("/results")));

    await test.step("write sanitized visual evidence", async () =>
      writeSafeDiagnosticEvidence(testInfo, `${testInfo.project.name}-visual-baseline.json`, {
        collectionSucceeded: true,
        samples,
      }));
  } finally {
    await test.step("release memory host", async () => {
      const releaseButton = hostControls(page).getByRole("button", { name: "Release" });

      if (
        (await releaseButton.count()) > 0 &&
        (await releaseButton.isEnabled().catch(() => false))
      ) {
        await clickAdminActionAndWait(page, releaseButton).catch(() => {
          // The worker discards memory state. A teardown navigation race must not invalidate
          // already-written evidence.
        });
      }
    });
  }
});
