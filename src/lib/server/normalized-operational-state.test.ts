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
  readonly operations: Array<{
    operation: "select" | "insert" | "upsert" | "delete";
    table: string;
  }> = [];
  readonly rpcCalls: Array<{ functionName: string; args: Record<string, string> }> = [];

  from(table: string) {
    this.touchedTables.push(table);

    return {
      select: () => ({
        eq: async (column: string, value: string) => {
          this.operations.push({ operation: "select", table });

          return {
            data: this.cloneRows(
              (this.rows.get(table) ?? []).filter((row) => row[column] === value),
            ),
            error: null,
          };
        },
      }),
      insert: async (rows: StoredRow[]) => {
        this.operations.push({ operation: "insert", table });
        this.rows.set(table, [...(this.rows.get(table) ?? []), ...this.cloneRows(rows)]);

        return { error: null };
      },
      upsert: async (input: StoredRow[] | StoredRow) => {
        this.operations.push({ operation: "upsert", table });
        const rows = Array.isArray(input) ? input : [input];
        const existing = this.rows.get(table) ?? [];

        for (const row of this.cloneRows(rows)) {
          const keyColumns =
            table === "host_locks"
              ? ["event_id", "lock_name"]
              : [table === "event_runtime_state" ? "event_id" : "id"];
          const index = existing.findIndex((candidate) =>
            keyColumns.every((keyColumn) => candidate[keyColumn] === row[keyColumn]),
          );

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
        eq: (column: string, value: string) => {
          const filters = [{ column, value }];
          let chained = false;
          const applyDelete = (extraFilter?: { column: string; values: string[] }) => {
            this.operations.push({ operation: "delete", table });
            this.rows.set(
              table,
              (this.rows.get(table) ?? []).filter((row) => {
                const matchesFilters = filters.every(
                  (filter) => row[filter.column] === filter.value,
                );
                const matchesExtra = extraFilter
                  ? extraFilter.values.includes(String(row[extraFilter.column]))
                  : true;

                return !(matchesFilters && matchesExtra);
              }),
            );

            return { error: null };
          };

          return {
            in: async (inColumn: string, values: string[]) => {
              chained = true;

              return applyDelete({ column: inColumn, values });
            },
            then: (resolve: (value: { error: null }) => void, reject: (error: unknown) => void) => {
              if (chained) {
                resolve({ error: null });
                return;
              }

              Promise.resolve(applyDelete()).then(resolve, reject);
            },
          };
        },
      }),
    };
  }

  async rpc(functionName: string, args: Record<string, string>) {
    this.rpcCalls.push({ functionName, args });

    return { data: true, error: null };
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
    expect(supabase.rpcCalls.map((call) => call.functionName)).toContain(
      "normalized_acquire_event_persistence_lock",
    );
    expect(supabase.rpcCalls.map((call) => call.functionName)).toContain(
      "normalized_release_event_persistence_lock",
    );
    expect(supabase.rows.get("ballot_choices")?.[0]).toMatchObject({
      draw_id: firstDraw.id,
      round_set_id: firstDraw.roundSetId,
    });
    expect(supabase.rows.get("ballots")?.[0]).toMatchObject({
      edit_token_hash: "hash-from-phone",
    });
    expect(supabase.rows.get("draws")?.[0]).toMatchObject({
      eligible_chart_ids: firstDraw.eligibleChartIds,
      excluded_chart_keys_snapshot: firstDraw.excludedChartKeysSnapshot,
      selected_song_keys_snapshot: firstDraw.selectedSongKeysSnapshot,
      same_round_blocked_song_keys_snapshot: firstDraw.sameRoundBlockedSongKeysSnapshot,
    });
    expect(supabase.rows.get("charts")).toHaveLength(14);
    expect(
      supabase.rows
        .get("charts")
        ?.map((row) => row.id)
        .sort(),
    ).toEqual([...firstDraw.charts, ...secondDraw.charts].map((chart) => chart.id).sort());
    expect(supabase.rows.get("result_rows")?.some((row) => row.draw_id === firstDraw.id)).toBe(
      true,
    );
    expect(supabase.rows.get("active_voter_presence")?.[0]).toMatchObject({
      round_number: 3,
      player_id: player.id,
      device_id: "phone-a",
    });

    supabase.rpcCalls.length = 0;

    const restored = await repository.load();

    expect(supabase.rpcCalls).toEqual([]);
    expect(restored?.roster.players.map((candidate) => candidate.startggUsername)).toEqual([
      "Alpha",
    ]);
    expect(restored?.draw.drawHistory[0]).toMatchObject({
      id: firstDraw.id,
      roundSetId: firstDraw.roundSetId,
      eligibleChartIds: firstDraw.eligibleChartIds,
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

  it("ignores partially persisted result snapshots until both result sets are available", async () => {
    const supabase = new FakeNormalizedSupabaseClient();
    const repository = new NormalizedOperationalStateRepository({
      eventId: "partial-result-test",
      supabase: supabase as unknown as NormalizedOperationalSupabaseClient,
      now: () => "2026-06-30T00:00:00.000Z",
    });
    const stores = createAdminStateStores();
    const player = stores.rosterStore.createOrUpdatePlayer({
      startggUsername: "Alpha",
      active: true,
      now: "2026-06-30T00:00:00.000Z",
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
    stores.votingWindowStore.closeVoting(1, 10_000);
    stores.resultStore.computeRound({
      roundNumber: 1,
      draws: [firstDraw, secondDraw],
      ballots: stores.ballotStore.listForRound(1),
      eligiblePlayers: stores.rosterStore.listEligiblePlayersForRound(1),
      now: "2026-06-30T00:01:00.000Z",
    });

    await repository.save(createOperationalStateSnapshot(stores, "2026-06-30T00:02:00.000Z"));

    supabase.rows.set(
      "result_rows",
      (supabase.rows.get("result_rows") ?? []).filter((row) => row.draw_id === firstDraw.id),
    );

    const restored = await repository.load();

    expect(restored?.result.results).toEqual([]);
  });

  it("persists passive host heartbeats without rewriting unrelated runtime tables", async () => {
    const supabase = new FakeNormalizedSupabaseClient();
    const repository = new NormalizedOperationalStateRepository({
      eventId: "host-heartbeat-test",
      supabase: supabase as unknown as NormalizedOperationalSupabaseClient,
      now: () => "2026-06-30T00:00:00.000Z",
    });
    const stores = createAdminStateStores();

    stores.rosterStore.createOrUpdatePlayer({
      startggUsername: "Alpha",
      active: true,
      now: "2026-06-30T00:00:00.000Z",
    });
    await repository.save(createOperationalStateSnapshot(stores, "2026-06-30T00:00:00.000Z"));

    supabase.touchedTables.length = 0;
    supabase.rpcCalls.length = 0;
    stores.hostLockStore.acquire("session-a", "host-token-a", 0);

    await repository.persistHostLock(stores.hostLockStore.exportSnapshot());

    expect(supabase.touchedTables).toEqual(["host_locks"]);
    expect(supabase.rows.get("players")).toHaveLength(1);
    expect(supabase.rows.get("host_locks")?.[0]).toMatchObject({
      owner_session_id: "session-a",
    });
    expect(supabase.rpcCalls.map((call) => call.functionName)).toEqual([]);
  });

  it("persists public voting changes without rewriting unrelated event tables", async () => {
    const supabase = new FakeNormalizedSupabaseClient();
    const repository = new NormalizedOperationalStateRepository({
      eventId: "voting-partial-test",
      supabase: supabase as unknown as NormalizedOperationalSupabaseClient,
      now: () => "2026-06-30T00:00:00.000Z",
    });
    const stores = createAdminStateStores();
    const player = stores.rosterStore.createOrUpdatePlayer({
      startggUsername: "Alpha",
      active: true,
      now: "2026-06-30T00:00:00.000Z",
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

    await repository.save(createOperationalStateSnapshot(stores, "2026-06-30T00:00:00.000Z"));

    const baseline = createOperationalStateSnapshot(stores, "2026-06-30T00:00:01.000Z");

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
            noBans: true,
            bannedChartIds: [],
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
      "2026-06-30T00:00:02.000Z",
      { editTokenHash: "hash-from-phone" },
    );

    supabase.operations.length = 0;

    await repository.persistVotingState({
      baseline,
      current: createOperationalStateSnapshot(stores, "2026-06-30T00:00:03.000Z"),
    });

    const writeTables = supabase.operations
      .filter((operation) => operation.operation !== "select")
      .map((operation) => operation.table);

    expect(writeTables).toEqual([
      "active_voter_presence",
      "ballot_revisions",
      "ballot_choices",
      "voting_windows",
      "ballots",
      "ballot_choices",
      "ballot_revisions",
    ]);
    expect(
      supabase.operations.some(
        (operation) => operation.operation === "delete" && operation.table === "voting_windows",
      ),
    ).toBe(false);
    expect(writeTables).not.toContain("round_player_eligibility");
    expect(supabase.rows.get("players")).toHaveLength(1);
    expect(supabase.rows.get("draws")).toHaveLength(2);
    expect(supabase.rows.get("drawn_charts")).toHaveLength(14);
    expect(supabase.rows.get("ballots")?.[0]).toMatchObject({
      player_id: player.id,
      edit_token_hash: "hash-from-phone",
    });
  });

  it("persists admin voting controls with audit and host lock without rewriting draw tables", async () => {
    const supabase = new FakeNormalizedSupabaseClient();
    const repository = new NormalizedOperationalStateRepository({
      eventId: "voting-admin-partial-test",
      supabase: supabase as unknown as NormalizedOperationalSupabaseClient,
      now: () => "2026-06-30T00:00:00.000Z",
    });
    const stores = createAdminStateStores();
    const player = stores.rosterStore.createOrUpdatePlayer({
      startggUsername: "Alpha",
      active: true,
      now: "2026-06-30T00:00:00.000Z",
    });

    stores.drawStateStore.setChartsForTest([
      ...chartsFor("16", 10, "S16"),
      ...chartsFor("17", 30, "S17"),
    ]);
    stores.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 1 });
    stores.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 2 });
    stores.votingWindowStore.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: [{ id: player.id, startggUsername: player.startggUsername }],
      nowMs: 0,
    });
    stores.hostLockStore.acquire("session-a", "host-token-a", 0);

    await repository.save(createOperationalStateSnapshot(stores, "2026-06-30T00:00:00.000Z"));

    const baseline = createOperationalStateSnapshot(stores, "2026-06-30T00:00:01.000Z");

    stores.votingWindowStore.closeVoting(1, 1_000);
    stores.ballotStore.setPhoneStatus(1, { phase: "closed_revealing" });
    stores.hostLockStore.refresh("session-a", "host-token-a", 1_000);
    stores.auditStore.record({
      sessionId: "session-a",
      action: "close_voting",
      summary: "Closed voting for Round 1.",
      metadata: { roundNumber: 1 },
      now: "2026-06-30T00:00:01.000Z",
    });

    supabase.operations.length = 0;

    await repository.persistVotingAdminState({
      baseline,
      current: createOperationalStateSnapshot(stores, "2026-06-30T00:00:02.000Z"),
    });

    const writeTables = supabase.operations
      .filter((operation) => operation.operation !== "select")
      .map((operation) => operation.table);

    expect(writeTables).toContain("admin_actions");
    expect(writeTables).toContain("host_locks");
    expect(writeTables).toContain("voting_windows");
    expect(writeTables).not.toContain("charts");
    expect(writeTables).not.toContain("players");
    expect(writeTables).not.toContain("draws");
    expect(writeTables).not.toContain("drawn_charts");
    expect(supabase.rows.get("voting_windows")?.[0]).toMatchObject({
      round_number: 1,
      status: "voting_closed",
    });
    expect(supabase.rows.get("admin_actions")?.[0]).toMatchObject({
      action_type: "close_voting",
    });
    expect(supabase.rows.get("host_locks")?.[0]).toMatchObject({
      owner_session_id: "session-a",
      heartbeat_at: "1970-01-01T00:00:01.000Z",
    });
  });
});
