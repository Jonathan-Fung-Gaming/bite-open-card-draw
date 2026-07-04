import { expect, type APIRequestContext } from "@playwright/test";
import { parse } from "csv-parse/sync";
import { getTestRouteHeaders, route } from "./phase9-env";

export const FINAL_PRIVATE_CSV_REQUIRED_COLUMNS = [
  "round_number",
  "result_id",
  "result_computed_at",
  "result_reveal_phase",
  "result_reveal_phase_started_at",
  "result_final_revealed_at",
  "player_startgg_username",
  "player_active_at_round_start",
  "submitted",
  "submitted_at",
  "last_revision_at",
  "ballot_revision",
  "set_1_label",
  "set_1_round_set_id",
  "set_1_draw_id",
  "set_1_draw_version",
  "set_1_ban_1",
  "set_1_ban_1_chart_id",
  "set_1_ban_1_difficulty",
  "set_1_ban_2",
  "set_1_ban_2_chart_id",
  "set_1_ban_2_difficulty",
  "set_1_no_bans",
  "set_2_label",
  "set_2_round_set_id",
  "set_2_draw_id",
  "set_2_draw_version",
  "set_2_ban_1",
  "set_2_ban_1_chart_id",
  "set_2_ban_1_difficulty",
  "set_2_ban_2",
  "set_2_ban_2_chart_id",
  "set_2_ban_2_difficulty",
  "set_2_no_bans",
  "manual_override",
  "override_admin",
  "override_reason",
  "replaced_existing_ballot",
  "selected_set_1_chart",
  "selected_set_1_chart_id",
  "selected_set_1_chart_difficulty",
  "selected_set_2_chart",
  "selected_set_2_chart_id",
  "selected_set_2_chart_difficulty",
  "set_1_tiebreak_used",
  "set_1_tiebreak_candidate_ids",
  "set_1_tiebreak_winner_chart_id",
  "set_1_tiebreak_winner_reveal_started_at",
  "set_2_tiebreak_used",
  "set_2_tiebreak_candidate_ids",
  "set_2_tiebreak_winner_chart_id",
  "set_2_tiebreak_winner_reveal_started_at",
] as const;

type PrivateCsvPayload = {
  csv?: string;
  error?: string;
  filename?: string;
};

export type PrivateCsvRecord = Record<string, string>;

export type PrivateCsvSummary = {
  activeAtRoundStartCount: number;
  expectedRows: number;
  manualOverrideCount: number;
  players: string[];
  roundNumber: number;
  selectedSetOneChartIds: string[];
  selectedSetTwoChartIds: string[];
  submittedRows: number;
  tiebreakRows: number;
};

type PrivateCsvFinalContentOptions = {
  expectedActiveAtRoundStartRows?: number;
  expectedManualOverrideRows?: number;
  expectedRevisionByPlayer?: ReadonlyMap<string, number> | Record<string, number>;
  expectedReplacedExistingRows?: number;
  expectedRows: number;
  expectedSubmittedRows?: number;
  requiredPlayers?: readonly string[];
  roundNumber: number;
};

function isRevisionMap(
  expectedRevisionByPlayer: PrivateCsvFinalContentOptions["expectedRevisionByPlayer"],
): expectedRevisionByPlayer is ReadonlyMap<string, number> {
  return typeof expectedRevisionByPlayer?.get === "function";
}

function csvRows(csv: string) {
  return csv.split(/\r?\n/).filter(Boolean);
}

export function parsePrivateCsv(csv: string) {
  return parse(csv, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  }) as PrivateCsvRecord[];
}

export function privateCsvHeader(csv: string) {
  const parsed = parse(csv, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
    to_line: 1,
  }) as string[][];

  return parsed[0] ?? [];
}

function getExpectedRevision(
  expectedRevisionByPlayer: PrivateCsvFinalContentOptions["expectedRevisionByPlayer"],
  player: string,
) {
  if (!expectedRevisionByPlayer) {
    return undefined;
  }

  return isRevisionMap(expectedRevisionByPlayer)
    ? expectedRevisionByPlayer.get(player)
    : (expectedRevisionByPlayer as Record<string, number>)[player];
}

function expectBooleanCell(record: PrivateCsvRecord, column: string) {
  expect(
    ["true", "false"],
    `${column} should be exported as an explicit boolean string`,
  ).toContain(record[column]);
}

function expectIsoTimestamp(value: string | undefined, column: string) {
  expect(value, `${column} should be present`).toBeTruthy();
  expect(Number.isNaN(Date.parse(value ?? "")), `${column} should be ISO-parseable`).toBe(false);
}

