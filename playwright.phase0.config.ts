import { defineConfig, devices } from "@playwright/test";
import { e2eBaseURL, e2eWebServer } from "./playwright.env";

export default defineConfig({
  testDir: "./tests/phase0",
  outputDir: process.env.E2E_PHASE0_OUTPUT_DIR ?? "phase0-test-results/default",
  timeout: 900_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list", { printSteps: true }]],
  use: {
    baseURL: e2eBaseURL,
    acceptDownloads: false,
    screenshot: "only-on-failure",
    trace: process.env.E2E_TRACE === "on" ? "retain-on-failure" : "off",
    video: "off",
  },
  projects: [
    {
      name: "phase0-visual-chromium",
      testMatch: /visual-baseline\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "phase0-visual-webkit",
      testMatch: /visual-baseline\.spec\.ts/,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "phase0-hosted-chromium",
      testMatch: /hosted-diagnostics\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: e2eWebServer
    ? {
        ...e2eWebServer,
        timeout: 180_000,
      }
    : undefined,
});
