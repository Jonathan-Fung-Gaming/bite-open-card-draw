import { defineConfig, devices } from "@playwright/test";
import { createHash, randomBytes, scryptSync } from "node:crypto";

const e2eAdminPassword = `e2e-${createHash("sha256").update("bite-open-card-draw-e2e").digest("hex").slice(0, 16)}`;
const adminPasswordSalt = randomBytes(16).toString("hex");
const adminPasswordHash = `scrypt:v1:${adminPasswordSalt}:${scryptSync(e2eAdminPassword, adminPasswordSalt, 64).toString("hex")}`;

process.env.E2E_ADMIN_PASSWORD = e2eAdminPassword;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: `test-only-${randomBytes(12).toString("hex")}`,
      ADMIN_PASSWORD_HASH: adminPasswordHash,
      SESSION_SECRET: randomBytes(32).toString("hex"),
      TOURNAMENT_STATE_BACKEND: "memory",
      TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND: "true",
      TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL: "true",
    },
  },
});
