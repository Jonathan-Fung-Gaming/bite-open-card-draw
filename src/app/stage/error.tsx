"use client";

import { TournamentLogo } from "@/components";

type StageErrorProps = {
  reset: () => void;
};

export default function StageError({ reset }: StageErrorProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-8">
      <section className="metal-panel w-full max-w-2xl rounded-lg border border-ember-300/45 p-6 text-center">
        <TournamentLogo priority className="mx-auto" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
          Stage display
        </p>
        <h1 className="mt-2 text-3xl font-black uppercase text-white">Stage view interrupted</h1>
        <p className="mt-3 text-sm text-metal-300">
          Tournament state is still server-authoritative. Retry this display or refresh the
          projector browser after the host confirms the admin console is healthy.
        </p>
        <button
          className="button-metal mt-5 rounded px-4 py-3 text-sm font-black uppercase"
          onClick={reset}
          type="button"
        >
          Retry Stage View
        </button>
      </section>
    </main>
  );
}
