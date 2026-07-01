import { expectSupabaseRevealPhase } from "../fixtures/supabase-state";
import { AdminPage } from "../pages/admin.page";

export async function computeAndRevealRoundResults(adminPage: AdminPage, roundNumber: number) {
  await adminPage.computeResults();

  if (!(await expectSupabaseRevealPhase(roundNumber, "computed"))) {
    await adminPage.expectTextAfterNavigation("results computed");
    await adminPage.expectRevealPhaseAfterNavigation("computed");
  }

  await adminPage.advanceToFinalReveal(roundNumber);
}

export async function verifyRoundCsvExport(adminPage: AdminPage, roundNumber: number) {
  await adminPage.verifyManualCsvDownload(roundNumber);
}
