import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RoundResultSnapshot } from "@/lib/results/result-engine";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const { PublicResultSummary } = await import("./PublicResultSummary");
const { ResultsBanCountDisclosure, resultsBanCountStorageKey } =
  await import("./ResultsBanCountDisclosure");

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function result(): RoundResultSnapshot {
  function resultSet(setOrder: 1 | 2): RoundResultSnapshot["sets"][number] {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      chart: {
        artist: `完全な Artist ${setOrder}-${index + 1}`,
        chartKey: `chart-${setOrder}-${index + 1}`,
        displayDifficulty: setOrder === 1 ? "S16" : "S17",
        id: `chart-${setOrder}-${index + 1}`,
        localImagePath: "/chart-images/fallback-card.svg",
        name:
          index === 0
            ? "PHASESIXMOBILEUNBROKENCHARTTITLEWITHOUTANYSPACESMUSTWRAPCOMPLETELY123"
            : `Chart ${setOrder}-${index + 1}`,
        songKey: `song-${setOrder}-${index + 1}`,
        sourceBgImg: "",
      },
      banCount: index,
      tiedForFewest: index === 0,
      selected: index === 0,
    }));

    return {
      displayLabel: setOrder === 1 ? "S16" : "S17",
      drawId: `draw-${setOrder}`,
      drawVersion: 1,
      leastBanCount: 0,
      maxBanCount: 6,
      roundSetId: `round-set-${setOrder}`,
      rows,
      selectedChart: rows[0]!.chart,
      setOrder,
      tiebreakCandidateIds: [rows[0]!.chart.id],
      tiebreakUsed: false,
      tiebreakWinnerChartId: null,
      wheelSlots: [],
      wheelSupported: false,
      winnerRevealStartedAt: null,
    };
  }

  const sets: RoundResultSnapshot["sets"] = [resultSet(1), resultSet(2)];

  return {
    computedAt: "2026-07-14T00:00:00.000Z",
    eligiblePlayers: [],
    finalRevealedAt: "2026-07-14T00:00:01.000Z",
    id: "phase-6-result",
    revealPhase: "final",
    revealPhaseStartedAt: "2026-07-14T00:00:01.000Z",
    roundNumber: 1,
    sets,
  };
}

describe("Phase 6 compact mobile results contracts", () => {
  it("keeps the shared summary default unchanged and makes the compact variant opt-in", () => {
    const snapshot = result();
    const defaultHtml = renderToStaticMarkup(
      createElement(PublicResultSummary, { result: snapshot }),
    );
    const compactHtml = renderToStaticMarkup(
      createElement(PublicResultSummary, { compactMobileResults: true, result: snapshot }),
    );

    expect(defaultHtml).toContain('data-compact-mobile-results="false"');
    expect(defaultHtml).not.toContain("results-winner-grid");
    expect(defaultHtml).not.toContain("Show Ban Counts");
    expect(defaultHtml.match(/<details/g)).toHaveLength(2);
    expect(compactHtml).toContain('data-compact-mobile-results="true"');
    expect(compactHtml).toContain('data-testid="results-winner-grid"');
    expect(compactHtml).toContain("grid-cols-2");
    expect(compactHtml).toContain("md:min-h-48");
    expect(compactHtml).toContain("md:text-5xl");
    expect(compactHtml).toContain(snapshot.sets[0].selectedChart.name);
    expect(compactHtml).toContain(snapshot.sets[0].selectedChart.artist);
  });

  it("renders one native mobile disclosure with both complete seven-row lists", () => {
    const snapshot = result();
    const html = renderToStaticMarkup(
      createElement(ResultsBanCountDisclosure, {
        resultId: snapshot.id,
        sets: snapshot.sets,
      }),
    );

    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html.match(/<summary/g)).toHaveLength(1);
    expect(html).toContain("Show Ban Counts");
    expect(html).toContain("min-h-11");
    expect(html.match(/data-testid="results-ban-count-list"/g)).toHaveLength(2);
    expect(html.match(/data-testid="public-result-row"/g)).toHaveLength(14);
    expect(html.match(/data-testid="result-selected-label"/g)).toHaveLength(2);
    expect(html).toContain("S16 ban counts");
    expect(html).toContain("S17 ban counts");
    expect(html).not.toContain("%");
    expect(resultsBanCountStorageKey(snapshot.id)).toBe(
      "bite-open-card-draw:results-ban-counts:phase-6-result",
    );
  });

  it("opts in from public final-result routes and preserves protected results copy", () => {
    const resultsPage = source("src/app/results/page.tsx");
    const chartsPage = source("src/app/charts/page.tsx");
    const votePage = source("src/app/vote/page.tsx");

    expect(resultsPage).toContain("<PublicResultSummary compactMobileResults result={result} />");
    expect(resultsPage).toContain("Previous round results");
    expect(resultsPage).toContain("Results are being revealed on stage.");
    expect(resultsPage).toContain("mobileCompact");
    expect(chartsPage).toContain("<PublicResultSummary compactMobileResults result={result} />");
    expect(votePage).not.toContain("compactMobileResults");
  });
});
