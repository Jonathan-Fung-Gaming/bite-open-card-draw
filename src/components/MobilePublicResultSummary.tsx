"use client";

import { useState } from "react";
import clsx from "clsx";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import type { ResultSetSnapshot, RoundResultSnapshot } from "@/lib/results/result-engine";
import { ChartArtImage } from "./ChartArtImage";
import { PublicResultRows } from "./PublicResultRows";

type MobilePublicResultSummaryProps = {
  result: RoundResultSnapshot;
  selectedCardTestId: string;
};

type WinnerCardProps = {
  chart: DrawnChartSummary;
  expanded: boolean;
  onToggle: () => void;
  panelId: string;
  set: ResultSetSnapshot;
  testId: string;
};

function banLabel(count: number) {
  return String(count);
}

function WinnerCard({ chart, expanded, onToggle, panelId, set, testId }: WinnerCardProps) {
  const imagePath = chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH;

  return (
    <article
      className={clsx(
        "overflow-hidden rounded-md border bg-furnace-900 shadow-ember-tight",
        expanded
          ? "border-ember-200 ring-2 ring-ember-300/60 md:border-ember-300/35 md:ring-0"
          : "border-ember-300/35",
      )}
      data-chart-image-path={imagePath}
      data-testid={testId}
    >
      <div className="relative">
        <button
          type="button"
          aria-controls={panelId}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} ${set.displayLabel} ban counts`}
          className="relative block aspect-[16/9] w-full overflow-hidden border-ember-300/15 bg-black/35 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-300 md:pointer-events-none md:cursor-default md:border-b"
          data-testid="results-mobile-winner-toggle"
          onClick={onToggle}
        >
          <ChartArtImage
            src={imagePath}
            className="h-full w-full object-cover opacity-95 md:object-contain"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent md:hidden"
          />
        </button>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-1.5 md:pointer-events-auto md:static md:flex md:min-h-48 md:flex-col md:justify-between md:p-5">
          <div className="flex items-start justify-between gap-1 font-black uppercase text-ember-300 md:gap-3">
            <span
              className="text-sm leading-none md:text-5xl md:leading-tight"
              data-testid="selected-chart-difficulty"
            >
              {chart.displayDifficulty}
            </span>
          </div>
          <div>
            <h2
              className="mt-0.5 break-words text-[10px] font-black uppercase leading-[1.05] text-white line-clamp-2 md:mt-5 md:text-5xl md:leading-tight md:line-clamp-none"
              data-testid="selected-chart-title"
            >
              {chart.name}
            </h2>
            <p
              className="mt-0.5 break-words text-[9px] font-semibold leading-[1.05] text-metal-300 line-clamp-1 md:mt-3 md:text-2xl md:font-normal md:leading-normal md:line-clamp-none"
              data-testid="selected-chart-artist"
            >
              {chart.artist}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export function MobileResultBanCountPanel({
  panelId,
  set,
}: {
  panelId: string;
  set: ResultSetSnapshot;
}) {
  return (
    <section
      aria-label={`${set.displayLabel} ban counts`}
      className="metal-panel rounded-lg p-2 md:hidden"
      data-expanded="true"
      data-testid="results-mobile-ban-panel"
      id={panelId}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2 border-b border-ember-300/20 pb-1 text-[10px] font-black uppercase tracking-[0.12em] text-ember-300">
        <p>Song</p>
        <p className="text-right">Bans</p>
      </div>
      <ol className="mt-1 grid gap-0.5" data-testid="results-ban-count-list">
        {set.rows.map((row) => (
          <li
            key={row.chart.id}
            className={clsx(
              "grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2 rounded border px-1.5 py-1",
              row.selected
                ? "border-ember-200 bg-ember-900/30"
                : row.tiedForFewest
                  ? "border-ember-300/55 bg-ember-900/10"
                  : "border-metal-700 bg-black/20",
            )}
            data-testid="results-mobile-ban-row"
          >
            <div className="min-w-0">
              <p className="break-words text-[10px] font-black uppercase leading-[1.08] text-white">
                {row.chart.name}
              </p>
              <p className="mt-0.5 break-words text-[9px] leading-[1.08] text-metal-300">
                {row.chart.artist}
              </p>
            </div>
            <p
              className="flex items-center justify-end self-stretch font-mono text-sm font-black leading-none text-ember-300"
              data-testid="results-mobile-ban-count"
            >
              {banLabel(row.banCount)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function MobilePublicResultSummary({
  result,
  selectedCardTestId,
}: MobilePublicResultSummaryProps) {
  const [expandedSetOrder, setExpandedSetOrder] = useState<1 | 2 | null>(null);

  function toggleSet(setOrder: 1 | 2) {
    setExpandedSetOrder((current) => (current === setOrder ? null : setOrder));
  }

  const expandedSet = result.sets.find((set) => set.setOrder === expandedSetOrder) ?? null;
  const expandedPanelId = `mobile-result-ban-counts-${result.id}`;

  return (
    <div
      className="grid gap-2 md:gap-5"
      data-compact-mobile-results="true"
      data-testid="mobile-public-result-summary"
    >
      <div className="grid grid-cols-2 gap-2 md:gap-4" data-testid="results-winner-grid">
        {result.sets.map((set) => (
          <WinnerCard
            key={set.roundSetId}
            chart={set.selectedChart}
            expanded={expandedSetOrder === set.setOrder}
            onToggle={() => toggleSet(set.setOrder)}
            panelId={expandedPanelId}
            set={set}
            testId={selectedCardTestId}
          />
        ))}
      </div>

      {expandedSet ? (
        <MobileResultBanCountPanel panelId={expandedPanelId} set={expandedSet} />
      ) : (
        <div
          className="rounded-md border border-ember-300/40 bg-black/35 px-2 py-2 text-center text-[9px] font-black uppercase leading-none tracking-[0.08em] text-ember-300 shadow-ember-tight md:hidden"
          data-testid="results-mobile-ban-prompt"
        >
          CLICK A CHART TO VIEW BAN COUNTS
        </div>
      )}

      <section className="metal-panel hidden rounded-lg p-5 md:block">
        <h2 className="text-4xl font-black uppercase text-white">Ban counts</h2>
        <div className="mt-4 grid gap-3">
          {result.sets.map((set) => (
            <details
              key={set.roundSetId}
              className="rounded border border-metal-700 bg-black/25 p-4 text-xl text-metal-300"
            >
              <summary className="cursor-pointer text-2xl font-bold uppercase text-ember-300">
                {set.displayLabel} ban counts
              </summary>
              <PublicResultRows set={set} />
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
