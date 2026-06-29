import type { RoundResultSnapshot } from "@/lib/results/result-engine";
import type { VotingRoundStatus } from "./voting-window";

export function shouldShowFinalPhoneResults(
  status: VotingRoundStatus,
  resultPhase: RoundResultSnapshot["revealPhase"] | null | undefined,
) {
  return resultPhase === "final" && (status === "results_revealed" || status === "round_complete");
}
