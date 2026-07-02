import "server-only";
import { isProductionDeploymentEnv } from "@/lib/server/env";

type TestRouteEnv = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  TOURNAMENT_TEST_ROUTE_TOKEN?: string;
  TOURNAMENT_TEST_ALLOW_E2E_ROUTES?: string;
  TOURNAMENT_STATE_BACKEND?: string;
  TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND?: string;
};

export function isE2eTestRouteAvailable(
  request: Request,
  env: TestRouteEnv = process.env,
) {
  if (isProductionDeploymentEnv(env)) {
    return false;
  }

  const token = env.TOURNAMENT_TEST_ROUTE_TOKEN;

  if (!token || request.headers.get("x-tournament-test-token") !== token) {
    return false;
  }

  return (
    env.TOURNAMENT_TEST_ALLOW_E2E_ROUTES === "true" ||
    (env.TOURNAMENT_STATE_BACKEND === "memory" &&
      env.TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND === "true")
  );
}
