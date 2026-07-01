import { defineConfig, devices } from "@playwright/test";
import { e2eBaseURL, e2eWebServer } from "./playwright.env";

export default defineConfig({
  testDir: "./tests/load",
  timeout: 600_000,
  expect: {
    timeout: 15_000,
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
      name: "load-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    ...e2eWebServer,
    timeout: 180_000,
  },
});
