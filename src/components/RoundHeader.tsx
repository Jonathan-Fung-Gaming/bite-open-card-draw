import clsx from "clsx";
import { TournamentLogo } from "./TournamentLogo";

type RoundHeaderProps = {
  eyebrow?: string;
  title: string;
  status?: string;
  compact?: boolean;
  mobileCompact?: boolean;
};

export function RoundHeader({
  eyebrow = "Pump It Up Open Stage",
  title,
  status,
  compact = false,
  mobileCompact = false,
}: RoundHeaderProps) {
  return (
    <header
      className={clsx(
        "flex border-b border-ember-300/15 lg:px-8",
        mobileCompact
          ? "flex-row items-start sm:items-center sm:justify-between"
          : "flex-col sm:flex-row sm:items-center sm:justify-between",
        compact
          ? "gap-2 px-5 py-1"
          : mobileCompact
            ? "gap-3 px-3 py-3 sm:gap-6 sm:px-5 sm:py-6"
            : "gap-6 px-5 py-6",
      )}
      data-mobile-compact={mobileCompact ? "true" : "false"}
      data-testid="round-header"
    >
      <TournamentLogo
        priority
        className="shrink-0"
        size={compact ? "compact" : mobileCompact ? "mobile-compact" : "standard"}
      />
      <div className={clsx("max-w-4xl sm:text-right", mobileCompact && "min-w-0 flex-1 text-left")}>
        <p
          className={clsx(
            "font-semibold uppercase tracking-[0.24em] text-ember-300",
            compact ? "text-sm" : mobileCompact ? "text-[10px] sm:text-xs" : "text-xs",
          )}
        >
          {eyebrow}
        </p>
        <h1
          className={clsx(
            "font-black uppercase leading-none text-white",
            compact
              ? "mt-0.5 text-3xl sm:text-4xl"
              : mobileCompact
                ? "mt-1 text-2xl sm:mt-2 sm:text-5xl lg:text-6xl"
                : "mt-2 text-4xl sm:text-5xl lg:text-6xl",
          )}
        >
          {title}
        </h1>
        {status ? (
          <p
            className={clsx(
              "font-semibold uppercase tracking-[0.16em] text-metal-300",
              compact
                ? "mt-1 text-base"
                : mobileCompact
                  ? "mt-1 text-xs sm:mt-3 sm:text-base"
                  : "mt-3 text-base",
            )}
            data-testid="round-header-status"
          >
            {status}
          </p>
        ) : null}
      </div>
    </header>
  );
}
