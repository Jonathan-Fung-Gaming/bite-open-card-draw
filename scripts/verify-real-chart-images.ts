import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { FALLBACK_CHART_IMAGE_PATH } from "../src/lib/charts/image-paths";
import {
  GENERATED_CHARTS_WITH_IMAGES_PATH,
  loadRuntimeCharts,
  SOURCE_CHART_CSV_PATH,
} from "../src/lib/charts/runtime-catalog";
import type { ImageAsset } from "../src/lib/charts/types";

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function publicFilePath(localPath: string) {
  return path.join(process.cwd(), "public", localPath.replace(/^\/+/, ""));
}

function sha256File(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const generatedDir = path.resolve(process.cwd(), "data/generated");
const assetsPath = path.join(generatedDir, "image-assets.json");
const generatedRuntimeCatalogPath = path.resolve(process.cwd(), GENERATED_CHARTS_WITH_IMAGES_PATH);
const sourceCsvPath = path.resolve(process.cwd(), SOURCE_CHART_CSV_PATH);
const MAX_CACHE_BYTES = 250 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1 * 1024 * 1024;

if (!existsSync(assetsPath)) {
  fail("Missing generated chart image metadata. Run npm run import:charts and npm run cache:chart-images first.");
}

const runtimeCatalogPath = existsSync(generatedRuntimeCatalogPath)
  ? generatedRuntimeCatalogPath
  : sourceCsvPath;

if (!existsSync(runtimeCatalogPath)) {
  fail(
    `Missing runtime chart catalog source ${path.relative(process.cwd(), runtimeCatalogPath)}.`,
  );
}

const assets = readJson<ImageAsset[]>(assetsPath);
const runtimeCharts = loadRuntimeCharts(process.cwd());
const cachedAssets = assets.filter(
  (asset) =>
    asset.status === "cached" &&
    asset.remoteUrl &&
    asset.localPath !== FALLBACK_CHART_IMAGE_PATH,
);

if (cachedAssets.length === 0) {
  fail("No non-fallback cached chart artwork assets found.");
}

const runtimeCachePaths = new Set(
  runtimeCharts
    .map((chart) => chart.localImagePath)
    .filter(
      (localPath): localPath is string =>
        Boolean(localPath) && localPath !== FALLBACK_CHART_IMAGE_PATH,
    ),
);

if (runtimeCachePaths.size === 0) {
  fail("Runtime catalog does not assign any chart to non-fallback cached artwork.");
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

const missingRuntimeFiles = [...runtimeCachePaths]
  .map((localPath) => ({
    localPath,
    filePath: publicFilePath(localPath),
  }))
  .filter(({ filePath }) => !existsSync(filePath) || statSync(filePath).size <= 0);

if (missingRuntimeFiles.length > 0) {
  fail(
    `Runtime catalog references ${missingRuntimeFiles.length} missing or empty public cache files. First missing: ${missingRuntimeFiles[0]?.localPath}`,
  );
}

const fileSizes = [...runtimeCachePaths].map((localPath) => ({
  localPath,
  size: statSync(publicFilePath(localPath)).size,
}));
const totalCacheBytes = fileSizes.reduce((total, file) => total + file.size, 0);
const oversizedFile = fileSizes.find((file) => file.size > MAX_IMAGE_BYTES);

if (totalCacheBytes > MAX_CACHE_BYTES) {
  fail(
    `Cached chart artwork is ${(totalCacheBytes / 1024 / 1024).toFixed(1)} MB, over the ${(MAX_CACHE_BYTES / 1024 / 1024).toFixed(0)} MB budget.`,
  );
}

if (oversizedFile) {
  fail(
    `${oversizedFile.localPath} is ${(oversizedFile.size / 1024).toFixed(1)} KB, over the ${(MAX_IMAGE_BYTES / 1024).toFixed(0)} KB per-file budget.`,
  );
}

const nonFallbackChartCount = runtimeCharts.filter(
  (chart) => chart.localImagePath && chart.localImagePath !== FALLBACK_CHART_IMAGE_PATH,
).length;

console.log(
  `Verified runtime catalog ${path.relative(process.cwd(), runtimeCatalogPath)} (${sha256File(runtimeCatalogPath)}) against ${runtimeCachePaths.size} public cache files for ${nonFallbackChartCount} charts.`,
);
console.log(
  `Image cache budget: ${(totalCacheBytes / 1024 / 1024).toFixed(1)} MB total, largest ${(Math.max(...fileSizes.map((file) => file.size)) / 1024).toFixed(1)} KB.`,
);
console.log(`Image asset manifest: ${path.relative(process.cwd(), assetsPath)} (${sha256File(assetsPath)}).`);
console.log(`Sample runtime cached artwork: ${[...runtimeCachePaths][0]}`);
