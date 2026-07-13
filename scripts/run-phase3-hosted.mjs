import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

function fail(message) {
  console.error(`[phase3-hosted-runner] ${message}`);
  process.exit(1);
}

if (process.env.E2E_ALLOW_DESTRUCTIVE_RESET !== "true") {
  fail("E2E_ALLOW_DESTRUCTIVE_RESET=true is required.");
}

if (process.env.E2E_CONFIRMED_NON_PRODUCTION_SUPABASE_PROJECT !== "true") {
  fail("E2E_CONFIRMED_NON_PRODUCTION_SUPABASE_PROJECT=true is required.");
}

const configuredEventId = process.env.TOURNAMENT_EVENT_ID?.trim();
const eventId = `phase3-${Date.now()}-${randomBytes(6).toString("hex")}`;

if (configuredEventId && eventId === configuredEventId) {
  fail("Generated event id unexpectedly matches the configured tournament event id.");
}

const forwardedArgs = process.argv.slice(2);
const nodeExecutable = process.execPath;
const child = spawn(
  nodeExecutable,
  [
    "scripts/run-playwright.mjs",
    "--profile=phase3-supabase",
    "test",
    "--config=playwright.phase3.config.ts",
    "--grep",
    "@phase3-hosted",
    ...forwardedArgs,
  ],
  {
    env: {
      ...process.env,
      E2E_PHASE3_GENERATED_DISPOSABLE_EVENT_ID: eventId,
      E2E_TOURNAMENT_EVENT_ID: eventId,
    },
    stdio: "inherit",
  },
);

child.once("error", (error) => {
  console.error(`[phase3-hosted-runner] Could not start Playwright: ${error.message}`);
  process.exit(1);
});
child.once("exit", (status, signal) => {
  if (signal) {
    console.error(`[phase3-hosted-runner] Playwright exited from signal ${signal}.`);
    process.exit(1);
  }

  process.exit(status ?? 1);
});
