import clsx from "clsx";
import type { ResultSetSnapshot } from "@/lib/results/result-engine";

type PublicResultRowsProps = {
  compact?: boolean;
  labelledBy?: string;
  listTestId?: string;
  set: ResultSetSnapshot;
};

function banLabel(count: number) {
  return `${count} ${count === 1 ? "ban" : "bans"}`;
}

export function PublicResultRows({
  compact = false,
  labelledBy,
  listTestId,
  set,
}: PublicResultRowsProps) {
  return (
    <ol
      aria-labelledby={labelledBy}
      className={clsx("grid", compact ? "mt-2 gap-1.5" : "mt-3 gap-2")}
      data-testid={listTestId}
    >
      {set.rows.map((row) => (
        <li
          key={row.chart.id}
          className={clsx(
            "grid rounded border bg-black/25",
            compact ? "gap-1 p-2" : "gap-2 p-3 sm:grid-cols-[1fr_auto]",
            row.selected
              ? "border-ember-200 bg-ember-900/30 shadow-ember-tight ring-2 ring-ember-300/60"
              : row.tiedForFewest
                ? "border-ember-300/65 bg-ember-900/15"
                : "border-metal-700",
          )}
          data-tied-for-fewest={row.tiedForFewest ? "true" : "false"}
          data-testid="public-result-row"
        >
          <div className="min-w-0">
            <p
              className={clsx(
                "font-black uppercase leading-tight text-ember-300",
                compact ? "text-sm" : "text-2xl",
              )}
            >
              {row.chart.displayDifficulty}
            </p>
            <p
              className={clsx(
                "mt-1 break-words font-bold text-white",
                compact ? "text-sm" : "text-2xl",
              )}
            >
              {row.chart.name}
            </p>
            <p className={clsx("break-words text-metal-300", compact ? "text-xs" : "text-lg")}>
              {row.chart.artist}
            </p>
          </div>
          <div
            className={clsx(
              "flex items-center justify-between gap-3",
              !compact && "sm:block sm:text-right",
            )}
          >
            <p
              className={clsx(
                "font-mono font-black text-ember-300",
                compact ? "text-sm" : "text-2xl",
              )}
            >
              {banLabel(row.banCount)}
            </p>
            {row.selected ? (
              <p
                className={clsx(
                  "mt-1 font-black uppercase text-white",
                  compact ? "text-xs tracking-[0.08em]" : "text-lg tracking-[0.14em]",
                )}
                data-testid="result-selected-label"
              >
                Selected
              </p>
            ) : null}
            {row.tiedForFewest ? (
              <p
                className={clsx(
                  "mt-1 font-black uppercase text-ember-300",
                  compact ? "text-xs tracking-[0.08em]" : "text-lg tracking-[0.14em]",
                )}
                data-testid="result-least-ban-label"
              >
                Least bans
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
