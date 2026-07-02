import type { APIRequestContext } from "@playwright/test";
import { expectPrivateCsvExport } from "../fixtures/private-csv";
import { expectSupabaseRevealPhase, expectSupabaseSupportedTiebreaks } from "../fixtures/supabase-state";
import { AdminPage } from "../pages/admin.page";

export async function computeAndRevealRoundResults(adminPage: AdminPage, roundNumber: number) {
  await adminPage.computeResults();

  if (!(await expectSupabaseRevealPhase(roundNumber, "computed"))) {
    await adminPage.expectTextAfterNavigation("results computed");
    await adminPage.expectRevealPhaseAfterNavigation("computed");
  }

  await expectSupabaseSupportedTiebreaks(roundNumber);
  await adminPage.advanceToFinalReveal(roundNumber);
}

export async function verifyRoundCsvExport(options: {
  adminPage: AdminPage;
  baseURL: string;
  browserDownloadPath?: string;
  request: APIRequestContext;
  roundNumber: number;
}) {
  const { adminPage, baseURL, browserDownloadPath, request, roundNumber } = options;

  await expectPrivateCsvExport({
    baseURL,
    expectedRows: 12,
    request,
    roundNumber,
  });

  if (browserDownloadPath) {
    await adminPage.verifyManualCsvDownload(roundNumber, browserDownloadPath);
  }
}
