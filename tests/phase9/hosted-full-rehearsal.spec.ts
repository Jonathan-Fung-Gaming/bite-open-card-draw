import { test } from "@playwright/test";
import { requireBaseURL } from "./fixtures/phase9-env";
import {
  assertRoundAttritionPlan,
  createProductionFlowRoundExpectations,
  visualEvidencePlayerName,
} from "./fixtures/rehearsal-plan";
import { collectPhase11VisualEvidence } from "./fixtures/phase11-visual-evidence";
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
  let phase11VisualEvidenceCaptured = false;
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
      afterVotingOpened: async ({ expectation, roundNumber }) => {
        if (
          process.env.E2E_PROFILE !== "production-flow" ||
          phase11VisualEvidenceCaptured ||
          roundNumber !== 1
        ) {
          return;
        }

        await collectPhase11VisualEvidence({
          baseURL: resolvedBaseURL,
          browser,
          roundNumber,
          testInfo,
          votePlayerName: visualEvidencePlayerName(expectation),
        });
        phase11VisualEvidenceCaptured = true;
      },
    });
  } catch (error) {
    testError = error;
    await attachRehearsalDiagnostics({ adminPage, publicPages, testInfo });
    throw error;
  } finally {
    await releaseHostAndClosePages(adminPage, publicPages, testError);
  }
});
