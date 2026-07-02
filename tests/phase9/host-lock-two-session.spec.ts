import { expect, test } from "@playwright/test";
import { requireBaseURL } from "./fixtures/phase9-env";
import {
  expectSupabaseAdminActionsRecorded,
  expectSupabaseHostLockOwnedBy,
} from "./fixtures/supabase-state";
import {
  createAdminPage,
  releaseHostAndClosePages,
  startHostedRehearsal,
} from "./flows/rehearsal.flow";

test("host lock two-session takeover survives stale heartbeat evidence @full", async ({
  page,
  browser,
  baseURL,
}) => {
  const resolvedBaseURL = requireBaseURL(baseURL);
  const adminA = createAdminPage(page, resolvedBaseURL);
  const adminBPage = await browser.newPage();
  const adminB = createAdminPage(adminBPage, resolvedBaseURL);
  let testError: unknown = null;

  try {
    await startHostedRehearsal(adminA, "PFR two-session host-lock evidence setup");
    const sessionA = await adminA.getSessionIdForEvidence();

    expect(sessionA).toBeTruthy();
    await expectSupabaseHostLockOwnedBy(sessionA ?? "");

    await adminB.visit();
    await adminB.forceHostTakeover("PFR two-session host-lock takeover evidence");
    const sessionB = await adminB.getSessionIdForEvidence();

    expect(sessionB).toBeTruthy();
    expect(sessionB).not.toBe(sessionA);
    await expectSupabaseHostLockOwnedBy(sessionB ?? "");

    await page.waitForTimeout(6_500);
    await adminA.expectReadOnlyHostForEvidence();
    await adminB.expectActiveHostForEvidence();
    await expectSupabaseHostLockOwnedBy(sessionB ?? "");
    await expectSupabaseAdminActionsRecorded([
      "host_lock_acquire",
      "host_lock_takeover",
      "start_rehearsal_mode",
    ]);
  } catch (error) {
    testError = error;
    throw error;
  } finally {
    await releaseHostAndClosePages(adminB, null, testError);
    await adminBPage.close().catch(() => undefined);
  }
});
