import { TournamentLogo } from "@/components";

export default function StageLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-8">
      <section className="metal-panel w-full max-w-2xl rounded-lg p-6 text-center">
        <TournamentLogo priority className="mx-auto" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
          Stage display
        </p>
        <h1 className="mt-2 text-3xl font-black uppercase text-white">Loading tournament state</h1>
        <p className="mt-3 text-sm text-metal-300">
          Keep the projector on this screen while the stage view reconnects.
        </p>
      </section>
    </main>
  );
}
