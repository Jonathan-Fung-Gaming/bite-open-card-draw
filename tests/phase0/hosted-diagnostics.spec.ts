import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { ADMIN_PASSWORD, clickServerAction, requireBaseURL } from "../phase9/fixtures/phase9-env";
import {
  getSupabaseE2eConfig,
  installSupabaseRehearsalState,
} from "../phase9/fixtures/supabase-state";
import { startHostedRehearsal } from "../phase9/flows/rehearsal.flow";
import { AdminPage } from "../phase9/pages/admin.page";
import { writeSafeDiagnosticEvidence } from "./diagnostic-evidence";

test.describe.configure({ mode: "serial" });

const PUBLIC_PATHS = new Set(["/stage", "/room", "/vote", "/charts", "/results"]);

function percentile(samples: readonly number[], percentileValue: number) {
  const ordered = [...samples].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentileValue / 100) * ordered.length) - 1);

  return Math.round((ordered[index] ?? 0) * 100) / 100;
}

function parseTimerSeconds(text: string | null) {
  const match = text?.match(/(\d{2}):(\d{2})/);

  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function normalizeTimestamp(value: string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function observePublicResponses(page: Page) {
  const responses: Array<{ method: string; path: string; sequence: number; status: number }> = [];
  const errors: Array<{ digest: string | null; errorClass: string }> = [];

  page.on("response", async (response) => {
    const url = new URL(response.url());

    if (response.status() >= 500) {
      const responseText = await response.text().catch(() => "");
      errors.push({
        digest: responseText.match(/digest[^a-z0-9-]+([a-z0-9-]+)/i)?.[1] ?? null,
        errorClass: "RscResponseError",
      });
    }

    if (PUBLIC_PATHS.has(url.pathname) || url.searchParams.has("_rsc")) {
      responses.push({
        method: response.request().method(),
        path: url.pathname,
        sequence: responses.length + 1,
        status: response.status(),
      });
    }
  });
  page.on("pageerror", (error) => {
    errors.push({
      digest: error.message.match(/digest[=: ]+([a-z0-9-]+)/i)?.[1] ?? null,
      errorClass: error.name || "Error",
    });
  });

  return { errors, responses };
}

async function collectHostedState() {
  const config = getSupabaseE2eConfig();

  if (!config) {
    throw new Error("Hosted Phase 0 diagnostics require the Supabase backend.");
  }

  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const [draws, voting, result] = await Promise.all([
    supabase
      .from("draws")
      .select("id,draw_version,status")
      .eq("event_id", config.eventId)
      .eq("status", "active")
      .order("draw_version", { ascending: true }),
    supabase
      .from("voting_windows")
      .select("round_number,status,closes_at,updated_at")
      .eq("event_id", config.eventId)
      .eq("round_number", 1)
      .maybeSingle(),
    supabase
      .from("result_snapshots")
      .select("id,reveal_phase")
      .eq("event_id", config.eventId)
      .eq("round_number", 1)
      .maybeSingle(),
  ]);

  for (const [label, query] of [
    ["draws", draws],
    ["voting", voting],
    ["result", result],
  ] as const) {
    if (query.error) {
      throw new Error(`Could not collect Phase 0 ${label} state: ${query.error.message}`);
    }
  }

  return {
    roundNumber: 1,
    draws: (draws.data ?? []).map((draw) => ({
      drawId: draw.id,
      drawVersion: draw.draw_version,
      drawStatus: draw.status,
    })),
    votingStatus: voting.data?.status ?? null,
    deadline: normalizeTimestamp(voting.data?.closes_at),
    freshnessObservedAt: normalizeTimestamp(voting.data?.updated_at),
    resultId: result.data?.id ?? null,
    resultPhase: result.data?.reveal_phase ?? null,
  };
}

async function rerollCurrentRoundAfterVoting(admin: AdminPage) {
  await admin.expectActiveHostForEvidence();
  await admin.openSecondaryPanels();
  const details = admin.page
    .getByTestId("admin-secondary-panels")
    .locator("details", { hasText: "Reroll full round" })
    .first();

  await expect(details).toHaveCount(1);
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.locator("summary").click();
  }

  const form = details.locator("form", {
    has: admin.page.getByRole("button", { name: "Confirm Round Reroll" }),
  });
  await form.locator("textarea[name='reason']").fill("Phase 0 post-open reroll diagnostic");
  await form.locator("input[name='adminPassword']").fill(ADMIN_PASSWORD);
  await clickServerAction(
    admin.page,
    form.getByRole("button", { name: "Confirm Round Reroll" }),
    0,
    { requireServerActionResponse: true, responseTimeoutMs: 60_000, submitForm: true },
  );
}

async function seedSupportedTiebreaks(admin: AdminPage) {
  await admin.loginAndTakeHost();
  await admin.openSecondaryPanels();
  const seedForm = admin.page.locator("form", {
    has: admin.page.getByRole("button", { name: "Seed Tiebreak" }),
  });

  await expect(seedForm).toHaveCount(1);
  await seedForm.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await seedForm.getByPlaceholder("Audit reason").fill("Phase 0 supported tiebreak diagnostic");
  await clickServerAction(admin.page, seedForm.getByRole("button", { name: "Seed Tiebreak" }));
}

async function collectAggregateRosterCounts() {
  const config = getSupabaseE2eConfig();

  if (!config) {
    throw new Error("Hosted Phase 0 diagnostics require the Supabase backend.");
  }

  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const [active, inactive, total] = await Promise.all([
    supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("event_id", config.eventId)
      .eq("active", true),
    supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("event_id", config.eventId)
      .eq("active", false),
    supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("event_id", config.eventId),
  ]);

  if (active.error || inactive.error || total.error) {
    throw new Error("Could not collect aggregate Phase 0 roster counts.");
  }

  return {
    activePlayerCount: active.count ?? 0,
    inactivePlayerCount: inactive.count ?? 0,
    totalPlayerCount: total.count ?? 0,
  };
}

function requirePhase0HostedConfig() {
  const config = getSupabaseE2eConfig();

  if (!config) {
    throw new Error("Hosted Phase 0 diagnostics require the Supabase profile.");
  }

  expect(config.eventId).toMatch(/^phase0-[a-z0-9-]+$/i);
  expect(process.env.E2E_PHASE0_EVENT_ID_DIFFERS_FROM_CONFIGURED).toBe("true");

  return config;
}

test("collects disposable hosted transition, timer, and RSC diagnostics @phase0-hosted @phase0-transition", async ({
  page,
  baseURL,
}, testInfo) => {
  requirePhase0HostedConfig();

  const resolvedBaseURL = requireBaseURL(baseURL);
  const admin = new AdminPage(page, resolvedBaseURL);
  const observerPage = await page.context().newPage();
  const stagePage = await page.context().newPage();
  const votePage = await page.context().newPage();
  const observer = observePublicResponses(observerPage);
  const adminObserver = observePublicResponses(page);
  page.on("download", (download) => {
    void download.cancel();
  });
  let releaseAttempted = false;

  try {
    await startHostedRehearsal(admin, "Phase 0 disposable hosted diagnostics");
    await admin.drawCurrentRound(1);
    await admin.openVoting();
    await stagePage.goto("/stage", { waitUntil: "domcontentloaded" });
    await votePage.goto("/vote", { waitUntil: "domcontentloaded" });
    await observerPage.goto("/charts", { waitUntil: "domcontentloaded" });

    const beforeReroll = await collectHostedState();
    const [stageTimerText, voteHeaderText] = await Promise.all([
      stagePage.getByTestId("stage-countdown-display").textContent(),
      votePage.getByTestId("vote-dense-header").textContent(),
    ]);
    const stageSeconds = parseTimerSeconds(stageTimerText);
    const phoneSeconds = parseTimerSeconds(voteHeaderText);
    const skewSeconds =
      stageSeconds === null || phoneSeconds === null ? null : Math.abs(stageSeconds - phoneSeconds);

    const transitionFailures: Array<{ errorClass: string; observationPhase: string }> = [];
    await rerollCurrentRoundAfterVoting(admin).catch((error: unknown) => {
      transitionFailures.push({
        errorClass: error instanceof Error ? error.name || "Error" : "UnknownError",
        observationPhase: "reroll",
      });
    });
    const afterReroll = await collectHostedState();
    await admin.openVoting().catch((error: unknown) => {
      transitionFailures.push({
        errorClass: error instanceof Error ? error.name || "Error" : "UnknownError",
        observationPhase: "restart",
      });
    });
    await observerPage.goto("/charts", { waitUntil: "domcontentloaded" });
    const afterRestart = await collectHostedState();

    await startHostedRehearsal(admin, "Phase 0 supported tiebreak transition diagnostics");
    await admin.drawCurrentRound(1);
    await admin.openVoting();
    await seedSupportedTiebreaks(admin);

    await admin.closeVoting();
    await admin.computeResults();
    const revealPhases: Array<{
      resultPhase: string;
      state: Awaited<ReturnType<typeof collectHostedState>>;
    }> = [];
    await admin.advanceToFinalReveal(1, {
      afterRevealPhase: async (phase) => {
        revealPhases.push({ resultPhase: phase, state: await collectHostedState() });
        await observerPage.goto("/results", { waitUntil: "domcontentloaded" });
      },
    });
    const afterStageConfirmation = await collectHostedState();

    await writeSafeDiagnosticEvidence(testInfo, "phase0-hosted-transitions.json", {
      collectionSucceeded: true,
      eventIdPrefix: "phase0-",
      eventIdDiffersFromConfigured: true,
      countdown: { skewSeconds, stageSeconds, phoneSeconds },
      transitions: {
        beforeReroll,
        afterReroll,
        afterRestart,
        failures: transitionFailures,
        revealPhases,
        afterStageConfirmation,
      },
      publicResponses: observer.responses,
      publicErrors: [...observer.errors, ...adminObserver.errors],
    });
  } finally {
    await Promise.all([observerPage.close(), stagePage.close(), votePage.close()]);
    try {
      await admin.releaseHost();
      releaseAttempted = true;
    } catch {
      releaseAttempted = true;
    }
    expect(releaseAttempted).toBe(true);
  }
});

test("collects a disposable hosted direct-database roster floor @phase0-hosted @phase0-roster", async ({}, testInfo) => {
  const config = requirePhase0HostedConfig();
  await installSupabaseRehearsalState({
    reason: "Phase 0 disposable direct-database roster baseline",
  });

  const diagnosticPlayers = Array.from(
    { length: 30 },
    (_, index) => `Phase Zero Diagnostic ${String(index + 1).padStart(2, "0")}`,
  );
  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const observer = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const now = new Date().toISOString();
  const { error: seedError } = await supabase.from("players").insert(
    diagnosticPlayers.map((playerName) => ({
      id: randomUUID(),
      event_id: config.eventId,
      startgg_username: playerName,
      startgg_username_normalized: playerName.toLowerCase(),
      active: true,
      has_tournament_history: false,
      created_at: now,
      updated_at: now,
    })),
  );

  expect(seedError).toBeNull();
  const workflowStartedAt = performance.now();
  const mutationResults = await Promise.all(
    diagnosticPlayers.map(async (playerName) => {
      const startedAt = performance.now();
      const { error } = await supabase
        .from("players")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("event_id", config.eventId)
        .eq("startgg_username", playerName);

      return {
        errorClass: error ? "DatabaseMutationError" : null,
        latencyMs: performance.now() - startedAt,
      };
    }),
  );
  const totalMs = performance.now() - workflowStartedAt;
  const latenciesMs = mutationResults
    .filter((result) => result.errorClass === null)
    .map((result) => result.latencyMs);
  const failures = mutationResults
    .filter((result) => result.errorClass !== null)
    .map((result) => ({ errorClass: result.errorClass! }));
  const propagationStartedAt = performance.now();
  const { count: observedInactiveCount, error: observerError } = await observer
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("event_id", config.eventId)
    .eq("active", false);
  const propagationMs = performance.now() - propagationStartedAt;
  const rosterCounts = await collectAggregateRosterCounts();

  expect(observerError).toBeNull();
  expect(observedInactiveCount).toBe(latenciesMs.length);
  await writeSafeDiagnosticEvidence(testInfo, "phase0-hosted-roster-floor.json", {
    collectionSucceeded: true,
    eventIdPrefix: "phase0-",
    eventIdDiffersFromConfigured: true,
    roster: {
      observationPhase: "direct_database",
      actionCount: diagnosticPlayers.length,
      confirmedActionCount: latenciesMs.length,
      ...rosterCounts,
      failures,
      latenciesMs,
      p50Ms: percentile(latenciesMs, 50),
      p95Ms: percentile(latenciesMs, 95),
      totalMs,
      propagationMs,
    },
  });
});
