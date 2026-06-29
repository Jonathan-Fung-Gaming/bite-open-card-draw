"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { EligiblePlayerSnapshot } from "@/lib/vote/voting-window";

type ManualBallotFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  roundNumber: 1 | 2 | 3 | 4;
  players: EligiblePlayerSnapshot[];
  draws: DrawRecord[];
  existingPlayerIds: string[];
  canControl: boolean;
  canSubmitManualBallot: boolean;
};

type ManualSetSelection = {
  bannedChartIds: string[];
  noBans: boolean;
};

function emptySelections(draws: DrawRecord[]) {
  return Object.fromEntries(
    draws.map((draw) => [draw.id, { bannedChartIds: [], noBans: false }]),
  ) as Record<string, ManualSetSelection>;
}

export function ManualBallotForm({
  action,
  roundNumber,
  players,
  draws,
  existingPlayerIds,
  canControl,
  canSubmitManualBallot,
}: ManualBallotFormProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [setSelections, setSetSelections] = useState(() => emptySelections(draws));
  const disabled = !canControl || !canSubmitManualBallot || draws.length !== 2;
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const selectedUsername = selectedPlayer?.startggUsername ?? "selected player";
  const selectedHasExistingBallot = existingPlayerIds.includes(selectedPlayerId);

  useEffect(() => {
    setSetSelections(emptySelections(draws));
  }, [draws]);

  const getSelection = (drawId: string) =>
    setSelections[drawId] ?? { bannedChartIds: [], noBans: false };

  const setChartBan = (drawId: string, chartId: string, checked: boolean) => {
    setSetSelections((current) => {
      const selection = current[drawId] ?? { bannedChartIds: [], noBans: false };

      if (!checked) {
        return {
          ...current,
          [drawId]: {
            noBans: false,
            bannedChartIds: selection.bannedChartIds.filter((id) => id !== chartId),
          },
        };
      }

      if (selection.bannedChartIds.includes(chartId) || selection.bannedChartIds.length >= 2) {
        return current;
      }

      return {
        ...current,
        [drawId]: {
          noBans: false,
          bannedChartIds: [...selection.bannedChartIds, chartId],
        },
      };
    });
  };

  const setNoBans = (drawId: string, checked: boolean) => {
    setSetSelections((current) => ({
      ...current,
      [drawId]: {
        noBans: checked,
        bannedChartIds: checked ? [] : (current[drawId]?.bannedChartIds ?? []),
      },
    }));
  };

  return (
    <form action={action} className="metal-panel rounded-lg p-4">
      <input type="hidden" name="roundNumber" value={roundNumber} />
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-ember-300" />
        <div>
          <p className="font-bold text-white">
            {selectedHasExistingBallot
              ? `You are about to manually replace a ballot for ${selectedUsername}.`
              : "You are about to manually enter a ballot."}
          </p>
          <p className="mt-1 text-sm text-metal-300">
            This will save a server-side ballot for the selected eligible player and may change the round result.
          </p>
        </div>
      </div>

      {!canSubmitManualBallot ? (
        <p className="mt-4 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300">
          Manual ballots are available while voting is open or after voting closes but before result reveal starts.
          If results were computed but not revealed, a manual ballot invalidates that computation so the host
          must compute results again.
        </p>
      ) : null}

      <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="manual-player">
        player
      </label>
      <select
        id="manual-player"
        name="playerId"
        required
        disabled={disabled}
        value={selectedPlayerId}
        onChange={(event) => setSelectedPlayerId(event.target.value)}
        className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
      >
        <option value="">Choose eligible player</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {player.startggUsername}
          </option>
        ))}
      </select>

      {selectedHasExistingBallot ? (
        <div className="mt-3 rounded border border-ember-500/40 bg-ember-900/25 p-3 text-sm text-ember-300">
          <p>{selectedUsername} already has a submitted ballot.</p>
          <p>Replacing it may change the round result and will be marked in the private CSV.</p>
          <p>Confirm replacement below before saving.</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4">
        {draws.map((draw, drawIndex) => {
          const selection = getSelection(draw.id);

          return (
            <fieldset key={draw.id} className="rounded border border-metal-700 bg-black/20 p-3" disabled={disabled}>
              <legend className="px-1 text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
                Set {drawIndex + 1} choices - {draw.displayLabel}
              </legend>
              <p className="mt-1 text-xs text-metal-300">Select 1-2 bans or choose no bans for this set.</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-ember-300">
                {selection.bannedChartIds.length}/2 bans selected
              </p>
              <div className="mt-3 grid gap-2">
                {draw.charts.map((chart) => {
                  const checked = selection.bannedChartIds.includes(chart.id);
                  const banDisabled =
                    disabled ||
                    selection.noBans ||
                    (!checked && selection.bannedChartIds.length >= 2);

                  return (
                    <label
                      key={chart.id}
                      className="flex gap-2 rounded border border-metal-700 bg-black/25 p-2 text-sm text-metal-300"
                    >
                      <input
                        checked={checked}
                        disabled={banDisabled}
                        name={`bans:${draw.id}`}
                        onChange={(event) => setChartBan(draw.id, chart.id, event.target.checked)}
                        type="checkbox"
                        value={chart.id}
                      />
                      <span>
                        <span className="font-bold text-white">{chart.name}</span>
                        <span className="ml-2 text-xs uppercase text-ember-300">{chart.displayDifficulty}</span>
                      </span>
                    </label>
                  );
                })}
                <label className="flex gap-2 rounded border border-ember-300/30 bg-black/25 p-2 text-sm font-bold text-ember-300">
                  <input
                    checked={selection.noBans}
                    disabled={disabled || selection.bannedChartIds.length > 0}
                    name={`noBans:${draw.id}`}
                    onChange={(event) => setNoBans(draw.id, event.target.checked)}
                    type="checkbox"
                    value="true"
                  />
                  No bans for this set
                </label>
              </div>
            </fieldset>
          );
        })}
      </div>

      {selectedHasExistingBallot ? (
        <label className="mt-4 flex items-start gap-2 text-sm font-semibold text-metal-300">
          <input
            name="replaceExistingBallot"
            required
            type="checkbox"
            value="yes"
            disabled={disabled}
          />
          <span>Replace existing ballot for {selectedUsername}</span>
        </label>
      ) : null}

      <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="manual-reason">
        reason
      </label>
      <textarea
        id="manual-reason"
        name="reason"
        required
        disabled={disabled}
        rows={3}
        className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
      />

      <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="manual-password">
        Admin password
      </label>
      <input
        id="manual-password"
        name="adminPassword"
        type="password"
        required
        disabled={disabled}
        className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
      />

      <button className="button-metal mt-4 w-full rounded px-4 py-2 font-bold uppercase disabled:opacity-40" disabled={disabled}>
        Save Manual Ballot
      </button>
    </form>
  );
}
