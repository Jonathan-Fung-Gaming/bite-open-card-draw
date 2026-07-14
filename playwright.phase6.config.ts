import { defineConfig, devices } from "@playwright/test";
import { e2eBaseURL, e2eWebServer } from "./playwright.env";

export default defineConfig({
  testDir: "./tests/phase6",
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
      name: "phase6-desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { height: 900, width: 1280 } },
    },
    {
      name: "phase6-mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "phase6-mobile-webkit",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: e2eWebServer,
});
