import type { APIRequestContext } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  expectPrivateCsvExport,
  expectPrivateCsvFinalContent,
} from "../fixtures/private-csv";
import {
  expectSupabaseFinalCsvMatchesDatabase,
  expectSupabaseRevealPhase,
  expectSupabaseSupportedTiebreaks,
} from "../fixtures/supabase-state";
import { AdminPage } from "../pages/admin.page";

type RevealRouteHooks = {
  afterComputed?: () => Promise<void>;
  afterRevealPhase?: (phase: string) => Promise<void>;
};

export async function computeAndRevealRoundResults(
  adminPage: AdminPage,
  roundNumber: number,
  hooks: RevealRouteHooks = {},
) {
  await adminPage.computeResults();

  if (!(await expectSupabaseRevealPhase(roundNumber, "computed"))) {
    await adminPage.expectTextAfterNavigation("results computed");
    await adminPage.expectRevealPhaseAfterNavigation("computed");
  }

  await hooks.afterComputed?.();
  await expectSupabaseSupportedTiebreaks(roundNumber);
  await adminPage.advanceToFinalReveal(roundNumber, {
    afterRevealPhase: hooks.afterRevealPhase,
  });
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
    const download = await adminPage.verifyManualCsvDownload(roundNumber, resolvedDownloadPath);
    const summary = expectPrivateCsvFinalContent(download.csv, {
      expectedRevisionByPlayer: {
        "Rehearsal Player 01": 2,
        "Rehearsal Player 02": 1,
      },
      expectedRows: 12,
      expectedSubmittedRows: 2,
      requiredPlayers: ["Rehearsal Player 01", "Rehearsal Player 02"],
      roundNumber,
    });

    await expectSupabaseFinalCsvMatchesDatabase({
      csv: download.csv,
      expectedSubmittedPlayers: {
        "Rehearsal Player 01": 2,
        "Rehearsal Player 02": 1,
      },
      roundNumber,
    });
    const summaryDir = join(process.cwd(), "test-results", "phase9");

    await mkdir(summaryDir, { recursive: true });

    await writeFile(
      join(summaryDir, `round-${roundNumber}-csv-summary.json`),
      `${JSON.stringify(
        {
          downloadPath: download.savePath,
          filename: download.filename,
          ...summary,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
}
