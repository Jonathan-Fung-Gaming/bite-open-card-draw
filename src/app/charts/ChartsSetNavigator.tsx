"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { PublicDrawSetPanel } from "@/components";
import {
  filterPublicChartsDrawForReveal,
  type PublicChartsSetView,
} from "@/lib/charts/public-chart-view";

type ChartsSetNavigatorProps = {
  serverNowMs: number;
  sets: PublicChartsSetView[];
  showAllDrawCards: boolean;
};

const ACTIVE_SET_STORAGE_KEY = "bite-open-card-draw:view-only-active-set";

export function ChartsSetNavigator({
  serverNowMs,
  sets,
  showAllDrawCards,
}: ChartsSetNavigatorProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [nowMs, setNowMs] = useState(serverNowMs);
  const maxActiveIndex = Math.max(sets.length - 1, 0);
  const drawnIndexes = sets.flatMap(({ draw }, index) => (draw ? [index] : []));
  const partiallyDrawn = drawnIndexes.length > 0 && drawnIndexes.length < sets.length;
  const fallbackActiveIndex = partiallyDrawn ? (drawnIndexes[0] ?? 0) : 0;
  const activeIndexIsAvailable =
    activeIndex >= 0 &&
    activeIndex <= maxActiveIndex &&
    (!partiallyDrawn || Boolean(sets[activeIndex]?.draw));
  const boundedActiveIndex = activeIndexIsAvailable
    ? Math.min(Math.max(activeIndex, 0), maxActiveIndex)
    : fallbackActiveIndex;

  useEffect(() => {
    const storedIndex = Number(window.sessionStorage.getItem(ACTIVE_SET_STORAGE_KEY));

    if (
      Number.isInteger(storedIndex) &&
      storedIndex >= 0 &&
      storedIndex <= maxActiveIndex &&
      (!partiallyDrawn || Boolean(sets[storedIndex]?.draw))
    ) {
      setActiveIndex(storedIndex);
    } else if (partiallyDrawn) {
      setActiveIndex(fallbackActiveIndex);
    }

    setHydrated(true);
  }, [fallbackActiveIndex, maxActiveIndex, partiallyDrawn, sets]);

  useEffect(() => {
    setNowMs(serverNowMs);

    if (showAllDrawCards) {
      return undefined;
    }

    const hasActiveReveal = sets.some(
      ({ draw, revealStartsAt }) => draw && revealStartsAt && revealStartsAt.length > 0,
    );

    if (!hasActiveReveal) {
      return undefined;
    }

    const basePerformanceMs = window.performance.now();
    const intervalId = window.setInterval(() => {
      setNowMs(serverNowMs + window.performance.now() - basePerformanceMs);
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [serverNowMs, sets, showAllDrawCards]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.sessionStorage.setItem(ACTIVE_SET_STORAGE_KEY, String(boundedActiveIndex));
  }, [boundedActiveIndex, hydrated]);

  return (
    <section className="mx-auto grid max-w-7xl gap-2 px-2 py-2 md:gap-5 md:px-5 md:py-5">
      <div
        className="grid grid-cols-2 gap-2 md:hidden"
        role="tablist"
        aria-label="View-only chart sets"
      >
        {sets.map(({ set, draw }, index) => {
          const tabAvailable = !partiallyDrawn || Boolean(draw);

          return (
            <button
              type="button"
              key={set.displayLabel}
              aria-controls={`view-only-set-${set.setOrder}`}
              aria-disabled={tabAvailable ? undefined : "true"}
              aria-selected={boundedActiveIndex === index}
              className={clsx(
                "min-h-9 rounded border px-2 py-2 text-xs font-black uppercase leading-none whitespace-nowrap",
                boundedActiveIndex === index
                  ? "border-ember-300 bg-ember-900/35 text-white"
                  : "border-metal-700 bg-black/25 text-metal-300",
                !tabAvailable && "opacity-55",
              )}
              disabled={!tabAvailable}
              onClick={(event) => {
                if (!tabAvailable) {
                  event.preventDefault();
                  setActiveIndex(fallbackActiveIndex);
                  return;
                }

                setActiveIndex(index);
              }}
              role="tab"
            >
              VIEW SET {set.setOrder} ({set.displayLabel})
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 md:grid-cols-2 md:gap-5">
        {sets.map((setView, index) => {
          const { set } = setView;
          const visibleDraw = filterPublicChartsDrawForReveal(setView, {
            nowMs,
            showAllCharts: showAllDrawCards,
          });
          const visibleCount = visibleDraw?.charts.length ?? 0;
          const revealStatus =
            setView.draw && !showAllDrawCards
              ? setView.revealStartsAt === null
                ? "Queued for reveal"
                : setView.revealStartsAt !== undefined && visibleCount < set.drawCount
                  ? `Revealing ${visibleCount} / ${set.drawCount}`
                  : null
              : null;

          return (
            <div
              key={set.displayLabel}
              className={clsx(
                !hydrated || index === boundedActiveIndex ? "block" : "hidden",
                "md:block",
              )}
              id={`view-only-set-${set.setOrder}`}
              role="tabpanel"
            >
              <PublicDrawSetPanel
                compactMobile
                draw={visibleDraw}
                revealStatus={revealStatus}
                set={set}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
