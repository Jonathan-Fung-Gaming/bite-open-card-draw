import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STAGE_CHART_REVEAL_INTERVAL_MS } from "@/lib/stage/stage-view";
import { filterPublicChartsDrawForReveal } from "@/lib/charts/public-chart-view";
import type { PublicChartsSetView } from "@/lib/charts/public-chart-view";
import type { RoundResultSnapshot } from "@/lib/results/result-engine";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const { ChartsSetNavigator } = await import("@/app/charts/ChartsSetNavigator");
const { MobileResultBanCountPanel } = await import("./MobilePublicResultSummary");
const { PublicDrawSetPanel } = await import("./PublicDrawSetPanel");
const { PublicResultSummary } = await import("./PublicResultSummary");

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function publicChartsSet(setOrder: 1 | 2): PublicChartsSetView {
  const displayLabel: PublicChartsSetView["set"]["displayLabel"] = setOrder === 1 ? "S16" : "S17";

  return {
    draw: {
      charts: Array.from({ length: 7 }, (_, index) => ({
        artist: `Follow Up Artist ${setOrder}-${index + 1}`,
        id: `follow-up-chart-${setOrder}-${index + 1}`,
        imagePath: `/chart-images/follow-up-${setOrder}-${index + 1}.png`,
        name: `Follow Up Chart ${setOrder}-${index + 1}`,
      })),
    },
    set: {
      displayLabel,
      drawCount: 7,
      roundNumber: 1 as const,
      setOrder,
    },
  };
}

