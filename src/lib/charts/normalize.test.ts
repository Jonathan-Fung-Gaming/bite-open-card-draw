import { describe, expect, it } from "vitest";
import {
  applyChartExclusions,
  getEligibleTournamentCharts,
  normalizeChartExclusionState,
  upsertChartExclusion,
} from "./exclusions";
import { buildChartKey, normalizeChartRow, normalizeKeyPart, parseChartLevel } from "./normalize";

const rawRow = {
  name: "Murdoch vs Otada",
  name_kr: "Murdoch vs Otada",
  artist: "ESPITZ vs WONDERTRAVELER Project",
  label: "s",
  type: "s",
  level: "16",
  bg_img: "https://example.com/chart.png",
};

describe("chart normalization", () => {
  it("normalizes names into stable song and chart keys", () => {
    expect(normalizeKeyPart("Murdoch vs Otada")).toBe("murdoch-vs-otada");
    expect(buildChartKey("Murdoch vs Otada", "ESPITZ vs WONDERTRAVELER Project", "s", 16)).toBe(
      "murdoch-vs-otada__espitz-vs-wondertraveler-project__s16",
    );
  });

  it("uses stable hashed key parts for Unicode-only values that would otherwise collapse", () => {
    const first = normalizeChartRow(
      {
        ...rawRow,
        name: "가나다",
        name_kr: "가나다",
        artist: "작곡가",
      },
      2,
    );
    const second = normalizeChartRow(
      {
        ...rawRow,
        name: "라마바",
        name_kr: "라마바",
        artist: "작곡가",
      },
      3,
    );

    expect(first.songKey).toMatch(/^unicode-[0-9a-f]{16}__unicode-[0-9a-f]{16}$/);
    expect(first.chartKey).toMatch(/^unicode-[0-9a-f]{16}__unicode-[0-9a-f]{16}__s16$/);
    expect(first.songKey).not.toBe("unknown__unknown");
    expect(first.songKey).not.toBe(second.songKey);
    expect(normalizeKeyPart("☆")).toMatch(/^unicode-[0-9a-f]{16}$/);
    expect(normalizeKeyPart("")).toBe("unknown");
  });

  it("keeps readable ASCII parts from mixed Unicode values", () => {
    expect(normalizeKeyPart("사랑 Love ☆")).toBe("love");
  });

  it("parses leading-zero chart levels", () => {
    expect(parseChartLevel("09")).toBe(9);
  });

  it("rejects non-strict chart levels", () => {
    expect(() => parseChartLevel("16x")).toThrow("Unsupported chart level");
    expect(() => parseChartLevel(" 16 ")).toThrow("Unsupported chart level");
    expect(() => parseChartLevel("")).toThrow("Unsupported chart level");
    expect(() => parseChartLevel("16.5")).toThrow("Unsupported chart level");
    expect(() => parseChartLevel("0")).toThrow("Unsupported chart level");
  });

  it("marks only tournament pools as tournament scope", () => {
    expect(normalizeChartRow(rawRow, 2).tournamentScope).toBe(true);
    expect(normalizeChartRow({ ...rawRow, level: "09" }, 3).tournamentScope).toBe(false);
  });

  it("supports exclusion and re-inclusion by chart key", () => {
    const chart = normalizeChartRow(rawRow, 2);
    const excluded = upsertChartExclusion([], chart.chartKey, true, "event rule exclusion", "now");
    const withExclusion = applyChartExclusions([chart], excluded);

    expect(getEligibleTournamentCharts(withExclusion)).toHaveLength(0);

    const reIncluded = upsertChartExclusion(
      excluded,
      chart.chartKey,
      false,
      "metadata fixed",
      "later",
    );
    const restored = applyChartExclusions([chart], reIncluded);

    expect(getEligibleTournamentCharts(restored)).toHaveLength(1);
  });

  it("normalizes duplicate exclusion rows to the latest current state", () => {
    const chart = normalizeChartRow(rawRow, 2);
    const normalized = normalizeChartExclusionState([
      {
        chartKey: chart.chartKey,
        excluded: true,
        reason: "old exclusion",
        updatedAt: "2026-07-03T00:00:01.000Z",
      },
      {
        chartKey: chart.chartKey,
        excluded: false,
        reason: "restored",
        updatedAt: "2026-07-03T00:00:02.000Z",
      },
    ]);

    expect(normalized).toEqual([
      {
        chartKey: chart.chartKey,
        excluded: false,
        reason: "restored",
        updatedAt: "2026-07-03T00:00:02.000Z",
      },
    ]);
    expect(getEligibleTournamentCharts(applyChartExclusions([chart], normalized))).toHaveLength(1);
  });
});
