import type { APIRequestContext } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expectPrivateCsvExport } from "../fixtures/private-csv";
import {
  expectSupabaseRevealPhase,
  expectSupabaseSupportedTiebreaks,
} from "../fixtures/supabase-state";
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

function isBrowserCsvDownloadOnly() {
  return (
    process.env.E2E_PROFILE === "production-flow" ||
    process.env.E2E_USE_ADMIN_ACTIONS_ONLY === "true"
  );
}

async function defaultCsvDownloadPath(roundNumber: number) {
  const outputDir = join(process.cwd(), "test-results", "phase9", "downloads");

  await mkdir(outputDir, { recursive: true });

  return join(outputDir, `round-${roundNumber}-private-ballots.csv`);
}

export async function verifyRoundCsvExport(options: {
  adminPage: AdminPage;
  baseURL: string;
  browserDownloadPath?: string;
  request: APIRequestContext;
  roundNumber: number;
}) {
  const { adminPage, baseURL, browserDownloadPath, request, roundNumber } = options;

  if (!isBrowserCsvDownloadOnly()) {
    await expectPrivateCsvExport({
      baseURL,
      expectedRows: 12,
      request,
      roundNumber,
    });
  }

  const resolvedDownloadPath =
    browserDownloadPath ??
    (isBrowserCsvDownloadOnly() ? await defaultCsvDownloadPath(roundNumber) : undefined);

  if (resolvedDownloadPath) {
    await adminPage.verifyManualCsvDownload(roundNumber, resolvedDownloadPath);
  }
}
