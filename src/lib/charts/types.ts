export const EXPECTED_CHART_CSV_COLUMNS = [
  "name",
  "name_kr",
  "artist",
  "label",
  "type",
  "level",
  "bg_img",
] as const;

export const REQUIRED_CHART_POOLS = [
  "S16",
  "S17",
  "S18",
  "S19",
  "S20",
  "S21",
  "S22",
  "D23",
] as const;

export type RequiredChartPool = (typeof REQUIRED_CHART_POOLS)[number];

export type RawChartCsvRow = {
  name: string;
  name_kr: string;
  artist: string;
  label: string;
  type: string;
  level: string;
  bg_img: string;
};

export type NormalizedChart = {
  id: string;
  sourceRowNumber: number;
  name: string;
  nameKr: string;
  artist: string;
  label: string;
  chartType: "s" | "d";
  level: number;
  displayDifficulty: string;
  songKey: string;
  chartKey: string;
  sourceBgImg: string;
  localImagePath: string | null;
  tournamentScope: boolean;
  excluded: boolean;
  exclusionReason: string | null;
};

export type ChartDuplicate = {
  chartKey: string;
  firstSourceRowNumber: number;
  duplicateSourceRowNumber: number;
};

export type ChartImportRowDiagnostic = {
  sourceRowNumber: number;
  reason: string;
};

export type ChartImportReport = {
  sourcePath: string;
  usedFixture: boolean;
  generatedAt: string;
  sourceSha256: string | null;
  strictMode: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewedCommit: string | null;
  totalSourceRows: number;
  importedCharts: number;
  repairedRows: ChartImportRowDiagnostic[];
  skippedRows: ChartImportRowDiagnostic[];
  filteredRows: ChartImportRowDiagnostic[];
  outOfScopeRows: ChartImportRowDiagnostic[];
  duplicateChartKeys: ChartDuplicate[];
  poolCounts: Record<RequiredChartPool, number>;
  poolsWithTooFewCharts: RequiredChartPool[];
  strictFailures: string[];
};

export type ChartExclusion = {
  chartKey: string;
  excluded: boolean;
  reason: string;
  updatedAt: string;
};

export type ImageAssetStatus = "pending" | "cached" | "fallback" | "failed";

export type ImageAsset = {
  remoteUrl: string | null;
  localPath: string;
  status: ImageAssetStatus;
  chartIds: string[];
  failureReason?: string;
};
