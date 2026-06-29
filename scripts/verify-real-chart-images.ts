import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { FALLBACK_CHART_IMAGE_PATH } from "../src/lib/charts/image-paths";
import type { ImageAsset, NormalizedChart } from "../src/lib/charts/types";

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function publicFilePath(localPath: string) {
  return path.join(process.cwd(), "public", localPath.replace(/^\/+/, ""));
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const generatedDir = path.resolve(process.cwd(), "data/generated");
const assetsPath = path.join(generatedDir, "image-assets.json");
const chartsWithImagesPath = path.join(generatedDir, "charts-with-images.json");

if (!existsSync(assetsPath) || !existsSync(chartsWithImagesPath)) {
  fail("Missing generated chart image metadata. Run npm run import:charts and npm run cache:chart-images first.");
}

const assets = readJson<ImageAsset[]>(assetsPath);
const charts = readJson<NormalizedChart[]>(chartsWithImagesPath);
const cachedAssets = assets.filter(
  (asset) =>
    asset.status === "cached" &&
    asset.remoteUrl &&
    asset.localPath !== FALLBACK_CHART_IMAGE_PATH,
);

if (cachedAssets.length === 0) {
  fail("No non-fallback cached chart artwork assets found.");
}

const missingFiles = cachedAssets
  .map((asset) => ({
    asset,
    filePath: publicFilePath(asset.localPath),
  }))
  .filter(({ filePath }) => !existsSync(filePath) || statSync(filePath).size <= 0);

if (missingFiles.length > 0) {
  fail(
    `Cached chart artwork metadata references ${missingFiles.length} missing or empty public files. First missing: ${missingFiles[0]?.asset.localPath}`,
  );
}

const nonFallbackChartCount = charts.filter(
  (chart) => chart.localImagePath && chart.localImagePath !== FALLBACK_CHART_IMAGE_PATH,
).length;

if (nonFallbackChartCount === 0) {
  fail("Generated charts-with-images.json does not assign any chart to non-fallback cached artwork.");
}

console.log(
  `Verified ${cachedAssets.length} non-fallback cached image assets for ${nonFallbackChartCount} charts.`,
);
console.log(`Sample cached artwork: ${cachedAssets[0]?.localPath}`);
