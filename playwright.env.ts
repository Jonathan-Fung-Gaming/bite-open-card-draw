import { createHash, randomBytes, scryptSync } from "node:crypto";

export const e2ePort = Number(process.env.E2E_PORT ?? 3100);
export const e2eBaseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;
export const e2eAdminPassword = `e2e-${createHash("sha256").update("bite-open-card-draw-e2e").digest("hex").slice(0, 16)}`;
export const e2eTestRouteToken =
  process.env.E2E_TEST_ROUTE_TOKEN ??
  process.env.TOURNAMENT_TEST_ROUTE_TOKEN ??
  `test-route-${randomBytes(24).toString("hex")}`;

const adminPasswordSalt = randomBytes(16).toString("hex");
const disposableEventIdPattern = /^(e2e|phase9|load|rehearsal)-[a-z0-9-]+$/i;
const e2eProfile = process.env.E2E_PROFILE ?? "legacy";
const usesHarnessConfig = process.argv.some(
  (arg) => arg.includes("playwright.phase9.config") || arg.includes("playwright.load.config"),
);
const usesPhase9Full = process.argv.some((arg) => arg.includes("@full"));

function getProfileDefaults() {
  if (e2eProfile === "memory-dev-smoke") {
    return {
      backend: "memory",
      serverMode: "dev",
      disableAdminSessionHeartbeat: "true",
      disableHostHeartbeat: "true",
      disableVoteLivePolling: "true",
      disablePublicRefresh: "false",
      allowE2eRoutes: "true",
      allowMemoryBackend: "true",
      phase9BallotMode: undefined,
    };
  }

  if (e2eProfile === "supabase-dev-rehearsal") {
    return {
      backend: "supabase",
      serverMode: "dev",
      disableAdminSessionHeartbeat: "true",
      disableHostHeartbeat: "true",
      disableVoteLivePolling: "true",
      disablePublicRefresh: "false",
      allowE2eRoutes: "true",
      allowMemoryBackend: "false",
      phase9BallotMode: "ui",
    };
  }

  if (e2eProfile === "production-flow") {
    return {
      backend: "supabase",
      serverMode: "start",
      disableAdminSessionHeartbeat: "false",
      disableHostHeartbeat: "false",
      disableVoteLivePolling: "false",
      disablePublicRefresh: "false",
      allowE2eRoutes: "false",
      allowMemoryBackend: "false",
      phase9BallotMode: "ui",
    };
  }

  return {
    backend: usesPhase9Full ? "supabase" : "memory",
    serverMode: usesHarnessConfig ? "dev" : "start",
    disableAdminSessionHeartbeat: "true",
    disableHostHeartbeat: "true",
    disableVoteLivePolling: "true",
    disablePublicRefresh: "false",
    allowE2eRoutes: "true",
    allowMemoryBackend: "true",
    phase9BallotMode: usesPhase9Full ? "ui" : undefined,
  };
}

function normalizeServerMode(value: string) {
  if (value !== "dev" && value !== "start" && value !== "external") {
    throw new Error(`Unsupported E2E_SERVER_MODE="${value}". Use dev, start, or external.`);
  }

  return value;
}

