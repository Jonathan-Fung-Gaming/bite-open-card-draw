"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
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
  const disabled = !canControl || !canSubmitManualBallot || draws.length !== 2;
  const selectedHasExistingBallot = existingPlayerIds.includes(selectedPlayerId);

  return (
    <form action={action} className="metal-panel rounded-lg p-4">
      <input type="hidden" name="roundNumber" value={roundNumber} />
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-ember-300" />
        <div>
          <p className="font-bold text-white">You are about to manually enter a ballot.</p>
          <p className="mt-1 text-sm text-metal-300">
            This will save a server-side ballot for the selected eligible player.
          </p>
        </div>
      </div>

      {!canSubmitManualBallot ? (
        <p className="mt-4 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300">
          Manual ballots are available while voting is open or after voting closes but before results are computed.
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
          <p>This player already has a submitted ballot.</p>
          <p>Are you sure you want to replace it?</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4">
        {draws.map((draw, drawIndex) => (
          <fieldset key={draw.id} className="rounded border border-metal-700 bg-black/20 p-3" disabled={disabled}>
            <legend className="px-1 text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
              Set {drawIndex + 1} choices - {draw.displayLabel}
            </legend>
            <p className="mt-1 text-xs text-metal-300">Select 1-2 bans or choose no bans for this set.</p>
            <div className="mt-3 grid gap-2">
              {draw.charts.map((chart) => (
                <label
                  key={chart.id}
                  className="flex gap-2 rounded border border-metal-700 bg-black/25 p-2 text-sm text-metal-300"
                >
                  <input name={`bans:${draw.id}`} type="checkbox" value={chart.id} />
                  <span>
                    <span className="font-bold text-white">{chart.name}</span>
                    <span className="ml-2 text-xs uppercase text-ember-300">{chart.displayDifficulty}</span>
                  </span>
                </label>
              ))}
              <label className="flex gap-2 rounded border border-ember-300/30 bg-black/25 p-2 text-sm font-bold text-ember-300">
                <input name={`noBans:${draw.id}`} type="checkbox" value="true" />
                No bans for this set
              </label>
            </div>
          </fieldset>
        ))}
      </div>

      <label className="mt-4 flex items-start gap-2 text-sm font-semibold text-metal-300">
        <input name="replaceExistingBallot" type="checkbox" value="yes" disabled={disabled} />
        <span>replace existing ballot? yes/no</span>
      </label>

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
