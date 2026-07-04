import { test } from "@playwright/test";
import { requireBaseURL } from "./fixtures/phase9-env";
import {
  assertRoundAttritionPlan,
  createProductionFlowRoundExpectations,
} from "./fixtures/rehearsal-plan";
import { expectProductionFlowTestRoutesDisabled } from "./fixtures/production-flow-safety";
import {
  attachRehearsalDiagnostics,
  createAdminPage,
  openRehearsalPublicPages,
  type RehearsalPublicPages,
  releaseHostAndClosePages,
  runHostedRehearsal,
  startHostedRehearsal,
} from "./flows/rehearsal.flow";

test.setTimeout(3_600_000);

test("hosted Supabase four-round rehearsal covers result reveal and CSV @full", async ({
  page,
  browser,
  request,
  baseURL,
}, testInfo) => {
  const resolvedBaseURL = requireBaseURL(baseURL);
  const adminPage = createAdminPage(page, resolvedBaseURL);
  const roundExpectations = createProductionFlowRoundExpectations();
  let publicPages: RehearsalPublicPages | null = null;
  let testError: unknown = null;

  try {
    assertRoundAttritionPlan(roundExpectations);
    if (process.env.E2E_PROFILE === "production-flow") {
      await expectProductionFlowTestRoutesDisabled(request, resolvedBaseURL);
    }
    await startHostedRehearsal(adminPage, "Phase 10 hosted four-round rehearsal");
    publicPages = await openRehearsalPublicPages(browser, resolvedBaseURL);
    await runHostedRehearsal({
      adminPage,
      baseURL: resolvedBaseURL,
      browser,
      browserDownloadPathForRound: (roundNumber) =>
        testInfo.outputPath(`round-${roundNumber}-private-ballots.csv`),
      publicPages,
      request,
      roundExpectations,
      rounds: [1, 2, 3, 4],
    });
  } catch (error) {
    testError = error;
    await attachRehearsalDiagnostics({ adminPage, publicPages, testInfo });
    throw error;
  } finally {
    await releaseHostAndClosePages(adminPage, publicPages, testError);
  }
});
