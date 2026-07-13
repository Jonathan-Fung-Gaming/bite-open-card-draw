import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  clickAdminActionAndWait,
  getAdminPassword,
  goto,
  loginAndTakeHost,
  openRehearsalControls,
} from "../e2e/admin-helpers";

const ADMIN_PASSWORD = getAdminPassword();
const IDENTITY_STORAGE_KEY = "bite-open-card-draw:startgg-identity:v1";

function normalizedEvidenceClient() {
  if (process.env.E2E_TOURNAMENT_STATE_BACKEND !== "supabase") {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Phase 1 Supabase evidence requires server-only Supabase credentials.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function submitNoBansBallot(page: Page, playerName: string) {
  await page.getByLabel("Select your start.gg username").selectOption({ label: playerName });
  await page.getByLabel(`I confirm that I am ${playerName}`).check();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByTestId("ballot-chart-card")).toHaveCount(7);
  await page.getByLabel("No bans for this set").check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("No bans for this set").check();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit Ballot" }).click();
  await expect(page.getByText("Ballot successfully submitted.")).toBeVisible();
}

async function expectNormalizedRerollEvidence(input: {
  expectedSupersededDraws: number;
  initialGeneration: number;
  reason: string;
  transitionKind: "reroll_round_set" | "reroll_full_round";
}) {
  const client = normalizedEvidenceClient();

  if (!client) {
    return;
  }

  const eventId = process.env.E2E_TOURNAMENT_EVENT_ID;

  if (!eventId) {
    throw new Error("Phase 1 Supabase evidence requires E2E_TOURNAMENT_EVENT_ID.");
  }

  const [drawsResult, ballotsResult, auditsResult, generationResult] = await Promise.all([
    client.from("draws").select("id,status,superseded_at").eq("event_id", eventId),
    client
      .from("ballots")
      .select("id,invalidated_at,invalidated_by_admin_action_id,invalidation_reason")
      .eq("event_id", eventId)
      .eq("round_number", 1),
    client
      .from("admin_actions")
      .select("id,action_type,mutation_request_id,reason")
      .eq("event_id", eventId)
      .eq("action_type", input.transitionKind)
      .eq("reason", input.reason),
    client
      .from("public_state_generations")
      .select("generation,transition_kind")
      .eq("event_id", eventId)
      .eq("round_number", 1)
      .single(),
  ]);

  for (const result of [drawsResult, ballotsResult, auditsResult, generationResult]) {
    expect(result.error).toBeNull();
  }

  const draws = drawsResult.data ?? [];
  expect(draws.filter((draw) => draw.status === "active")).toHaveLength(2);
  expect(draws.filter((draw) => draw.status === "superseded" && draw.superseded_at)).toHaveLength(
    input.expectedSupersededDraws,
  );
  expect(ballotsResult.data).toHaveLength(1);
  expect(ballotsResult.data?.[0]?.invalidated_at).toBeTruthy();
  expect(ballotsResult.data?.[0]?.invalidated_by_admin_action_id).toBeTruthy();
  expect(ballotsResult.data?.[0]?.invalidation_reason).toBe(input.reason);
  expect(auditsResult.data).toHaveLength(1);
  expect(auditsResult.data?.[0]?.mutation_request_id).toBeTruthy();
  expect(ballotsResult.data?.[0]?.invalidated_by_admin_action_id).toBe(auditsResult.data?.[0]?.id);
  expect(generationResult.data?.generation).toBe(input.initialGeneration + 1);
  expect(generationResult.data?.transition_kind).toBe(input.transitionKind);
}

function hostRunButton(page: Page, name: string | RegExp) {
  return page.getByTestId("admin-host-run-controls").getByRole("button", { name });
}

async function startFreshOpenRound(adminPage: Page, reason: string) {
  const rehearsalForm = adminPage
    .getByTestId("admin-rehearsal-controls")
    .locator("form", { has: adminPage.getByRole("button", { name: "Start Rehearsal" }) })
    .first();

  await rehearsalForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await rehearsalForm.getByPlaceholder("Audit reason").fill(reason);
  await clickAdminActionAndWait(
    adminPage,
    rehearsalForm.getByRole("button", { name: "Start Rehearsal" }),
  );
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(0));
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Draw Set").nth(1));
  await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Open Voting"));
}

