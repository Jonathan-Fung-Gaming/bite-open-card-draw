import type { ReactNode } from "react";
import { HostLockBadge } from "./HostLockBadge";
import { TournamentLogo } from "./TournamentLogo";

type AdminLayoutProps = {
  children: ReactNode;
};

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
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
          <HostLockBadge status="inactive" />
        </header>
        {children}
      </div>
    </main>
  );
}
