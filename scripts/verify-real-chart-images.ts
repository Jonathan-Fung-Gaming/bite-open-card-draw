import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

function publicFilePath(localPath: string, projectRoot = process.cwd()) {
  return path.join(projectRoot, "public", localPath.replace(/^\/+/, ""));
}

function sha256File(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export type RealChartImageVerification = {
  runtimeCatalogPath: string;
  runtimeCatalogSha256: string;
  runtimeCacheFileCount: number;
  nonFallbackChartCount: number;
  totalCacheBytes: number;
  largestCacheFileBytes: number;
  imageAssetManifestPath: string;
  imageAssetManifestSha256: string;
  sampleRuntimeCachedArtwork: string;
};

const MAX_CACHE_BYTES = 250 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1 * 1024 * 1024;

export function verifyRealChartImages(projectRoot = process.cwd()): RealChartImageVerification {
  const generatedDir = path.resolve(projectRoot, "data/generated");
  const assetsPath = path.join(generatedDir, "image-assets.json");
  const generatedRuntimeCatalogPath = path.resolve(projectRoot, GENERATED_CHARTS_WITH_IMAGES_PATH);
  const sourceCsvPath = path.resolve(projectRoot, SOURCE_CHART_CSV_PATH);

  if (!existsSync(assetsPath)) {
    throw new Error(
      "Missing generated chart image metadata. Run npm run import:charts and npm run cache:chart-images first.",
    );
  }

  const runtimeCatalogPath = existsSync(generatedRuntimeCatalogPath)
    ? generatedRuntimeCatalogPath
    : sourceCsvPath;

  if (!existsSync(runtimeCatalogPath)) {
    throw new Error(
      `Missing runtime chart catalog source ${path.relative(projectRoot, runtimeCatalogPath)}.`,
    );
  }

  const assets = readJson<ImageAsset[]>(assetsPath);
  const runtimeCharts = loadRuntimeCharts(projectRoot);
  const cachedAssets = assets.filter(
    (asset) =>
      asset.status === "cached" &&
      asset.remoteUrl &&
      asset.localPath !== FALLBACK_CHART_IMAGE_PATH,
  );

  if (cachedAssets.length === 0) {
    throw new Error("No non-fallback cached chart artwork assets found.");
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
    throw new Error("Runtime catalog does not assign any chart to non-fallback cached artwork.");
  }

  const missingFiles = cachedAssets
    .map((asset) => ({
      asset,
      filePath: publicFilePath(asset.localPath, projectRoot),
    }))
    .filter(({ filePath }) => !existsSync(filePath) || statSync(filePath).size <= 0);

  if (missingFiles.length > 0) {
    throw new Error(
      `Cached chart artwork metadata references ${missingFiles.length} missing or empty public files. First missing: ${missingFiles[0]?.asset.localPath}`,
    );
  }

  const missingRuntimeFiles = [...runtimeCachePaths]
    .map((localPath) => ({
      localPath,
      filePath: publicFilePath(localPath, projectRoot),
    }))
    .filter(({ filePath }) => !existsSync(filePath) || statSync(filePath).size <= 0);

  if (missingRuntimeFiles.length > 0) {
    throw new Error(
      `Runtime catalog references ${missingRuntimeFiles.length} missing or empty public cache files. First missing: ${missingRuntimeFiles[0]?.localPath}`,
    );
  }

  const fileSizes = [...runtimeCachePaths].map((localPath) => ({
    localPath,
    size: statSync(publicFilePath(localPath, projectRoot)).size,
  }));
  const totalCacheBytes = fileSizes.reduce((total, file) => total + file.size, 0);
  const oversizedFile = fileSizes.find((file) => file.size > MAX_IMAGE_BYTES);

  if (totalCacheBytes > MAX_CACHE_BYTES) {
    throw new Error(
      `Cached chart artwork is ${(totalCacheBytes / 1024 / 1024).toFixed(1)} MB, over the ${(MAX_CACHE_BYTES / 1024 / 1024).toFixed(0)} MB budget.`,
    );
  }

  if (oversizedFile) {
    throw new Error(
      `${oversizedFile.localPath} is ${(oversizedFile.size / 1024).toFixed(1)} KB, over the ${(MAX_IMAGE_BYTES / 1024).toFixed(0)} KB per-file budget.`,
    );
  }

  const nonFallbackChartCount = runtimeCharts.filter(
    (chart) => chart.localImagePath && chart.localImagePath !== FALLBACK_CHART_IMAGE_PATH,
  ).length;

  return {
    runtimeCatalogPath: path.relative(projectRoot, runtimeCatalogPath),
    runtimeCatalogSha256: sha256File(runtimeCatalogPath),
    runtimeCacheFileCount: runtimeCachePaths.size,
    nonFallbackChartCount,
    totalCacheBytes,
    largestCacheFileBytes: Math.max(...fileSizes.map((file) => file.size)),
    imageAssetManifestPath: path.relative(projectRoot, assetsPath),
    imageAssetManifestSha256: sha256File(assetsPath),
    sampleRuntimeCachedArtwork: [...runtimeCachePaths][0] ?? "",
  };
}

export function printRealChartImageVerification(result: RealChartImageVerification) {
  console.log(
    `Verified runtime catalog ${result.runtimeCatalogPath} (${result.runtimeCatalogSha256}) against ${result.runtimeCacheFileCount} public cache files for ${result.nonFallbackChartCount} charts.`,
  );
  console.log(
    `Image cache budget: ${(result.totalCacheBytes / 1024 / 1024).toFixed(1)} MB total, largest ${(result.largestCacheFileBytes / 1024).toFixed(1)} KB.`,
  );
  console.log(
    `Image asset manifest: ${result.imageAssetManifestPath} (${result.imageAssetManifestSha256}).`,
  );
  console.log(`Sample runtime cached artwork: ${result.sampleRuntimeCachedArtwork}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";

if (import.meta.url === invokedPath) {
  try {
    printRealChartImageVerification(verifyRealChartImages());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