function isLocalBaseURL(value: string) {
  try {
    const url = new URL(value);

    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

const profileDefaults = getProfileDefaults();
const e2eTournamentStateBackend =
  process.env.E2E_TOURNAMENT_STATE_BACKEND ?? profileDefaults.backend;
const e2eServerMode = normalizeServerMode(
  process.env.E2E_SERVER_MODE ?? profileDefaults.serverMode,
);
const isSupabaseE2e = e2eTournamentStateBackend === "supabase";
const hostedSupabaseUrl =
  process.env.E2E_NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const hostedSupabaseAnonKey =
  process.env.E2E_NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hostedSupabaseServiceRoleKey =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const explicitE2eTournamentEventId = process.env.E2E_TOURNAMENT_EVENT_ID;
const e2eTournamentEventId =
  explicitE2eTournamentEventId ?? (isSupabaseE2e ? undefined : process.env.TOURNAMENT_EVENT_ID);
const e2ePhase9BallotMode = process.env.E2E_PHASE9_BALLOT_MODE ?? profileDefaults.phase9BallotMode;
const e2eDisableAdminSessionHeartbeat =
  process.env.NEXT_PUBLIC_E2E_DISABLE_ADMIN_SESSION_HEARTBEAT ??
  profileDefaults.disableAdminSessionHeartbeat;
const e2eDisableHostHeartbeat =
  process.env.NEXT_PUBLIC_E2E_DISABLE_HOST_HEARTBEAT ?? profileDefaults.disableHostHeartbeat;
const e2eDisableVoteLivePolling =
  process.env.NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING ?? profileDefaults.disableVoteLivePolling;
const e2eDisablePublicRefresh =
  process.env.NEXT_PUBLIC_E2E_DISABLE_PUBLIC_REFRESH ?? profileDefaults.disablePublicRefresh;
const e2eAllowE2eRoutes =
  process.env.TOURNAMENT_TEST_ALLOW_E2E_ROUTES ?? profileDefaults.allowE2eRoutes;
const e2eAllowMemoryBackend =
  process.env.TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND ?? profileDefaults.allowMemoryBackend;
const e2eAllowLocalPublicUrl =
  process.env.TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL ??
  (isLocalBaseURL(e2eBaseURL) ? "true" : "false");
const e2eUseAdminActionsOnly =
  process.env.E2E_USE_ADMIN_ACTIONS_ONLY ?? (e2eProfile === "production-flow" ? "true" : "false");

if (e2eProfile === "production-flow") {
  const errors: string[] = [];

  if (e2eTournamentStateBackend !== "supabase") {
    errors.push(`backend must be supabase, got ${e2eTournamentStateBackend}.`);
  }

  if (e2eServerMode !== "start" && e2eServerMode !== "external") {
    errors.push(`serverMode must be start or external, got ${e2eServerMode}.`);
  }

  if (!explicitE2eTournamentEventId) {
    errors.push("E2E_TOURNAMENT_EVENT_ID must be explicit.");
  }

  if (e2eDisableAdminSessionHeartbeat === "true") {
    errors.push("admin session heartbeat must be enabled.");
  }

  if (e2eDisableHostHeartbeat === "true") {
    errors.push("host heartbeat must be enabled.");
  }

  if (e2eDisableVoteLivePolling === "true") {
    errors.push("vote live polling must be enabled.");
  }

  if (e2eDisablePublicRefresh === "true") {
    errors.push("public route refresh must be enabled.");
  }

  if (e2ePhase9BallotMode !== "ui") {
    errors.push(`E2E_PHASE9_BALLOT_MODE must be ui, got ${e2ePhase9BallotMode ?? "unset"}.`);
  }

  if (e2eUseAdminActionsOnly !== "true") {
    errors.push("E2E_USE_ADMIN_ACTIONS_ONLY=true is required.");
  }

  if (errors.length > 0) {
    throw new Error(
      `production-flow Playwright environment is not production-like: ${errors.join(" ")}`,
    );
  }
}

process.env.E2E_SERVER_MODE = e2eServerMode;
process.env.E2E_PROFILE = e2eProfile;
process.env.E2E_TOURNAMENT_STATE_BACKEND = e2eTournamentStateBackend;
process.env.TOURNAMENT_STATE_BACKEND = e2eTournamentStateBackend;
if (e2ePhase9BallotMode) {
  process.env.E2E_PHASE9_BALLOT_MODE = e2ePhase9BallotMode;
}
if (e2eTournamentEventId) {
  process.env.E2E_TOURNAMENT_EVENT_ID = e2eTournamentEventId;
  process.env.TOURNAMENT_EVENT_ID = e2eTournamentEventId;
}

if (isSupabaseE2e) {
  if (!explicitE2eTournamentEventId) {
    throw new Error("Missing explicit E2E_TOURNAMENT_EVENT_ID for Supabase Playwright rehearsal.");
  }

  if (!disposableEventIdPattern.test(explicitE2eTournamentEventId)) {
    throw new Error(
      "Supabase Playwright rehearsal event id must start with e2e-, phase9-, load-, or rehearsal-.",
    );
  }

  if (process.env.E2E_ALLOW_DESTRUCTIVE_RESET !== "true") {
    throw new Error("Set E2E_ALLOW_DESTRUCTIVE_RESET=true to run Supabase rehearsal resets.");
  }

  for (const [name, value] of [
    ["NEXT_PUBLIC_SUPABASE_URL", hostedSupabaseUrl],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", hostedSupabaseAnonKey],
    ["SUPABASE_SERVICE_ROLE_KEY", hostedSupabaseServiceRoleKey],
    ["TOURNAMENT_EVENT_ID", e2eTournamentEventId],
  ] as const) {
    if (!value) {
      throw new Error(`Missing ${name} for Supabase Playwright rehearsal.`);
    }
  }
}

const e2eSupabaseUrl = (isSupabaseE2e ? hostedSupabaseUrl : undefined) ?? "http://127.0.0.1:54321";
const e2eSupabaseAnonKey = (isSupabaseE2e ? hostedSupabaseAnonKey : undefined) ?? "local-anon-key";
const e2eSupabaseServiceRoleKey =
  (isSupabaseE2e ? hostedSupabaseServiceRoleKey : undefined) ??
  `test-only-${randomBytes(12).toString("hex")}`;

export const e2eAdminPasswordHash = `scrypt:v1:${adminPasswordSalt}:${scryptSync(
  e2eAdminPassword,
  adminPasswordSalt,
  64,
).toString("hex")}`;

process.env.E2E_ADMIN_PASSWORD = e2eAdminPassword;
process.env.E2E_TEST_ROUTE_TOKEN = e2eTestRouteToken;
process.env.TOURNAMENT_TEST_ROUTE_TOKEN = e2eTestRouteToken;
process.env.NEXT_PUBLIC_E2E_DISABLE_ADMIN_SESSION_HEARTBEAT = e2eDisableAdminSessionHeartbeat;
process.env.NEXT_PUBLIC_E2E_DISABLE_HOST_HEARTBEAT = e2eDisableHostHeartbeat;
process.env.NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING = e2eDisableVoteLivePolling;
process.env.NEXT_PUBLIC_E2E_DISABLE_PUBLIC_REFRESH = e2eDisablePublicRefresh;
process.env.E2E_USE_ADMIN_ACTIONS_ONLY = e2eUseAdminActionsOnly;

export const e2eWebServer =
  e2eServerMode === "external"
    ? undefined
    : {
        command:
          e2eServerMode === "dev"
            ? `npx next dev --hostname 127.0.0.1 --port ${e2ePort}`
            : `npm run start -- --hostname 127.0.0.1 --port ${e2ePort}`,
        url: e2eBaseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          NODE_ENV: e2eServerMode === "dev" ? "development" : "production",
          E2E_PROFILE: e2eProfile,
          ...(e2ePhase9BallotMode ? { E2E_PHASE9_BALLOT_MODE: e2ePhase9BallotMode } : {}),
          E2E_USE_ADMIN_ACTIONS_ONLY: e2eUseAdminActionsOnly,
          NEXT_PUBLIC_E2E_DISABLE_ADMIN_SESSION_HEARTBEAT: e2eDisableAdminSessionHeartbeat,
          NEXT_PUBLIC_E2E_DISABLE_HOST_HEARTBEAT: e2eDisableHostHeartbeat,
          NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING: e2eDisableVoteLivePolling,
          NEXT_PUBLIC_E2E_DISABLE_PUBLIC_REFRESH: e2eDisablePublicRefresh,
          NEXT_PUBLIC_SITE_URL: e2eBaseURL,
          NEXT_PUBLIC_SUPABASE_URL: e2eSupabaseUrl,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: e2eSupabaseAnonKey,
          SUPABASE_SERVICE_ROLE_KEY: e2eSupabaseServiceRoleKey,
          ADMIN_PASSWORD_HASH: e2eAdminPasswordHash,
          SESSION_SECRET: randomBytes(32).toString("hex"),
          TOURNAMENT_STATE_BACKEND: e2eTournamentStateBackend,
          ...(e2eTournamentEventId ? { TOURNAMENT_EVENT_ID: e2eTournamentEventId } : {}),
          TOURNAMENT_TEST_ALLOW_E2E_ROUTES: e2eAllowE2eRoutes,
          TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND: e2eAllowMemoryBackend,
          TOURNAMENT_TEST_ROUTE_TOKEN: e2eTestRouteToken,
          TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL: e2eAllowLocalPublicUrl,
          TOURNAMENT_TEST_PUBLIC_SITE_URL: e2eBaseURL,
        },
      };