async function submitDangerousReroll(form: ReturnType<Page["locator"]>, reason: string) {
  const details = form.locator("xpath=ancestor::details[1]");

  if (!(await details.getAttribute("open"))) {
    await details.locator("summary").click();
  }

  await form.getByLabel("Audit reason").fill(reason);
  await form.getByLabel("Admin password").fill(ADMIN_PASSWORD);
  await clickAdminActionAndWait(form.page(), form.getByRole("button", { name: /Confirm/ }));
}

test("@phase1 set and full-round reroll forms replace exactly their active draws", async ({
  page: adminPage,
  browser,
}) => {
  const publicContexts: BrowserContext[] = [];
  let testError: unknown = null;

  try {
    await loginAndTakeHost(adminPage);
    await openRehearsalControls(adminPage);

    for (const rerollKind of ["set", "full"] as const) {
      await startFreshOpenRound(adminPage, `Phase 1 ${rerollKind} reroll transaction evidence`);

      const voteContext = await browser.newContext();
      publicContexts.push(voteContext);
      const votePage = await voteContext.newPage();
      await goto(votePage, "/vote");
      await submitNoBansBallot(votePage, "Rehearsal Player 01");
      const guard = votePage.getByTestId("vote-route-freshness-guard");
      const initialGeneration = Number(
        await guard.getAttribute("data-accepted-public-state-generation"),
      );
      const initialDrawKey = await guard.getAttribute("data-accepted-active-draw-key");
      expect(initialDrawKey).toBeTruthy();
      expect(initialDrawKey?.split("|")).toHaveLength(2);

      const transitionKind =
        rerollKind === "set" ? ("reroll_round_set" as const) : ("reroll_full_round" as const);
      const reason = `Phase 1 ${rerollKind} reroll transaction evidence`;

      if (rerollKind === "set") {
        const form = adminPage
          .getByText("Reroll this set", { exact: true })
          .first()
          .locator("..")
          .locator("form");

        await submitDangerousReroll(form, reason);
      } else {
        const form = adminPage
          .getByText("Reroll full round", { exact: true })
          .first()
          .locator("..")
          .locator("form");

        await submitDangerousReroll(form, reason);
      }

      await expect(
        adminPage.getByTestId("admin-host-run-controls").getByText("Ready to vote", {
          exact: true,
        }),
      ).toBeVisible();

      await expectNormalizedRerollEvidence({
        expectedSupersededDraws: rerollKind === "set" ? 1 : 2,
        initialGeneration,
        reason,
        transitionKind,
      });

      await clickAdminActionAndWait(adminPage, hostRunButton(adminPage, "Open Voting"));
      await expect
        .poll(
          async () => Number(await guard.getAttribute("data-accepted-public-state-generation")),
          { timeout: 30_000 },
        )
        .toBeGreaterThan(initialGeneration);

      const nextDrawKey = await guard.getAttribute("data-accepted-active-draw-key");
      const initialDrawEntries = new Set(initialDrawKey?.split("|") ?? []);
      const nextDrawEntries = new Set(nextDrawKey?.split("|") ?? []);
      const unchangedEntries = [...initialDrawEntries].filter((entry) =>
        nextDrawEntries.has(entry),
      );

      expect(nextDrawEntries.size).toBe(2);
      expect(unchangedEntries).toHaveLength(rerollKind === "set" ? 1 : 0);
      await expect(votePage.getByText("Ballot successfully submitted.")).toHaveCount(0);
      await expect(votePage.getByText("0 ban selection(s)")).toHaveCount(
        rerollKind === "set" ? 1 : 2,
      );
      await votePage
        .getByRole("button", { name: /^Edit / })
        .first()
        .click();
      await expect(votePage.getByTestId("ballot-chart-card")).toHaveCount(7);
      await expect
        .poll(() =>
          votePage.evaluate((storageKey) => {
            const stored = window.localStorage.getItem(storageKey);

            return stored ? (JSON.parse(stored) as unknown) : null;
          }, IDENTITY_STORAGE_KEY),
        )
        .toMatchObject({ locked: true, startggUsername: "Rehearsal Player 01" });

      await voteContext.close();
    }
  } catch (error) {
    testError = error;
    throw error;
  } finally {
    await Promise.all(publicContexts.map((context) => context.close().catch(() => undefined)));

    if (!adminPage.isClosed()) {
      const release = hostRunButton(adminPage, "Release");

      if (await release.isEnabled().catch(() => false)) {
        try {
          await clickAdminActionAndWait(adminPage, release);
        } catch (cleanupError) {
          if (!testError) {
            throw cleanupError;
          }
        }
      }
    }
  }
});
