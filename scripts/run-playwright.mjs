import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
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

function terminateChildProcessTree(child) {
  if (!child.pid) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

async function acquirePhase6RunLock() {
  const workspaceHash = createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12);
  const lockDirectory = join(tmpdir(), `bite-open-card-draw-phase6-${workspaceHash}.lock`);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await mkdir(lockDirectory);
      await writeFile(join(lockDirectory, "owner-pid"), String(process.pid), "utf8");
      return lockDirectory;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }

      const ownerPid = Number.parseInt(
        await readFile(join(lockDirectory, "owner-pid"), "utf8").catch(() => ""),
        10,
      );
      const lockAgeMs = Date.now() - (await stat(lockDirectory)).mtimeMs;

      if (Number.isInteger(ownerPid) && ownerPid > 0 && processIsAlive(ownerPid)) {
        throw new Error(
          `[playwright-runner] phase6-memory is already running in this workspace (pid ${ownerPid}).`,
        );
      }
      if (!Number.isInteger(ownerPid) && lockAgeMs < 60_000) {
        throw new Error(
          "[playwright-runner] phase6-memory is already acquiring its workspace lock.",
        );
      }

      await rm(lockDirectory, { force: true, recursive: true });
    }
  }

  throw new Error("[playwright-runner] could not acquire the phase6-memory workspace lock.");
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const executable = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : command;
    const finalArgs = process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
    const child = spawn(executable, finalArgs, {
      detached: process.platform !== "win32",
      env,
      stdio: "inherit",
    });
    const forwardSignal = () => terminateChildProcessTree(child);
    const cleanup = () => {
      process.off("SIGINT", forwardSignal);
      process.off("SIGTERM", forwardSignal);
    };

    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (status, signal) => {
      cleanup();

      if (signal) {
        console.error(`[playwright-runner] ${command} exited from signal ${signal}.`);
      }

      if (status !== 0) {
        const error = new Error(`${command} exited with status ${status ?? 1}.`);
        error.exitStatus = status ?? 1;
        reject(error);
        return;
      }

      resolve();
    });
  });
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
  "phase1-memory",
  "phase1-supabase",
  "phase1-supabase-cache-zero",
  "phase1-supabase-cache-max",
  "phase2-memory",
  "phase3-memory",
  "phase3-supabase",
  "phase4-memory",
  "phase4-supabase",
  "phase5-memory",
  "phase6-memory",
  "supabase-dev-rehearsal",
  "production-flow",
]);
const DISPOSABLE_EVENT_ID_PATTERN =
  /^(e2e|phase0|phase3|phase4|phase9|load|rehearsal)-[a-z0-9-]+$/i;

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
  if (profile === "phase6-memory") {
    return {
      backend: "memory",
      serverMode: "dev",
      disableAdminSessionHeartbeat: "true",
      disableHostHeartbeat: "true",
      disableVoteLivePolling: "false",
      disablePublicRefresh: "false",
      allowE2eRoutes: "true",
      allowMemoryBackend: "true",
      phase9BallotMode: undefined,
      publicReadCacheMs: "1000",
      useAdminActionsOnly: "false",
    };
  }

  if (
    profile === "phase1-memory" ||
    profile === "phase2-memory" ||
    profile === "phase3-memory" ||
    profile === "phase4-memory" ||
    profile === "phase5-memory"
  ) {
    return {
      backend: "memory",
      serverMode: "dev",
      disableAdminSessionHeartbeat: "true",
      disableHostHeartbeat: "true",
      disableVoteLivePolling: "false",
      disablePublicRefresh: profile === "phase5-memory" ? "true" : "false",
      allowE2eRoutes: "true",
      allowMemoryBackend: "true",
      phase9BallotMode: undefined,
      publicReadCacheMs: "1000",
      useAdminActionsOnly: "false",
    };
  }

  if (profile.startsWith("phase1-supabase")) {
    return {
      backend: "supabase",
      serverMode: "dev",
      disableAdminSessionHeartbeat: "true",
      disableHostHeartbeat: "true",
      disableVoteLivePolling: "false",
      disablePublicRefresh: "false",
      allowE2eRoutes: "true",
      allowMemoryBackend: "false",
      phase9BallotMode: "ui",
      publicReadCacheMs: profile.endsWith("cache-zero")
        ? "0"
        : profile.endsWith("cache-max")
          ? "5000"
          : "1000",
      useAdminActionsOnly: "false",
    };
  }

  if (profile === "phase3-supabase" || profile === "phase4-supabase") {
    return {
      backend: "supabase",
      serverMode: "dev",
      disableAdminSessionHeartbeat: "true",
      disableHostHeartbeat: "true",
      disableVoteLivePolling: "true",
      disablePublicRefresh: "false",
      allowE2eRoutes: "false",
      allowMemoryBackend: "false",
      phase9BallotMode: undefined,
      publicReadCacheMs: "0",
      useAdminActionsOnly: "true",
    };
  }

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
    errors.push(
      "E2E_TOURNAMENT_EVENT_ID must start with e2e-, phase0-, phase3-, phase4-, phase9-, load-, or rehearsal-.",
    );
  } else if (
    config.eventId.toLowerCase().startsWith("phase0-") &&
    !config.phase0EventIdDiffersFromConfigured
  ) {
    errors.push(
      "Phase 0 diagnostics require E2E_TOURNAMENT_EVENT_ID to differ from the normally configured TOURNAMENT_EVENT_ID.",
    );
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

function collectPhase1SupabaseValidationErrors(config) {
  const errors = [];

  if (config.backend !== "supabase") {
    errors.push(`backend must be supabase, got ${config.backend}.`);
  }

  if (!config.explicitE2eTournamentEventId) {
    errors.push(
      "Phase 1 Supabase profiles require an explicit E2E_TOURNAMENT_EVENT_ID; TOURNAMENT_EVENT_ID fallback is not allowed.",
    );
  } else if (
    config.configuredTournamentEventId &&
    config.explicitE2eTournamentEventId === config.configuredTournamentEventId
  ) {
    errors.push(
      "Phase 1 Supabase profiles require E2E_TOURNAMENT_EVENT_ID to differ from the configured TOURNAMENT_EVENT_ID.",
    );
  }

  if (
    config.supabaseUrl &&
    !isLocalUrl(config.supabaseUrl) &&
    process.env.E2E_CONFIRMED_NON_PRODUCTION_SUPABASE_PROJECT !== "true"
  ) {
    errors.push(
      "E2E_CONFIRMED_NON_PRODUCTION_SUPABASE_PROJECT=true is required for a non-local Phase 1 Supabase target.",
    );
  }

  return [...errors, ...collectSupabaseValidationErrors(config)];
}

function collectPhase3SupabaseValidationErrors(config) {
  const errors = [];

  if (config.backend !== "supabase") {
    errors.push(`backend must be supabase, got ${config.backend}.`);
  }

  if (!config.explicitE2eTournamentEventId) {
    errors.push("Phase 3 Supabase profile requires an explicit generated E2E_TOURNAMENT_EVENT_ID.");
  } else if (!config.explicitE2eTournamentEventId.toLowerCase().startsWith("phase3-")) {
    errors.push("Phase 3 Supabase event id must start with phase3-.");
  } else if (
    config.configuredTournamentEventId &&
    config.explicitE2eTournamentEventId === config.configuredTournamentEventId
  ) {
    errors.push("Phase 3 Supabase profile refuses the normally configured TOURNAMENT_EVENT_ID.");
  }

  if (
    process.env.E2E_PHASE3_GENERATED_DISPOSABLE_EVENT_ID !== config.explicitE2eTournamentEventId
  ) {
    errors.push(
      "Phase 3 Supabase profile must be launched by the generated disposable-event runner.",
    );
  }

  if (process.env.E2E_CONFIRMED_NON_PRODUCTION_SUPABASE_PROJECT !== "true") {
    errors.push(
      "E2E_CONFIRMED_NON_PRODUCTION_SUPABASE_PROJECT=true is required for Phase 3 hosted evidence.",
    );
  }

  if (config.allowE2eRoutes !== "false") {
    errors.push("TOURNAMENT_TEST_ALLOW_E2E_ROUTES=false is required for Phase 3 hosted evidence.");
  }

  if (config.useAdminActionsOnly !== "true") {
    errors.push("E2E_USE_ADMIN_ACTIONS_ONLY=true is required for Phase 3 hosted evidence.");
  }

  return [...errors, ...collectSupabaseValidationErrors(config)];
}

function collectPhase4SupabaseValidationErrors(config) {
  const errors = [];

  if (config.backend !== "supabase") {
    errors.push(`backend must be supabase, got ${config.backend}.`);
  }

  if (!config.explicitE2eTournamentEventId) {
    errors.push("Phase 4 Supabase profile requires an explicit generated E2E_TOURNAMENT_EVENT_ID.");
  } else if (!config.explicitE2eTournamentEventId.toLowerCase().startsWith("phase4-")) {
    errors.push("Phase 4 Supabase event id must start with phase4-.");
  } else if (
    config.configuredTournamentEventId &&
    config.explicitE2eTournamentEventId === config.configuredTournamentEventId
  ) {
    errors.push("Phase 4 Supabase profile refuses the normally configured TOURNAMENT_EVENT_ID.");
  }

  if (
    process.env.E2E_PHASE4_GENERATED_DISPOSABLE_EVENT_ID !== config.explicitE2eTournamentEventId
  ) {
    errors.push(
      "Phase 4 Supabase profile must be launched by the generated disposable-event runner.",
    );
  }

  if (process.env.E2E_CONFIRMED_NON_PRODUCTION_SUPABASE_PROJECT !== "true") {
    errors.push(
      "E2E_CONFIRMED_NON_PRODUCTION_SUPABASE_PROJECT=true is required for Phase 4 hosted evidence.",
    );
  }

  if (config.allowE2eRoutes !== "false") {
    errors.push("TOURNAMENT_TEST_ALLOW_E2E_ROUTES=false is required for Phase 4 hosted evidence.");
  }

  if (config.useAdminActionsOnly !== "true") {
    errors.push("E2E_USE_ADMIN_ACTIONS_ONLY=true is required for Phase 4 hosted evidence.");
  }

  return [...errors, ...collectSupabaseValidationErrors(config)];
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

  if (config.serverMode === "external" && !process.env.E2E_DEPLOYED_TEST_ROUTE_TOKEN) {
    errors.push(
      "external production-flow mode requires E2E_DEPLOYED_TEST_ROUTE_TOKEN so deployed e2e-route 404 probes cannot be masked by token mismatch.",
    );
  }

  if (config.serverMode === "external" && !process.env.E2E_DEPLOYED_COMMIT_SHA) {
    errors.push(
      "external production-flow mode requires E2E_DEPLOYED_COMMIT_SHA so deployed evidence is tied to the commit served by E2E_BASE_URL.",
    );
  }

  if (config.allowLocalPublicUrl === "true") {
    errors.push("TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL must be false for production-flow.");
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

  if (config.allowE2eRoutes !== "false") {
    errors.push("TOURNAMENT_TEST_ALLOW_E2E_ROUTES=false is required for production-flow.");
  }

  if (config.allowMemoryBackend !== "false") {
    errors.push("TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND=false is required for production-flow.");
  }

  if (config.allowRehearsalAdminControls !== "true") {
    errors.push(
      "TOURNAMENT_ALLOW_REHEARSAL_ADMIN_CONTROLS=true is required for production-flow rehearsal.",
    );
  }

  return [...errors, ...collectSupabaseValidationErrors(config)];
}

function collectPhase2MemoryValidationErrors(config) {
  const errors = [];

  if (config.backend !== "memory") {
    errors.push(`backend must be memory, got ${config.backend}.`);
  }

  if (config.serverMode !== "dev") {
    errors.push(`serverMode must be dev, got ${config.serverMode}.`);
  }

  if (!isLocalUrl(config.baseURL)) {
    errors.push("Phase 2 memory evidence requires a local E2E_BASE_URL.");
  }

  if (!isLocalUrl(config.publicSiteUrl)) {
    errors.push("Phase 2 memory evidence requires a local NEXT_PUBLIC_SITE_URL.");
  }

  return errors;
}

function collectPhase6MemoryValidationErrors(config) {
  const errors = [];

  if (config.backend !== "memory") {
    errors.push(`backend must be memory, got ${config.backend}.`);
  }

  if (config.serverMode !== "dev") {
    errors.push(`serverMode must be dev, got ${config.serverMode}.`);
  }

  if (!isLocalUrl(config.baseURL)) {
    errors.push("Phase 6 memory evidence requires a local E2E_BASE_URL.");
  }

  if (!isLocalUrl(config.publicSiteUrl)) {
    errors.push("Phase 6 memory evidence requires a local NEXT_PUBLIC_SITE_URL.");
  }

  if (config.disablePublicRefresh === "true") {
    errors.push("Phase 6 memory evidence requires public route refresh to remain enabled.");
  }

  if (config.allowRehearsalAdminControls !== "true") {
    errors.push("Phase 6 memory evidence requires guarded rehearsal admin controls.");
  }

  return errors;
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
  const eventIdLabel = config.eventId?.toLowerCase().startsWith("phase0-")
    ? "phase0-[generated]"
    : (config.eventId ?? "(none)");

  console.log(
    [
      `[playwright-runner] profile=${config.profile}`,
      `backend=${config.backend}`,
      `serverMode=${config.serverMode}`,
      `baseURL=${config.baseURL}`,
      `publicSiteUrl=${config.publicSiteUrl}`,
      `eventId=${eventIdLabel}`,
      `build=${config.skipBuild ? "skipped" : "enabled"}`,
      `adminSessionHeartbeat=${enabledLabel(config.disableAdminSessionHeartbeat)}`,
      `hostHeartbeat=${enabledLabel(config.disableHostHeartbeat)}`,
      `voteLivePolling=${enabledLabel(config.disableVoteLivePolling)}`,
      `publicRouteRefresh=${enabledLabel(config.disablePublicRefresh)}`,
      `publicReadCacheMs=${config.publicReadCacheMs}`,
      `phase9BallotMode=${config.phase9BallotMode ?? "(default)"}`,
      `loadProfile=${config.loadProfile ?? "(none)"}`,
      `adminActionsOnly=${config.useAdminActionsOnly === "true" ? "enabled" : "disabled"}`,
      `rehearsalControls=${config.allowRehearsalAdminControls === "true" ? "enabled" : "disabled"}`,
      `deployedCommit=${config.deployedCommit ?? "(none)"}`,
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
const explicitE2eTournamentEventId = process.env.E2E_TOURNAMENT_EVENT_ID?.trim() || undefined;
const configuredTournamentEventId = process.env.TOURNAMENT_EVENT_ID?.trim() || undefined;
const usesLoadConfig = requestedArgs.some((arg) => arg.includes("playwright.load.config"));
const usesPhase9Config = requestedArgs.some((arg) => arg.includes("playwright.phase9.config"));
const usesPhase0Config = requestedArgs.some((arg) => arg.includes("playwright.phase0.config"));
const usesPhase9Full = usesPhase9Config && requestedArgs.some((arg) => arg.includes("@full"));
const hasPlayerRouteLoadGrep = requestedArgs.some((arg) => arg.includes("@player-route"));
const hasApiInjectionLoadGrep = requestedArgs.some((arg) => arg.includes("@api-injection"));
const e2eLoadProfile = usesLoadConfig
  ? hasPlayerRouteLoadGrep
    ? "player-route"
    : hasApiInjectionLoadGrep
      ? "api-injection"
      : "all"
  : undefined;

if (usesLoadConfig && hasPlayerRouteLoadGrep && hasApiInjectionLoadGrep) {
  console.error(
    "[playwright-runner] Load config requires exactly one profile grep: @api-injection or @player-route.",
  );
  process.exit(1);
}

if (usesLoadConfig && e2eLoadProfile === "all") {
  console.error(
    "[playwright-runner] Load config requires an explicit --grep @api-injection or --grep @player-route so load evidence stays isolated.",
  );
  process.exit(1);
}
const defaults = profileDefaults(requestedProfile, {
  usesHarnessConfig: usesLoadConfig || usesPhase9Config,
  usesPhase9Full,
});
const requestedBackendOverride = process.env.E2E_TOURNAMENT_STATE_BACKEND?.trim();

if (
  (requestedProfile === "phase1-memory" ||
    requestedProfile === "phase2-memory" ||
    requestedProfile === "phase3-memory" ||
    requestedProfile === "phase4-memory" ||
    requestedProfile === "phase5-memory" ||
    requestedProfile === "phase6-memory") &&
  requestedBackendOverride &&
  requestedBackendOverride !== "memory"
) {
  console.error(
    `[playwright-runner] ${requestedProfile} is locked to the memory backend; remove E2E_TOURNAMENT_STATE_BACKEND.`,
  );
  process.exit(1);
}

const memoryLockedProfile =
  requestedProfile === "phase1-memory" ||
  requestedProfile === "phase2-memory" ||
  requestedProfile === "phase3-memory" ||
  requestedProfile === "phase4-memory" ||
  requestedProfile === "phase5-memory" ||
  requestedProfile === "phase6-memory";
const e2eTournamentStateBackend = memoryLockedProfile
  ? "memory"
  : (requestedBackendOverride ?? defaults.backend);
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
  requestedArgs.includes("--list") ||
  process.env.E2E_SKIP_BUILD === "1" ||
  e2eServerMode === "dev" ||
  e2eServerMode === "external";
const explicitTournamentEventId =
  e2eTournamentStateBackend === "supabase"
    ? requestedProfile.startsWith("phase1-supabase")
      ? explicitE2eTournamentEventId
      : explicitE2eTournamentEventId || configuredTournamentEventId
    : undefined;
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
const phase1CacheProfileMs = requestedProfile.endsWith("cache-zero")
  ? "0"
  : requestedProfile.endsWith("cache-max")
    ? "5000"
    : undefined;
const requestedPublicReadCacheMs = process.env.TOURNAMENT_PUBLIC_READ_CACHE_MS?.trim();

if (
  phase1CacheProfileMs !== undefined &&
  requestedPublicReadCacheMs !== undefined &&
  requestedPublicReadCacheMs !== phase1CacheProfileMs
) {
  console.error(
    `[playwright-runner] ${requestedProfile} is locked to TOURNAMENT_PUBLIC_READ_CACHE_MS=${phase1CacheProfileMs}.`,
  );
  process.exit(1);
}

const e2ePublicReadCacheMs =
  phase1CacheProfileMs ?? requestedPublicReadCacheMs ?? defaults.publicReadCacheMs ?? "1000";
const e2ePhase9BallotMode = process.env.E2E_PHASE9_BALLOT_MODE || defaults.phase9BallotMode;
const e2eAllowE2eRoutes = process.env.TOURNAMENT_TEST_ALLOW_E2E_ROUTES ?? defaults.allowE2eRoutes;
const e2eAllowMemoryBackend =
  process.env.TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND ?? defaults.allowMemoryBackend;
const isProductionFlowLocalStart =
  requestedProfile === "production-flow" && e2eServerMode === "start" && isLocalUrl(e2eBaseURL);
const e2eAllowLocalPublicUrl =
  process.env.TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL ??
  (isProductionFlowLocalStart ? "false" : isLocalUrl(e2eBaseURL) ? "true" : "false");
const e2eUseAdminActionsOnly =
  process.env.E2E_USE_ADMIN_ACTIONS_ONLY ?? defaults.useAdminActionsOnly;
const e2eAllowRehearsalAdminControls =
  process.env.TOURNAMENT_ALLOW_REHEARSAL_ADMIN_CONTROLS ??
  (usesPhase0Config ||
  requestedProfile === "production-flow" ||
  requestedProfile === "supabase-dev-rehearsal" ||
  requestedProfile.startsWith("phase1-") ||
  requestedProfile === "phase2-memory" ||
  requestedProfile.startsWith("phase3-") ||
  requestedProfile.startsWith("phase4-") ||
  requestedProfile.startsWith("phase5-") ||
  requestedProfile.startsWith("phase6-")
    ? "true"
    : "false");
const e2eDeployedCommit = process.env.E2E_DEPLOYED_COMMIT_SHA;
const requestedNextDistDirOverride = process.env.E2E_NEXT_DIST_DIR?.trim();
const lockedNextDistDir = requestedProfile === "phase2-memory" ? ".next-phase2" : undefined;

if (requestedProfile === "phase6-memory" && requestedNextDistDirOverride) {
  console.error(
    "[playwright-runner] phase6-memory uses a freshly cleared .next cache; remove E2E_NEXT_DIST_DIR.",
  );
  process.exit(1);
}

if (
  lockedNextDistDir &&
  requestedNextDistDirOverride &&
  requestedNextDistDirOverride !== lockedNextDistDir
) {
  console.error(
    `[playwright-runner] ${requestedProfile} is locked to ${lockedNextDistDir}; remove E2E_NEXT_DIST_DIR.`,
  );
  process.exit(1);
}

const e2eNextDistDir =
  lockedNextDistDir ??
  requestedNextDistDirOverride ??
  (usesPhase0Config ? ".next-phase0" : undefined);
const e2ePublicSiteUrl =
  requestedProfile === "phase2-memory" ||
  requestedProfile.startsWith("phase3-") ||
  requestedProfile.startsWith("phase4-") ||
  requestedProfile.startsWith("phase5-") ||
  requestedProfile.startsWith("phase6-")
    ? e2eBaseURL
    : (process.env.NEXT_PUBLIC_SITE_URL ??
      (isProductionFlowLocalStart ? "https://event.example.test" : e2eBaseURL));
const hostedSupabaseUrl =
  process.env.E2E_NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const hostedSupabaseAnonKey =
  process.env.E2E_NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hostedSupabaseServiceRoleKey =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const phase0EventIdDiffersFromConfigured = Boolean(
  e2eTournamentEventId?.toLowerCase().startsWith("phase0-") &&
  process.env.TOURNAMENT_EVENT_ID &&
  e2eTournamentEventId !== process.env.TOURNAMENT_EVENT_ID,
);
const runConfig = {
  profile: requestedProfile,
  backend: e2eTournamentStateBackend,
  serverMode: e2eServerMode,
  baseURL: e2eBaseURL,
  publicSiteUrl: e2ePublicSiteUrl,
  eventId: e2eTournamentEventId,
  explicitE2eTournamentEventId,
  configuredTournamentEventId,
  phase0EventIdDiffersFromConfigured,
  skipBuild,
  disableAdminSessionHeartbeat: e2eDisableAdminSessionHeartbeat,
  disableHostHeartbeat: e2eDisableHostHeartbeat,
  disableVoteLivePolling: e2eDisableVoteLivePolling,
  disablePublicRefresh: e2eDisablePublicRefresh,
  publicReadCacheMs: e2ePublicReadCacheMs,
  phase9BallotMode: e2ePhase9BallotMode,
  loadProfile: e2eLoadProfile,
  useAdminActionsOnly: e2eUseAdminActionsOnly,
  allowRehearsalAdminControls: e2eAllowRehearsalAdminControls,
  allowE2eRoutes: e2eAllowE2eRoutes,
  allowMemoryBackend: e2eAllowMemoryBackend,
  allowLocalPublicUrl: e2eAllowLocalPublicUrl,
  supabaseUrl: hostedSupabaseUrl,
  supabaseAnonKey: hostedSupabaseAnonKey,
  supabaseServiceRoleKey: hostedSupabaseServiceRoleKey,
  deployedCommit: e2eDeployedCommit,
};

printEnvironmentSummary(runConfig);

if (requestedProfile === "production-flow") {
  failValidation(requestedProfile, collectProductionFlowValidationErrors(runConfig));
} else if (requestedProfile === "phase2-memory") {
  failValidation(requestedProfile, collectPhase2MemoryValidationErrors(runConfig));
} else if (requestedProfile === "phase6-memory") {
  failValidation(requestedProfile, collectPhase6MemoryValidationErrors(runConfig));
} else if (requestedProfile.startsWith("phase1-supabase")) {
  failValidation(requestedProfile, collectPhase1SupabaseValidationErrors(runConfig));
} else if (requestedProfile === "phase3-supabase") {
  failValidation(requestedProfile, collectPhase3SupabaseValidationErrors(runConfig));
} else if (requestedProfile === "phase4-supabase") {
  failValidation(requestedProfile, collectPhase4SupabaseValidationErrors(runConfig));
} else if (e2eTournamentStateBackend === "supabase") {
  failValidation(requestedProfile, collectSupabaseValidationErrors(runConfig));
}

if (validateEnvOnly) {
  process.exit(0);
}

const phase6RunLock =
  requestedProfile === "phase6-memory" && !requestedArgs.includes("--list")
    ? await acquirePhase6RunLock()
    : undefined;

if (phase6RunLock) {
  const phase6NextDirectory = join(process.cwd(), ".next");

  if (relative(process.cwd(), phase6NextDirectory) !== ".next") {
    throw new Error("[playwright-runner] refused to clear an unexpected Phase 6 cache path.");
  }

  await rm(phase6NextDirectory, { force: true, recursive: true });
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
  E2E_PHASE0_EVENT_ID_DIFFERS_FROM_CONFIGURED: String(runConfig.phase0EventIdDiffersFromConfigured),
  E2E_PHASE9_BALLOT_MODE: e2ePhase9BallotMode,
  E2E_LOAD_PROFILE: e2eLoadProfile,
  E2E_USE_ADMIN_ACTIONS_ONLY: e2eUseAdminActionsOnly,
  NEXT_PUBLIC_E2E_DISABLE_ADMIN_SESSION_HEARTBEAT: e2eDisableAdminSessionHeartbeat,
  NEXT_PUBLIC_E2E_DISABLE_HOST_HEARTBEAT: e2eDisableHostHeartbeat,
  NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING: e2eDisableVoteLivePolling,
  NEXT_PUBLIC_E2E_DISABLE_PUBLIC_REFRESH: e2eDisablePublicRefresh,
  TOURNAMENT_STATE_BACKEND: e2eTournamentStateBackend,
  TOURNAMENT_PUBLIC_READ_CACHE_MS: e2ePublicReadCacheMs,
  TOURNAMENT_EVENT_ID: e2eTournamentEventId,
  NEXT_PUBLIC_SITE_URL: e2ePublicSiteUrl,
  NEXT_PUBLIC_SUPABASE_URL: hostedSupabaseUrl || "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: hostedSupabaseAnonKey || "local-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: hostedSupabaseServiceRoleKey,
  TOURNAMENT_TEST_ALLOW_E2E_ROUTES: e2eAllowE2eRoutes,
  TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND: e2eAllowMemoryBackend,
  TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL: e2eAllowLocalPublicUrl,
  TOURNAMENT_ALLOW_REHEARSAL_ADMIN_CONTROLS: e2eAllowRehearsalAdminControls,
  TOURNAMENT_TEST_PUBLIC_SITE_URL: process.env.TOURNAMENT_TEST_PUBLIC_SITE_URL || e2eBaseURL,
  TOURNAMENT_TEST_ROUTE_TOKEN: e2eTestRouteToken,
  E2E_DEPLOYED_TEST_ROUTE_TOKEN: process.env.E2E_DEPLOYED_TEST_ROUTE_TOKEN,
  E2E_NEXT_DIST_DIR: e2eNextDistDir,
  NEXT_DIST_DIR: e2eNextDistDir,
});

let exitStatus = 0;

try {
  if (!skipBuild) {
    await run(npmCommand, ["run", "build"], env);
  }
  await run(npxCommand, ["playwright", ...requestedArgs], env);
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
  if (phase6RunLock) {
    await rm(phase6RunLock, { force: true, recursive: true });
  }
}

process.exit(exitStatus);
