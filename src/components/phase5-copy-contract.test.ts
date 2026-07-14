import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Phase 5 copy contract", () => {
  it("removes only the reviewed redundant stage, chart, result, and spinner copy", () => {
    const stage = source("src/app/stage/page.tsx");
    const charts = source("src/app/charts/page.tsx");
    const publicDraw = source("src/components/PublicDrawSetPanel.tsx");
    const publicResults = source("src/components/PublicResultSummary.tsx");
    const resultSet = source("src/components/ResultSetPanel.tsx");
    const runeWheel = source("src/components/RuneWheel.tsx");

    expect(stage).not.toContain("One window covers both sets.");
    expect(stage).toContain("Ballots submitted:");
    expect(stage).toContain("Ban selections cast across both sets:");
    expect(charts).not.toContain('status="Chart display"');
    expect(charts).not.toContain("Final charts revealed");
    expect(publicDraw).not.toContain('draw ? "Charts ready"');
    expect(publicDraw).toContain("Awaiting host draw");
    expect(publicResults).not.toContain("Full ban counts");
    expect(publicResults).toContain(">Ban counts</h2>");
    expect(resultSet).not.toContain("Full ban counts");
    expect(runeWheel).not.toContain("Tiebreak selector is spinning.");
    expect(runeWheel).toContain("Waiting for authoritative reveal timing.");
  });

  it("preserves protected identity, no-bans, reveal, previous-round, host, danger, and error copy", () => {
    expect(source("src/app/vote/UsernameSelectField.tsx")).toContain(
      "Select your start.gg username",
    );
    expect(source("src/app/vote/BallotFlow.tsx")).toContain("Are you sure you are voting as");
    expect(source("src/app/vote/BallotFlow.tsx")).toContain("No bans for this set");
    expect(source("src/app/vote/page.tsx")).toContain("Results are being revealed on stage.");
    expect(source("src/app/results/page.tsx")).toContain("Previous round results");
    expect(source("src/components/AdminLayout.tsx")).toContain("Host credential restore required");
    expect(source("src/components/DangerousActionDialog.tsx")).toContain("Action summary");
    expect(source("src/components/DangerousActionDialog.tsx")).toContain(
      "Required before destructive actions",
    );
    expect(source("src/app/stage/error.tsx")).toContain("Stage view interrupted");
  });
});
