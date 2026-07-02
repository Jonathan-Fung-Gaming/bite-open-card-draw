import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

async function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;

      server.close(() => {
        if (!port) {
          reject(new Error("Could not allocate an e2e port."));
          return;
        }

        resolve(String(port));
      });
    });
  });
}

function run(command, args, env) {
  const executable = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : command;
  const finalArgs = process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
  const result = spawnSync(executable, finalArgs, {
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const error = new Error(`${command} exited with status ${result.status ?? 1}.`);
    error.exitStatus = result.status ?? 1;
    throw error;
  }
}

async function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: Number(port) });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function sanitizeEnv(env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) => Boolean(key) && !key.startsWith("=") && typeof value === "string",
    ),
  );
}

const PROFILES = new Set([
  "legacy",
  "memory-dev-smoke",
  "supabase-dev-rehearsal",
  "production-flow",
]);
const DISPOSABLE_EVENT_ID_PATTERN = /^(e2e|phase9|load|rehearsal)-[a-z0-9-]+$/i;

function optionValue(args, optionName) {
  const prefix = `${optionName}=`;
  const matched = args.find((arg) => arg.startsWith(prefix));

  return matched ? matched.slice(prefix.length) : undefined;
}

function isLocalUrl(value) {
  try {
    const url = new URL(value);

    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function profileDefaults(profile, context) {
  if (profile === "memory-dev-smoke") {
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
      useAdminActionsOnly: "false",
    };
  }

  if (profile === "supabase-dev-rehearsal") {
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
      useAdminActionsOnly: "false",
    };
  }

  if (profile === "production-flow") {
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
      useAdminActionsOnly: "true",
    };
  }

  return {
    backend: context.usesPhase9Full ? "supabase" : "memory",
    serverMode: context.usesHarnessConfig ? "dev" : "start",
    disableAdminSessionHeartbeat: "true",
    disableHostHeartbeat: "true",
    disableVoteLivePolling: "true",
    disablePublicRefresh: "false",
    allowE2eRoutes: "true",
    allowMemoryBackend: "true",
    phase9BallotMode: context.usesPhase9Full ? "ui" : undefined,
    useAdminActionsOnly: "false",
  };
}

function enabledLabel(disableFlag) {
  return disableFlag === "true" ? "disabled" : "enabled";
}

function validateKnownServerMode(serverMode) {
  if (!["dev", "start", "external"].includes(serverMode)) {
    throw new Error(`Unsupported E2E_SERVER_MODE="${serverMode}". Use dev, start, or external.`);
  }
}

function collectSupabaseValidationErrors(config) {
  const errors = [];

  if (!config.eventId) {
    errors.push("E2E_TOURNAMENT_EVENT_ID must be set for Supabase Playwright rehearsal.");
  } else if (!DISPOSABLE_EVENT_ID_PATTERN.test(config.eventId)) {
    errors.push("E2E_TOURNAMENT_EVENT_ID must start with e2e-, phase9-, load-, or rehearsal-.");
  }

  if (process.env.E2E_ALLOW_DESTRUCTIVE_RESET !== "true") {
    errors.push("E2E_ALLOW_DESTRUCTIVE_RESET=true is required for disposable Supabase setup.");
  }

  for (const [name, value] of [
    ["NEXT_PUBLIC_SUPABASE_URL", config.supabaseUrl],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", config.supabaseAnonKey],
    ["SUPABASE_SERVICE_ROLE_KEY", config.supabaseServiceRoleKey],
  ]) {
    if (!value) {
      errors.push(`${name} must be set for Supabase Playwright rehearsal.`);
    }
  }

  return errors;
}

function collectProductionFlowValidationErrors(config) {
  const errors = [];

  if (config.backend !== "supabase") {
    errors.push(`backend must be supabase, got ${config.backend}.`);
  }

  if (!["start", "external"].includes(config.serverMode)) {
    errors.push(`serverMode must be start or external, got ${config.serverMode}.`);
  }

  if (config.serverMode === "start" && config.skipBuild) {
    errors.push("local production-flow start mode must run a fresh production build.");
  }

  if (config.serverMode === "external" && !process.env.E2E_BASE_URL) {
    errors.push("external production-flow mode requires E2E_BASE_URL.");
  }

  if (config.disableAdminSessionHeartbeat === "true") {
    errors.push("admin session heartbeat must be enabled.");
  }

  if (config.disableHostHeartbeat === "true") {
    errors.push("host heartbeat must be enabled.");
  }

  if (config.disableVoteLivePolling === "true") {
    errors.push("vote live polling must be enabled.");
  }

  if (config.disablePublicRefresh === "true") {
    errors.push("public route refresh must be enabled.");
  }

  if (config.phase9BallotMode !== "ui") {
    errors.push(`E2E_PHASE9_BALLOT_MODE must be ui, got ${config.phase9BallotMode ?? "unset"}.`);
  }

  if (config.useAdminActionsOnly !== "true") {
    errors.push("E2E_USE_ADMIN_ACTIONS_ONLY=true is required for production-flow rehearsal.");
  }

  return [...errors, ...collectSupabaseValidationErrors(config)];
}

