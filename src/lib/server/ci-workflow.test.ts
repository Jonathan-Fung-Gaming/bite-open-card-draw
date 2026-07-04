import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("CI and secret hygiene", () => {
  it("keeps GitHub Actions workflow creation deferred until Phase 12", () => {
    const workflowDir = path.join(process.cwd(), ".github", "workflows");
    const workflowFiles = existsSync(workflowDir)
      ? readdirSync(workflowDir).filter((filename) => /\.(ya?ml)$/i.test(filename))
      : [];

    expect(workflowFiles).toEqual([]);
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
