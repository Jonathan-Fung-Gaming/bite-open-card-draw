"use server";

import { adminState } from "@/lib/server/admin-state";
import type { SubmitRoundBallotInput } from "@/lib/vote/ballot";

export async function getExistingBallotAction(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  return adminState.ballotStore.get(roundNumber, playerId);
}

export async function submitRoundBallotAction(input: SubmitRoundBallotInput) {
  const draws = adminState.drawStateStore
    .getRoundDraws(input.roundNumber)
    .filter((draw): draw is NonNullable<typeof draw> => draw !== null);

  return adminState.ballotStore.submit(input, draws);
}
