import { TournamentLogo } from "./TournamentLogo";

type RoundHeaderProps = {
  eyebrow?: string;
  title: string;
  status: string;
};

export function RoundHeader({ eyebrow = "Pump It Up Open Stage", title, status }: RoundHeaderProps) {
  return (
    <header className="flex flex-col gap-6 border-b border-ember-300/15 px-5 py-6 sm:flex-row sm:items-center sm:justify-between lg:px-8">
      <TournamentLogo priority className="shrink-0" />
      <div className="max-w-4xl sm:text-right">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember-300">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-black uppercase leading-none text-white sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        <p className="mt-3 text-base font-semibold uppercase tracking-[0.16em] text-metal-300">{status}</p>
      </div>
    </header>
  );
}
