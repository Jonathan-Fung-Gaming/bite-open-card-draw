import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SERVER_SECRET_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
  "ADMIN_PASSWORD_HASH",
  "adminPasswordHash",
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
});
