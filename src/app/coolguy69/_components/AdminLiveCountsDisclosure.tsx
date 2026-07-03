"use client";

import { useState, useTransition } from "react";
import type { AdminLiveCountSet } from "@/lib/admin/live-counts";

type AdminLiveCountsDisclosureProps = {
  roundNumber: 1 | 2 | 3 | 4;
  action: (roundNumber: 1 | 2 | 3 | 4) => Promise<AdminLiveCountSet[]>;
};

export function AdminLiveCountsDisclosure({
  roundNumber,
  action,
}: AdminLiveCountsDisclosureProps) {
  const [liveCountRows, setLiveCountRows] = useState<AdminLiveCountSet[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function revealLiveCounts() {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      try {
        const rows = await action(roundNumber);

        setLiveCountRows(rows);
        setMessage(null);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not load live counts.");
      }
    });
  }

  return (
    <section className="metal-panel rounded-lg p-4" data-testid="admin-live-counts">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
        Sensitive Admin Counts
      </p>
      <h2 className="mt-1 text-2xl font-black uppercase text-white">Live Chart Counts</h2>
      <div className="mt-4 rounded border border-ember-300/30 bg-ember-900/15 p-3">
        <p className="text-sm text-metal-300">
          Keep this closed on projector or stream. This warning does not require another password
          because it does not change tournament state.
        </p>
        <button
          className="button-metal mt-4 rounded px-4 py-2 text-sm font-black uppercase disabled:opacity-40"
          disabled={isPending}
          onClick={revealLiveCounts}
          type="button"
        >
          {liveCountRows ? "Refresh live counts" : "Show live counts"}
        </button>
        {message ? (
          <p className="mt-3 text-sm text-ember-300" role="alert">
            {message}
          </p>
        ) : null}
        {liveCountRows ? (
          <div className="mt-4 grid gap-3">
            {liveCountRows.length === 0 ? (
              <p className="text-sm text-metal-300">
                Draw both current-round sets before live counts appear.
              </p>
            ) : (
              liveCountRows.map((set) => (
                <div key={set.id} className="rounded border border-metal-700 bg-black/25 p-3">
                  <p className="font-bold text-white">{set.displayLabel}</p>
                  <ol className="mt-2 grid gap-1 text-sm text-metal-300">
                    {set.rows.map((row) => (
                      <li key={row.id} className="flex justify-between gap-3">
                        <span>{row.name}</span>
                        <span className="font-mono text-ember-300">{row.banCount}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
