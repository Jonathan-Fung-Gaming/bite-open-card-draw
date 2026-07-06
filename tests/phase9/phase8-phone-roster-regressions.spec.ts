import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { requireBaseURL } from "./fixtures/phase9-env";
import { expectPrivateCsvExport, parsePrivateCsv } from "./fixtures/private-csv";
import { computeAndRevealRoundResults } from "./flows/results-reveal.flow";
import {
  attachRehearsalDiagnostics,
  createAdminPage,
  releaseHostAndClosePages,
  startHostedRehearsal,
} from "./flows/rehearsal.flow";
import { closeVotingForRound, openVotingForRound } from "./flows/voting-window.flow";
import { VotePage } from "./pages/vote.page";

const ROUND_ONE = 1;
const ROUND_TWO = 2;
const PLAYER_NAMES = Array.from(
  { length: 12 },
  (_, index) => `Rehearsal Player ${String(index + 1).padStart(2, "0")}`,
);
const PLAYER_ONE = "Rehearsal Player 01";
const PLAYER_TWO = "Rehearsal Player 02";
const INACTIVE_AFTER_OPEN = "Rehearsal Player 10";
const INACTIVE_BEFORE_OPEN = "Rehearsal Player 11";

function withoutPlayers(...excludedNames: string[]) {
  const excluded = new Set(excludedNames);

  return PLAYER_NAMES.filter((name) => !excluded.has(name));
}

function isSupabaseProfile() {
  return (
    (process.env.E2E_TOURNAMENT_STATE_BACKEND ?? process.env.TOURNAMENT_STATE_BACKEND) ===
    "supabase"
  );
}

