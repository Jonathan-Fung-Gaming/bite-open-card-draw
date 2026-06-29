import type { RoundResultSnapshot } from "@/lib/results/result-engine";
import type { RoundBallot } from "@/lib/vote/ballot";

const CSV_COLUMNS = [
  "round_number",
  "player_startgg_username",
  "player_active_at_round_start",
  "submitted",
  "submitted_at",
  "last_revision_at",
  "set_1_label",
  "set_1_draw_id",
  "set_1_draw_version",
  "set_1_ban_1",
  "set_1_ban_2",
  "set_1_no_bans",
  "set_2_label",
  "set_2_draw_id",
  "set_2_draw_version",
  "set_2_ban_1",
  "set_2_ban_2",
  "set_2_no_bans",
  "manual_override",
  "override_admin",
  "override_reason",
  "replaced_existing_ballot",
  "selected_set_1_chart",
  "selected_set_2_chart",
  "set_1_tiebreak_used",
  "set_2_tiebreak_used",
] as const;

function escapeCsv(value: string | number | boolean | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function chartNamesById(result: RoundResultSnapshot) {
  const names = new Map<string, string>();

  for (const set of result.sets) {
    for (const row of set.rows) {
      names.set(row.chart.id, row.chart.name);
    }
  }

  return names;
}

export function generatePrivateBallotCsv(input: {
  result: RoundResultSnapshot;
  ballots: readonly RoundBallot[];
}) {
  const { result } = input;
  const ballotsByPlayer = new Map(input.ballots.map((ballot) => [ballot.playerId, ballot]));
  const chartNames = chartNamesById(result);
  const rows = [CSV_COLUMNS.join(",")];
  const [setOne, setTwo] = result.sets;

  for (const player of result.eligiblePlayers) {
    const ballot = ballotsByPlayer.get(player.id);
    const setOneChoice = ballot?.choices.find((choice) => choice.drawId === setOne.drawId);
    const setTwoChoice = ballot?.choices.find((choice) => choice.drawId === setTwo.drawId);
    const setOneBans = setOneChoice?.bannedChartIds.map((chartId) => chartNames.get(chartId) ?? chartId) ?? [];
    const setTwoBans = setTwoChoice?.bannedChartIds.map((chartId) => chartNames.get(chartId) ?? chartId) ?? [];

    rows.push(
      [
        result.roundNumber,
        player.startggUsername,
        true,
        Boolean(ballot),
        ballot?.submittedAt ?? "",
        ballot?.submittedAt ?? "",
        setOne.displayLabel,
        setOne.drawId,
        setOne.drawVersion,
        setOneBans[0] ?? "",
        setOneBans[1] ?? "",
        setOneChoice?.noBans ?? false,
        setTwo.displayLabel,
        setTwo.drawId,
        setTwo.drawVersion,
        setTwoBans[0] ?? "",
        setTwoBans[1] ?? "",
        setTwoChoice?.noBans ?? false,
        ballot?.manualOverride ?? false,
        ballot?.source === "manual_admin" ? "shared_admin" : "",
        ballot?.manualReason ?? "",
        ballot?.replacedExistingBallot ?? false,
        setOne.selectedChart.name,
        setTwo.selectedChart.name,
        setOne.tiebreakUsed,
        setTwo.tiebreakUsed,
      ].map(escapeCsv).join(","),
    );
  }

  return `${rows.join("\r\n")}\r\n`;
}
