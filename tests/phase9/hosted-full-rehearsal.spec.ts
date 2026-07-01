import { test } from "@playwright/test";
import { requireBaseURL } from "./fixtures/phase9-env";
import {
  createAdminPage,
  openRehearsalPublicPages,
  releaseHostAndClosePages,
  runHostedRehearsal,
  startHostedRehearsal,
} from "./flows/rehearsal.flow";

test("hosted Supabase four-round rehearsal covers result reveal and CSV @full", async ({
  page,
  browser,
  request,
  baseURL,
}) => {
  const resolvedBaseURL = requireBaseURL(baseURL);
  const adminPage = createAdminPage(page, resolvedBaseURL);

  await startHostedRehearsal(adminPage, "Phase 9 hosted four-round rehearsal");
  const publicPages = await openRehearsalPublicPages(browser, resolvedBaseURL);

  try {
    await runHostedRehearsal({
      adminPage,
      baseURL: resolvedBaseURL,
      publicPages,
      request,
      rounds: [1, 2, 3, 4],
    });
  } finally {
    await releaseHostAndClosePages(adminPage, publicPages);
  }
});
