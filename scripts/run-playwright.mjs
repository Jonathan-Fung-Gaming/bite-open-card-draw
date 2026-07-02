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

const rawArgs = process.argv.slice(2);
const skipBuildArg = rawArgs.includes("--skip-build");
const requestedArgs = rawArgs.filter((arg) => arg !== "--skip-build");
loadEnvConfig(process.cwd());
const usesLoadConfig = requestedArgs.some((arg) => arg.includes("playwright.load.config"));
const usesPhase9Config = requestedArgs.some((arg) => arg.includes("playwright.phase9.config"));
const usesPhase9Full = usesPhase9Config && requestedArgs.some((arg) => arg.includes("@full"));
const e2eTournamentStateBackend =
  process.env.E2E_TOURNAMENT_STATE_BACKEND ?? (usesPhase9Full ? "supabase" : "memory");
const e2ePort = process.env.E2E_PORT || (await findOpenPort());
const e2eBaseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${e2ePort}`;
const e2eTestRouteToken =
  process.env.E2E_TEST_ROUTE_TOKEN ||
  process.env.TOURNAMENT_TEST_ROUTE_TOKEN ||
  `test-route-${randomBytes(24).toString("hex")}`;
const defaultServerMode = usesLoadConfig || usesPhase9Config ? "dev" : "start";
const e2eServerMode = process.env.E2E_SERVER_MODE || defaultServerMode;
const skipBuild = skipBuildArg || process.env.E2E_SKIP_BUILD === "1" || e2eServerMode === "dev";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const env = sanitizeEnv({
  ...process.env,
  NODE_ENV: "production",
  E2E_PORT: e2ePort,
  E2E_BASE_URL: e2eBaseURL,
  E2E_TEST_ROUTE_TOKEN: e2eTestRouteToken,
  E2E_SERVER_MODE: e2eServerMode,
  E2E_TOURNAMENT_STATE_BACKEND: e2eTournamentStateBackend,
  E2E_TOURNAMENT_EVENT_ID: process.env.E2E_TOURNAMENT_EVENT_ID,
  E2E_PHASE9_BALLOT_MODE:
    process.env.E2E_PHASE9_BALLOT_MODE || (usesPhase9Full ? "ui" : undefined),
  TOURNAMENT_STATE_BACKEND: e2eTournamentStateBackend,
  TOURNAMENT_EVENT_ID: process.env.E2E_TOURNAMENT_EVENT_ID || process.env.TOURNAMENT_EVENT_ID,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || e2eBaseURL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "local-anon-key",
  TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL:
    process.env.TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL || "true",
  TOURNAMENT_TEST_PUBLIC_SITE_URL: process.env.TOURNAMENT_TEST_PUBLIC_SITE_URL || e2eBaseURL,
  TOURNAMENT_TEST_ROUTE_TOKEN: e2eTestRouteToken,
});

console.log(
  `[playwright-runner] backend=${e2eTournamentStateBackend} serverMode=${e2eServerMode} baseURL=${e2eBaseURL} phase9Full=${usesPhase9Full ? "true" : "false"}`,
);

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
