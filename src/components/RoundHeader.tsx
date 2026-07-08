import clsx from "clsx";
import { TournamentLogo } from "./TournamentLogo";

type RoundHeaderProps = {
  eyebrow?: string;
  title: string;
  status: string;
  compact?: boolean;
};

export function RoundHeader({
  eyebrow = "Pump It Up Open Stage",
  title,
  status,
  compact = false,
}: RoundHeaderProps) {
  return (
    <header
      className={clsx(
        "flex flex-col border-b border-ember-300/15 sm:flex-row sm:items-center sm:justify-between lg:px-8",
        compact ? "gap-2 px-5 py-1" : "gap-6 px-5 py-6",
      )}
    >
      <TournamentLogo priority className="shrink-0" size={compact ? "compact" : "standard"} />
      <div className="max-w-4xl sm:text-right">
        <p
          className={clsx(
            "font-semibold uppercase tracking-[0.24em] text-ember-300",
            compact ? "text-sm" : "text-xs",
          )}
        >
          {eyebrow}
        </p>
        <h1
          className={clsx(
            "font-black uppercase leading-none text-white",
            compact ? "mt-0.5 text-3xl sm:text-4xl" : "mt-2 text-4xl sm:text-5xl lg:text-6xl",
          )}
        >
          {title}
        </h1>
        <p
          className={clsx(
            "font-semibold uppercase tracking-[0.16em] text-metal-300",
            compact ? "mt-1 text-base" : "mt-3 text-base",
          )}
        >
          {status}
        </p>
      </div>
    </header>
  );
}
