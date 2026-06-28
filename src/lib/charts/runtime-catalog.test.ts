import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { localImagePathForRemoteUrl } from "./image-cache";
import { FALLBACK_CHART_IMAGE_PATH } from "./image-paths";
import { normalizeChartRow } from "./normalize";
import { resolveRuntimeChartImages } from "./runtime-catalog";

function chartWithLocalImagePath(localImagePath: string | null) {
  return {
    ...normalizeChartRow(
      {
        name: "Runtime",
        name_kr: "Runtime",
        artist: "Artist",
        label: "s",
        type: "s",
        level: "16",
        bg_img: "https://example.com/runtime.png",
      },
      2,
    ),
    localImagePath,
  };
}

describe("runtime chart catalog", () => {
  it("keeps cached chart art only when the local public asset exists", () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), "runtime-charts-"));
    const cachedPath = path.join(projectRoot, "public/chart-images/cache/runtime.png");
    mkdirSync(path.dirname(cachedPath), { recursive: true });
    writeFileSync(cachedPath, "image");

    expect(
      resolveRuntimeChartImages(
        [chartWithLocalImagePath("/chart-images/cache/runtime.png")],
        projectRoot,
      )[0]?.localImagePath,
    ).toBe("/chart-images/cache/runtime.png");

    expect(
      resolveRuntimeChartImages(
        [chartWithLocalImagePath("/chart-images/cache/missing.png")],
        projectRoot,
      )[0]?.localImagePath,
    ).toBe(FALLBACK_CHART_IMAGE_PATH);
  });

  it("derives deployed cache paths from source bg_img when generated metadata is absent", () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), "runtime-charts-"));
    const expectedLocalPath = localImagePathForRemoteUrl("https://example.com/runtime.png");
    const cachedPath = path.join(projectRoot, "public", expectedLocalPath.replace(/^\/+/, ""));

    mkdirSync(path.dirname(cachedPath), { recursive: true });
    writeFileSync(cachedPath, "image");

    expect(resolveRuntimeChartImages([chartWithLocalImagePath(null)], projectRoot)[0]?.localImagePath).toBe(
      expectedLocalPath,
    );
  });
});
