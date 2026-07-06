import { describe, expect, it } from "vitest";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { RoundSetDefinition } from "@/lib/tournament";
import { toPublicChartsSetView } from "./public-chart-view";

const set: RoundSetDefinition = {
  id: "00000000-0000-4000-8000-000000000101",
  chartLevel: 16,
  chartType: "S",
  displayLabel: "S16",
  drawCount: 7,
  maxBans: 2,
  roundNumber: 1,
  setOrder: 1,
};

function draw(): DrawRecord {
  return {
    id: "draw-secret-id",
    charts: [
      {
        id: "chart-visible-id",
        artist: "Open Stage",
        chartKey: "chart-key-secret",
        displayDifficulty: "S16",
        localImagePath: null,
        name: "Arc Furnace",
        songKey: "song-secret",
        sourceBgImg: "https://example.invalid/private-source-bg.png",
      },
    ],
    createdAt: "2026-07-05T00:00:00.000Z",
    displayLabel: set.displayLabel,
    eligibleChartIds: ["eligible-chart-secret"],
    eligiblePoolCount: 42,
    excludedChartKeysSnapshot: ["excluded-chart-secret"],
    reason: "private reroll reason",
    roundNumber: set.roundNumber,
    roundSetId: set.id,
    sameRoundBlockedSongKeysSnapshot: ["blocked-song-secret"],
    selectedSongKeysSnapshot: ["selected-song-secret"],
    setOrder: set.setOrder,
    supersededAt: null,
    version: 4,
  };
}

function collectKeys(value: unknown, keys = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, keys);
    }

    return keys;
  }

  if (!value || typeof value !== "object") {
    return keys;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    keys.add(key);
    collectKeys(nestedValue, keys);
  }

  return keys;
}

describe("public charts view", () => {
  it("maps draw records to display-safe chart props only", () => {
    const view = toPublicChartsSetView({ set, draw: draw() });
    const serialized = JSON.stringify(view);

    expect(Object.keys(view.set).sort()).toEqual([
      "displayLabel",
      "drawCount",
      "roundNumber",
      "setOrder",
    ]);
    expect(Object.keys(view.draw ?? {})).toEqual(["charts"]);
    expect(Object.keys(view.draw?.charts[0] ?? {}).sort()).toEqual([
      "artist",
      "id",
      "imagePath",
      "name",
    ]);
    expect(view.draw?.charts[0]).toEqual({
      artist: "Open Stage",
      id: "chart-visible-id",
      imagePath: FALLBACK_CHART_IMAGE_PATH,
      name: "Arc Furnace",
    });

    expect([...collectKeys(view)].sort()).not.toEqual(
      expect.arrayContaining([
        "chartKey",
        "createdAt",
        "eligibleChartIds",
        "eligiblePoolCount",
        "excludedChartKeysSnapshot",
        "reason",
        "sameRoundBlockedSongKeysSnapshot",
        "selectedSongKeysSnapshot",
        "songKey",
        "sourceBgImg",
        "supersededAt",
        "version",
      ]),
    );
    expect(serialized).not.toContain("draw-secret-id");
    expect(serialized).not.toContain("eligible-chart-secret");
    expect(serialized).not.toContain("private reroll reason");
    expect(serialized).not.toContain("private-source-bg");
    expect(serialized).not.toContain("song-secret");
    expect(serialized).not.toContain("chart-key-secret");
  });

  it("represents an undrawn set without draw metadata", () => {
    expect(toPublicChartsSetView({ set, draw: null })).toEqual({
      set: {
        displayLabel: "S16",
        drawCount: 7,
        roundNumber: 1,
        setOrder: 1,
      },
      draw: null,
    });
  });
});