function expectChartIdentity(record: PrivateCsvRecord, prefix: "selected_set_1" | "selected_set_2") {
  const chart = record[`${prefix}_chart`];
  const chartId = record[`${prefix}_chart_id`];
  const difficulty = record[`${prefix}_chart_difficulty`];

  expect(chart, `${prefix}_chart should include a display identity`).toBeTruthy();
  expect(chartId, `${prefix}_chart_id should be present`).toBeTruthy();
  expect(difficulty, `${prefix}_chart_difficulty should be present`).toMatch(/^[SD]\d{2}$/);
  expect(chart, `${prefix}_chart should include the selected chart id`).toContain(`<${chartId}>`);
  expect(chart, `${prefix}_chart should include the selected difficulty`).toContain(
    `[${difficulty}]`,
  );
}

function expectOptionalBanIdentity(record: PrivateCsvRecord, prefix: "set_1" | "set_2", ban: 1 | 2) {
  const chart = record[`${prefix}_ban_${ban}`];
  const chartId = record[`${prefix}_ban_${ban}_chart_id`];
  const difficulty = record[`${prefix}_ban_${ban}_difficulty`];

  if (!chartId && !chart && !difficulty) {
    return;
  }

  expect(chart, `${prefix}_ban_${ban} should include display identity`).toBeTruthy();
  expect(chartId, `${prefix}_ban_${ban}_chart_id should be present`).toBeTruthy();
  expect(difficulty, `${prefix}_ban_${ban}_difficulty should be present`).toMatch(/^[SD]\d{2}$/);
  expect(chart, `${prefix}_ban_${ban} should include chart id`).toContain(`<${chartId}>`);
  expect(chart, `${prefix}_ban_${ban} should include difficulty`).toContain(`[${difficulty}]`);
}

