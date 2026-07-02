import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SERVER_SECRET_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
  "ADMIN_PASSWORD_HASH",
  "adminPasswordHash",
  "TOURNAMENT_TEST_ROUTE_TOKEN",
] as const;

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const absolutePath = path.join(root, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      return sourceFiles(absolutePath);
    }

    return /\.(ts|tsx)$/.test(entry) ? [absolutePath] : [];
  });
}

function clientComponentFiles() {
  return sourceFiles(path.join(process.cwd(), "src")).filter((absolutePath) => {
    const source = readFileSync(absolutePath, "utf8");

    return /^\s*["']use client["'];/m.test(source);
  });
}

describe("browser security boundary", () => {
  it("does not reference server-only secret names from any client component", () => {
    const clients = clientComponentFiles();

    expect(clients.length).toBeGreaterThan(0);

    for (const absolutePath of clients) {
      const source = readFileSync(absolutePath, "utf8");
      const relativePath = path.relative(process.cwd(), absolutePath);

      for (const secretName of SERVER_SECRET_NAMES) {
        expect(source, `${relativePath} should not reference ${secretName}`).not.toContain(secretName);
      }
    }
  });

  it("does not import server-only modules from client components", () => {
    const clients = clientComponentFiles();

    expect(clients.length).toBeGreaterThan(0);

    for (const absolutePath of clients) {
      const source = readFileSync(absolutePath, "utf8");
      const relativePath = path.relative(process.cwd(), absolutePath);

      expect(source, `${relativePath} should not import server modules`).not.toContain(
        "@/lib/server",
      );
      expect(source, `${relativePath} should not import server-only`).not.toContain(
        "server-only",
      );
    }
  });

  it("does not expose full live submitted-player lists to the vote browser payload", () => {
    const actionSource = readFileSync(path.join(process.cwd(), "src/app/vote/actions.ts"), "utf8");
    const pageSource = readFileSync(path.join(process.cwd(), "src/app/vote/page.tsx"), "utf8");
    const clientSource = readFileSync(path.join(process.cwd(), "src/app/vote/BallotFlow.tsx"), "utf8");

    expect(actionSource).not.toContain("submittedPlayerIds");
    expect(actionSource).not.toContain("eligiblePlayerIds");
    expect(pageSource).not.toContain("submittedPlayerIds");
    expect(pageSource).not.toContain("eligiblePlayerIds");
    expect(clientSource).not.toContain("submittedPlayerIds");
    expect(clientSource).not.toContain("eligiblePlayerIds");
  });

  it("hard-disables the e2e ballot mutation route in production", () => {
    const helperSource = readFileSync(
      path.join(process.cwd(), "src/lib/server/test-route-safety.ts"),
      "utf8",
    );

    expect(helperSource).toContain("isProductionDeploymentEnv");
    expect(helperSource).toContain("x-tournament-test-token");

    for (const routePath of [
      "src/app/api/e2e/load-ballot/route.ts",
      "src/app/api/e2e/private-csv/route.ts",
    ]) {
      const routeSource = readFileSync(path.join(process.cwd(), routePath), "utf8");

      expect(routeSource).toContain("isE2eTestRouteAvailable");
    }
  });
});
