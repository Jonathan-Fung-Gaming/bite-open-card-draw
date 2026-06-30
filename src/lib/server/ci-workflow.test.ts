import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("CI and secret hygiene", () => {
  it("keeps CI on stable local gates without production secrets", () => {
    const workflow = readRepoFile(".github/workflows/ci.yml");

    for (const command of [
      "npm ci",
      "npx playwright install --with-deps chromium webkit",
      "npm run lint",
      "npm run typecheck",
      "npm run test",
      "npm run import:charts",
      "npm run cache:chart-images -- --fallback-only",
      "npm audit --omit=dev",
      "npm run build",
      "npm run test:e2e:no-build",
    ]) {
      expect(workflow).toContain(command);
    }

    for (const forbidden of [
      "secrets.",
      "SUPABASE_SERVICE_ROLE_KEY",
      "ADMIN_PASSWORD_HASH",
      "SESSION_SECRET",
      "VERCEL_TOKEN",
    ]) {
      expect(workflow).not.toContain(forbidden);
    }
  });

  it("keeps local env secret files ignored and untracked", () => {
    const gitignore = readRepoFile(".gitignore");
    const trackedEnvFiles = execFileSync("git", ["ls-files", ".env", ".env.local"], {
      encoding: "utf8",
    }).trim();

    expect(gitignore).toContain(".env");
    expect(gitignore).toContain(".env.*");
    expect(gitignore).toContain("!.env.example");
    expect(trackedEnvFiles).toBe("");
  });
});