export function expectPrivateCsvFinalContent(
  csv: string,
  options: PrivateCsvFinalContentOptions,
): PrivateCsvSummary {
  const header = privateCsvHeader(csv);
  const records = parsePrivateCsv(csv);

  for (const column of FINAL_PRIVATE_CSV_REQUIRED_COLUMNS) {
    expect(header, `CSV should include ${column}`).toContain(column);
  }

  expect(records.length).toBe(options.expectedRows);

  for (const player of options.requiredPlayers ?? []) {
    expect(
      records.some((record) => record.player_startgg_username === player),
      `CSV should include player ${player}`,
    ).toBe(true);
  }

  const submittedRecords = records.filter((record) => record.submitted === "true");
  const activeAtRoundStartRecords = records.filter(
    (record) => record.player_active_at_round_start === "true",
  );
  const manualOverrideRecords = records.filter((record) => record.manual_override === "true");
  const replacedExistingRecords = records.filter(
    (record) => record.replaced_existing_ballot === "true",
  );

  if (typeof options.expectedSubmittedRows === "number") {
    expect(submittedRecords.length).toBe(options.expectedSubmittedRows);
  }

  if (typeof options.expectedActiveAtRoundStartRows === "number") {
    expect(activeAtRoundStartRecords.length).toBe(options.expectedActiveAtRoundStartRows);
  }

  if (typeof options.expectedManualOverrideRows === "number") {
    expect(manualOverrideRecords.length).toBe(options.expectedManualOverrideRows);
  }

  if (typeof options.expectedReplacedExistingRows === "number") {
    expect(replacedExistingRecords.length).toBe(options.expectedReplacedExistingRows);
  }

  for (const record of records) {
    expect(record.round_number).toBe(String(options.roundNumber));
    expect(record.result_reveal_phase).toBe("final");
    expectIsoTimestamp(record.result_computed_at, "result_computed_at");
    expectIsoTimestamp(record.result_reveal_phase_started_at, "result_reveal_phase_started_at");
    expectIsoTimestamp(record.result_final_revealed_at, "result_final_revealed_at");
    expect(record.player_startgg_username).toBeTruthy();
    expectBooleanCell(record, "player_active_at_round_start");
    expectBooleanCell(record, "submitted");
    expectBooleanCell(record, "set_1_no_bans");
    expectBooleanCell(record, "set_2_no_bans");
    expectBooleanCell(record, "manual_override");
    expectBooleanCell(record, "replaced_existing_ballot");
    expectBooleanCell(record, "set_1_tiebreak_used");
    expectBooleanCell(record, "set_2_tiebreak_used");
    expect(record.set_1_label).toMatch(/^[SD]\d{2}$/);
    expect(record.set_2_label).toMatch(/^[SD]\d{2}$/);
    expect(record.set_1_round_set_id).toBeTruthy();
    expect(record.set_2_round_set_id).toBeTruthy();
    expect(record.set_1_draw_id).toBeTruthy();
    expect(record.set_2_draw_id).toBeTruthy();
    expect(Number(record.set_1_draw_version)).toBeGreaterThanOrEqual(1);
    expect(Number(record.set_2_draw_version)).toBeGreaterThanOrEqual(1);
    expectChartIdentity(record, "selected_set_1");
    expectChartIdentity(record, "selected_set_2");
    expectOptionalBanIdentity(record, "set_1", 1);
    expectOptionalBanIdentity(record, "set_1", 2);
    expectOptionalBanIdentity(record, "set_2", 1);
    expectOptionalBanIdentity(record, "set_2", 2);

    if (record.set_1_tiebreak_used === "true") {
      expect(record.set_1_tiebreak_candidate_ids).toContain(
        record.set_1_tiebreak_winner_chart_id,
      );
    }

    if (record.set_2_tiebreak_used === "true") {
      expect(record.set_2_tiebreak_candidate_ids).toContain(
        record.set_2_tiebreak_winner_chart_id,
      );
    }

    if (record.submitted === "true") {
      expectIsoTimestamp(record.submitted_at, "submitted_at");
      expectIsoTimestamp(record.last_revision_at, "last_revision_at");
      expect(Number(record.ballot_revision)).toBeGreaterThanOrEqual(1);
    }

    const expectedRevision = getExpectedRevision(
      options.expectedRevisionByPlayer,
      record.player_startgg_username,
    );

    if (typeof expectedRevision === "number") {
      expect(record.submitted).toBe("true");
      expect(Number(record.ballot_revision)).toBe(expectedRevision);
    }
  }

  return {
    activeAtRoundStartCount: records.filter(
      (record) => record.player_active_at_round_start === "true",
    ).length,
    expectedRows: options.expectedRows,
    manualOverrideCount: records.filter((record) => record.manual_override === "true").length,
    players: records.map((record) => record.player_startgg_username),
    roundNumber: options.roundNumber,
    selectedSetOneChartIds: [...new Set(records.map((record) => record.selected_set_1_chart_id))],
    selectedSetTwoChartIds: [...new Set(records.map((record) => record.selected_set_2_chart_id))],
    submittedRows: submittedRecords.length,
    tiebreakRows: records.filter(
      (record) =>
        record.set_1_tiebreak_used === "true" || record.set_2_tiebreak_used === "true",
    ).length,
  };
}

export async function expectPrivateCsvExport(options: {
  baseURL: string;
  expectedActiveAtRoundStartRows?: number;
  expectedManualOverrideRows?: number;
  expectedRows: number;
  expectedSubmittedRows?: number;
  request: APIRequestContext;
  expectedRevisionByPlayer?: ReadonlyMap<string, number> | Record<string, number>;
  expectedReplacedExistingRows?: number;
  requiredPlayers?: string[];
  roundNumber: number;
}) {
  const {
    baseURL,
    expectedActiveAtRoundStartRows,
    expectedManualOverrideRows,
    expectedRevisionByPlayer,
    expectedReplacedExistingRows,
    expectedRows,
    expectedSubmittedRows,
    request,
    requiredPlayers,
    roundNumber,
  } = options;
  const response = await request.get(
    route(baseURL, `/api/e2e/private-csv?roundNumber=${roundNumber}`),
    {
      headers: getTestRouteHeaders(),
      timeout: 30_000,
    },
  );
  const payload = (await response.json()) as PrivateCsvPayload;

  expect(
    response.ok(),
    payload.error ?? `private CSV route returned HTTP ${response.status()}`,
  ).toBe(true);
  expect(payload.filename).toBe(`round-${roundNumber}-private-ballots.csv`);

  const csv = payload.csv ?? "";
  const rows = csvRows(csv);

  expect(rows.length - 1).toBe(expectedRows);
  expectPrivateCsvFinalContent(csv, {
    expectedRevisionByPlayer,
    expectedActiveAtRoundStartRows,
    expectedManualOverrideRows,
    expectedReplacedExistingRows,
    expectedRows,
    expectedSubmittedRows,
    requiredPlayers: requiredPlayers ?? ["Rehearsal Player 01", "Rehearsal Player 02"],
    roundNumber,
  });

  return csv;
}
