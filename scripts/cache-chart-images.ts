import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  applyImageAssetsToCharts,
  FALLBACK_CHART_IMAGE_PATH,
  planImageAssets,
} from "../src/lib/charts/image-cache";
import type { ImageAsset, NormalizedChart } from "../src/lib/charts/types";

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function readNumberArg(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));

  return arg ? Number.parseInt(arg.slice(prefix.length), 10) : null;
}

function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function fetchAsset(asset: ImageAsset, publicDir: string): Promise<ImageAsset> {
  if (!asset.remoteUrl) {
    return asset;
  }

  const destination = path.join(publicDir, asset.localPath.replace(/^\//, ""));

  if (existsSync(destination)) {
    return {
      ...asset,
      status: "cached",
    };
  }

  try {
    const response = await fetch(asset.remoteUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, Buffer.from(await response.arrayBuffer()));

    return {
      ...asset,
      status: "cached",
    };
  } catch (error) {
    return {
      ...asset,
      localPath: FALLBACK_CHART_IMAGE_PATH,
      status: "failed",
      failureReason: error instanceof Error ? error.message : "Unknown fetch error",
    };
  }
}

async function main() {
async function main() {
  const generatedDir = path.resolve(process.cwd(), "data/generated");
  const publicDir = path.resolve(process.cwd(), "public");
  const chartsPath = path.join(generatedDir, "charts.json");
  const fallbackOnly = hasFlag("fallback-only");
  const limit = readNumberArg("limit");

  if (!existsSync(chartsPath)) {
    console.error("Missing data/generated/charts.json. Run npm run import:charts first.");
    process.exit(1);
  }

  const charts = JSON.parse(readFileSync(chartsPath, "utf8")) as NormalizedChart[];
  const plannedAssets = planImageAssets(charts);
  const limitedAssets = typeof limit === "number" ? plannedAssets.slice(0, limit) : plannedAssets;

  const assets = fallbackOnly
    ? plannedAssets.map((asset) => ({
        ...asset,
        localPath: FALLBACK_CHART_IMAGE_PATH,
        status: "fallback" as const,
        failureReason: asset.remoteUrl ? "Fallback-only cache run." : asset.failureReason,
      }))
    : [
        ...(await Promise.all(limitedAssets.map((asset) => fetchAsset(asset, publicDir)))),
        ...plannedAssets.slice(limitedAssets.length).map((asset) => ({
          ...asset,
          localPath: FALLBACK_CHART_IMAGE_PATH,
          status: "fallback" as const,
          failureReason: "Skipped by cache limit.",
        })),
      ];

  writeJson(path.join(generatedDir, "image-assets.json"), assets);
  writeJson(path.join(generatedDir, "charts-with-images.json"), applyImageAssetsToCharts(charts, assets));

  const cachedCount = assets.filter((asset) => asset.status === "cached").length;
  const fallbackCount = assets.filter((asset) => asset.status !== "cached").length;

  console.log(
    `Prepared ${assets.length} image assets: ${cachedCount} cached, ${fallbackCount} using fallback ${FALLBACK_CHART_IMAGE_PATH}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
