import { defineConfig, devices } from "@playwright/test";
import { e2eBaseURL, e2eWebServer } from "./playwright.env";

const soakDurationMs = Number(process.env.E2E_PHASE3_SOAK_DURATION_MS ?? 15_000);

export default defineConfig({
  testDir: "./tests/phase3",
  timeout: Math.max(180_000, soakDurationMs + 120_000),
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: e2eBaseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "phase3-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: e2eWebServer,
});
