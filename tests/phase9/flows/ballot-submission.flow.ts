import { expect, type APIRequestContext } from "@playwright/test";
import { getTestRouteHeaders, route } from "../fixtures/phase9-env";
import { expectSupabaseBallotsAtLeast } from "../fixtures/supabase-state";

async function submitBallot(
  request: APIRequestContext,
  baseURL: string,
  roundNumber: number,
  playerStartggUsername: string,
  revision: 1 | 2 = 1,
) {
  const response = await request.post(route(baseURL, "/api/e2e/load-ballot"), {
    headers: getTestRouteHeaders(),
    data: {
      roundNumber,
      playerStartggUsername,
      revision,
    },
  });
  const payload = (await response.json()) as { error?: string; revision?: number };

  expect(
    response.ok(),
    `Round ${roundNumber} ${playerStartggUsername} revision ${revision}: ${payload.error ?? "ok"}`,
  ).toBe(true);
  expect(payload.revision).toBe(revision);
}

export async function submitRehearsalBallots(
  request: APIRequestContext,
  baseURL: string,
  roundNumber: number,
) {
  await submitBallot(request, baseURL, roundNumber, "Rehearsal Player 01", 1);
  await submitBallot(request, baseURL, roundNumber, "Rehearsal Player 01", 2);
  await submitBallot(request, baseURL, roundNumber, "Rehearsal Player 02", 1);
  await expectSupabaseBallotsAtLeast(roundNumber, 2);
}
