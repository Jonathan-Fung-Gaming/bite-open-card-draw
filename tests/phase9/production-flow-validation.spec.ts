import { test } from "@playwright/test";
import { requireBaseURL } from "./fixtures/phase9-env";
import { expectProductionFlowTestRoutesDisabled } from "./fixtures/production-flow-safety";

test("production-flow validation proves e2e routes are disabled @validate", async ({
  request,
  baseURL,
}) => {
  const resolvedBaseURL = requireBaseURL(baseURL);

  await expectProductionFlowTestRoutesDisabled(request, resolvedBaseURL);
});
