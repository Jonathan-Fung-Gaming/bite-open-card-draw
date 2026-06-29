import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { localImagePathForRemoteUrl } from "./image-cache";
import { importChartRows, parseChartCsv } from "./importer";
import { FALLBACK_CHART_IMAGE_PATH } from "./image-paths";
import type { NormalizedChart } from "./types";

export const GENERATED_CHARTS_WITH_IMAGES_PATH = "data/generated/charts-with-images.json";
export const SOURCE_CHART_CSV_PATH = "data/source/charts.csv";

function publicAssetExists(localImagePath: string, projectRoot: string) {
  if (!localImagePath.startsWith("/") || localImagePath.startsWith("//")) {
    return false;
  }

  return existsSync(path.join(projectRoot, "public", localImagePath.replace(/^\/+/, "")));
}

export function resolveRuntimeChartImages(
  charts: readonly NormalizedChart[],
  projectRoot = process.cwd(),
): NormalizedChart[] {
  return charts.map((chart) => {
    if (
      chart.localImagePath &&
      chart.localImagePath !== FALLBACK_CHART_IMAGE_PATH &&
      publicAssetExists(chart.localImagePath, projectRoot)
    ) {
      return chart;
    }

    if (chart.sourceBgImg) {
      const deterministicCachePath = localImagePathForRemoteUrl(chart.sourceBgImg);

      if (publicAssetExists(deterministicCachePath, projectRoot)) {
        return {
          ...chart,
          localImagePath: deterministicCachePath,
        };
      }
    }

    return {
      ...chart,
      localImagePath: FALLBACK_CHART_IMAGE_PATH,
    };
  });
}

function readGeneratedCharts(projectRoot: string) {
  const generatedPath = path.join(projectRoot, GENERATED_CHARTS_WITH_IMAGES_PATH);

  if (!existsSync(generatedPath)) {
    return null;
  }

  return JSON.parse(readFileSync(generatedPath, "utf8")) as NormalizedChart[];
}

export function loadRuntimeCharts(projectRoot = process.cwd()) {
  const generatedCharts = readGeneratedCharts(projectRoot);

  if (generatedCharts) {
    return resolveRuntimeChartImages(generatedCharts, projectRoot);
  }

  const sourcePath = path.join(projectRoot, SOURCE_CHART_CSV_PATH);

  if (!existsSync(sourcePath)) {
    throw new Error("Missing data/source/charts.csv.");
  }

  const { charts } = importChartRows(parseChartCsv(readFileSync(sourcePath, "utf8")), {
    sourcePath: SOURCE_CHART_CSV_PATH,
  });

  return resolveRuntimeChartImages(charts, projectRoot);
}
