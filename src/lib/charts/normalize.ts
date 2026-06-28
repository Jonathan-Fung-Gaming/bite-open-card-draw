import { createHash } from "node:crypto";
import type { NormalizedChart, RawChartCsvRow } from "./types";
import { REQUIRED_CHART_POOLS } from "./types";

export function normalizeChartType(value: string): "s" | "d" {
  const normalized = value.trim().toLowerCase();

  if (normalized === "s" || normalized === "single") {
    return "s";
  }

  if (normalized === "d" || normalized === "double") {
    return "d";
  }

  throw new Error(`Unsupported chart type: ${value}`);
}

export function parseChartLevel(value: string): number {
  const level = Number.parseInt(value.trim(), 10);

  if (!Number.isFinite(level) || level <= 0) {
    throw new Error(`Unsupported chart level: ${value}`);
  }

  return level;
}

export function normalizeKeyPart(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "unknown";
}

export function buildSongKey(name: string, artist: string): string {
  return `${normalizeKeyPart(name)}__${normalizeKeyPart(artist)}`;
}

export function buildChartKey(
  name: string,
  artist: string,
  chartType: "s" | "d",
  level: number,
): string {
  return `${buildSongKey(name, artist)}__${chartType}${level}`;
}

export function deterministicUuid(input: string): string {
  const hex = createHash("sha256").update(input).digest("hex");
  const variant = ((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

export function normalizeChartRow(row: RawChartCsvRow, sourceRowNumber: number): NormalizedChart {
  const chartType = normalizeChartType(row.type);
  const level = parseChartLevel(row.level);
  const displayDifficulty = `${chartType.toUpperCase()}${level}`;
  const songKey = buildSongKey(row.name, row.artist);
  const chartKey = buildChartKey(row.name, row.artist, chartType, level);

  return {
    id: deterministicUuid(chartKey),
    sourceRowNumber,
    name: row.name.trim(),
    nameKr: row.name_kr.trim(),
    artist: row.artist.trim(),
    label: row.label.trim(),
    chartType,
    level,
    displayDifficulty,
    songKey,
    chartKey,
    sourceBgImg: row.bg_img.trim(),
    localImagePath: null,
    tournamentScope: REQUIRED_CHART_POOLS.includes(displayDifficulty as never),
    excluded: false,
    exclusionReason: null,
  };
}
