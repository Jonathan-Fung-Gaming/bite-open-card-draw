import { test } from "@playwright/test";
import { requireBaseURL } from "./fixtures/phase9-env";
import {
  createAdminPage,
  openRehearsalPublicPages,
  releaseHostAndClosePages,
  runHostedRehearsal,
  startHostedRehearsal,
} from "./flows/rehearsal.flow";

test("hosted one-round rehearsal smoke @smoke", async ({ page, browser, request, baseURL }) => {
  const resolvedBaseURL = requireBaseURL(baseURL);
  const adminPage = createAdminPage(page, resolvedBaseURL);

  await startHostedRehearsal(adminPage, "Phase 9 hosted one-round smoke");
  const publicPages = await openRehearsalPublicPages(browser, resolvedBaseURL);

  try {
    await runHostedRehearsal({
      adminPage,
      baseURL: resolvedBaseURL,
      publicPages,
      request,
      rounds: [1],
    });
  } finally {
    await releaseHostAndClosePages(adminPage, publicPages);
  }
});
