import type { ReactNode } from "react";
import { HostLockBadge, type HostLockBadgeProps } from "./HostLockBadge";
import { TournamentLogo } from "./TournamentLogo";

type AdminLayoutProps = {
  children: ReactNode;
  hostStatus?: HostLockBadgeProps["status"];
};

export function AdminLayout({ children, hostStatus = "inactive" }: AdminLayoutProps) {
  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-5 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-[112rem] flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-ember-300/15 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <TournamentLogo />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                Admin Console
              </p>
              <h1 className="mt-1 text-3xl font-black uppercase text-white">coolguy69</h1>
            </div>
          </div>
          <HostLockBadge status={hostStatus} />
        </header>
        {hostStatus === "readonly" ? (
          <section className="rounded-lg border border-metal-500/40 bg-black/35 p-4 text-sm text-metal-300">
            <p className="font-bold uppercase tracking-[0.14em] text-white">Read-only admin</p>
            <p className="mt-2">
              Another admin browser currently has host control. Tournament-changing controls stay
              disabled here until you take over from the Host Lock section.
            </p>
          </section>
        ) : null}
        {children}
      </div>
    </main>
  );
}
