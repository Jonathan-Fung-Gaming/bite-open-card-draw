import Link from "next/link";
import { Eye, Vote } from "lucide-react";
import { TournamentLogo } from "@/components";

export default function RoomPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-6">
      <section className="w-full max-w-xl">
        <TournamentLogo priority className="mx-auto mb-8" />
        <div className="metal-panel rounded-lg p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember-300">
            Pump It Up Open Stage
          </p>
          <h1 className="mt-2 text-3xl font-black uppercase text-white sm:text-4xl">Tournament Room</h1>
          <div className="rune-divider my-5" />
          <div className="grid gap-3">
            <Link
              href="/vote"
              className="button-metal flex items-center justify-center gap-3 rounded px-4 py-4 text-base font-black uppercase"
            >
              <Vote aria-hidden="true" className="h-5 w-5" />
              I am a player voting
            </Link>
            <Link
              href="/charts"
              className="flex items-center justify-center gap-3 rounded border border-metal-700 bg-black/25 px-4 py-4 text-base font-black uppercase text-metal-300 hover:border-ember-300/50 hover:text-white"
            >
              <Eye aria-hidden="true" className="h-5 w-5" />
              View charts only
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
