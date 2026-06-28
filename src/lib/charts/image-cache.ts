import { createHash } from "node:crypto";
import type { ImageAsset, NormalizedChart } from "./types";

export const FALLBACK_CHART_IMAGE_PATH = "/chart-images/fallback-card.svg";

export function imageHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function extensionFromRemoteUrl(remoteUrl: string) {
  try {
    const pathname = new URL(remoteUrl).pathname;
    const extension = pathname.split(".").pop()?.toLowerCase();

    if (extension && ["png", "jpg", "jpeg", "webp"].includes(extension)) {
      return extension === "jpeg" ? "jpg" : extension;
    }
  } catch {
    return "png";
  }

  return "png";
}

export function localImagePathForRemoteUrl(remoteUrl: string) {
  return `/chart-images/cache/${imageHash(remoteUrl)}.${extensionFromRemoteUrl(remoteUrl)}`;
}

export function planImageAssets(charts: readonly NormalizedChart[]): ImageAsset[] {
  const assets = new Map<string, ImageAsset>();

  for (const chart of charts) {
    if (!chart.sourceBgImg) {
      assets.set(`fallback:${chart.id}`, {
        remoteUrl: null,
        localPath: FALLBACK_CHART_IMAGE_PATH,
        status: "fallback",
        chartIds: [chart.id],
        failureReason: "Chart row has no bg_img URL.",
      });
      continue;
    }

    const existing = assets.get(chart.sourceBgImg);

    if (existing) {
      existing.chartIds.push(chart.id);
      continue;
    }

    assets.set(chart.sourceBgImg, {
      remoteUrl: chart.sourceBgImg,
      localPath: localImagePathForRemoteUrl(chart.sourceBgImg),
      status: "pending",
      chartIds: [chart.id],
    });
  }

  return [...assets.values()].sort((left, right) => left.localPath.localeCompare(right.localPath));
}

export function applyImageAssetsToCharts(
  charts: readonly NormalizedChart[],
  assets: readonly ImageAsset[],
): NormalizedChart[] {
  const assetsByRemoteUrl = new Map(
    assets
      .filter((asset) => asset.remoteUrl)
      .map((asset) => [asset.remoteUrl as string, asset.localPath]),
  );

  return charts.map((chart) => ({
    ...chart,
    localImagePath: chart.sourceBgImg
      ? (assetsByRemoteUrl.get(chart.sourceBgImg) ?? FALLBACK_CHART_IMAGE_PATH)
      : FALLBACK_CHART_IMAGE_PATH,
  }));
}
