import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  clickAdminActionAndWait,
  getAdminPassword,
  loginAndTakeHost,
  openRehearsalControls,
} from "../e2e/admin-helpers";
import { hostRunButton, releaseHostIfHeld, startFreshRehearsal } from "../phase2/helpers";

const MOBILE_WIDTHS = [320, 360, 390] as const;
const LONG_USERNAME = `Phase5 ${"Long start.gg Username ".repeat(6)}`.slice(0, 100);
const LOGO_ALT = "Pump It Up Open Stage tournament logo";

type Box = { height: number; width: number; x: number; y: number };

function roundedBox(box: Box | null) {
  return box
    ? (Object.fromEntries(
        Object.entries(box).map(([key, value]) => [key, Math.round(value * 100) / 100]),
      ) as Box)
    : null;
}

async function prepareRound(
  adminPage: Page,
  options: { drawCount: 1 | 2; importLongUsername?: boolean; openVoting?: boolean },
) {
  await loginAndTakeHost(adminPage, "Phase 5 targeted UI evidence");
  await startFreshRehearsal(adminPage, "Phase 5 targeted UI evidence");

  if (options.importLongUsername) {
    const importForm = adminPage.locator("form", {
      has: adminPage.getByPlaceholder("Bulk import start.gg usernames"),
    });

    await importForm.getByPlaceholder("Bulk import start.gg usernames").fill(LONG_USERNAME);
    await clickAdminActionAndWait(
      adminPage,
      importForm.getByRole("button", { name: "Bulk Import" }),
    );
    await expect(
      adminPage.getByTestId("admin-roster-row").filter({ hasText: LONG_USERNAME }),
    ).toBeVisible();
  }

  for (let index = 0; index < options.drawCount; index += 1) {
    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(index));
  }

  if (options.drawCount === 2) {
    await expect(
      adminPage.getByTestId("admin-host-run-controls").getByText("Ready to vote", { exact: true }),
    ).toBeVisible();
  }

  if (options.openVoting) {
    await clickAdminActionAndWait(
      adminPage,
      hostRunButton(adminPage, "Open Voting").filter({ visible: true }).first(),
    );
    await expect(
      adminPage.getByTestId("admin-host-run-controls").getByText("Voting open", { exact: true }),
    ).toBeVisible();
  }
}

async function installLayoutShiftObserver(page: Page) {
  await page.addInitScript(() => {
    const shifts: Array<{ logoRelated: boolean; value: number }> = [];

    Object.defineProperty(window, "__phase5LogoShifts", {
      configurable: true,
      value: shifts,
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

        const logo = document.querySelector(`img[alt="${LOGO_ALT}"]`);
        const wrapper = logo?.parentElement;
        const logoRelated = Boolean(
          wrapper && shift.sources?.some((source) => source.node && wrapper.contains(source.node)),
        );

        shifts.push({ logoRelated, value: shift.value ?? 0 });
      }
    }).observe({ buffered: true, type: "layout-shift" });
  });
}

