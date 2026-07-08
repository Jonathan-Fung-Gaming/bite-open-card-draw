import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import type { RoundResultSnapshot, ResultSetSnapshot } from "@/lib/results/result-engine";
import { TIEBREAK_REVEAL_DURATION_MS } from "@/lib/results/reveal-timing";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const { PublicResultSummary } = await import("./PublicResultSummary");
const { ResultSetPanel } = await import("./ResultSetPanel");

function chart(id: string, name: string): DrawnChartSummary {
  return {
    id,
    name,
    artist: "Artist",
    displayDifficulty: "S16",
    songKey: `song-${id}`,
    chartKey: `chart-${id}`,
    sourceBgImg: "",
    localImagePath: `/chart-images/${id}.png`,
  };
}

function resultSet(overrides: Partial<ResultSetSnapshot> = {}): ResultSetSnapshot {
  const charts = [
    chart("winner", "Winner"),
    chart("least-tie", "Least Tie"),
    chart("middle", "Middle"),
    chart("most", "Most"),
  ];

  return {
    drawId: "draw-1",
    drawVersion: 1,
    roundSetId: "static-s16",
    setOrder: 1,
    displayLabel: "S16",
    rows: [
      { chart: charts[0]!, banCount: 0, selected: true, tiedForFewest: true },
      { chart: charts[1]!, banCount: 0, selected: false, tiedForFewest: true },
      { chart: charts[2]!, banCount: 1, selected: false, tiedForFewest: false },
      { chart: charts[3]!, banCount: 3, selected: false, tiedForFewest: false },
    ],
    maxBanCount: 3,
    leastBanCount: 0,
    selectedChart: charts[0]!,
    tiebreakUsed: false,
    tiebreakCandidateIds: [charts[0]!.id],
    tiebreakWinnerChartId: null,
    wheelSlots: [],
    wheelSupported: false,
    zeroBallotTiebreak: false,
    winnerRevealStartedAt: null,
    ...overrides,
  };
}

function roundResult(): RoundResultSnapshot {
  const setOne = resultSet();
  const setTwo = resultSet({
    drawId: "draw-2",
    roundSetId: "static-s17",
    setOrder: 2,
    displayLabel: "S17",
    selectedChart: chart("winner-two", "Winner Two"),
  });

  return {
    id: "result",
    roundNumber: 1,
    computedAt: "2026-07-08T00:00:00.000Z",
    eligiblePlayers: [],
    sets: [setOne, setTwo],
    revealPhase: "final",
    revealPhaseStartedAt: "2026-07-08T00:00:00.000Z",
    finalRevealedAt: "2026-07-08T00:01:00.000Z",
  };
}

describe("result presentation", () => {
  it("shows selected chart art in unique least-ban reveal panels", () => {
    const html = renderToStaticMarkup(
      createElement(ResultSetPanel, { set: resultSet(), showWinner: true }),
    );

    expect(html).toContain('data-testid="result-selected-reveal-card"');
    expect(html).toContain('data-testid="result-selected-reveal-image"');
    expect(html).toContain("/chart-images/winner.png");
    expect(html).toContain("Unique least-ban chart");
  });

  it("shows selected chart art in fallback tiebreak reveal after the sealed winner is revealed", () => {
    const revealStartedAt = "2026-07-08T00:00:00.000Z";
    const serverNowMs = Date.parse(revealStartedAt) + TIEBREAK_REVEAL_DURATION_MS;
    const html = renderToStaticMarkup(
      createElement(ResultSetPanel, {
        set: resultSet({
          tiebreakUsed: true,
          tiebreakCandidateIds: ["winner", "least-tie", "middle", "most", "fifth"],
          tiebreakWinnerChartId: "winner",
          wheelSupported: false,
          winnerRevealStartedAt: revealStartedAt,
        }),
        showWinner: true,
        serverNowMs,
      }),
    );

    expect(html).toContain('data-testid="fallback-tiebreak-reveal"');
    expect(html).toContain('data-winner-revealed="true"');
    expect(html).toContain('data-testid="result-selected-reveal-card"');
    expect(html).toContain("/chart-images/winner.png");
  });

  it("flags every least-ban row while keeping final public selected charts before full counts", () => {
    const panelHtml = renderToStaticMarkup(createElement(ResultSetPanel, { set: resultSet() }));
    const publicHtml = renderToStaticMarkup(
      createElement(PublicResultSummary, { result: roundResult() }),
    );

    expect(panelHtml.match(/data-tied-for-fewest="true"/g)).toHaveLength(2);
    expect(publicHtml.indexOf('data-testid="stage-chart-card"')).toBeLessThan(
      publicHtml.indexOf("Full ban counts"),
    );
    expect(
      publicHtml.match(/data-testid="result-least-ban-label"/g)?.length,
    ).toBeGreaterThanOrEqual(2);
  });
});
