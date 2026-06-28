import { CheckCircle2 } from "lucide-react";
import { ChartSetPanel, RoundHeader } from "@/components";
import { getPlaceholderChartsForSet, getSetsForRound, PLACEHOLDER_PLAYERS } from "@/lib/tournament";

export default function VotePage() {
  const sets = getSetsForRound(1);
  const selectedPlayer = PLACEHOLDER_PLAYERS[0];

  return (
    <main className="min-h-screen">
      <RoundHeader title="Player Ballot" status="Round ballot shell" />
      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-5 lg:grid-cols-[320px_1fr]">
        <aside className="metal-panel rounded-lg p-4">
          <label
            className="text-sm font-bold uppercase tracking-[0.16em] text-ember-300"
            htmlFor="startgg-username"
          >
            Select your start.gg username
          </label>
          <select
            id="startgg-username"
            className="mt-3 w-full rounded border border-metal-700 bg-black/35 px-3 py-3 text-white"
            defaultValue={selectedPlayer}
          >
            {PLACEHOLDER_PLAYERS.map((player) => (
              <option key={player} value={player}>
                {player}
              </option>
            ))}
          </select>
          <div className="mt-5 rounded border border-ember-300/20 bg-black/25 p-3">
            <div className="flex gap-2 text-ember-300">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm font-semibold">
                Are you sure you are voting as {selectedPlayer}?
              </p>
            </div>
          </div>
          <div className="rune-divider my-5" />
          <ol className="grid gap-2 text-sm text-metal-300">
            <li>Step 1: Set 1</li>
            <li>Step 2: Set 2</li>
            <li>Step 3: Review and Submit</li>
          </ol>
        </aside>
        <div className="grid gap-5">
          {sets.map((set) => (
            <ChartSetPanel
              key={set.displayLabel}
              set={set}
              charts={getPlaceholderChartsForSet(set.displayLabel)}
              compact
            />
          ))}
        </div>
      </section>
    </main>
  );
}
