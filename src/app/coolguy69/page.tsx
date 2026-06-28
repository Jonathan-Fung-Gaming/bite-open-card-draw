import { AdminLayout, DangerousActionDialog, HostLockBadge } from "@/components";
import { ROUND_SET_DEFINITIONS } from "@/lib/tournament";

export default function AdminPage() {
  return (
    <AdminLayout>
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-5">
          <section className="metal-panel rounded-lg p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Tournament Config
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">Round Sets</h2>
              </div>
              <HostLockBadge status="readonly" />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {ROUND_SET_DEFINITIONS.map((set) => (
                <div
                  key={`${set.roundNumber}-${set.displayLabel}`}
                  className="rounded border border-metal-700 bg-black/25 p-3"
                >
                  <p className="text-sm font-bold text-white">
                    Round {set.roundNumber} - {set.displayLabel}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-metal-300">
                    Draw {set.drawCount} / Max bans {set.maxBans}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="metal-panel rounded-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">Roster</p>
            <h2 className="mt-1 text-2xl font-black uppercase text-white">Active Players</h2>
            <div className="mt-4 rounded border border-metal-700 bg-black/25 p-4 text-sm text-metal-300">
              Active roster standby
            </div>
          </section>
        </div>
        <aside className="grid content-start gap-5">
          <section className="metal-panel rounded-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">Security</p>
            <h2 className="mt-1 text-2xl font-black uppercase text-white">Admin Login</h2>
            <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="admin-password">
              Shared admin password
            </label>
            <input
              id="admin-password"
              type="password"
              disabled
              className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-metal-300"
              placeholder="Password"
            />
          </section>
          <DangerousActionDialog
            action="reroll Round 1 - S16"
            consequence="replace the currently drawn charts for this set"
          />
        </aside>
      </section>
    </AdminLayout>
  );
}
