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
const { RuneWheel } = await import("./RuneWheel");

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

function resultRowOpenTags(html: string) {
  return html.match(/<article\b[^>]*data-testid="result-row"[^>]*>/g) ?? [];
}

function stageRevealOrderChartIds(html: string) {
  return resultRowOpenTags(html)
    .map((row) => {
      const chartId = row.match(/data-chart-id="([^"]+)"/)?.[1];
      const revealIndex = Number(row.match(/data-stage-reveal-index="([^"]+)"/)?.[1]);

      if (!chartId || !Number.isFinite(revealIndex)) {
        throw new Error(`Result row is missing chart id or stage reveal index: ${row}`);
      }

      return { chartId, revealIndex };
    })
    .sort((left, right) => left.revealIndex - right.revealIndex)
    .map((row) => row.chartId);
}

function wheelSlots() {
  const charts = [chart("winner", "Winner"), chart("runner-up", "Runner Up")];

  return Array.from({ length: 12 }, (_, index) => charts[index % charts.length]!);
}

describe("result presentation", () => {
  it("shows selected chart art in unique least-ban reveal panels", () => {
    const html = renderToStaticMarkup(
      createElement(ResultSetPanel, { set: resultSet(), showWinner: true }),
    );

    expect(html).toContain('data-testid="result-selected-reveal-card"');
    expect(html).toContain('data-testid="result-selected-reveal-image"');
    expect(html).toContain("/chart-images/winner.png");
    expect(html).toContain("Selected chart");
  });

  it("shows selected chart art in fallback tiebreak reveal after the winner is revealed", () => {
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
    expect(html).toContain("Tiebreak reveal");
    expect(html).not.toContain("Fallback tiebreak reveal");
    expect(html).not.toContain("Selector locked for reveal");
  });

  it("flags every least-ban row while keeping final public selected charts before full counts", () => {
    const panelHtml = renderToStaticMarkup(createElement(ResultSetPanel, { set: resultSet() }));
    const publicHtml = renderToStaticMarkup(
      createElement(PublicResultSummary, { result: roundResult() }),
    );

    expect(panelHtml.match(/data-tied-for-fewest="true"/g)).toHaveLength(2);
    expect(publicHtml.indexOf('data-testid="stage-chart-card"')).toBeLessThan(
      publicHtml.indexOf(">Ban counts</h2>"),
    );
    expect(panelHtml).not.toContain("Full ban counts");
    expect(publicHtml).not.toContain("Full ban counts");
    expect(
      publicHtml.match(/data-testid="result-least-ban-label"/g)?.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("reveals tied stage rows backward from their final detail order", () => {
    const charts = Array.from({ length: 7 }, (_, index) =>
      chart(`chart-${index + 1}`, `Chart ${index + 1}`),
    );
    const html = renderToStaticMarkup(
      createElement(ResultSetPanel, {
        set: resultSet({
          rows: [
            { chart: charts[0]!, banCount: 0, selected: true, tiedForFewest: true },
            { chart: charts[1]!, banCount: 0, selected: false, tiedForFewest: true },
            { chart: charts[2]!, banCount: 0, selected: false, tiedForFewest: true },
            { chart: charts[3]!, banCount: 3, selected: false, tiedForFewest: false },
            { chart: charts[4]!, banCount: 3, selected: false, tiedForFewest: false },
            { chart: charts[5]!, banCount: 3, selected: false, tiedForFewest: false },
            { chart: charts[6]!, banCount: 5, selected: false, tiedForFewest: false },
          ],
          maxBanCount: 5,
          leastBanCount: 0,
          selectedChart: charts[0]!,
          tiebreakUsed: true,
          tiebreakCandidateIds: [charts[0]!.id, charts[1]!.id, charts[2]!.id],
          tiebreakWinnerChartId: charts[0]!.id,
        }),
        stageMode: true,
      }),
    );

    expect(stageRevealOrderChartIds(html)).toEqual([
      "chart-7",
      "chart-6",
      "chart-5",
      "chart-4",
      "chart-3",
      "chart-2",
      "chart-1",
    ]);
  });

  it("centers rune wheel status without the old title", () => {
    const html = renderToStaticMarkup(
      createElement(RuneWheel, {
        slots: wheelSlots(),
        winnerChartId: "winner",
        winnerRevealed: true,
        stageMode: true,
      }),
    );

    expect(html).not.toContain("Rune-wheel tiebreak");
    expect(html).toContain('data-testid="rune-wheel-center"');
    expect(html).toContain('data-testid="rune-wheel-status"');
    expect(html).not.toContain("Selected chart:");
    expect(html).not.toContain("sealed chart");
    expect(html).toContain("Winner");
    expect(html).toMatch(/data-testid="rune-wheel-center"[\s\S]*data-testid="rune-wheel-status"/);
    expect(html).toContain("rune-wheel-slot-selected");
    expect(html).toContain('data-slot-winner="true"');
  });

  it("removes the stage tiebreak panel rune wheel badge", () => {
    const html = renderToStaticMarkup(
      createElement(ResultSetPanel, {
        set: resultSet({
          tiebreakUsed: true,
          tiebreakCandidateIds: ["winner", "least-tie"],
          tiebreakWinnerChartId: "winner",
          wheelSupported: true,
          wheelSlots: wheelSlots(),
        }),
        showWinner: true,
        stageMode: true,
      }),
    );

    expect(html).not.toContain(">Rune wheel<");
    expect(html).toContain("Selected Chart");
  });

  it("leaves the rune wheel center visually blank while authoritative spinning is active", () => {
    const revealStartedAt = "2026-07-08T00:00:00.000Z";
    const html = renderToStaticMarkup(
      createElement(RuneWheel, {
        slots: wheelSlots(),
        winnerChartId: "winner",
        winnerRevealed: false,
        revealStartedAt,
        serverNowMs: Date.parse(revealStartedAt) + 1_000,
        stageMode: true,
      }),
    );

    expect(html).not.toContain("Tiebreak selector is spinning.");
    expect(html).toMatch(/data-testid="rune-wheel-status"[^>]*><\/p>/);
    expect(html).not.toContain("sealed chart");
  });

  it("shows an authoritative waiting state when tiebreak timing is unavailable", () => {
    const wheelHtml = renderToStaticMarkup(
      createElement(RuneWheel, {
        slots: wheelSlots(),
        winnerChartId: "winner",
        winnerRevealed: false,
        revealStartedAt: null,
        serverNowMs: Date.parse("2026-07-08T00:00:01.000Z"),
        stageMode: true,
      }),
    );
    const fallbackHtml = renderToStaticMarkup(
      createElement(ResultSetPanel, {
        set: resultSet({
          tiebreakUsed: true,
          tiebreakCandidateIds: ["winner", "least-tie", "middle", "most", "fifth"],
          tiebreakWinnerChartId: "winner",
          wheelSupported: false,
          winnerRevealStartedAt: null,
        }),
        showWinner: true,
        serverNowMs: Date.parse("2026-07-08T00:00:01.000Z"),
      }),
    );

    expect(wheelHtml).toContain("Waiting for authoritative reveal timing.");
    expect(wheelHtml).not.toContain("Tiebreak selector is spinning.");
    expect(fallbackHtml).toContain("Waiting for reveal timing");
    expect(fallbackHtml).toContain("Waiting for the authoritative reveal start time.");
    expect(fallbackHtml).not.toContain("Revealing in 10 seconds.");
  });
});
