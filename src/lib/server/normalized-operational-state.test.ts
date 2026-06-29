import { describe, expect, it, vi } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import {
  createAdminStateStores,
  createOperationalStateSnapshot,
} from "@/lib/persistence/operational-state";
import {
  NormalizedOperationalStateRepository,
  type NormalizedOperationalSupabaseClient,
} from "./normalized-operational-state";

vi.mock("server-only", () => ({}));

type StoredRow = Record<string, unknown>;

class FakeNormalizedSupabaseClient {
  readonly rows = new Map<string, StoredRow[]>();
  readonly touchedTables: string[] = [];

  from(table: string) {
    this.touchedTables.push(table);

    return {
      select: () => ({
        eq: async (column: string, value: string) => ({
          data: this.cloneRows((this.rows.get(table) ?? []).filter((row) => row[column] === value)),
          error: null,
        }),
      }),
      insert: async (rows: StoredRow[]) => {
        this.rows.set(table, [...(this.rows.get(table) ?? []), ...this.cloneRows(rows)]);

        return { error: null };
      },
      upsert: async (input: StoredRow[] | StoredRow) => {
        const rows = Array.isArray(input) ? input : [input];
        const existing = this.rows.get(table) ?? [];

        for (const row of this.cloneRows(rows)) {
          const keyColumn = table === "event_runtime_state" ? "event_id" : "id";
          const key = row[keyColumn];
          const index = existing.findIndex((candidate) => candidate[keyColumn] === key);

          if (index >= 0) {
            existing[index] = row;
          } else {
            existing.push(row);
          }
        }

        this.rows.set(table, existing);

        return { error: null };
      },
      delete: () => ({
        eq: async (column: string, value: string) => {
          this.rows.set(
            table,
            (this.rows.get(table) ?? []).filter((row) => row[column] !== value),
          );

          return { error: null };
        },
      }),
    };
  }

  private cloneRows<T>(rows: T): T {
    return JSON.parse(JSON.stringify(rows)) as T;
  }
}

function chartsFor(level: string, startRow: number, prefix: string) {
  return Array.from({ length: 8 }, (_, index) =>
    normalizeChartRow(
      {
        name: `${prefix} ${index}`,
        name_kr: `${prefix} ${index}`,
        artist: "Artist",
        label: "test",
        type: "s",
        level,
        bg_img: "",
      },
      startRow + index,
    ),
  );
}

describe("normalized operational state repository", () => {
  it("round-trips runtime state through normalized tables instead of tournament_state_snapshots", async () => {
    const supabase = new FakeNormalizedSupabaseClient();
    const repository = new NormalizedOperationalStateRepository({
      eventId: "phase-5-test",
      supabase: supabase as unknown as NormalizedOperationalSupabaseClient,
      now: () => "2026-06-29T00:00:00.000Z",
    });
    const stores = createAdminStateStores();
    const player = stores.rosterStore.createOrUpdatePlayer({
      startggUsername: "Alpha",
      active: true,
      now: "2026-06-29T00:00:00.000Z",
    });

    stores.drawStateStore.setChartsForTest([
      ...chartsFor("16", 10, "S16"),
      ...chartsFor("17", 30, "S17"),
    ]);
    const firstDraw = stores.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 1 });
    const secondDraw = stores.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 2 });

    stores.votingWindowStore.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: [{ id: player.id, startggUsername: player.startggUsername }],
      nowMs: 0,
    });
    stores.ballotStore.submit(
      {
        roundNumber: 1,
        playerId: player.id,
        playerStartggUsername: player.startggUsername,
        choices: [
          {
            drawId: firstDraw.id,
            roundSetId: firstDraw.roundSetId,
            displayLabel: firstDraw.displayLabel,
            noBans: false,
            bannedChartIds: [firstDraw.charts[0]?.id ?? ""],
          },
          {
            drawId: secondDraw.id,
            roundSetId: secondDraw.roundSetId,
            displayLabel: secondDraw.displayLabel,
            noBans: true,
            bannedChartIds: [],
          },
        ],
      },
      [firstDraw, secondDraw],
      "2026-06-29T00:01:00.000Z",
      { editTokenHash: "hash-from-phone" },
    );
    stores.ballotStore.claimVoterPresence({
      roundNumber: 3,
      playerId: player.id,
      deviceId: "phone-a",
      nowMs: 90_000,
    });
    stores.votingWindowStore.closeVoting(1, 10_000);
    stores.resultStore.computeRound({
      roundNumber: 1,
      draws: [firstDraw, secondDraw],
      ballots: stores.ballotStore.listForRound(1),
      eligiblePlayers: stores.rosterStore.listEligiblePlayersForRound(1),
      now: "2026-06-29T00:02:00.000Z",
    });

    await repository.save(createOperationalStateSnapshot(stores, "2026-06-29T00:03:00.000Z"));

    expect(supabase.touchedTables).not.toContain("tournament_state_snapshots");
    expect(supabase.touchedTables).not.toContain("admin_sessions");
    expect(supabase.rows.get("ballot_choices")?.[0]).toMatchObject({
      draw_id: firstDraw.id,
      round_set_id: firstDraw.roundSetId,
    });
    expect(supabase.rows.get("ballots")?.[0]).toMatchObject({
      edit_token_hash: "hash-from-phone",
    });
    expect(supabase.rows.get("result_rows")?.some((row) => row.draw_id === firstDraw.id)).toBe(
      true,
    );
    expect(supabase.rows.get("active_voter_presence")?.[0]).toMatchObject({
      round_number: 3,
      player_id: player.id,
      device_id: "phone-a",
    });

    const restored = await repository.load();

    expect(restored?.roster.players.map((candidate) => candidate.startggUsername)).toEqual([
      "Alpha",
    ]);
    expect(restored?.draw.drawHistory[0]).toMatchObject({
      id: firstDraw.id,
      roundSetId: firstDraw.roundSetId,
    });
    expect(restored?.ballot.ballots[0]?.choices[0]).toMatchObject({
      drawId: firstDraw.id,
      roundSetId: firstDraw.roundSetId,
    });
    expect(restored?.ballot.ballots[0]?.editTokenHash).toBe("hash-from-phone");
    expect(restored?.result.results[0]?.sets[0]).toMatchObject({
      drawId: firstDraw.id,
      roundSetId: firstDraw.roundSetId,
    });
    expect(restored?.ballot.presenceClaims?.[0]).toMatchObject({
      roundNumber: 3,
      playerId: player.id,
      deviceId: "phone-a",
    });
  });
});
