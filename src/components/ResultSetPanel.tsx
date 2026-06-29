"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { ResultSetSnapshot } from "@/lib/results/result-engine";
import {
  getTiebreakRevealRemainingMs,
  isTiebreakRevealComplete,
} from "@/lib/results/reveal-timing";
import { RuneWheel } from "./RuneWheel";

type ResultSetPanelProps = {
  set: ResultSetSnapshot;
  showWinner?: boolean;
  serverNowMs?: number;
  stageMode?: boolean;
};

function banLabel(count: number) {
  return `${count} ${count === 1 ? "ban" : "bans"}`;
}

export function ResultSetPanel({
  set,
  showWinner = false,
  serverNowMs,
  stageMode = false,
}: ResultSetPanelProps) {
  const [nowMs, setNowMs] = useState(serverNowMs ?? Date.now());
  const tiebreakWinnerRevealed =
    showWinner &&
    set.tiebreakUsed &&
    isTiebreakRevealComplete(set.winnerRevealStartedAt, nowMs);
  const shouldShowSelectedState = showWinner && (!set.tiebreakUsed || tiebreakWinnerRevealed);
  const tiebreakRemainingMs =
    showWinner && set.tiebreakUsed
      ? getTiebreakRevealRemainingMs(set.winnerRevealStartedAt, nowMs)
      : 0;
  const tiebreakRemainingSeconds = Math.ceil(tiebreakRemainingMs / 1000);
  const revealPanel = showWinner ? (
    <>
      {set.tiebreakUsed ? (
        set.wheelSupported ? (
          <RuneWheel
            compact={stageMode}
            slots={set.wheelSlots}
            winnerChartId={set.selectedChart.id}
            winnerRevealed={tiebreakWinnerRevealed}
            winnerRevealStartedAt={set.winnerRevealStartedAt}
            nowMs={nowMs}
          />
        ) : (
          <div
            className="rounded border border-ember-300/35 bg-black/25 p-3"
            data-testid="fallback-tiebreak-reveal"
            data-winner-revealed={tiebreakWinnerRevealed ? "true" : "false"}
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ember-300">
              Fallback tiebreak reveal
            </p>
            {tiebreakWinnerRevealed ? (
              <p className="mt-2 text-lg font-black text-white">{set.selectedChart.name}</p>
            ) : (
              <p className="mt-2 text-lg font-black text-white">Backend winner sealed for reveal</p>
            )}
            <p className="mt-1 text-sm text-metal-300">
              {tiebreakWinnerRevealed
                ? "5 or more charts tied for fewest bans."
                : `Revealing in ${tiebreakRemainingSeconds} seconds.`}
            </p>
          </div>
        )
      ) : (
        <div className="rounded border border-ember-300/35 bg-black/25 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-ember-300">
            Unique least-ban chart
          </p>
          <p className="mt-2 text-lg font-black text-white">{set.selectedChart.name}</p>
        </div>
      )}
    </>
  ) : null;

  useEffect(() => {
    if (!showWinner || !set.tiebreakUsed || tiebreakWinnerRevealed) {
      return undefined;
    }

    const intervalId = window.setInterval(() => setNowMs(Date.now()), 250);

    return () => window.clearInterval(intervalId);
  }, [set.tiebreakUsed, set.winnerRevealStartedAt, showWinner, tiebreakWinnerRevealed]);

  return (
    <section className={clsx("metal-panel rounded-lg", stageMode ? "p-2" : "p-4")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
            Set {set.setOrder} - {set.displayLabel}
          </p>
          <h2 className={clsx("mt-1 font-black uppercase text-white", stageMode ? "text-lg" : "text-2xl")}>
            Ban Counts
          </h2>
        </div>
        <p
          className={clsx(
            "rounded border border-metal-700 bg-black/25 font-bold uppercase text-metal-300",
            stageMode ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm",
          )}
        >
          Least banned to most banned
        </p>
      </div>
      <div
        className={clsx(
          "grid",
          stageMode && showWinner ? "mt-3 gap-2 lg:grid-cols-[minmax(0,1fr)_220px]" : "mt-4",
        )}
      >
        <div className={clsx("grid", stageMode ? "gap-2 lg:grid-cols-2" : "gap-3")}>
        {set.rows.map((row, index) => {
          const barWidth =
            set.maxBanCount > 0 ? `${(row.banCount / set.maxBanCount) * 100}%` : "0%";

          return (
            <article
              key={row.chart.id}
              className={clsx(
                "grid rounded border bg-black/25",
                stageMode
                  ? "gap-2 p-1.5 md:grid-cols-[48px_1fr_auto]"
                  : "gap-3 p-3 md:grid-cols-[96px_1fr_auto]",
                shouldShowSelectedState && row.selected
                  ? "border-ember-300 shadow-ember-tight"
                  : "border-metal-700",
              )}
            >
              <div
                className={clsx(
                  "relative overflow-hidden rounded border border-ember-300/15 bg-furnace-900",
                  stageMode ? "h-12" : "h-24",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH}
                  alt=""
                  className="h-full w-full object-cover opacity-65"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <p className="absolute bottom-2 left-2 font-mono text-xs font-black text-ember-300">
                  {String(index + 1).padStart(2, "0")}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
                  {row.chart.displayDifficulty}
                </p>
                <h3
                  className={clsx(
                    "mt-1 line-clamp-2 font-black uppercase text-white",
                    stageMode ? "text-sm leading-tight" : "text-xl",
                  )}
                >
                  {row.chart.name}
                </h3>
                <p className={clsx("mt-1 line-clamp-1 text-metal-300", stageMode ? "text-xs" : "text-sm")}>
                  {row.chart.artist}
                </p>
                <div
                  className={clsx(
                    "overflow-hidden rounded bg-metal-900",
                    stageMode ? "mt-1 h-1.5" : "mt-3 h-2",
                  )}
                >
                  <div className="h-full rounded bg-ember-500" style={{ width: barWidth }} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 md:block md:text-right">
                <p
                  className={clsx(
                    "rounded border border-ember-300/35 bg-ember-900/25 font-black text-white",
                    stageMode ? "px-2 py-1 text-sm" : "px-3 py-2",
                  )}
                >
                  {banLabel(row.banCount)}
                </p>
                {shouldShowSelectedState && row.selected ? (
                  <p
                    className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-ember-300"
                    data-testid="result-selected-label"
                  >
                    Selected
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
        </div>
        {showWinner ? <div className="grid content-start gap-2">{revealPanel}</div> : null}
      </div>
    </section>
  );
}
