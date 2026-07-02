import { defineConfig, devices } from "@playwright/test";
import { e2eBaseURL, e2eWebServer } from "./playwright.env";

export default defineConfig({
  testDir: "./tests/load",
  outputDir: "test-results/load",
  timeout: 600_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list", { printSteps: true }], ["json", { outputFile: "test-results/load/results.json" }]],
  use: {
    baseURL: e2eBaseURL,
    acceptDownloads: true,
    screenshot: "only-on-failure",
    trace: process.env.E2E_TRACE === "on" ? "retain-on-failure" : "off",
    video: "off",
  },
  projects: [
    {
      name: "load-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    ...e2eWebServer,
    timeout: 180_000,
  },
});
