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
};

function banLabel(count: number) {
  return `${count} ${count === 1 ? "ban" : "bans"}`;
}

export function ResultSetPanel({ set, showWinner = false, serverNowMs }: ResultSetPanelProps) {
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

  useEffect(() => {
    if (!showWinner || !set.tiebreakUsed || tiebreakWinnerRevealed) {
      return undefined;
    }

    const intervalId = window.setInterval(() => setNowMs(Date.now()), 250);

    return () => window.clearInterval(intervalId);
  }, [set.tiebreakUsed, set.winnerRevealStartedAt, showWinner, tiebreakWinnerRevealed]);

  return (
    <section className="metal-panel rounded-lg p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
            Set {set.setOrder} - {set.displayLabel}
          </p>
          <h2 className="mt-1 text-2xl font-black uppercase text-white">Ban Counts</h2>
        </div>
        <p className="rounded border border-metal-700 bg-black/25 px-3 py-2 text-sm font-bold uppercase text-metal-300">
          Most banned to least banned
        </p>
      </div>
      <div className="mt-4 grid gap-3">
        {set.rows.map((row, index) => {
          const barWidth =
            set.maxBanCount > 0 ? `${(row.banCount / set.maxBanCount) * 100}%` : "0%";

          return (
            <article
              key={row.chart.id}
              className={clsx(
                "grid gap-3 rounded border bg-black/25 p-3 md:grid-cols-[96px_1fr_auto]",
                shouldShowSelectedState && row.selected
                  ? "border-ember-300 shadow-ember-tight"
                  : "border-metal-700",
              )}
            >
              <div className="relative h-24 overflow-hidden rounded border border-ember-300/15 bg-furnace-900">
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
                <h3 className="mt-1 text-xl font-black uppercase text-white">{row.chart.name}</h3>
                <p className="mt-1 text-sm text-metal-300">{row.chart.artist}</p>
                <div className="mt-3 h-2 overflow-hidden rounded bg-metal-900">
                  <div className="h-full rounded bg-ember-500" style={{ width: barWidth }} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 md:block md:text-right">
                <p className="rounded border border-ember-300/35 bg-ember-900/25 px-3 py-2 font-black text-white">
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
      {showWinner ? (
        <div className="mt-4 grid gap-3">
          {set.tiebreakUsed ? (
            set.wheelSupported ? (
              <RuneWheel
                slots={set.wheelSlots}
                winnerChartId={set.selectedChart.id}
                winnerRevealed={tiebreakWinnerRevealed}
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
                  <p className="mt-2 text-lg font-black text-white">
                    Backend winner sealed for reveal
                  </p>
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
        </div>
      ) : null}
    </section>
  );
}