function failValidation(profile, errors) {
  if (errors.length === 0) {
    return;
  }

  console.error(`[playwright-runner] ${profile} environment validation failed:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

function printEnvironmentSummary(config) {
  console.log(
    [
      `[playwright-runner] profile=${config.profile}`,
      `backend=${config.backend}`,
      `serverMode=${config.serverMode}`,
      `baseURL=${config.baseURL}`,
      `eventId=${config.eventId ?? "(none)"}`,
      `build=${config.skipBuild ? "skipped" : "enabled"}`,
      `adminSessionHeartbeat=${enabledLabel(config.disableAdminSessionHeartbeat)}`,
      `hostHeartbeat=${enabledLabel(config.disableHostHeartbeat)}`,
      `voteLivePolling=${enabledLabel(config.disableVoteLivePolling)}`,
      `publicRouteRefresh=${enabledLabel(config.disablePublicRefresh)}`,
      `phase9BallotMode=${config.phase9BallotMode ?? "(default)"}`,
      `adminActionsOnly=${config.useAdminActionsOnly === "true" ? "enabled" : "disabled"}`,
      `testRoutes=${config.allowE2eRoutes === "true" ? "enabled" : "disabled"}`,
    ].join(" "),
  );
}

const rawArgs = process.argv.slice(2);
const requestedProfile = optionValue(rawArgs, "--profile") ?? process.env.E2E_PROFILE ?? "legacy";

if (!PROFILES.has(requestedProfile)) {
  throw new Error(
    `Unsupported --profile=${requestedProfile}. Use ${Array.from(PROFILES).join(", ")}.`,
  );
}

const skipBuildArg = rawArgs.includes("--skip-build");
const validateEnvOnly = rawArgs.includes("--validate-env-only");
const requestedArgs = rawArgs.filter(
  (arg) => arg !== "--skip-build" && arg !== "--validate-env-only" && !arg.startsWith("--profile="),
);
loadEnvConfig(process.cwd());
const usesLoadConfig = requestedArgs.some((arg) => arg.includes("playwright.load.config"));
const usesPhase9Config = requestedArgs.some((arg) => arg.includes("playwright.phase9.config"));
const usesPhase9Full = usesPhase9Config && requestedArgs.some((arg) => arg.includes("@full"));
const defaults = profileDefaults(requestedProfile, {
  usesHarnessConfig: usesLoadConfig || usesPhase9Config,
  usesPhase9Full,
});
const e2eTournamentStateBackend = process.env.E2E_TOURNAMENT_STATE_BACKEND ?? defaults.backend;
const e2ePort = process.env.E2E_PORT || (await findOpenPort());
const e2eBaseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${e2ePort}`;
const e2eTestRouteToken =
  process.env.E2E_TEST_ROUTE_TOKEN ||
  process.env.TOURNAMENT_TEST_ROUTE_TOKEN ||
  `test-route-${randomBytes(24).toString("hex")}`;
const e2eServerMode = process.env.E2E_SERVER_MODE || defaults.serverMode;
validateKnownServerMode(e2eServerMode);
const skipBuild =
  skipBuildArg ||
  process.env.E2E_SKIP_BUILD === "1" ||
  e2eServerMode === "dev" ||
  e2eServerMode === "external";
const explicitTournamentEventId =
  process.env.E2E_TOURNAMENT_EVENT_ID || process.env.TOURNAMENT_EVENT_ID;
const e2eTournamentEventId =
  explicitTournamentEventId ||
  (e2eTournamentStateBackend === "memory" ? `e2e-${requestedProfile}` : undefined);
const e2eDisableAdminSessionHeartbeat =
  process.env.NEXT_PUBLIC_E2E_DISABLE_ADMIN_SESSION_HEARTBEAT ??
  defaults.disableAdminSessionHeartbeat;
const e2eDisableHostHeartbeat =
  process.env.NEXT_PUBLIC_E2E_DISABLE_HOST_HEARTBEAT ?? defaults.disableHostHeartbeat;
const e2eDisableVoteLivePolling =
  process.env.NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING ?? defaults.disableVoteLivePolling;
const e2eDisablePublicRefresh =
  process.env.NEXT_PUBLIC_E2E_DISABLE_PUBLIC_REFRESH ?? defaults.disablePublicRefresh;
const e2ePhase9BallotMode = process.env.E2E_PHASE9_BALLOT_MODE || defaults.phase9BallotMode;
const e2eAllowE2eRoutes = process.env.TOURNAMENT_TEST_ALLOW_E2E_ROUTES ?? defaults.allowE2eRoutes;
const e2eAllowMemoryBackend =
  process.env.TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND ?? defaults.allowMemoryBackend;
const e2eAllowLocalPublicUrl =
  process.env.TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL ?? (isLocalUrl(e2eBaseURL) ? "true" : "false");
const e2eUseAdminActionsOnly =
  process.env.E2E_USE_ADMIN_ACTIONS_ONLY ?? defaults.useAdminActionsOnly;
const hostedSupabaseUrl =
  process.env.E2E_NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const hostedSupabaseAnonKey =
  process.env.E2E_NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hostedSupabaseServiceRoleKey =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const runConfig = {
  profile: requestedProfile,
  backend: e2eTournamentStateBackend,
  serverMode: e2eServerMode,
  baseURL: e2eBaseURL,
  eventId: e2eTournamentEventId,
  skipBuild,
  disableAdminSessionHeartbeat: e2eDisableAdminSessionHeartbeat,
  disableHostHeartbeat: e2eDisableHostHeartbeat,
  disableVoteLivePolling: e2eDisableVoteLivePolling,
  disablePublicRefresh: e2eDisablePublicRefresh,
  phase9BallotMode: e2ePhase9BallotMode,
  useAdminActionsOnly: e2eUseAdminActionsOnly,
  allowE2eRoutes: e2eAllowE2eRoutes,
  allowMemoryBackend: e2eAllowMemoryBackend,
  supabaseUrl: hostedSupabaseUrl,
  supabaseAnonKey: hostedSupabaseAnonKey,
  supabaseServiceRoleKey: hostedSupabaseServiceRoleKey,
};

printEnvironmentSummary(runConfig);

if (requestedProfile === "production-flow") {
  failValidation(requestedProfile, collectProductionFlowValidationErrors(runConfig));
} else if (e2eTournamentStateBackend === "supabase") {
  failValidation(requestedProfile, collectSupabaseValidationErrors(runConfig));
}

if (validateEnvOnly) {
  process.exit(0);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const env = sanitizeEnv({
  ...process.env,
  E2E_PROFILE: requestedProfile,
  NODE_ENV: "production",
  E2E_PORT: e2ePort,
  E2E_BASE_URL: e2eBaseURL,
  E2E_TEST_ROUTE_TOKEN: e2eTestRouteToken,
  E2E_SERVER_MODE: e2eServerMode,
  E2E_TOURNAMENT_STATE_BACKEND: e2eTournamentStateBackend,
  E2E_TOURNAMENT_EVENT_ID: e2eTournamentEventId,
  E2E_PHASE9_BALLOT_MODE: e2ePhase9BallotMode,
  E2E_USE_ADMIN_ACTIONS_ONLY: e2eUseAdminActionsOnly,
  NEXT_PUBLIC_E2E_DISABLE_ADMIN_SESSION_HEARTBEAT: e2eDisableAdminSessionHeartbeat,
  NEXT_PUBLIC_E2E_DISABLE_HOST_HEARTBEAT: e2eDisableHostHeartbeat,
  NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING: e2eDisableVoteLivePolling,
  NEXT_PUBLIC_E2E_DISABLE_PUBLIC_REFRESH: e2eDisablePublicRefresh,
  TOURNAMENT_STATE_BACKEND: e2eTournamentStateBackend,
  TOURNAMENT_EVENT_ID: e2eTournamentEventId,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || e2eBaseURL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "local-anon-key",
  TOURNAMENT_TEST_ALLOW_E2E_ROUTES: e2eAllowE2eRoutes,
  TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND: e2eAllowMemoryBackend,
  TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL: e2eAllowLocalPublicUrl,
  TOURNAMENT_TEST_PUBLIC_SITE_URL: process.env.TOURNAMENT_TEST_PUBLIC_SITE_URL || e2eBaseURL,
  TOURNAMENT_TEST_ROUTE_TOKEN: e2eTestRouteToken,
});

let exitStatus = 0;

try {
  if (!skipBuild) {
    run(npmCommand, ["run", "build"], env);
  }
  run(npxCommand, ["playwright", ...requestedArgs], env);
} catch (error) {
  exitStatus = typeof error?.exitStatus === "number" ? error.exitStatus : 1;
  if (exitStatus === 1 && error instanceof Error) {
    console.error(error.message);
  }
} finally {
  if (await isPortListening(e2ePort)) {
    console.warn(
      `[playwright-runner] port ${e2ePort} is still listening after Playwright exit; check for a leftover Next process from this workspace.`,
    );
  }
}

process.exit(exitStatus);