function result(): RoundResultSnapshot {
  function resultSet(setOrder: 1 | 2): RoundResultSnapshot["sets"][number] {
    const displayDifficulty = setOrder === 1 ? "S16" : "S17";
    const rows = Array.from({ length: 7 }, (_, index) => ({
      chart: {
        artist: `Follow Up Result Artist ${setOrder}-${index + 1}`,
        chartKey: `follow-up-result-${setOrder}-${index + 1}`,
        displayDifficulty,
        id: `follow-up-result-${setOrder}-${index + 1}`,
        localImagePath: "/chart-images/fallback-card.svg",
        name: `Follow Up Result Chart ${setOrder}-${index + 1}`,
        songKey: `follow-up-song-${setOrder}-${index + 1}`,
        sourceBgImg: "",
      },
      banCount: index,
      selected: index === 0,
      tiedForFewest: index === 0,
    }));

    return {
      displayLabel: displayDifficulty,
      drawId: `follow-up-draw-${setOrder}`,
      drawVersion: 1,
      leastBanCount: 0,
      maxBanCount: 6,
      roundSetId: `follow-up-set-${setOrder}`,
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

  return {
    computedAt: "2026-07-15T00:00:00.000Z",
    eligiblePlayers: [],
    finalRevealedAt: "2026-07-15T00:00:01.000Z",
    id: "mobile-charts-results-follow-up",
    revealPhase: "final",
    revealPhaseStartedAt: "2026-07-15T00:00:01.000Z",
    roundNumber: 1,
    sets: [resultSet(1), resultSet(2)],
  };
}

function occurrences(html: string, pattern: RegExp) {
  return html.match(pattern)?.length ?? 0;
}

describe("mobile charts/results follow-up contracts", () => {
  it("removes /charts view-only status copy and uses non-navigating one-line tabs", () => {
    const chartsPage = source("src/app/charts/page.tsx");
    const navigator = source("src/app/charts/ChartsSetNavigator.tsx");
    const html = renderToStaticMarkup(
      createElement(ChartsSetNavigator, {
        serverNowMs: Date.parse("2026-07-15T00:00:00.000Z"),
        sets: [publicChartsSet(1), publicChartsSet(2)],
        showAllDrawCards: true,
      }),
    );

    expect(chartsPage).not.toContain("View charts only - no votes recorded");
    expect(chartsPage).not.toContain('data-testid="view-only-status"');
    expect(navigator).not.toContain('data-testid="view-only-status"');
    expect(navigator).not.toContain("href=");
    expect(html).toContain('role="tablist"');
    expect(html).toContain("<button");
    expect(html).not.toContain("<a ");
    expect(html).toContain("VIEW SET 1 (S16)");
    expect(html).toContain("VIEW SET 2 (S17)");
  });

  it("filters /charts draw cards by the stage reveal clock without leaking unrevealed titles", () => {
    const setView = publicChartsSet(1);
    const revealStartsAt = "2026-07-15T00:00:00.000Z";
    const serverNowMs = Date.parse(revealStartsAt) + STAGE_CHART_REVEAL_INTERVAL_MS * 2 - 1;
    const revealView = { ...setView, revealStartsAt };
    const canonicalDraw = filterPublicChartsDrawForReveal(revealView, {
      nowMs: serverNowMs,
      showAllCharts: false,
    });
    const canonicalHtml = renderToStaticMarkup(
      createElement(PublicDrawSetPanel, {
        compactMobile: true,
        draw: canonicalDraw,
        revealStatus: "Revealing 2 / 7",
        set: setView.set,
      }),
    );

    expect(occurrences(canonicalHtml, /data-testid="stage-chart-card"/g)).toBe(7);
    expect(occurrences(canonicalHtml, /data-has-chart="true"/g)).toBe(2);
    expect(occurrences(canonicalHtml, /data-has-chart="false"/g)).toBe(5);
    expect(canonicalHtml).toContain("Follow Up Chart 1-1");
    expect(canonicalHtml).toContain("Follow Up Chart 1-2");
    expect(canonicalHtml).not.toContain("Follow Up Chart 1-3");
    expect(canonicalHtml).not.toContain("Follow Up Artist 1-3");

    const votingEraDraw = filterPublicChartsDrawForReveal(revealView, {
      nowMs: serverNowMs,
      showAllCharts: true,
    });
    const votingEraHtml = renderToStaticMarkup(
      createElement(PublicDrawSetPanel, {
        compactMobile: true,
        draw: votingEraDraw,
        set: setView.set,
      }),
    );

    expect(occurrences(votingEraHtml, /data-has-chart="true"/g)).toBe(7);
    expect(votingEraHtml).toContain("Follow Up Chart 1-7");
  });

  it("renders compact /results as per-image mobile disclosures and leaves default summaries intact", () => {
    const snapshot = result();
    const defaultHtml = renderToStaticMarkup(
      createElement(PublicResultSummary, { result: snapshot }),
    );
    const compactHtml = renderToStaticMarkup(
      createElement(PublicResultSummary, { compactMobileResults: true, result: snapshot }),
    );
    const panelHtml = renderToStaticMarkup(
      createElement(MobileResultBanCountPanel, {
        panelId: "unit-mobile-result-ban-panel",
        set: snapshot.sets[0],
      }),
    );

    expect(defaultHtml).toContain('data-compact-mobile-results="false"');
    expect(defaultHtml).not.toContain('data-testid="results-mobile-winner-toggle"');
    expect(defaultHtml.match(/<details/g)).toHaveLength(2);

    expect(compactHtml).toContain('data-compact-mobile-results="true"');
    expect(compactHtml).not.toContain("Show Ban Counts");
    expect(compactHtml).toContain("CLICK A CHART TO VIEW BAN COUNTS");
    expect(compactHtml).toContain('data-testid="results-mobile-ban-prompt"');
    expect(occurrences(compactHtml, /data-testid="results-mobile-winner-toggle"/g)).toBe(2);
    expect(occurrences(compactHtml, /aria-expanded="false"/g)).toBe(2);
    expect(compactHtml).not.toContain(">01<");
    expect(compactHtml).not.toContain(">02<");

    expect(occurrences(panelHtml, /data-testid="results-mobile-ban-panel"/g)).toBe(1);
    expect(occurrences(panelHtml, /data-testid="results-mobile-ban-row"/g)).toBe(7);
    expect(panelHtml).not.toContain("CLICK A CHART TO VIEW BAN COUNTS");
    expect(panelHtml).toContain("Song");
    expect(panelHtml).toContain("Bans");
    expect(panelHtml).toContain('data-testid="results-mobile-ban-count"');
    expect(panelHtml).not.toContain("Least bans");
    expect(panelHtml).not.toContain("Selected");
    const rowFragments =
      panelHtml.match(/<li[^>]*data-testid="results-mobile-ban-row"[\s\S]*?<\/li>/g) ?? [];

    expect(rowFragments).toHaveLength(7);
    for (const row of rowFragments) {
      expect(row).not.toContain("S16");
    }
  });

  it("keeps the compact mobile results variant route-only and away from stage rendering", () => {
    const resultsPage = source("src/app/results/page.tsx");
    const chartsPage = source("src/app/charts/page.tsx");
    const votePage = source("src/app/vote/page.tsx");
    const stagePage = source("src/app/stage/page.tsx");

    expect(resultsPage).toContain("<PublicResultSummary compactMobileResults result={result} />");
    expect(chartsPage).not.toContain("compactMobileResults");
    expect(votePage).not.toContain("compactMobileResults");
    expect(stagePage).not.toContain("compactMobileResults");
    expect(stagePage).not.toContain("PublicResultSummary");
    expect(stagePage).toContain('data-testid="stage-final-chart-list"');
  });
});
