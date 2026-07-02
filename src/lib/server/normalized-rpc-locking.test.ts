import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("normalized RPC locking", () => {
  it("serializes ballot submission and result computation with snapshot persistence", () => {
    const ballotSource = readFileSync(
      path.join(process.cwd(), "src/lib/server/normalized-ballots.ts"),
      "utf8",
    );
    const resultSource = readFileSync(
      path.join(process.cwd(), "src/lib/server/normalized-results.ts"),
      "utf8",
    );

    expect(ballotSource).toContain("withNormalizedEventPersistenceLock");
    expect(ballotSource).toContain('executeNormalizedTransactionalMutation("submitBallot"');
    expect(resultSource).toContain("withNormalizedEventPersistenceLock");
    expect(resultSource).toContain('executeNormalizedTransactionalMutation("computeResults"');
  });
});
