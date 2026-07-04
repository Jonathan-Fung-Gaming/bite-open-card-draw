import { expect, type APIRequestContext } from "@playwright/test";
import { getTestRouteHeaders, route } from "./phase9-env";

function routeProbeHeaders() {
  return [
    undefined,
    getTestRouteHeaders(),
    process.env.E2E_DEPLOYED_TEST_ROUTE_TOKEN
      ? { "x-tournament-test-token": process.env.E2E_DEPLOYED_TEST_ROUTE_TOKEN }
      : undefined,
  ];
}

export async function expectProductionFlowTestRoutesDisabled(
  request: APIRequestContext,
  baseURL: string,
) {
  const probeHeaders = routeProbeHeaders();

  for (const headers of probeHeaders) {
    const privateCsvResponse = await request.get(
      route(baseURL, "/api/e2e/private-csv?roundNumber=1"),
      { headers },
    );

    expect(privateCsvResponse.status()).toBe(404);

    const loadBallotResponse = await request.post(route(baseURL, "/api/e2e/load-ballot"), {
      data: {
        playerStartggUsername: "Rehearsal Player 01",
        revision: 1,
        roundNumber: 1,
      },
      headers,
    });

    expect(loadBallotResponse.status()).toBe(404);
  }
}
