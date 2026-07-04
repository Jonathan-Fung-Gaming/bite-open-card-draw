import { defineConfig, devices } from "@playwright/test";
import { e2eBaseURL, e2eWebServer } from "./playwright.env";

export default defineConfig({
  testDir: "./tests/phase9",
  outputDir: "test-results/phase9",
  timeout: 900_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list", { printSteps: true }]],
  use: {
    baseURL: e2eBaseURL,
    acceptDownloads: true,
    screenshot: "only-on-failure",
    trace: process.env.E2E_TRACE === "on" ? "retain-on-failure" : "off",
    video: "off",
  },
  projects: [
    {
      name: "phase9-chromium",
      testMatch: /.*\.spec\.ts/,
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
