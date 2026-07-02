import { randomUUID } from "node:crypto";
import type { RoundResultSnapshot } from "@/lib/results/result-engine";
import type { RoundBallot } from "@/lib/vote/ballot";

const CSV_COLUMNS = [
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

type CsvCell = string | number | boolean | null | undefined;
type CsvChart = RoundResultSnapshot["sets"][number]["selectedChart"];
type RoundBallotWithTimestamps = RoundBallot & {
  firstSubmittedAt?: string | null;
  lastRevisionAt?: string | null;
};

type EligibilityExportMetadata = {
  playerId: string;
  activeAtRoundStart: boolean;
};

function neutralizeSpreadsheetFormula(text: string) {
  return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function escapeCsv(value: string | number | boolean | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  const safeText = typeof value === "string" ? neutralizeSpreadsheetFormula(text) : text;

  if (/[",\r\n]/.test(safeText)) {
    return `"${safeText.replaceAll('"', '""')}"`;
  }

  return safeText;
}

function chartById(result: RoundResultSnapshot) {
  const charts = new Map<string, CsvChart>();

  for (const set of result.sets) {
    for (const row of set.rows) {
      charts.set(row.chart.id, row.chart);
    }
  }

  return charts;
}

function formatChartForCsv(chart: CsvChart | null | undefined, fallbackChartId = "") {
  if (!chart) {
    return fallbackChartId;
  }

  return `${chart.name} [${chart.displayDifficulty}] <${chart.id}>`;
}

function bannedChartCells(chartId: string | undefined, chartsById: ReadonlyMap<string, CsvChart>) {
  if (!chartId) {
    return ["", "", ""] as const;
  }

  const chart = chartsById.get(chartId);

  return [
    formatChartForCsv(chart, chartId),
    chart?.id ?? chartId,
    chart?.displayDifficulty ?? "",
  ] as const;
}

function activeAtRoundStartForPlayer(
  player: RoundResultSnapshot["eligiblePlayers"][number],
  activeByPlayerId: ReadonlyMap<string, boolean>,
  emergencyAddedPlayerIds: ReadonlySet<string>,
) {
  const playerWithMetadata = player as typeof player & {
    activeAtRoundStart?: unknown;
    playerActiveAtRoundStart?: unknown;
  };

  if (typeof playerWithMetadata.activeAtRoundStart === "boolean") {
    return playerWithMetadata.activeAtRoundStart;
  }

  if (typeof playerWithMetadata.playerActiveAtRoundStart === "boolean") {
    return playerWithMetadata.playerActiveAtRoundStart;
  }

  if (activeByPlayerId.has(player.id)) {
    return activeByPlayerId.get(player.id) as boolean;
  }

  return !emergencyAddedPlayerIds.has(player.id);
}

function firstSubmittedAt(ballot: RoundBallotWithTimestamps | undefined) {
  return ballot?.firstSubmittedAt ?? ballot?.submittedAt ?? "";
}

function lastRevisionAt(ballot: RoundBallotWithTimestamps | undefined) {
  return ballot?.lastRevisionAt ?? ballot?.submittedAt ?? "";
}

function sanitizeFilenameSegment(value: string) {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "event"
  );
}

export function buildPrivateBallotCsvFilename(input: {
  eventId: string;
  roundNumber: 1 | 2 | 3 | 4;
  generatedAt?: string;
  nonce?: string;
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const timestamp = generatedAt.replace(/[:.]/g, "-").replace(/[^0-9TZ-]/g, "");
  const nonce = sanitizeFilenameSegment(input.nonce ?? randomUUID().slice(0, 8));
  const eventId = sanitizeFilenameSegment(input.eventId);

  return `${eventId}-round-${input.roundNumber}-private-ballots-${timestamp}-${nonce}.csv`;
}

export function generatePrivateBallotCsv(input: {
  result: RoundResultSnapshot;
  ballots: readonly RoundBallot[];
  roundEligibility?: readonly EligibilityExportMetadata[];
  emergencyEligiblePlayerIds?: readonly string[];
}) {
  const { result } = input;
  const ballotsByPlayer = new Map(
    input.ballots.map((ballot) => [ballot.playerId, ballot as RoundBallotWithTimestamps]),
  );
  const chartsById = chartById(result);
  const activeByPlayerId = new Map(
    (input.roundEligibility ?? []).map((entry) => [
      entry.playerId,
      entry.activeAtRoundStart,
    ]),
  );
  const emergencyAddedPlayerIds = new Set(input.emergencyEligiblePlayerIds ?? []);
  const rows = [CSV_COLUMNS.join(",")];
  const [setOne, setTwo] = result.sets;

  for (const player of result.eligiblePlayers) {
    const ballot = ballotsByPlayer.get(player.id);
    const setOneChoice = ballot?.choices.find((choice) => choice?.drawId === setOne.drawId);
    const setTwoChoice = ballot?.choices.find((choice) => choice?.drawId === setTwo.drawId);
    const setOneBanOne = bannedChartCells(setOneChoice?.bannedChartIds[0], chartsById);
    const setOneBanTwo = bannedChartCells(setOneChoice?.bannedChartIds[1], chartsById);
    const setTwoBanOne = bannedChartCells(setTwoChoice?.bannedChartIds[0], chartsById);
    const setTwoBanTwo = bannedChartCells(setTwoChoice?.bannedChartIds[1], chartsById);

    const cells: CsvCell[] = [
        result.roundNumber,
        result.id,
        result.computedAt,
        result.revealPhase,
        result.revealPhaseStartedAt,
        result.finalRevealedAt ?? "",
        player.startggUsername,
        activeAtRoundStartForPlayer(player, activeByPlayerId, emergencyAddedPlayerIds),
        Boolean(ballot),
        firstSubmittedAt(ballot),
        lastRevisionAt(ballot),
        ballot?.revision ?? "",
        setOne.displayLabel,
        setOne.roundSetId,
        setOne.drawId,
        setOne.drawVersion,
        ...setOneBanOne,
        ...setOneBanTwo,
        setOneChoice?.noBans ?? false,
        setTwo.displayLabel,
        setTwo.roundSetId,
        setTwo.drawId,
        setTwo.drawVersion,
        ...setTwoBanOne,
        ...setTwoBanTwo,
        setTwoChoice?.noBans ?? false,
        ballot?.manualOverride ?? false,
        ballot?.source === "manual_admin" ? "shared_admin" : "",
        ballot?.manualReason ?? "",
        ballot?.replacedExistingBallot ?? false,
        formatChartForCsv(setOne.selectedChart),
        setOne.selectedChart.id,
        setOne.selectedChart.displayDifficulty,
        formatChartForCsv(setTwo.selectedChart),
        setTwo.selectedChart.id,
        setTwo.selectedChart.displayDifficulty,
        setOne.tiebreakUsed,
        setOne.tiebreakCandidateIds.join("|"),
        setOne.tiebreakWinnerChartId ?? "",
        setOne.winnerRevealStartedAt ?? "",
        setTwo.tiebreakUsed,
        setTwo.tiebreakCandidateIds.join("|"),
        setTwo.tiebreakWinnerChartId ?? "",
        setTwo.winnerRevealStartedAt ?? "",
      ];

    rows.push(cells.map(escapeCsv).join(","));
  }

  return `${rows.join("\r\n")}\r\n`;
}
