"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { ResultSetSnapshot } from "@/lib/results/result-engine";
import {
  TIEBREAK_REVEAL_DURATION_MS,
  getTiebreakRevealRemainingMs,
  isTiebreakRevealComplete,
} from "@/lib/results/reveal-timing";
import { ChartArtImage } from "./ChartArtImage";
import { RuneWheel } from "./RuneWheel";

type ResultSetPanelProps = {
  set: ResultSetSnapshot;
  showWinner?: boolean;
  serverNowMs?: number;
  stageMode?: boolean;
};

const STAGE_RESULT_ROW_REVEAL_INTERVAL_MS = 1_100;

function banLabel(count: number) {
  return `${count} ${count === 1 ? "ban" : "bans"}`;
}

function sortStageRevealRows(
  left: ResultSetSnapshot["rows"][number],
  right: ResultSetSnapshot["rows"][number],
) {
  if (left.banCount !== right.banCount) {
    return right.banCount - left.banCount;
  }

  return left.chart.name.localeCompare(right.chart.name);
}

function RevealChartCard({
  chart,
  stageMode,
}: {
  chart: ResultSetSnapshot["selectedChart"];
  stageMode: boolean;
}) {
  const imagePath = chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH;

  return (
    <article
      className={clsx(
        "overflow-hidden rounded border border-ember-300/45 bg-furnace-900 shadow-ember-tight",
        stageMode ? "w-full max-w-3xl" : "w-full",
      )}
      data-chart-id={chart.id}
      data-chart-image-path={imagePath}
      data-testid="result-selected-reveal-card"
    >
      <div className="relative aspect-[16/9] overflow-hidden border-b border-ember-300/15 bg-black/35">
        <ChartArtImage
          src={imagePath}
          className="h-full w-full object-contain opacity-95"
          testId="result-selected-reveal-image"
        />
      </div>
      <div className={clsx("p-4", stageMode ? "sm:p-5" : "sm:p-4")}>
        <p
          className={clsx(
            "font-black uppercase leading-none text-ember-300",
            stageMode ? "text-5xl" : "text-2xl",
          )}
        >
          {chart.displayDifficulty}
        </p>
        <h3
          className={clsx(
            "mt-3 break-words font-black uppercase leading-tight text-white",
            stageMode ? "text-4xl" : "text-xl",
          )}
        >
          {chart.name}
        </h3>
        <p
          className={clsx("mt-2 break-words text-metal-300", stageMode ? "text-2xl" : "text-base")}
        >
          {chart.artist}
        </p>
      </div>
    </article>
  );
}

