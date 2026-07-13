import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
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
          reject(new Error("Could not allocate a Phase 0 diagnostic port."));
          return;
        }

        resolve(String(port));
      });
    });
  });
}

if (process.env.E2E_ALLOW_DESTRUCTIVE_RESET !== "true") {
  throw new Error(
    "Set E2E_ALLOW_DESTRUCTIVE_RESET=true to opt in to the disposable hosted Phase 0 diagnostic.",
  );
}

const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const eventId = `phase0-${date}-${randomBytes(6).toString("hex")}`;
const grep = process.env.E2E_PHASE0_GREP ?? "@phase0-hosted";
const forwardedPlaywrightArgs = process.argv.slice(2);
const isListOnly = forwardedPlaywrightArgs.includes("--list");
loadEnvConfig(process.cwd());
const configuredEventId = process.env.TOURNAMENT_EVENT_ID;

if (configuredEventId && configuredEventId === eventId) {
  throw new Error("Generated Phase 0 event id unexpectedly matches the configured event id.");
}

const port = await findOpenPort();
const executable = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npx";
const childEnv = {
  ...process.env,
  NODE_ENV: "production",
  E2E_PORT: port,
  E2E_PROFILE: "supabase-dev-rehearsal",
  E2E_PUBLIC_SITE_URL: "https://event.example.test",
  E2E_SERVER_MODE: "start",
  E2E_PHASE0_EVENT_ID_DIFFERS_FROM_CONFIGURED: "true",
  E2E_NEXT_DIST_DIR: ".next-phase0",
  E2E_TOURNAMENT_EVENT_ID: eventId,
  E2E_TOURNAMENT_STATE_BACKEND: "supabase",
  TOURNAMENT_ALLOW_REHEARSAL_ADMIN_CONTROLS: "true",
  TOURNAMENT_STATE_BACKEND: "supabase",
  TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL: "false",
  NEXT_DIST_DIR: ".next-phase0",
};

if (!isListOnly) {
  const npmExecutable = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const npmArgs =
    process.platform === "win32" ? ["/d", "/s", "/c", "npm", "run", "build"] : ["run", "build"];
  const buildResult = spawnSync(npmExecutable, npmArgs, { env: childEnv, stdio: "inherit" });

  if (buildResult.error) {
    throw buildResult.error;
  }

  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }
}

const args =
  process.platform === "win32"
    ? [
        "/d",
        "/s",
        "/c",
        "npx",
        "playwright",
        "test",
        "--config=playwright.phase0.config.ts",
        "--grep",
        grep,
        ...forwardedPlaywrightArgs,
      ]
    : [
        "playwright",
        "test",
        "--config=playwright.phase0.config.ts",
        "--grep",
        grep,
        ...forwardedPlaywrightArgs,
      ];
const result = spawnSync(executable, args, {
  env: childEnv,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

if (result.signal) {
  console.error(`[phase0-runner] Playwright child exited from signal ${result.signal}.`);
}

if (typeof result.status !== "number") {
  console.error("[phase0-runner] Playwright child returned no numeric exit status.");
}

process.exit(result.status ?? 1);
