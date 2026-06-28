import { describe, expect, it } from "vitest";
import {
  applyChartExclusions,
  getEligibleTournamentCharts,
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

  it("parses leading-zero chart levels", () => {
    expect(parseChartLevel("09")).toBe(9);
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
});
