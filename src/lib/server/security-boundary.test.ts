import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SERVER_SECRET_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
  "ADMIN_PASSWORD_HASH",
  "adminPasswordHash",
  "TOURNAMENT_TEST_ROUTE_TOKEN",
] as const;

const CLIENT_ENTRYPOINTS = [
  "src/app/coolguy69/_components/AdminInactivityTimer.tsx",
  "src/app/coolguy69/_components/AdminSessionHeartbeat.tsx",
  "src/app/coolguy69/_components/HostHeartbeat.tsx",
  "src/app/coolguy69/_components/ManualBallotForm.tsx",
  "src/app/coolguy69/_components/PrivateCsvDownload.tsx",
  "src/app/vote/BallotFlow.tsx",
  "src/components/CountdownTimer.tsx",
];

describe("browser security boundary", () => {
  it("does not reference server-only secret names from client components", () => {
    for (const relativePath of CLIENT_ENTRYPOINTS) {
      const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");

      for (const secretName of SERVER_SECRET_NAMES) {
        expect(source, `${relativePath} should not reference ${secretName}`).not.toContain(secretName);
      }
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
    const routeSource = readFileSync(
      path.join(process.cwd(), "src/app/api/e2e/load-ballot/route.ts"),
      "utf8",
    );

    expect(routeSource).toContain('process.env.NODE_ENV === "production"');
    expect(routeSource).toContain("x-tournament-test-token");
  });
});
