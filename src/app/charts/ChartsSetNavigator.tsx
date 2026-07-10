"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { PublicDrawSetPanel } from "@/components";
import type { PublicChartsSetView } from "@/lib/charts/public-chart-view";

type ChartsSetNavigatorProps = {
  sets: PublicChartsSetView[];
  status: {
    label: string;
    detail: string;
    timerText?: string | null;
  };
};

const ACTIVE_SET_STORAGE_KEY = "bite-open-card-draw:view-only-active-set";

export function ChartsSetNavigator({ sets, status }: ChartsSetNavigatorProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
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
  const activeSet = sets[boundedActiveIndex];

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
    if (!hydrated) {
      return;
    }

    window.sessionStorage.setItem(ACTIVE_SET_STORAGE_KEY, String(boundedActiveIndex));
  }, [boundedActiveIndex, hydrated]);

  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5">
      <div className="metal-panel rounded-lg p-4" data-testid="view-only-status">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
              View charts only - no votes recorded
            </p>
            <h2 className="mt-1 text-xl font-black uppercase text-white">{status.label}</h2>
          </div>
          {status.timerText ? (
            <p className="font-mono text-3xl font-black tabular-nums text-white">
              {status.timerText}
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-metal-300">{status.detail}</p>
      </div>

      <div
        className="grid grid-cols-2 gap-2 md:hidden"
        role="tablist"
        aria-label="View-only chart sets"
      >
        {sets.map(({ set, draw }, index) => {
          const tabAvailable = !partiallyDrawn || Boolean(draw);

          return (
            <a
              key={set.displayLabel}
              aria-controls={`view-only-set-${set.setOrder}`}
              aria-disabled={tabAvailable ? undefined : "true"}
              aria-selected={boundedActiveIndex === index}
              className={clsx(
                "rounded border px-3 py-3 text-sm font-black uppercase",
                boundedActiveIndex === index
                  ? "border-ember-300 bg-ember-900/35 text-white"
                  : "border-metal-700 bg-black/25 text-metal-300",
                !tabAvailable && "opacity-55",
              )}
              href={tabAvailable ? `#view-only-set-${set.setOrder}` : "#"}
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
              View Set {set.setOrder}
              <span className="block font-mono text-xs">{set.displayLabel}</span>
            </a>
          );
        })}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {sets.map(({ set, draw }, index) => (
          <div
            key={set.displayLabel}
            className={clsx(
              !hydrated || index === boundedActiveIndex ? "block" : "hidden",
              "md:block",
            )}
            id={`view-only-set-${set.setOrder}`}
            role="tabpanel"
          >
            <PublicDrawSetPanel set={set} draw={draw} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <button
          className="rounded border border-metal-700 px-4 py-3 font-bold uppercase text-metal-300 disabled:opacity-40"
          disabled={!hydrated || boundedActiveIndex === 0}
          onClick={() => setActiveIndex((current) => Math.max(0, current - 1))}
          type="button"
        >
          Previous chart set
        </button>
        <button
          className="rounded border border-metal-700 px-4 py-3 font-bold uppercase text-metal-300 disabled:opacity-40"
          disabled={!hydrated || !activeSet || boundedActiveIndex === sets.length - 1}
          onClick={() => setActiveIndex((current) => Math.min(sets.length - 1, current + 1))}
          type="button"
        >
          Next chart set
        </button>
      </div>
    </section>
  );
}
