import type { ReactNode } from "react";
import clsx from "clsx";
import { ChartArtImage } from "./ChartArtImage";

type ChartCardVisualProps = {
  artist: string;
  badge?: ReactNode;
  compact?: boolean;
  imagePath: string;
  imageTestId?: string;
  name: string;
  selected?: boolean;
  variant: "ballot" | "view-only";
};

export function ChartCardVisual({
  artist,
  badge,
  compact = false,
  imagePath,
  imageTestId,
  name,
  selected = false,
  variant,
}: ChartCardVisualProps) {
  const viewOnly = variant === "view-only";
  const compactViewOnly = viewOnly && compact;

  return (
    <div
      className={clsx(
        "relative h-full",
        viewOnly
          ? compactViewOnly
            ? "min-h-[82px] sm:min-h-36 md:min-h-0"
            : "min-h-36 md:min-h-0"
          : "min-h-24 sm:min-h-56",
      )}
    >
      <div
        className={clsx(
          "absolute inset-0 overflow-hidden bg-black/35",
          viewOnly && "md:relative md:aspect-[16/9] md:border-b md:border-ember-300/15",
        )}
      >
        <ChartArtImage
          src={imagePath}
          loading={viewOnly ? "eager" : "lazy"}
          className={clsx(
            "h-full w-full opacity-95",
            viewOnly ? "object-cover md:object-contain" : "object-cover",
          )}
          testId={imageTestId}
        />
      </div>
      <span
        aria-hidden="true"
        className={clsx(
          "absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-black/10",
          viewOnly && "md:hidden",
        )}
      />
      {selected ? (
        <span aria-hidden="true" className="absolute inset-0 border-2 border-red-500/90" />
      ) : null}
      <div
        className={clsx(
          "relative flex flex-col p-2",
          viewOnly
            ? compactViewOnly
              ? "min-h-[82px] justify-end p-1.5 sm:min-h-36 sm:p-2 md:min-h-28 md:p-3"
              : "min-h-36 justify-end md:min-h-28 md:p-3"
            : "min-h-24 justify-between sm:min-h-56 sm:p-3",
        )}
      >
        {badge ? (
          <div className="flex items-start justify-end gap-1 text-[10px] font-bold uppercase text-ember-300 sm:gap-2 sm:text-xs">
            {badge}
          </div>
        ) : null}
        <div>
          {viewOnly ? (
            <>
              <h3
                className={clsx(
                  "block break-words font-black uppercase text-white md:text-lg md:line-clamp-none",
                  compactViewOnly
                    ? "text-[10px] leading-[1.05] line-clamp-2 sm:text-xs"
                    : "text-xs leading-tight line-clamp-3 sm:text-base",
                )}
                data-testid="chart-card-title"
              >
                {name}
              </h3>
              <p
                className={clsx(
                  "block break-words font-semibold text-metal-300 md:line-clamp-none",
                  compactViewOnly
                    ? "mt-0.5 text-[9px] leading-tight line-clamp-1 sm:text-xs"
                    : "mt-1 text-xs line-clamp-2 sm:text-sm",
                )}
                data-testid="chart-card-artist"
              >
                {artist}
              </p>
            </>
          ) : (
            <>
              <span className="block break-words text-[11px] font-black uppercase leading-tight text-white line-clamp-2 sm:text-base sm:line-clamp-3">
                {name}
              </span>
              <span className="mt-1 block break-words text-[10px] font-semibold text-metal-300 line-clamp-1 sm:text-sm sm:line-clamp-2">
                {artist}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
