import { expect, type APIRequestContext } from "@playwright/test";
import { getTestRouteHeaders, route } from "./phase9-env";

const REQUIRED_COLUMNS = [
  "round_number",
  "player_startgg_username",
  "submitted",
  "set_1_no_bans",
  "set_2_no_bans",
  "manual_override",
  "selected_set_1_chart",
  "selected_set_2_chart",
  "set_1_tiebreak_used",
  "set_2_tiebreak_used",
] as const;

type PrivateCsvPayload = {
  csv?: string;
  error?: string;
  filename?: string;
};

function csvRows(csv: string) {
  return csv.split(/\r?\n/).filter(Boolean);
}

export async function expectPrivateCsvExport(options: {
  baseURL: string;
  expectedRows: number;
  request: APIRequestContext;
  requiredPlayers?: string[];
  roundNumber: number;
}) {
  const { baseURL, expectedRows, request, requiredPlayers, roundNumber } = options;
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
  const header = rows[0]?.split(",") ?? [];

  for (const column of REQUIRED_COLUMNS) {
    expect(header, `CSV should include ${column}`).toContain(column);
  }

  expect(rows.length - 1).toBe(expectedRows);
  for (const player of requiredPlayers ?? ["Rehearsal Player 01", "Rehearsal Player 02"]) {
    expect(csv).toContain(player);
  }
  expect(csv).toContain("selected_set_1_chart");
  expect(csv).toContain("selected_set_2_chart");

  return csv;
}