test("Phase 8 phone roster regressions cover snapshots, duplicate username, and save failure @smoke", async ({
  page,
  browser,
  request,
  baseURL,
}, testInfo) => {
  if (isSupabaseProfile()) {
    test.skip(true, "Phase 8 focused phone/roster regressions run in the memory smoke profile.");
    return;
  }

  const resolvedBaseURL = requireBaseURL(baseURL);
  const adminPage = createAdminPage(page, resolvedBaseURL);
  const openedPages: Page[] = [];
  const openedContexts: BrowserContext[] = [];
  let testError: unknown = null;

  try {
    await startHostedRehearsal(adminPage, "Phase 8 focused phone and roster regression evidence");
    await adminPage.expectActiveCount(12);

    await adminPage.markPlayersInactive([INACTIVE_BEFORE_OPEN]);
    await adminPage.expectActiveCount(11);

    await adminPage.drawCurrentRound(ROUND_ONE);
    await openVotingForRound(adminPage, ROUND_ONE);
    await adminPage.expectVotingEligibleCount(11);

    const snapshotPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    openedPages.push(snapshotPage);
    const snapshotVotePage = new VotePage(snapshotPage, resolvedBaseURL);

    await snapshotVotePage.expectEligiblePlayers(withoutPlayers(INACTIVE_BEFORE_OPEN));

    await adminPage.markPlayersInactive([INACTIVE_AFTER_OPEN]);
    await adminPage.expectActiveCount(10);
    await adminPage.expectVotingEligibleCount(11);
    await snapshotVotePage.expectEligiblePlayers(withoutPlayers(INACTIVE_BEFORE_OPEN));

    await adminPage.addInactivePlayerToCurrentRound(
      INACTIVE_BEFORE_OPEN,
      "Phase 8 emergency current-round eligibility evidence",
    );
    await adminPage.expectActiveCount(10);
    await adminPage.expectVotingEligibleCount(12);
    await snapshotVotePage.expectEligiblePlayers(PLAYER_NAMES);

    const firstContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    openedContexts.push(firstContext, secondContext);
    const firstDeviceVote = new VotePage(await firstContext.newPage(), resolvedBaseURL);
    const secondDeviceVote = new VotePage(await secondContext.newPage(), resolvedBaseURL);

    await firstDeviceVote.beginBallot({ playerName: PLAYER_ONE });
    await secondDeviceVote.beginBallot({ playerName: PLAYER_ONE });
    await secondDeviceVote.expectPresenceWarning(PLAYER_ONE);

    const firstDeviceBallot = await firstDeviceVote.finishCurrentBallot([[0], [0]]);
    const secondDeviceBallot = await secondDeviceVote.finishCurrentBallot([[1], [1]]);

    expect(secondDeviceBallot.selectedCards[0]?.chartId).toBeTruthy();
    expect(secondDeviceBallot.selectedCards[1]?.chartId).toBeTruthy();
    expect(secondDeviceBallot.selectedCards[0]?.chartId).not.toBe(
      firstDeviceBallot.selectedCards[0]?.chartId,
    );
    expect(secondDeviceBallot.selectedCards[1]?.chartId).not.toBe(
      firstDeviceBallot.selectedCards[1]?.chartId,
    );

    const saveFailureContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    openedContexts.push(saveFailureContext);
    const saveFailureVote = new VotePage(await saveFailureContext.newPage(), resolvedBaseURL);
    await saveFailureVote.submitBallot({
      banPlan: [[], []],
      playerName: PLAYER_TWO,
    });

    await saveFailureVote.expectSavedBallot({
      expectedTexts: ["No bans for this set"],
      playerName: PLAYER_TWO,
    });
    await saveFailureVote.editSavedBallotAndForceSubmitFailure([[2], [2]]);
    await saveFailureVote.reload();
    await saveFailureVote.expectSavedBallot({
      expectedTexts: ["No bans for this set"],
      playerName: PLAYER_TWO,
    });

    await closeVotingForRound(adminPage, ROUND_ONE);
    await computeAndRevealRoundResults(adminPage, ROUND_ONE);
    const csv = await expectPrivateCsvExport({
      baseURL: resolvedBaseURL,
      expectedRevisionByPlayer: {
        [PLAYER_ONE]: 2,
        [PLAYER_TWO]: 1,
      },
      expectedRows: 12,
      expectedSubmittedRows: 2,
      request,
      requiredPlayers: [PLAYER_ONE, PLAYER_TWO, INACTIVE_AFTER_OPEN, INACTIVE_BEFORE_OPEN],
      roundNumber: ROUND_ONE,
    });
    const records = parsePrivateCsv(csv);
    const recordByPlayer = new Map(
      records.map((record) => [record.player_startgg_username, record]),
    );
    const playerOneCsv = recordByPlayer.get(PLAYER_ONE);
    const playerTwoCsv = recordByPlayer.get(PLAYER_TWO);
    const inactiveAfterOpenCsv = recordByPlayer.get(INACTIVE_AFTER_OPEN);
    const emergencyAddedCsv = recordByPlayer.get(INACTIVE_BEFORE_OPEN);

    expect(playerOneCsv?.set_1_ban_1_chart_id).toBe(
      secondDeviceBallot.selectedCards.find((card) => card.setIndex === 0)?.chartId,
    );
    expect(playerOneCsv?.set_2_ban_1_chart_id).toBe(
      secondDeviceBallot.selectedCards.find((card) => card.setIndex === 1)?.chartId,
    );
    expect(playerOneCsv?.set_1_ban_1_chart_id).not.toBe(
      firstDeviceBallot.selectedCards.find((card) => card.setIndex === 0)?.chartId,
    );
    expect(playerOneCsv?.set_2_ban_1_chart_id).not.toBe(
      firstDeviceBallot.selectedCards.find((card) => card.setIndex === 1)?.chartId,
    );
    expect(playerTwoCsv?.ballot_revision).toBe("1");
    expect(playerTwoCsv?.set_1_no_bans).toBe("true");
    expect(playerTwoCsv?.set_2_no_bans).toBe("true");
    expect(playerTwoCsv?.set_1_ban_1_chart_id).toBe("");
    expect(playerTwoCsv?.set_2_ban_1_chart_id).toBe("");
    expect(inactiveAfterOpenCsv?.player_active_at_round_start).toBe("true");
    expect(emergencyAddedCsv?.player_active_at_round_start).toBe("false");

    await adminPage.setCurrentRound(ROUND_TWO);
    await adminPage.drawCurrentRound(ROUND_TWO);
    await openVotingForRound(adminPage, ROUND_TWO);
    await adminPage.expectVotingEligibleCount(10);

    const nextRoundContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    openedContexts.push(nextRoundContext);
    const nextRoundVote = new VotePage(await nextRoundContext.newPage(), resolvedBaseURL);

    await nextRoundVote.expectEligiblePlayers(
      withoutPlayers(INACTIVE_AFTER_OPEN, INACTIVE_BEFORE_OPEN),
    );
  } catch (error) {
    testError = error;
    await attachRehearsalDiagnostics({ adminPage, publicPages: null, testInfo });
    throw error;
  } finally {
    for (const pageToClose of openedPages) {
      await pageToClose.close().catch(() => undefined);
    }

    for (const contextToClose of openedContexts) {
      await contextToClose.close().catch(() => undefined);
    }

    await releaseHostAndClosePages(adminPage, null, testError);
  }
});
