import { defineConfig, devices } from "@playwright/test";
import { e2eBaseURL, e2eWebServer } from "./playwright.env";

export default defineConfig({
  testDir: "./tests/phase4",
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
      name: "phase4-desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "phase4-mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: e2eWebServer,
});
