import { describe, expect, it } from "vitest";
import { localImagePathForRemoteUrl } from "./image-cache";
import { normalizeChartRow } from "./normalize";
import { filterDisallowedRuntimeCharts, resolveRuntimeChartImages } from "./runtime-catalog";

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
  it("keeps generated cached chart art even when the server filesystem cannot see public assets", () => {
    expect(
      resolveRuntimeChartImages([chartWithLocalImagePath("/chart-images/cache/runtime.png")])[0]
        ?.localImagePath,
    ).toBe("/chart-images/cache/runtime.png");

    expect(
      resolveRuntimeChartImages([chartWithLocalImagePath("/chart-images/cache/missing.png")])[0]
        ?.localImagePath,
    ).toBe("/chart-images/cache/missing.png");
  });

  it("derives deployed cache paths from source bg_img when generated metadata is absent", () => {
    const expectedLocalPath = localImagePathForRemoteUrl("https://example.com/runtime.png");

    expect(resolveRuntimeChartImages([chartWithLocalImagePath(null)])[0]?.localImagePath).toBe(
      expectedLocalPath,
    );
  });

  it("filters stale generated Short Cut and Full Song charts before runtime use", () => {
    const normal = chartWithLocalImagePath("/chart-images/cache/runtime.png");
    const filtered = filterDisallowedRuntimeCharts([
      normal,
      {
        ...normal,
        id: "short-cut",
        name: "Runtime - SHORT CUT -",
        nameKr: "Runtime - SHORT CUT -",
      },
      {
        ...normal,
        id: "full-song",
        name: "Runtime - FULL SONG -",
        nameKr: "Runtime - FULL SONG -",
      },
      {
        ...normal,
        id: "remix",
        name: "Runtime Remix",
        nameKr: "Runtime Remix",
      },
    ]);

    expect(filtered.map((chart) => chart.id)).toEqual([normal.id, "remix"]);
  });
});
