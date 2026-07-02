import { expectSupabaseVotingStatus, expectSupabaseVotingStatusIn } from "../fixtures/supabase-state";
import { AdminPage } from "../pages/admin.page";

const CLOSEABLE_VOTING_STATUSES = [
  "voting_open",
  "final_30_seconds",
  "extension_1_minute",
] as const;

export async function openVotingForRound(adminPage: AdminPage, roundNumber: number) {
  await adminPage.openVoting();

  if (!(await expectSupabaseVotingStatus(roundNumber, "voting_open"))) {
    await adminPage.expectTextAfterNavigation("voting open");
  }
}

export async function closeVotingForRound(adminPage: AdminPage, roundNumber: number) {
  if (!(await expectSupabaseVotingStatusIn(roundNumber, CLOSEABLE_VOTING_STATUSES))) {
    await adminPage.expectTextAfterNavigation("voting open");
  }

  await adminPage.closeVoting();

  if (!(await expectSupabaseVotingStatus(roundNumber, "voting_closed"))) {
    await adminPage.expectTextAfterNavigation("voting closed");
  }
}
