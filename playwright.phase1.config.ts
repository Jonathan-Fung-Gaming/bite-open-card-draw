import { defineConfig, devices } from "@playwright/test";
import { e2eBaseURL, e2eWebServer } from "./playwright.env";

export default defineConfig({
  testDir: "./tests/phase1",
  timeout: 120_000,
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
      name: "phase1-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: e2eWebServer,
});
