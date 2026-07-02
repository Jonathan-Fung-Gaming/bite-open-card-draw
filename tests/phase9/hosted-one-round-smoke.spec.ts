import { test } from "@playwright/test";
import { requireBaseURL } from "./fixtures/phase9-env";
import {
  attachRehearsalDiagnostics,
  createAdminPage,
  openRehearsalPublicPages,
  type RehearsalPublicPages,
  releaseHostAndClosePages,
  runHostedRehearsal,
  startHostedRehearsal,
} from "./flows/rehearsal.flow";

test("hosted one-round rehearsal smoke @smoke", async ({ page, browser, request, baseURL }, testInfo) => {
  const resolvedBaseURL = requireBaseURL(baseURL);
  const adminPage = createAdminPage(page, resolvedBaseURL);
  let publicPages: RehearsalPublicPages | null = null;
  let testError: unknown = null;

  try {
    await startHostedRehearsal(adminPage, "Phase 9 hosted one-round smoke");
    publicPages = await openRehearsalPublicPages(browser, resolvedBaseURL);
    await runHostedRehearsal({
      adminPage,
      baseURL: resolvedBaseURL,
      browser,
      browserDownloadPathForRound: (roundNumber) =>
        roundNumber === 1 ? testInfo.outputPath("round-1-private-ballots.csv") : undefined,
      publicPages,
      request,
      rounds: [1],
    });
  } catch (error) {
    testError = error;
    await attachRehearsalDiagnostics({ adminPage, publicPages, testInfo });
    throw error;
  } finally {
    await releaseHostAndClosePages(adminPage, publicPages, testError);
  }
});
