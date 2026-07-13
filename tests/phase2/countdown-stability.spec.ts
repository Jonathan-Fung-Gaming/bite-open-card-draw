import { expect, test, type BrowserContext, type CDPSession } from "@playwright/test";
import { clickAdminActionAndWait, goto, loginAndTakeHost } from "../e2e/admin-helpers";
import {
  hostRunButton,
  readCountdownPair,
  readCountdownSeconds,
  releaseHostIfHeld,
  startFreshOpenRound,
} from "./helpers";

const DEVICE_CLOCK_SKEW_MS = 6 * 60 * 60 * 1000;

test("@phase2 stage and phone countdowns stay monotonic through refresh, skew, background, and pause", async ({
  browser,
  page: adminPage,
}, testInfo) => {
  let skewedPhoneContext: BrowserContext | null = null;
  let skewedPhoneCdp: CDPSession | null = null;

  try {
    await loginAndTakeHost(adminPage);
    await startFreshOpenRound(adminPage, "Phase 2 countdown stability evidence");

    const stagePage = await adminPage.context().newPage();
    const phonePage = await adminPage.context().newPage();

    await Promise.all([goto(stagePage, "/stage"), goto(phonePage, "/vote")]);
    const phoneCountdown = phonePage.getByTestId("phone-countdown-display");
    const stageGuard = stagePage.getByTestId("stage-route-freshness-guard");

    await expect(phoneCountdown).toHaveAttribute("data-countdown-status", "voting_open");
    await expect
      .poll(() =>
        phonePage.evaluate(() => {
          const header = document.querySelector('[data-testid="phone-countdown-display"]');
          const ballot = document.querySelector('[data-testid="phone-ballot-countdown-display"]');

          return header?.textContent === ballot?.textContent;
        }),
      )
      .toBe(true);
    const openRevision = Number(await phoneCountdown.getAttribute("data-countdown-revision"));
    const openStageGeneration = Number(
      await stageGuard.getAttribute("data-accepted-public-state-generation"),
    );

    expect(Number.isSafeInteger(openRevision)).toBe(true);

    const samples = [await readCountdownPair(stagePage, phonePage)];

    for (let index = 0; index < 6; index += 1) {
      await stagePage.waitForTimeout(1_000);
      samples.push(await readCountdownPair(stagePage, phonePage));
    }

    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index]!;

      expect(Math.abs(sample.stageSeconds - sample.phoneSeconds)).toBeLessThanOrEqual(1);
      await expect
        .poll(() =>
          phonePage.evaluate(() => {
            const header = document.querySelector('[data-testid="phone-countdown-display"]');
            const ballot = document.querySelector('[data-testid="phone-ballot-countdown-display"]');

            return header?.textContent === ballot?.textContent;
          }),
        )
        .toBe(true);

      if (index > 0) {
        const previous = samples[index - 1]!;
        const stageDecrease = previous.stageSeconds - sample.stageSeconds;
        const phoneDecrease = previous.phoneSeconds - sample.phoneSeconds;

        expect(sample.stageSeconds).toBeLessThanOrEqual(previous.stageSeconds);
        expect(sample.phoneSeconds).toBeLessThanOrEqual(previous.phoneSeconds);
        expect(stageDecrease).toBeLessThanOrEqual(2);
        expect(phoneDecrease).toBeLessThanOrEqual(2);
      }
    }

    const firstSample = samples[0]!;
    const lastSample = samples.at(-1)!;

    expect(firstSample.stageSeconds - lastSample.stageSeconds).toBeGreaterThanOrEqual(5);
    expect(firstSample.stageSeconds - lastSample.stageSeconds).toBeLessThanOrEqual(7);
    expect(firstSample.phoneSeconds - lastSample.phoneSeconds).toBeGreaterThanOrEqual(5);
    expect(firstSample.phoneSeconds - lastSample.phoneSeconds).toBeLessThanOrEqual(7);
    expect(Number(await stageGuard.getAttribute("data-accepted-public-state-generation"))).toBe(
      openStageGeneration,
    );

    skewedPhoneContext = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL),
      viewport: { height: 844, width: 390 },
    });
    await skewedPhoneContext.addInitScript((offsetMs) => {
      const actualDateNow = Date.now.bind(Date);

      Date.now = () => actualDateNow() + offsetMs;
    }, DEVICE_CLOCK_SKEW_MS);
    const skewedPhonePage = await skewedPhoneContext.newPage();
    skewedPhoneCdp = await skewedPhoneContext.newCDPSession(skewedPhonePage);

    await goto(skewedPhonePage, "/vote");
    const skewedCountdown = skewedPhonePage.getByTestId("phone-countdown-display");

    await expect(skewedCountdown).toHaveAttribute("data-countdown-status", "voting_open");
    const skewPair = await readCountdownPair(stagePage, skewedPhonePage);

    expect(Math.abs(skewPair.stageSeconds - skewPair.phoneSeconds)).toBeLessThanOrEqual(1);

    const beforeBackgroundSeconds = await readCountdownSeconds(skewedCountdown);

    await skewedPhoneCdp.send("Page.setWebLifecycleState", { state: "frozen" });
    await adminPage.waitForTimeout(2_500);
    await skewedPhoneCdp.send("Page.setWebLifecycleState", { state: "active" });
    await skewedPhonePage.bringToFront();
    const afterBackgroundSeconds = await readCountdownSeconds(skewedCountdown);

    expect(beforeBackgroundSeconds - afterBackgroundSeconds).toBeGreaterThanOrEqual(2);
    expect(beforeBackgroundSeconds - afterBackgroundSeconds).toBeLessThanOrEqual(4);
    const resumedPair = await readCountdownPair(stagePage, skewedPhonePage);

    expect(Math.abs(resumedPair.stageSeconds - resumedPair.phoneSeconds)).toBeLessThanOrEqual(1);

    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Pause"));
    await expect(
      stagePage.locator("header").getByText("Voting paused", { exact: true }),
    ).toBeVisible();
    await expect(phoneCountdown).toHaveAttribute("data-countdown-status", "voting_paused");
    const pausedRevision = Number(await phoneCountdown.getAttribute("data-countdown-revision"));

    expect(pausedRevision).toBeGreaterThan(openRevision);
    const pausedPair = await readCountdownPair(stagePage, phonePage);

    await stagePage.waitForTimeout(2_200);
    expect(await readCountdownPair(stagePage, phonePage)).toEqual(pausedPair);

    await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Resume"));
    await expect(
      stagePage.locator("header").getByText("Voting open", { exact: true }),
    ).toBeVisible();
    await expect(phoneCountdown).toHaveAttribute("data-countdown-status", "voting_open");
    const resumedRevision = Number(await phoneCountdown.getAttribute("data-countdown-revision"));

    expect(resumedRevision).toBeGreaterThan(pausedRevision);
    const resumeStart = await readCountdownPair(stagePage, phonePage);

    await stagePage.waitForTimeout(2_200);
    const resumeEnd = await readCountdownPair(stagePage, phonePage);

    expect(resumeEnd.stageSeconds).toBeLessThan(resumeStart.stageSeconds);
    expect(resumeEnd.phoneSeconds).toBeLessThan(resumeStart.phoneSeconds);
    expect(Math.abs(resumeEnd.stageSeconds - resumeEnd.phoneSeconds)).toBeLessThanOrEqual(1);
  } finally {
    await skewedPhoneCdp?.detach().catch(() => undefined);
    await skewedPhoneContext?.close().catch(() => undefined);
    await releaseHostIfHeld(adminPage);
  }
});
