import clsx from "clsx";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import type { RoundResultSnapshot } from "@/lib/results/result-engine";
import { ChartArtImage } from "./ChartArtImage";

type PublicResultSummaryProps = {
  result: RoundResultSnapshot;
  selectedCardTestId?: string;
};

function banLabel(count: number) {
  return `${count} ${count === 1 ? "ban" : "bans"}`;
}

function SelectedChartCard({
  chart,
  index,
  testId,
}: {
  chart: DrawnChartSummary;
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
      <div className="flex min-h-36 flex-col justify-between p-4">
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-ember-300">
          <span data-testid="selected-chart-difficulty">{chart.displayDifficulty}</span>
          <span className="font-mono">{String(index).padStart(2, "0")}</span>
        </div>
        <div>
          <h2
            className="mt-4 break-words text-xl font-black uppercase leading-tight text-white sm:text-2xl"
            data-testid="selected-chart-title"
          >
            {chart.name}
          </h2>
          <p
            className="mt-2 break-words text-sm text-metal-300 sm:text-base"
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
  result,
  selectedCardTestId = "stage-chart-card",
}: PublicResultSummaryProps) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        {result.sets.map((set, index) => (
          <SelectedChartCard
            key={set.roundSetId}
            chart={set.selectedChart}
            index={index + 1}
            testId={selectedCardTestId}
          />
        ))}
      </div>
      <section className="metal-panel rounded-lg p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
          Full ban counts
        </p>
        <h2 className="mt-1 text-2xl font-black uppercase text-white">
          Least banned to most banned
        </h2>
        <div className="mt-4 grid gap-3">
          {result.sets.map((set) => (
            <details
              key={set.roundSetId}
              className="rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300"
            >
              <summary className="cursor-pointer font-bold uppercase text-ember-300">
                {set.displayLabel} ban counts
              </summary>
              <ol className="mt-3 grid gap-2">
                {set.rows.map((row) => (
                  <li
                    key={row.chart.id}
                    className={clsx(
                      "grid gap-2 rounded border bg-black/25 p-3 sm:grid-cols-[1fr_auto]",
                      row.selected ? "border-ember-300/55" : "border-metal-700",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-ember-300">
                        {row.chart.displayDifficulty}
                      </p>
                      <p className="mt-1 break-words font-bold text-white">{row.chart.name}</p>
                      <p className="break-words text-xs text-metal-300">{row.chart.artist}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                      <p className="font-mono font-black text-ember-300">
                        {banLabel(row.banCount)}
                      </p>
                      {row.selected ? (
                        <p
                          className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-white"
                          data-testid="result-selected-label"
                        >
                          Selected
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
