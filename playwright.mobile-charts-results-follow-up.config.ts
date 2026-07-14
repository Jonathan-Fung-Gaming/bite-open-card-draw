import { defineConfig, devices } from "@playwright/test";
import { e2eBaseURL, e2eWebServer } from "./playwright.env";

export default defineConfig({
  testDir: "./tests/mobile-charts-results-follow-up",
  timeout: 240_000,
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
      name: "mobile-charts-results-follow-up-chromium",
      use: {
        ...devices["Pixel 5"],
        viewport: { height: 844, width: 390 },
      },
    },
  ],
  webServer: e2eWebServer,
});
