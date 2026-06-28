import { describe, expect, it } from "vitest";
import { applyImageAssetsToCharts, FALLBACK_CHART_IMAGE_PATH, planImageAssets } from "./image-cache";
import { normalizeChartRow } from "./normalize";

describe("chart image cache planning", () => {
  it("deduplicates remote art URLs and keeps chart references", () => {
    const raw = {
      name: "First",
      name_kr: "First",
      artist: "Artist",
      label: "s",
      type: "s",
      level: "16",
      bg_img: "https://example.com/shared.png",
    };
    const first = normalizeChartRow(raw, 2);
    const second = normalizeChartRow(
      {
        ...raw,
        name: "Second",
        name_kr: "Second",
        bg_img: "https://example.com/shared.png",
      },
      3,
    );

    const assets = planImageAssets([first, second]);

    expect(assets).toHaveLength(1);
    expect(assets[0]?.chartIds).toHaveLength(2);
    expect(assets[0]?.localPath).toMatch(/^\/chart-images\/cache\/.+\.png$/);
  });

  it("uses the fallback image when source art is missing", () => {
    const chart = normalizeChartRow(
      {
        name: "Missing",
        name_kr: "Missing",
        artist: "Artist",
        label: "s",
        type: "s",
        level: "16",
        bg_img: "",
      },
      2,
    );
    const assets = planImageAssets([chart]);
    const charts = applyImageAssetsToCharts([chart], assets);

    expect(assets[0]?.status).toBe("fallback");
    expect(charts[0]?.localImagePath).toBe(FALLBACK_CHART_IMAGE_PATH);
  });
});
