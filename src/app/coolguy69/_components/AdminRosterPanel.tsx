import type { RosterPlayer } from "@/lib/admin/roster";
import {
  addPlayerAction,
  bulkImportPlayersAction,
  editPlayerUsernameAction,
  setPlayerActiveStatusAction,
} from "../actions";

type AdminRosterPanelProps = {
  activeCount: number;
  canControl: boolean;
  players: RosterPlayer[];
};

export function AdminRosterPanel({ activeCount, canControl, players }: AdminRosterPanelProps) {
  return (
    <section className="metal-panel rounded-lg p-4" data-testid="admin-roster-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
            Roster
          </p>
          <h2 className="mt-1 text-2xl font-black uppercase text-white">Players</h2>
        </div>
        <p
          className="rounded border border-metal-700 bg-black/25 px-3 py-2 text-sm text-metal-300"
          data-count={activeCount}
          data-testid="admin-active-player-count"
        >
          Active {activeCount}
        </p>
      </div>
      {!canControl ? (
        <p className="mt-4 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300">
          Take host control to edit the roster.
        </p>
      ) : null}
      <form action={addPlayerAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          name="startggUsername"
          required
          disabled={!canControl}
          placeholder="start.gg username"
          className="min-w-0 flex-1 rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
        />
        <button
          className="button-metal rounded px-4 py-2 font-bold uppercase disabled:opacity-40"
          disabled={!canControl}
          type="submit"
        >
          Add Player
        </button>
      </form>
      <form action={bulkImportPlayersAction} className="mt-4 grid gap-2">
        <textarea
          name="startggUsernames"
          rows={4}
          disabled={!canControl}
          placeholder="Bulk import start.gg usernames"
          className="rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
        />
        <button
          className="button-metal rounded px-4 py-2 font-bold uppercase disabled:opacity-40"
          disabled={!canControl}
          type="submit"
        >
          Bulk Import
        </button>
      </form>
      <div className="mt-4 overflow-hidden rounded border border-metal-700 text-sm">
        <div className="hidden grid-cols-[minmax(0,15ch)_130px_minmax(0,1fr)] gap-3 bg-black/40 p-3 text-xs uppercase tracking-[0.16em] text-ember-300 md:grid">
          <p>Username</p>
          <p>Active</p>
          <p>Edit</p>
        </div>
        <div className="grid gap-px bg-metal-700">
          {players.map((player) => (
            <article
              key={player.id}
              className="grid gap-3 bg-black/20 p-3 md:grid-cols-[minmax(0,15ch)_130px_minmax(0,1fr)]"
              data-active={player.active ? "true" : "false"}
              data-player-username={player.startggUsername}
              data-testid="admin-roster-row"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-ember-300 md:hidden">
                  Username
                </p>
                <p
                  className={`break-words font-semibold ${
                    player.active ? "text-green-400" : "text-red-400"
                  }`}
                  data-testid="admin-roster-username"
                >
                  {player.startggUsername}
                </p>
                {player.hasTournamentHistory ? (
                  <span className="mt-1 block break-words text-xs text-metal-400">
                    History locked
                  </span>
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-ember-300 md:hidden">
                  Active state
                </p>
                <form action={setPlayerActiveStatusAction}>
                  <input type="hidden" name="playerId" value={player.id} />
                  <input
                    type="hidden"
                    name="active"
                    value={player.active ? "false" : "true"}
                  />
                  <button
                    className={`w-full rounded border px-3 py-1 text-xs font-bold uppercase disabled:opacity-40 ${
                      player.active
                        ? "border-red-500/35 text-red-300 hover:border-red-400"
                        : "border-green-500/35 text-green-300 hover:border-green-400"
                    }`}
                    disabled={!canControl}
                    type="submit"
                  >
                    {player.active ? "Mark Inactive" : "Reactivate"}
                  </button>
                </form>
              </div>
              <div className="grid min-w-0 gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-ember-300 md:hidden">
                  Edit
                </p>
                <form action={editPlayerUsernameAction} className="grid min-w-0 gap-2">
                  <input type="hidden" name="playerId" value={player.id} />
                  <input
                    name="startggUsername"
                    defaultValue={player.startggUsername}
                    disabled={!canControl || player.hasTournamentHistory}
                    className="min-w-0 rounded border border-metal-700 bg-black/30 px-2 py-1 text-xs text-white disabled:opacity-40"
                  />
                  <button
                    className="rounded border border-metal-700 px-3 py-1 text-xs font-bold uppercase text-metal-300 hover:border-ember-300/50 hover:text-white disabled:opacity-40"
                    disabled={!canControl || player.hasTournamentHistory}
                    type="submit"
                  >
                    Save Name
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
