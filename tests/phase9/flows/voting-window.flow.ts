import {
  expectSupabaseVotingStatus,
  expectSupabaseVotingStatusIn,
  getSupabaseVotingStatusValue,
} from "../fixtures/supabase-state";
import { AdminPage } from "../pages/admin.page";

const CLOSEABLE_VOTING_STATUSES = [
  "voting_open",
  "final_30_seconds",
  "extension_1_minute",
] as const;
const CLOSEABLE_VOTING_STATUS_VALUES: readonly string[] = CLOSEABLE_VOTING_STATUSES;

export async function openVotingForRound(adminPage: AdminPage, roundNumber: number) {
  await adminPage.openVoting();

  if (!(await expectSupabaseVotingStatus(roundNumber, "voting_open"))) {
    await adminPage.expectTextAfterNavigation("Voting open");
  }
}

export async function closeVotingForRound(adminPage: AdminPage, roundNumber: number) {
  const supabaseStatus = await getSupabaseVotingStatusValue(roundNumber);

  if (supabaseStatus === "voting_closed") {
    return;
  }

  if (supabaseStatus && !CLOSEABLE_VOTING_STATUS_VALUES.includes(supabaseStatus)) {
    throw new Error(`Round ${roundNumber} cannot be closed from status ${supabaseStatus}.`);
  }

  if (!(await expectSupabaseVotingStatusIn(roundNumber, CLOSEABLE_VOTING_STATUSES))) {
    await adminPage.expectTextAfterNavigation("Voting open");
  }

  await adminPage.closeVoting();

  if (!(await expectSupabaseVotingStatus(roundNumber, "voting_closed"))) {
    await adminPage.expectTextAfterNavigation("Voting closed");
  }
}
