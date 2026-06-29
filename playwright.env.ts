import { createHash, randomBytes, scryptSync } from "node:crypto";

export const e2ePort = Number(process.env.E2E_PORT ?? 3100);
export const e2eBaseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;
export const e2eAdminPassword = `e2e-${createHash("sha256").update("bite-open-card-draw-e2e").digest("hex").slice(0, 16)}`;

const adminPasswordSalt = randomBytes(16).toString("hex");

export const e2eAdminPasswordHash = `scrypt:v1:${adminPasswordSalt}:${scryptSync(
  e2eAdminPassword,
  adminPasswordSalt,
  64,
).toString("hex")}`;

process.env.E2E_ADMIN_PASSWORD = e2eAdminPassword;

export const e2eWebServer = {
  command: `npm run start -- --hostname 127.0.0.1 --port ${e2ePort}`,
  url: e2eBaseURL,
  reuseExistingServer: false,
  timeout: 120_000,
  env: {
    NEXT_PUBLIC_SITE_URL: e2eBaseURL,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: `test-only-${randomBytes(12).toString("hex")}`,
    ADMIN_PASSWORD_HASH: e2eAdminPasswordHash,
    SESSION_SECRET: randomBytes(32).toString("hex"),
    TOURNAMENT_STATE_BACKEND: "memory",
    TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND: "true",
    TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL: "true",
    TOURNAMENT_TEST_PUBLIC_SITE_URL: e2eBaseURL,
  },
};
