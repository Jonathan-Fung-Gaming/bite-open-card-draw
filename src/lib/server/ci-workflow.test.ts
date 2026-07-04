import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("CI and secret hygiene", () => {
  it("defines the Phase 12 GitHub Actions workflow with stable source gates", () => {
    const workflowDir = path.join(process.cwd(), ".github", "workflows");
    const workflowFiles = existsSync(workflowDir)
      ? readdirSync(workflowDir).filter((filename) => /\.(ya?ml)$/i.test(filename))
      : [];

    expect(workflowFiles).toEqual(["ci.yml"]);

    const workflow = readRepoFile(".github/workflows/ci.yml");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("branches:");
    expect(workflow).toContain("- main");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm run test");
    expect(workflow).toContain("npm run build");
  });

  it("keeps CI free of production secrets and release-only gates", () => {
    const workflow = readRepoFile(".github/workflows/ci.yml");
    const forbiddenWorkflowText = [
      "SUPABASE_SERVICE_ROLE_KEY",
      "ADMIN_PASSWORD_HASH",
      "SESSION_SECRET",
      "VERCEL_TOKEN",
      ".env",
      "E2E_ALLOW_DESTRUCTIVE_RESET=true",
      "supabase:db:push",
      "test:e2e:production-flow",
      "test:phase9:full",
      "test:diagnostic:supabase-dev-full",
      "cache:chart-images",
    ];

    for (const forbidden of forbiddenWorkflowText) {
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
