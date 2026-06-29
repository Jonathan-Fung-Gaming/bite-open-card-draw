import { defineConfig, devices } from "@playwright/test";
import { e2eBaseURL, e2eWebServer } from "./playwright.env";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: e2eBaseURL,
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      testMatch: /full-flow\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      testMatch: /mobile-routes\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-webkit",
      testMatch: /mobile-routes\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: e2eWebServer,
});
