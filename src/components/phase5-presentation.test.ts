import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const { default: StageError } = await import("@/app/stage/error");
const { default: StageLoading } = await import("@/app/stage/loading");
const { ChartCardVisual } = await import("./ChartCardVisual");
const { PublicDrawSetPanel } = await import("./PublicDrawSetPanel");
const { RoundHeader } = await import("./RoundHeader");
const { TournamentLogo } = await import("./TournamentLogo");

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Phase 5 shared presentation contracts", () => {
  it("renders intrinsic optimized logo markup without changing its public contract", () => {
    const priorityHtml = renderToStaticMarkup(
      createElement(TournamentLogo, { priority: true, size: "standard" }),
    );
    const compactHtml = renderToStaticMarkup(
      createElement(TournamentLogo, { size: "mobile-compact" }),
    );

    expect(priorityHtml).toContain('width="512"');
    expect(priorityHtml).toContain('height="339"');
    expect(priorityHtml).toContain("tournament-logo-web.png");
    expect(priorityHtml).not.toContain("tournament-logo.png");
    expect(priorityHtml).toContain('alt="Pump It Up Open Stage tournament logo"');
    expect(priorityHtml).toContain('<link rel="preload" as="image"');
    expect(compactHtml).not.toContain('<link rel="preload" as="image"');
    expect(priorityHtml).toContain("pointer-events-none h-full w-full object-contain");
    expect(priorityHtml).toContain("drop-shadow-");
    expect(compactHtml).toContain("h-10 w-24 sm:h-24 sm:w-56");
    expect(compactHtml).toContain("(max-width: 640px) 96px, 224px");
  });

  it("keeps stage loading and error consumers on the intrinsic shared logo", () => {
    const loadingHtml = renderToStaticMarkup(createElement(StageLoading));
    const errorHtml = renderToStaticMarkup(createElement(StageError, { reset: () => undefined }));

    for (const html of [loadingHtml, errorHtml]) {
      expect(html).toContain('width="512"');
      expect(html).toContain('height="339"');
      expect(html).toContain('alt="Pump It Up Open Stage tournament logo"');
    }
    expect(errorHtml).toContain("Stage view interrupted");
    expect(loadingHtml).toContain("Loading tournament state");
  });

  it("omits the complete status row when a round header has no useful status", () => {
    const withoutStatus = renderToStaticMarkup(
      createElement(RoundHeader, { mobileCompact: true, title: "Drawn Charts" }),
    );
    const withStatus = renderToStaticMarkup(
      createElement(RoundHeader, { status: "Previous round results", title: "Final Charts" }),
    );

    expect(withoutStatus).toContain('data-mobile-compact="true"');
    expect(withoutStatus).toContain("Pump It Up Open Stage");
    expect(withoutStatus).toContain("Drawn Charts");
    expect(withoutStatus).not.toContain('data-testid="round-header-status"');
    expect(withStatus).toContain('data-testid="round-header-status"');
    expect(withStatus).toContain("Previous round results");
  });

  it("renders view-only chart visuals as passive articles with mobile overlays", () => {
    const set = {
      displayLabel: "S16",
      drawCount: 7,
      roundNumber: 1,
      setOrder: 1,
    } as const;
    const drawnHtml = renderToStaticMarkup(
      createElement(PublicDrawSetPanel, {
        set,
        draw: {
          charts: Array.from({ length: 7 }, (_, index) => ({
            artist: `Artist ${index + 1}`,
            id: `chart-${index + 1}`,
            imagePath: `/chart-images/chart-${index + 1}.png`,
            name: `Chart ${index + 1}`,
          })),
        },
      }),
    );
    const waitingHtml = renderToStaticMarkup(
      createElement(PublicDrawSetPanel, { set, draw: null }),
    );

    expect(drawnHtml.match(/<article/g)).toHaveLength(7);
    expect(drawnHtml).not.toContain("<button");
    expect(drawnHtml).not.toContain("aria-pressed");
    expect(drawnHtml).not.toContain("Tap to ban");
    expect(drawnHtml).not.toContain("Charts ready");
    expect(drawnHtml).toContain("bg-gradient-to-t");
    expect(drawnHtml).toContain("md:relative md:aspect-[16/9]");
    expect(waitingHtml).toContain("Awaiting host draw");
    expect(waitingHtml).toContain("This set has not been drawn yet.");

    const ballotHtml = renderToStaticMarkup(
      createElement(
        "button",
        null,
        createElement(ChartCardVisual, {
          artist: "Ballot artist",
          imagePath: "/chart-images/ballot.png",
          name: "Ballot chart",
          variant: "ballot",
        }),
      ),
    );

    expect(ballotHtml).not.toContain("<h3");
    expect(ballotHtml).not.toContain("<p");
    expect(ballotHtml).toContain("Ballot chart");
    expect(ballotHtml).toContain("Ballot artist");
  });

  it("keeps every required logo consumer routed through the shared component", () => {
    for (const path of [
      "src/components/RoundHeader.tsx",
      "src/components/AdminLayout.tsx",
      "src/app/room/page.tsx",
      "src/app/vote/page.tsx",
      "src/app/vote/VoteLiveShell.tsx",
      "src/app/coolguy69/page.tsx",
      "src/app/stage/loading.tsx",
      "src/app/stage/error.tsx",
    ]) {
      expect(source(path), path).toContain("<TournamentLogo");
    }

    for (const path of [
      "src/app/stage/page.tsx",
      "src/app/charts/page.tsx",
      "src/app/results/page.tsx",
    ]) {
      expect(source(path), path).toContain("<RoundHeader");
    }
  });
});