async function settleVisuals(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function sampleLogoHardReload(
  page: Page,
  route: string,
  testInfo: TestInfo,
  name: string,
  ready: { heading?: string; testId?: string },
) {
  const logoResponses: string[] = [];
  let releaseDelayedLogo: () => void = () => undefined;
  const delayedLogo = new Promise<void>((resolve) => {
    releaseDelayedLogo = resolve;
  });
  const responseListener = (response: { url(): string }) => {
    const decoded = decodeURIComponent(response.url());

    if (decoded.includes("tournament-logo")) {
      logoResponses.push(decoded);
    }
  };

  page.on("response", responseListener);
  await page.route("**/*", async (requestRoute) => {
    const decoded = decodeURIComponent(requestRoute.request().url());

    if (decoded.includes("tournament-logo-web.png")) {
      await delayedLogo;
    }

    await requestRoute.continue();
  });

  try {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    if (ready.testId) {
      await page.getByTestId(ready.testId).waitFor({ state: "visible" });
    } else if (ready.heading) {
      await page.getByRole("heading", { name: ready.heading }).waitFor({ state: "visible" });
    }
    const logo = page.getByAltText(LOGO_ALT).first();

    await logo.waitFor({ state: "visible" });
    const wrapper = logo.locator("..");
    let earliest: { image: Box; wrapper: Box } | null = null;

    await expect
      .poll(async () => {
        const image = roundedBox(await logo.boundingBox());
        const wrapperBox = roundedBox(await wrapper.boundingBox());

        if (image && wrapperBox) {
          earliest = { image, wrapper: wrapperBox };
        }

        return earliest !== null;
      })
      .toBe(true);

    const earliestGeometry = earliest as { image: Box; wrapper: Box } | null;

    if (!earliestGeometry) {
      throw new Error(`Logo geometry never stabilized for ${route}.`);
    }

    const markup = await logo.evaluate((element) => {
      const image = element as HTMLImageElement;
      const style = getComputedStyle(image);

      return {
        fetchPriority: image.fetchPriority,
        height: image.getAttribute("height"),
        objectFit: style.objectFit,
        sizes: image.getAttribute("sizes"),
        width: image.getAttribute("width"),
      };
    });

    releaseDelayedLogo();
    await expect
      .poll(async () => logo.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    const loaded = {
      image: roundedBox(await logo.boundingBox()),
      wrapper: roundedBox(await wrapper.boundingBox()),
    };

    await settleVisuals(page);
    const settled = {
      image: roundedBox(await logo.boundingBox()),
      wrapper: roundedBox(await wrapper.boundingBox()),
    };
    const shifts = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __phase5LogoShifts?: Array<{ logoRelated: boolean; value: number }>;
          }
        ).__phase5LogoShifts ?? [],
    );

    expect(markup.width).toBe("512");
    expect(markup.height).toBe("339");
    expect(markup.objectFit).toBe("contain");
    expect(markup.sizes).toBeTruthy();
    expect(logoResponses.some((url) => url.includes("tournament-logo-web.png"))).toBe(true);
    expect(
      logoResponses.some(
        (url) => url.includes("/brand/tournament-logo.png") && !url.includes("-web.png"),
      ),
    ).toBe(false);
    expect(shifts.filter((entry) => entry.logoRelated)).toHaveLength(0);

    for (const phase of [loaded, settled]) {
      expect(phase.wrapper).toEqual(earliestGeometry.wrapper);
      expect(phase.image).toEqual(earliestGeometry.image);
    }

    await page.screenshot({ path: testInfo.outputPath(`${name}-uncached.png`), fullPage: true });

    await page.unroute("**/*");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    await expect
      .poll(async () =>
        roundedBox(await page.getByAltText(LOGO_ALT).first().locator("..").boundingBox()),
      )
      .toEqual(settled.wrapper);
    await settleVisuals(page);
    const cached = {
      image: roundedBox(await page.getByAltText(LOGO_ALT).first().boundingBox()),
      wrapper: roundedBox(await page.getByAltText(LOGO_ALT).first().locator("..").boundingBox()),
    };

    expect(cached).toEqual(settled);
    await page.screenshot({ path: testInfo.outputPath(`${name}-cached.png`), fullPage: true });

    return { cached, earliest: earliestGeometry, loaded, markup, route, settled, shifts };
  } finally {
    releaseDelayedLogo();
    await page.unroute("**/*").catch(() => undefined);
    page.off("response", responseListener);
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(1);
}

