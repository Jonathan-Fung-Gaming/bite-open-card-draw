import type { RoundResultSnapshot } from "@/lib/results/result-engine";
import type { VotingRoundStatus } from "./voting-window";

export const VOTE_LIVE_POLL_INTERVAL_MS = 5_000;
export const VOTER_PRESENCE_REFRESH_INTERVAL_MS = 45_000;
export const VOTE_PAGE_REFRESH_INTERVAL_MS = 8_000;
export const STAGE_PUBLIC_REFRESH_INTERVAL_MS = 5_000;
export const STAGE_REVEAL_REFRESH_INTERVAL_MS = 8_000;
export const PUBLIC_INSPECTION_REFRESH_INTERVAL_MS = 10_000;

const SAVE_FAILURE_REASSURANCE = "Previous server-confirmed ballot remains valid.";

export function shouldShowFinalPhoneResults(
  status: VotingRoundStatus,
  resultPhase: RoundResultSnapshot["revealPhase"] | null | undefined,
) {
  return resultPhase === "final" && (status === "results_revealed" || status === "round_complete");
}

export function shouldShowPhoneResultHoldingState(
  status: VotingRoundStatus,
  resultPhase: RoundResultSnapshot["revealPhase"] | null | undefined,
) {
  if (
    status === "voting_closed" ||
    status === "results_computed" ||
    status === "results_revealing"
  ) {
    return true;
  }

  return (status === "results_revealed" || status === "round_complete") && resultPhase !== "final";
}

export function formatBallotSaveFailureMessage(message: string, hasServerConfirmedBallot: boolean) {
  if (!hasServerConfirmedBallot || message.includes(SAVE_FAILURE_REASSURANCE)) {
    return message;
  }

  return `${message} ${SAVE_FAILURE_REASSURANCE}`;
}
