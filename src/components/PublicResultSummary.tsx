import clsx from "clsx";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import type { RoundResultSnapshot } from "@/lib/results/result-engine";
import { ChartArtImage } from "./ChartArtImage";
import { MobilePublicResultSummary } from "./MobilePublicResultSummary";
import { PublicResultRows } from "./PublicResultRows";

type PublicResultSummaryProps = {
  compactMobileResults?: boolean;
  result: RoundResultSnapshot;
  selectedCardTestId?: string;
};

function SelectedChartCard({
  chart,
  compactMobile,
  index,
  testId,
}: {
  chart: DrawnChartSummary;
  compactMobile: boolean;
  index: number;
  testId: string;
}) {
  const imagePath = chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH;

  return (
    <article
      className="overflow-hidden rounded-md border border-ember-300/35 bg-furnace-900 shadow-ember-tight"
      data-chart-image-path={imagePath}
      data-testid={testId}
    >
      <div className="relative aspect-[16/9] overflow-hidden border-b border-ember-300/15 bg-black/35">
        <ChartArtImage src={imagePath} className="h-full w-full object-contain opacity-95" />
      </div>
      <div
        className={clsx(
          "flex flex-col justify-between",
          compactMobile ? "min-h-0 p-2 md:min-h-48 md:p-5" : "min-h-48 p-5",
        )}
      >
        <div
          className={clsx(
            "flex items-start justify-between font-black uppercase text-ember-300",
            compactMobile ? "gap-1 md:gap-3" : "gap-3",
          )}
        >
          <span
            className={clsx(
              compactMobile
                ? "text-xl leading-none md:text-5xl md:leading-tight"
                : "text-3xl leading-tight sm:text-5xl",
            )}
            data-testid="selected-chart-difficulty"
          >
            {chart.displayDifficulty}
          </span>
          <span className={clsx("font-mono", compactMobile ? "text-xs md:text-lg" : "text-lg")}>
            {String(index).padStart(2, "0")}
          </span>
        </div>
        <div>
          <h2
            className={clsx(
              "break-words font-black uppercase leading-tight text-white",
              compactMobile ? "mt-1 text-sm md:mt-5 md:text-5xl" : "mt-5 text-3xl sm:text-5xl",
            )}
            data-testid="selected-chart-title"
          >
            {chart.name}
          </h2>
          <p
            className={clsx(
              "break-words text-metal-300",
              compactMobile
                ? "mt-1 text-xs leading-tight md:mt-3 md:text-2xl md:leading-normal"
                : "mt-3 text-xl sm:text-2xl",
            )}
            data-testid="selected-chart-artist"
          >
            {chart.artist}
          </p>
        </div>
      </div>
    </article>
  );
}

export function PublicResultSummary({
  compactMobileResults = false,
  result,
  selectedCardTestId = "stage-chart-card",
}: PublicResultSummaryProps) {
  if (compactMobileResults) {
    return <MobilePublicResultSummary result={result} selectedCardTestId={selectedCardTestId} />;
  }

  return (
    <div className="grid gap-5" data-compact-mobile-results="false">
      <div className="grid gap-4 md:grid-cols-2">
        {result.sets.map((set, index) => (
          <SelectedChartCard
            key={set.roundSetId}
            chart={set.selectedChart}
            compactMobile={false}
            index={index + 1}
            testId={selectedCardTestId}
          />
        ))}
      </div>
      <section className="metal-panel rounded-lg p-5">
        <h2 className="text-4xl font-black uppercase text-white">Ban counts</h2>
        <div className="mt-4 grid gap-3">
          {result.sets.map((set) => (
            <details
              key={set.roundSetId}
              className="rounded border border-metal-700 bg-black/25 p-4 text-xl text-metal-300"
            >
              <summary className="cursor-pointer text-2xl font-bold uppercase text-ember-300">
                {set.displayLabel} ban counts
              </summary>
              <PublicResultRows set={set} />
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
