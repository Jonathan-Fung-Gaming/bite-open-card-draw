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
const usesHarnessConfig = process.argv.some(
  (arg) =>
    arg.includes("playwright.phase9.config") || arg.includes("playwright.load.config"),
);
const usesPhase9Full = process.argv.some((arg) => arg.includes("@full"));
const e2eTournamentStateBackend =
  process.env.E2E_TOURNAMENT_STATE_BACKEND ?? (usesPhase9Full ? "supabase" : "memory");
const e2eServerMode =
  process.env.E2E_SERVER_MODE === "dev" || (!process.env.E2E_SERVER_MODE && usesHarnessConfig)
    ? "dev"
    : "start";
const isSupabaseE2e = e2eTournamentStateBackend === "supabase";
const hostedSupabaseUrl =
  process.env.E2E_NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const hostedSupabaseAnonKey =
  process.env.E2E_NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hostedSupabaseServiceRoleKey =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const explicitE2eTournamentEventId = process.env.E2E_TOURNAMENT_EVENT_ID;
const e2eTournamentEventId = explicitE2eTournamentEventId ?? (isSupabaseE2e ? undefined : process.env.TOURNAMENT_EVENT_ID);

process.env.E2E_SERVER_MODE = e2eServerMode;
process.env.E2E_TOURNAMENT_STATE_BACKEND = e2eTournamentStateBackend;
process.env.TOURNAMENT_STATE_BACKEND = e2eTournamentStateBackend;
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

export const e2eWebServer = {
  command:
    e2eServerMode === "dev"
      ? `npx next dev --hostname 127.0.0.1 --port ${e2ePort}`
      : `npm run start -- --hostname 127.0.0.1 --port ${e2ePort}`,
  url: e2eBaseURL,
  reuseExistingServer: false,
  timeout: 120_000,
  env: {
    NODE_ENV: e2eServerMode === "dev" ? "development" : "production",
    NEXT_PUBLIC_E2E_DISABLE_ADMIN_SESSION_HEARTBEAT: "true",
    NEXT_PUBLIC_E2E_DISABLE_HOST_HEARTBEAT: "true",
    NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING: "true",
    NEXT_PUBLIC_SITE_URL: e2eBaseURL,
    NEXT_PUBLIC_SUPABASE_URL: e2eSupabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: e2eSupabaseAnonKey,
    SUPABASE_SERVICE_ROLE_KEY: e2eSupabaseServiceRoleKey,
    ADMIN_PASSWORD_HASH: e2eAdminPasswordHash,
    SESSION_SECRET: randomBytes(32).toString("hex"),
    TOURNAMENT_STATE_BACKEND: e2eTournamentStateBackend,
    ...(e2eTournamentEventId ? { TOURNAMENT_EVENT_ID: e2eTournamentEventId } : {}),
    TOURNAMENT_TEST_ALLOW_E2E_ROUTES: "true",
    TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND: "true",
    TOURNAMENT_TEST_ROUTE_TOKEN: e2eTestRouteToken,
    TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL: "true",
    TOURNAMENT_TEST_PUBLIC_SITE_URL: e2eBaseURL,
  },
};