export function ResultSetPanel({
  set,
  showWinner = false,
  serverNowMs,
  stageMode = false,
}: ResultSetPanelProps) {
  const [nowMs, setNowMs] = useState(serverNowMs ?? Date.now());
  const displayRows = set.rows;
  const stageRevealRows =
    stageMode && !showWinner ? [...displayRows].sort(sortStageRevealRows) : displayRows;
  const stageRevealRankByChartId = new Map(
    stageRevealRows.map((row, index) => [row.chart.id, index]),
  );
  const initialStageVisibleRowCount =
    stageMode && !showWinner && stageRevealRows.length > 0 ? 1 : displayRows.length;
  const [stageVisibleRowCount, setStageVisibleRowCount] = useState(initialStageVisibleRowCount);
  const [stageTiebreakWinnerRevealed, setStageTiebreakWinnerRevealed] = useState(false);
  const serverTiebreakWinnerRevealed =
    showWinner && set.tiebreakUsed && isTiebreakRevealComplete(set.winnerRevealStartedAt, nowMs);
  const tiebreakWinnerRevealed =
    stageMode && showWinner && set.tiebreakUsed
      ? stageTiebreakWinnerRevealed
      : serverTiebreakWinnerRevealed;
  const shouldShowSelectedState = showWinner && (!set.tiebreakUsed || tiebreakWinnerRevealed);
  const tiebreakRemainingMs =
    showWinner && set.tiebreakUsed
      ? stageMode
        ? stageTiebreakWinnerRevealed
          ? 0
          : TIEBREAK_REVEAL_DURATION_MS
        : getTiebreakRevealRemainingMs(set.winnerRevealStartedAt, nowMs)
      : 0;
  const tiebreakRemainingSeconds = Math.ceil(tiebreakRemainingMs / 1000);
  const revealPanel = showWinner ? (
    <>
      {set.tiebreakUsed ? (
        set.wheelSupported ? (
          <RuneWheel
            stageMode={stageMode}
            slots={set.wheelSlots}
            winnerChartId={set.selectedChart.id}
            winnerRevealed={tiebreakWinnerRevealed}
          />
        ) : (
          <div
            className={clsx(
              "rounded border border-ember-300/35 bg-black/25",
              stageMode ? "p-5" : "p-3",
            )}
            data-testid="fallback-tiebreak-reveal"
            data-winner-revealed={tiebreakWinnerRevealed ? "true" : "false"}
          >
            <p
              className={clsx(
                "font-bold uppercase tracking-[0.18em] text-ember-300",
                stageMode ? "text-2xl" : "text-xs",
              )}
            >
              Fallback tiebreak reveal
            </p>
            {tiebreakWinnerRevealed ? (
              <div className="mt-4">
                <RevealChartCard chart={set.selectedChart} stageMode={stageMode} />
              </div>
            ) : (
              <p className={clsx("mt-2 font-black text-white", stageMode ? "text-3xl" : "text-lg")}>
                Selector locked for reveal
              </p>
            )}
            <p className={clsx("mt-2 text-metal-300", stageMode ? "text-xl" : "text-sm")}>
              {tiebreakWinnerRevealed
                ? "5 or more charts tied for fewest bans."
                : `Revealing in ${tiebreakRemainingSeconds} seconds.`}
            </p>
          </div>
        )
      ) : (
        <div
          className={clsx(
            "rounded border border-ember-300/35 bg-black/25",
            stageMode ? "p-5" : "p-3",
          )}
        >
          <p
            className={clsx(
              "font-bold uppercase tracking-[0.18em] text-ember-300",
              stageMode ? "text-2xl" : "text-xs",
            )}
          >
            Unique least-ban chart
          </p>
          <p className={clsx("mt-2 font-black text-white", stageMode ? "text-3xl" : "text-lg")}>
            {set.selectedChart.name}
          </p>
          <div className="mt-4">
            <RevealChartCard chart={set.selectedChart} stageMode={stageMode} />
          </div>
        </div>
      )}
    </>
  ) : null;

  useEffect(() => {
    const baseNowMs = serverNowMs ?? Date.now();

    setNowMs(baseNowMs);

    if (!showWinner || !set.tiebreakUsed) {
      return undefined;
    }

    const basePerformanceMs = window.performance.now();
    const intervalId = window.setInterval(() => {
      setNowMs(baseNowMs + window.performance.now() - basePerformanceMs);
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [serverNowMs, set.tiebreakUsed, set.winnerRevealStartedAt, showWinner]);

  useEffect(() => {
    if (!stageMode || showWinner) {
      setStageVisibleRowCount(displayRows.length);
      return undefined;
    }

    setStageVisibleRowCount(displayRows.length > 0 ? 1 : 0);

    const intervalId = window.setInterval(() => {
      setStageVisibleRowCount((count) => {
        if (count >= displayRows.length) {
          window.clearInterval(intervalId);
          return count;
        }

        return count + 1;
      });
    }, STAGE_RESULT_ROW_REVEAL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [displayRows.length, set.drawId, set.drawVersion, showWinner, stageMode]);

  useEffect(() => {
    if (!stageMode || !showWinner || !set.tiebreakUsed) {
      setStageTiebreakWinnerRevealed(false);
      return undefined;
    }

    const storageKey = [
      "stage-tiebreak",
      set.drawId,
      set.selectedChart.id,
      set.winnerRevealStartedAt ?? "no-start",
    ].join(":");
    const startedAtMs = set.winnerRevealStartedAt ? Date.parse(set.winnerRevealStartedAt) : NaN;
    const initialServerNowMs = serverNowMs ?? Date.now();
    const serverRevealAlreadyComplete =
      Number.isFinite(startedAtMs) &&
      initialServerNowMs - startedAtMs >= TIEBREAK_REVEAL_DURATION_MS;
    let storedRevealComplete = false;

    try {
      storedRevealComplete = window.sessionStorage.getItem(storageKey) === "complete";

      if (serverRevealAlreadyComplete) {
        window.sessionStorage.setItem(storageKey, "complete");
      }
    } catch {
      // Session storage can be unavailable in hardened browser contexts.
    }

    if (serverRevealAlreadyComplete || storedRevealComplete) {
      setStageTiebreakWinnerRevealed(true);
      return undefined;
    }

    setStageTiebreakWinnerRevealed(false);

    const timeoutId = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(storageKey, "complete");
      } catch {
        // The visual state can still complete even if storage is unavailable.
      }

      setStageTiebreakWinnerRevealed(true);
    }, TIEBREAK_REVEAL_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    set.drawId,
    set.selectedChart.id,
    set.tiebreakUsed,
    set.winnerRevealStartedAt,
    serverNowMs,
    showWinner,
    stageMode,
  ]);

  if (stageMode && showWinner) {
    return (
      <section className="metal-panel rounded-lg p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xl font-semibold uppercase tracking-[0.22em] text-ember-300">
              Set {set.setOrder} - {set.displayLabel}
            </p>
            <h2 className="mt-1 text-5xl font-black uppercase leading-none text-white">
              {set.tiebreakUsed ? "Tiebreak Selector" : "Selected Chart"}
            </h2>
          </div>
          <p className="rounded border border-metal-700 bg-black/25 px-4 py-2 text-xl font-bold uppercase text-metal-300">
            {set.tiebreakUsed ? "Rune wheel" : "Least bans"}
          </p>
        </div>
        <div className="mt-3 grid place-items-center">{revealPanel}</div>
      </section>
    );
  }

  return (
    <section className={clsx("metal-panel rounded-lg", stageMode ? "p-5" : "p-4")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p
            className={clsx(
              "font-semibold uppercase tracking-[0.22em] text-ember-300",
              stageMode ? "text-xl" : "text-xs",
            )}
          >
            Set {set.setOrder} - {set.displayLabel}
          </p>
          <h2
            className={clsx(
              "mt-1 font-black uppercase text-white",
              stageMode ? "text-5xl" : "text-2xl",
            )}
          >
            Ban Counts
          </h2>
        </div>
        <p
          className={clsx(
            "rounded border border-metal-700 bg-black/25 font-bold uppercase text-metal-300",
            stageMode ? "px-4 py-2 text-xl" : "px-3 py-2 text-sm",
          )}
        >
          {stageMode
            ? "Least banned first - revealing most banned first"
            : "Least banned to most banned"}
        </p>
      </div>
      <div
        className={clsx(
          "grid",
          stageMode && showWinner
            ? "mt-4 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,44vw)]"
            : "mt-4",
        )}
      >
        <div className={clsx("grid", stageMode ? "gap-3 md:grid-cols-2" : "gap-3")}>
          {displayRows.map((row, index) => {
            const barWidth =
              set.maxBanCount > 0 ? `${(row.banCount / set.maxBanCount) * 100}%` : "0%";
            const stageRevealIndex = stageRevealRankByChartId.get(row.chart.id) ?? index;
            const rowRevealed = !stageMode || showWinner || stageRevealIndex < stageVisibleRowCount;

            return (
              <article
                key={row.chart.id}
                className={clsx(
                  "grid rounded border bg-black/25 transition duration-500",
                  stageMode
                    ? "gap-3 p-3 md:grid-cols-[104px_1fr_auto]"
                    : "gap-3 p-3 md:grid-cols-[96px_1fr_auto]",
                  rowRevealed
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-3 opacity-0",
                  shouldShowSelectedState && row.selected
                    ? "border-ember-200 bg-ember-900/30 shadow-ember-tight ring-2 ring-ember-300/70"
                    : row.tiedForFewest
                      ? "border-ember-300/65 bg-ember-900/15 shadow-[0_0_16px_rgba(255,185,92,0.18)]"
                      : "border-metal-700",
                )}
                data-ban-count={row.banCount}
                data-result-row-visible={rowRevealed ? "true" : "false"}
                data-stage-reveal-index={stageRevealIndex}
                data-testid="result-row"
                data-tied-for-fewest={row.tiedForFewest ? "true" : "false"}
              >
                <div
                  className={clsx(
                    "relative overflow-hidden rounded border border-ember-300/15 bg-furnace-900",
                    stageMode ? "h-28" : "h-24",
                  )}
                >
                  <ChartArtImage
                    src={row.chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH}
                    className="h-full w-full object-cover opacity-65"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <p
                    className={clsx(
                      "absolute bottom-2 left-2 font-mono font-black text-ember-300",
                      stageMode ? "text-base" : "text-xs",
                    )}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </p>
                </div>
                <div className="min-w-0">
                  <p
                    className={clsx(
                      "font-black uppercase leading-tight text-ember-300",
                      stageMode ? "text-3xl" : "text-xl",
                    )}
                    data-testid="result-row-difficulty"
                  >
                    {row.chart.displayDifficulty}
                  </p>
                  <h3
                    className={clsx(
                      "mt-1 line-clamp-2 font-black uppercase leading-tight text-white",
                      stageMode ? "text-2xl leading-tight" : "text-xl",
                    )}
                    data-testid="result-row-title"
                  >
                    {row.chart.name}
                  </h3>
                  <p
                    className={clsx(
                      "mt-1 text-metal-300",
                      stageMode ? "line-clamp-2 break-words text-lg" : "line-clamp-1 text-sm",
                    )}
                    data-testid="result-row-artist"
                  >
                    {row.chart.artist}
                  </p>
                  <div
                    className={clsx(
                      "overflow-hidden rounded bg-metal-900",
                      stageMode ? "mt-2 h-2" : "mt-3 h-2",
                    )}
                  >
                    <div className="h-full rounded bg-ember-500" style={{ width: barWidth }} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 md:block md:text-right">
                  <p
                    className={clsx(
                      "rounded border border-ember-300/35 bg-ember-900/25 font-black text-white",
                      stageMode ? "px-4 py-2 text-2xl" : "px-3 py-2",
                    )}
                    data-testid="result-row-ban-count"
                  >
                    {banLabel(row.banCount)}
                  </p>
                  {shouldShowSelectedState && row.selected ? (
                    <p
                      className={clsx(
                        "mt-2 font-black uppercase tracking-[0.16em] text-ember-300",
                        stageMode ? "text-lg" : "text-xs",
                      )}
                      data-testid="result-selected-label"
                    >
                      Selected
                    </p>
                  ) : null}
                  {row.tiedForFewest ? (
                    <p
                      className={clsx(
                        "mt-2 font-black uppercase tracking-[0.16em] text-ember-300",
                        stageMode ? "text-lg" : "text-xs",
                      )}
                      data-testid="result-least-ban-label"
                    >
                      Least bans
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