async function assertMobileChartsGeometry(page: Page, width: number, testInfo: TestInfo) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/charts", { waitUntil: "domcontentloaded" });
  await settleVisuals(page);

  const header = page.getByTestId("round-header");
  const heading = page.getByRole("heading", { name: "Drawn Charts" });
  const logo = header.getByAltText(LOGO_ALT);
  const headerBox = await header.boundingBox();
  const headingBox = await heading.boundingBox();
  const logoBox = await logo.boundingBox();
  const headingFontSize = await heading.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );

  expect(headerBox).not.toBeNull();
  expect(headingBox).not.toBeNull();
  expect(logoBox).not.toBeNull();
  expect(headerBox!.height).toBeLessThan(100);
  expect(headingBox!.y).toBeLessThan(96);
  expect(headingBox!.x).toBeGreaterThanOrEqual(logoBox!.x + logoBox!.width);
  expect(logoBox!.x).toBeLessThanOrEqual(16);
  expect(logoBox!.width).toBeLessThanOrEqual(100);
  expect(headingFontSize).toBeLessThanOrEqual(24);
  await expect(header).toHaveAttribute("data-mobile-compact", "true");
  await expect(page.getByTestId("round-header-status")).toHaveCount(0);
  await expect(page.getByText("Chart display", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Charts ready", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Previous chart set/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Next chart set/i })).toHaveCount(0);

  const visiblePanel = page.locator('[data-testid="stage-set-row"]:visible');
  const cards = visiblePanel.getByTestId("stage-chart-card");

  await expect(cards).toHaveCount(7);
  const firstCard = cards.first();
  await expect(firstCard).toHaveJSProperty("tagName", "ARTICLE");
  await expect(firstCard).not.toHaveAttribute("tabindex", /.+/);
  await expect(firstCard).not.toHaveAttribute("aria-pressed", /.+/);
  await expect(firstCard.getByRole("button")).toHaveCount(0);
  await expect(firstCard.getByText(/Tap to ban|Ban selected/)).toHaveCount(0);

  const imageBox = await firstCard.getByTestId("stage-chart-image").boundingBox();
  const titleBox = await firstCard.getByTestId("chart-card-title").boundingBox();

  expect(imageBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(titleBox!.y).toBeGreaterThanOrEqual(imageBox!.y);
  expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(imageBox!.y + imageBox!.height + 1);

  await firstCard.click();
  expect(await firstCard.evaluate((element) => document.activeElement === element)).toBe(false);

  const gridBox = await visiblePanel.locator(".public-chart-grid").boundingBox();
  const seventhBox = await cards.nth(6).boundingBox();

  expect(gridBox).not.toBeNull();
  expect(seventhBox).not.toBeNull();
  expect(Math.abs(seventhBox!.x + seventhBox!.width / 2 - (gridBox!.x + gridBox!.width / 2))).toBe(
    0,
  );

  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-charts-${width}.png`),
    fullPage: true,
  });
}

test("@phase5 intrinsic logo, copy, and desktop chart presentation remain stable", async ({
  browser,
  page: adminPage,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phase5-desktop-chromium");
  expect(baseURL).toBeTruthy();
  await prepareRound(adminPage, { drawCount: 2, openVoting: true });

  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
    const publicPage = await context.newPage();
    await installLayoutShiftObserver(publicPage);
    const evidence = [];

    try {
      for (const sample of [
        { ready: { testId: "round-header" }, route: "/stage" },
        { ready: { testId: "room-current-status" }, route: "/room" },
        { ready: { testId: "vote-dense-header" }, route: "/vote" },
        { ready: { testId: "round-header" }, route: "/charts" },
        { ready: { testId: "round-header" }, route: "/results" },
        { ready: { heading: "Host Console" }, route: "/coolguy69" },
      ] as const) {
        evidence.push(
          await sampleLogoHardReload(
            publicPage,
            sample.route,
            testInfo,
            `phase5-logo-${sample.route.slice(1)}`,
            sample.ready,
          ),
        );
      }

      await publicPage.goto("/stage", { waitUntil: "domcontentloaded" });
      await expect(publicPage.getByText(/Ballots submitted: \d+ \/ \d+/)).toBeVisible();
      await expect(publicPage.getByText(/Ban selections cast across both sets: \d+/)).toBeVisible();
      await expect(
        publicPage.getByText("One window covers both sets.", { exact: true }),
      ).toHaveCount(0);

      for (const width of [1280, 1440]) {
        await publicPage.setViewportSize({ width, height: 900 });
        await publicPage.goto("/charts", { waitUntil: "domcontentloaded" });
        await settleVisuals(publicPage);
        await expect(publicPage.locator('[data-testid="stage-set-row"]:visible')).toHaveCount(2);
        const firstCard = publicPage.getByTestId("stage-chart-card").first();
        const image = await firstCard.getByTestId("stage-chart-image").boundingBox();
        const title = await firstCard.getByTestId("chart-card-title").boundingBox();

        expect(image).not.toBeNull();
        expect(title).not.toBeNull();
        expect(title!.y).toBeGreaterThanOrEqual(image!.y + image!.height - 1);
        await expectNoHorizontalOverflow(publicPage);
        await publicPage.screenshot({
          path: testInfo.outputPath(`phase5-charts-desktop-${width}.png`),
          fullPage: true,
        });
      }
    } finally {
      await context.close();
    }

    await installLayoutShiftObserver(adminPage);
    evidence.push(
      await sampleLogoHardReload(
        adminPage,
        "/coolguy69",
        testInfo,
        "phase5-logo-authenticated-admin",
        { heading: "Host Console" },
      ),
    );
    await testInfo.attach("phase5-logo-geometry.json", {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: "application/json",
    });
  } finally {
    await releaseHostIfHeld(adminPage);
  }
});

test("@phase5 valid rune-wheel spin has a blank center and still reveals its committed winner", async ({
  page: adminPage,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phase5-desktop-chromium");
  await prepareRound(adminPage, { drawCount: 2, openVoting: true });
  const stagePage = await adminPage.context().newPage();

  try {
    await openRehearsalControls(adminPage);
    const seedForm = adminPage.locator("form", {
      has: adminPage.getByRole("button", { name: "Seed Tiebreak" }),
    });

    await seedForm.getByPlaceholder("Admin password").fill(getAdminPassword());
    await seedForm.getByPlaceholder("Audit reason").fill("Phase 5 blank rune center evidence");
    await clickAdminActionAndWait(
      adminPage,
      seedForm.getByRole("button", { name: "Seed Tiebreak" }),
    );
    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Close Voting"));
    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Compute Results"));
    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Advance to Set 1 counts"));
    await stagePage.goto("/stage", { waitUntil: "domcontentloaded" });
    await clickAdminActionAndWait(
      adminPage,
      hostRunButton(adminPage, "Reveal Set 1 selected chart"),
    );
    await stagePage.reload({ waitUntil: "domcontentloaded" });

    const wheel = stagePage.getByTestId("rune-wheel");

    await expect(wheel).toHaveAttribute("data-winner-revealed", "false", { timeout: 2_000 });
    await expect(stagePage.getByTestId("rune-wheel-slot")).toHaveCount(12);
    await expect(stagePage.getByTestId("rune-wheel-status")).toHaveText("");
    await expect(
      stagePage.locator('[data-testid="rune-wheel-slot"][data-slot-winner="true"]'),
    ).toHaveCount(0);
    await stagePage.screenshot({
      path: testInfo.outputPath("phase5-rune-wheel-blank-mid-spin.png"),
      fullPage: true,
    });

    await expect(wheel).toHaveAttribute("data-winner-revealed", "true", { timeout: 13_000 });
    const winner = (await stagePage.getByTestId("rune-wheel-status").textContent())?.trim() ?? "";

    expect(winner.length).toBeGreaterThan(0);
    await expect(
      stagePage.locator('[data-testid="rune-wheel-slot"][data-slot-winner="true"]'),
    ).toHaveCount(1);
  } finally {
    await stagePage.close();
    await releaseHostIfHeld(adminPage);
  }
});

test("@phase5 mobile charts and username selector pass Chromium and WebKit geometry", async ({
  browser,
  page: adminPage,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name === "phase5-desktop-chromium");
  expect(baseURL).toBeTruthy();
  await prepareRound(adminPage, {
    drawCount: 2,
    importLongUsername: true,
    openVoting: true,
  });
  const publicPage = await adminPage.context().newPage();

  try {
    for (const width of MOBILE_WIDTHS) {
      await assertMobileChartsGeometry(publicPage, width, testInfo);
    }

    await publicPage.getByRole("tab", { name: /View Set 2/ }).click();
    await expect(publicPage.getByTestId("stage-set-row").nth(1)).toBeVisible();
    await expect(publicPage.getByTestId("stage-set-row").nth(0)).toBeHidden();
    await publicPage.getByRole("tab", { name: /View Set 1/ }).click();
    await expect(publicPage.getByTestId("stage-set-row").nth(0)).toBeVisible();
    await expect(publicPage).toHaveURL(/#view-only-set-1$/);

    const noJsContext = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      viewport: { width: 320, height: 844 },
    });
    const noJsPage = await noJsContext.newPage();

    try {
      await noJsPage.goto("/charts", { waitUntil: "domcontentloaded" });
      await expect(noJsPage.getByRole("tab", { name: /View Set 1/ })).toBeVisible();
      await expect(noJsPage.getByRole("tab", { name: /View Set 2/ })).toBeVisible();
      await expect(noJsPage.getByTestId("stage-set-row")).toHaveCount(2);
      await expect(noJsPage.getByTestId("stage-set-row").nth(0)).toBeVisible();
      await expect(noJsPage.getByTestId("stage-set-row").nth(1)).toBeVisible();
      await noJsPage.getByRole("tab", { name: /View Set 2/ }).click();
      await expect(noJsPage).toHaveURL(/#view-only-set-2$/);
    } finally {
      await noJsContext.close();
    }

    const votePage = await adminPage.context().newPage();

    try {
      await votePage.setViewportSize({ width: 320, height: 844 });
      await votePage.goto("/vote", { waitUntil: "domcontentloaded" });
      const select = votePage.getByLabel("Select your start.gg username");
      const chevron = votePage.getByTestId("startgg-select-chevron");

      await expect(select).toBeEnabled();
      await select.selectOption({ label: LONG_USERNAME });
      await expect(
        votePage.getByText(`Are you sure you are voting as ${LONG_USERNAME}?`),
      ).toBeVisible();
      const selectStyle = await select.evaluate((element) => {
        const style = getComputedStyle(element);

        return {
          appearance: style.appearance,
          boxShadow: style.boxShadow,
          height: element.getBoundingClientRect().height,
          paddingRight: Number.parseFloat(style.paddingRight),
          tagName: element.tagName,
        };
      });

      expect(selectStyle.tagName).toBe("SELECT");
      expect(selectStyle.appearance).toBe("none");
      expect(selectStyle.height).toBeGreaterThanOrEqual(44);
      expect(selectStyle.paddingRight).toBeGreaterThanOrEqual(48);
      await expect(chevron).toHaveAttribute("aria-hidden", "true");
      await expect(chevron).toHaveCSS("pointer-events", "none");

      const selectBox = await select.boundingBox();
      const chevronBox = await chevron.boundingBox();

      expect(selectBox).not.toBeNull();
      expect(chevronBox).not.toBeNull();
      expect(Math.round(selectBox!.x + selectBox!.width - chevronBox!.x - chevronBox!.width)).toBe(
        16,
      );
      expect(
        Math.abs(selectBox!.y + selectBox!.height / 2 - (chevronBox!.y + chevronBox!.height / 2)),
      ).toBeLessThanOrEqual(1);

      await select.focus();
      await expect(select).toBeFocused();
      const focusedStyle = await select.evaluate((element) => getComputedStyle(element).boxShadow);

      expect(focusedStyle).not.toBe("none");
      const beforeKeyboard = await select.inputValue();
      await select.press("ArrowUp");
      expect(await select.inputValue()).not.toBe(beforeKeyboard);
      await select.selectOption({ label: LONG_USERNAME });
      await votePage.mouse.click(
        chevronBox!.x + chevronBox!.width / 2,
        chevronBox!.y + chevronBox!.height / 2,
      );
      await expect(select).toBeFocused();
      await expectNoHorizontalOverflow(votePage);
      await votePage.screenshot({
        path: testInfo.outputPath(`${testInfo.project.name}-select-focused.png`),
        fullPage: true,
      });

      const selectedPlayerId = await select.inputValue();
      await votePage.evaluate(
        ({ playerId, startggUsername }) => {
          window.localStorage.setItem(
            "bite-open-card-draw:startgg-identity:v1",
            JSON.stringify({ locked: true, playerId, startggUsername }),
          );
        },
        { playerId: selectedPlayerId, startggUsername: LONG_USERNAME },
      );
      await votePage.reload({ waitUntil: "domcontentloaded" });
      await expect(votePage.getByLabel("Select your start.gg username")).toBeDisabled();
      await expect(votePage.getByTestId("startgg-select-chevron")).toBeVisible();
      await votePage.screenshot({
        path: testInfo.outputPath(`${testInfo.project.name}-select-disabled.png`),
        fullPage: true,
      });
    } finally {
      await votePage.close();
    }
  } finally {
    await publicPage.close();
    await releaseHostIfHeld(adminPage);
  }
});

test("@phase5 partial draw keeps server-visible fallback tabs without redundant buttons", async ({
  browser,
  page: adminPage,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name === "phase5-desktop-chromium");
  expect(baseURL).toBeTruthy();
  await prepareRound(adminPage, { drawCount: 1 });
  const chartsPage = await adminPage.context().newPage();

  try {
    await chartsPage.setViewportSize({ width: 320, height: 844 });
    await chartsPage.goto("/charts", { waitUntil: "domcontentloaded" });
    const setOneTab = chartsPage.getByRole("tab", { name: /View Set 1/ });
    const setTwoTab = chartsPage.getByRole("tab", { name: /View Set 2/ });

    await expect(setOneTab).toHaveAttribute("aria-selected", "true");
    await expect(setTwoTab).toHaveAttribute("aria-disabled", "true");
    await expect(chartsPage.getByTestId("stage-set-row").nth(0)).toBeVisible();
    await expect(chartsPage.getByTestId("stage-set-row").nth(1)).toBeHidden();
    await expect(chartsPage.getByRole("button", { name: /Previous chart set/i })).toHaveCount(0);
    await expect(chartsPage.getByRole("button", { name: /Next chart set/i })).toHaveCount(0);
    await expectNoHorizontalOverflow(chartsPage);

    const noJsContext = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      viewport: { width: 320, height: 844 },
    });
    const noJsPage = await noJsContext.newPage();

    try {
      await noJsPage.goto("/charts", { waitUntil: "domcontentloaded" });
      await expect(noJsPage.getByTestId("stage-set-row")).toHaveCount(2);
      await expect(noJsPage.getByTestId("stage-set-row").nth(0)).toBeVisible();
      await expect(noJsPage.getByTestId("stage-set-row").nth(1)).toBeVisible();
      await expect(noJsPage.getByText("This set has not been drawn yet.")).toBeVisible();
      await expect(noJsPage.getByRole("tab", { name: /View Set 2/ })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    } finally {
      await noJsContext.close();
    }
  } finally {
    await chartsPage.close();
    await releaseHostIfHeld(adminPage);
  }
});
