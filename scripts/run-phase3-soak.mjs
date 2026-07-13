import { spawn } from "node:child_process";

const realSoak = process.argv.includes("--real");
const forwardedArgs = process.argv.slice(2).filter((argument) => argument !== "--real");

if (realSoak && process.env.E2E_PHASE3_REAL_SOAK !== "true") {
  console.error(
    "[phase3-soak-runner] E2E_PHASE3_REAL_SOAK=true is required for the fixed 35-minute soak.",
  );
  process.exit(1);
}

const soakDurationMs = realSoak ? 35 * 60_000 : 15_000;
const child = spawn(
  process.execPath,
  [
    "scripts/run-playwright.mjs",
    "--profile=phase3-memory",
    "test",
    "--config=playwright.phase3.config.ts",
    "--grep",
    "@phase3-soak",
    ...forwardedArgs,
  ],
  {
    env: {
      ...process.env,
      E2E_PHASE3_REAL_SOAK: realSoak ? "true" : "false",
      E2E_PHASE3_SOAK_DURATION_MS: String(soakDurationMs),
      NEXT_PUBLIC_E2E_DISABLE_ADMIN_SESSION_HEARTBEAT: "true",
      NEXT_PUBLIC_E2E_DISABLE_HOST_HEARTBEAT: "false",
    },
    stdio: "inherit",
  },
);

child.once("error", (error) => {
  console.error(`[phase3-soak-runner] Could not start Playwright: ${error.message}`);
  process.exit(1);
});
child.once("exit", (status, signal) => {
  if (signal) {
    console.error(`[phase3-soak-runner] Playwright exited from signal ${signal}.`);
    process.exit(1);
  }

  process.exit(status ?? 1);
});
