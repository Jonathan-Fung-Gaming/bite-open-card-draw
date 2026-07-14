"use client";

import { useEffect, useRef } from "react";
import type { ResultSetSnapshot } from "@/lib/results/result-engine";
import { PublicResultRows } from "./PublicResultRows";

type ResultsBanCountDisclosureProps = {
  resultId: string;
  sets: [ResultSetSnapshot, ResultSetSnapshot];
};

export function resultsBanCountStorageKey(resultId: string) {
  return `bite-open-card-draw:results-ban-counts:${resultId}`;
}

export function ResultsBanCountDisclosure({ resultId, sets }: ResultsBanCountDisclosureProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const storageKey = resultsBanCountStorageKey(resultId);

  useEffect(() => {
    const details = detailsRef.current;

    if (!details) {
      return;
    }

    try {
      details.open = window.sessionStorage.getItem(storageKey) === "open";
    } catch {
      details.open = false;
    }
  }, [storageKey]);

  return (
    <details
      className="group metal-panel rounded-lg md:hidden"
      data-storage-key={storageKey}
      data-testid="results-ban-count-disclosure"
      onToggle={(event) => {
        try {
          window.sessionStorage.setItem(storageKey, event.currentTarget.open ? "open" : "closed");
        } catch {
          // The native disclosure remains usable if browser storage is unavailable.
        }
      }}
      ref={detailsRef}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-black uppercase text-ember-300 marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-300">
        <span>Show Ban Counts</span>
        <span aria-hidden="true" className="text-lg leading-none">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </span>
      </summary>
      <div className="border-t border-ember-300/15 p-3">
        <h2 className="text-xl font-black uppercase text-white">Ban counts</h2>
        <div className="mt-3 grid gap-3">
          {sets.map((set) => {
            const labelId = `results-ban-counts-${resultId}-${set.roundSetId}`;

            return (
              <section key={set.roundSetId} aria-labelledby={labelId}>
                <h3 id={labelId} className="text-base font-black uppercase text-ember-300">
                  {set.displayLabel} ban counts
                </h3>
                <PublicResultRows
                  compact
                  labelledBy={labelId}
                  listTestId="results-ban-count-list"
                  set={set}
                />
              </section>
            );
          })}
        </div>
      </div>
    </details>
  );
}
