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
  readonly rpcCalls: Array<{ functionName: string; args: Record<string, unknown> }> = [];

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
              : table === "event_runtime_state"
                ? ["event_id"]
                : table === "voting_windows" || table === "result_snapshots"
                  ? ["event_id", "round_number"]
                  : table === "tiebreaks"
                    ? ["event_id", "result_snapshot_id", "draw_id"]
                    : ["id"];
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

  async rpc(functionName: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ functionName, args });

    if (functionName === "normalized_replace_draw_state") {
      const eventId = String(args.p_event_id);
      const payload = args.p_payload as {
        draws?: Array<{
          id: string;
          roundSetId: string;
          version: number;
          status: string;
          eligiblePoolCount: number;
          eligibleChartIds: string[];
          excludedChartKeysSnapshot: string[];
          selectedSongKeysSnapshot: string[];
          sameRoundBlockedSongKeysSnapshot: string[];
          createdAt: string;
          supersededAt: string | null;
          reason: string;
          charts: Array<{ id: string }>;
        }>;
      };
      const draws = payload.draws ?? [];

      this.rows.set(
        "drawn_charts",
        (this.rows.get("drawn_charts") ?? []).filter((row) => row.event_id !== eventId),
      );
      this.rows.set(
        "draws",
        (this.rows.get("draws") ?? []).filter((row) => row.event_id !== eventId),
      );

      this.rows.set("draws", [
        ...(this.rows.get("draws") ?? []),
        ...draws.map((draw) => ({
          id: draw.id,
          event_id: eventId,
          round_set_id: draw.roundSetId,
          draw_version: draw.version,
          status: draw.status,
          eligible_pool_count: draw.eligiblePoolCount,
          eligible_chart_ids: draw.eligibleChartIds,
          excluded_chart_keys_snapshot: draw.excludedChartKeysSnapshot,
          selected_song_keys_snapshot: draw.selectedSongKeysSnapshot,
          same_round_blocked_song_keys_snapshot: draw.sameRoundBlockedSongKeysSnapshot,
          created_at: draw.createdAt,
          superseded_at: draw.supersededAt,
          reason: draw.reason,
        })),
      ]);
      this.rows.set("drawn_charts", [
        ...(this.rows.get("drawn_charts") ?? []),
        ...draws.flatMap((draw) =>
          draw.charts.map((chart, index) => ({
            event_id: eventId,
            draw_id: draw.id,
            chart_id: chart.id,
            draw_order: index + 1,
            created_at: draw.createdAt,
          })),
        ),
      ]);

      return { data: { committed: true, rows_changed: draws.length }, error: null };
    }

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

  it("keeps existing host locks when a full event save has no host-lock delta", async () => {
    const supabase = new FakeNormalizedSupabaseClient();
    const repository = new NormalizedOperationalStateRepository({
      eventId: "host-lock-full-save-test",
      supabase: supabase as unknown as NormalizedOperationalSupabaseClient,
      now: () => "2026-06-30T00:00:00.000Z",
    });
    const hostStores = createAdminStateStores();
    const unrelatedStores = createAdminStateStores();

    hostStores.hostLockStore.acquire("session-a", "host-token-a", 0);
    await repository.persistHostLock(hostStores.hostLockStore.exportSnapshot());

    unrelatedStores.rosterStore.createOrUpdatePlayer({
      startggUsername: "Alpha",
      active: true,
      now: "2026-06-30T00:00:01.000Z",
    });

    supabase.operations.length = 0;

    await repository.save(
      createOperationalStateSnapshot(unrelatedStores, "2026-06-30T00:00:02.000Z"),
    );

    const deletedTables = supabase.operations
      .filter((operation) => operation.operation === "delete")
      .map((operation) => operation.table);

    expect(deletedTables).not.toContain("host_locks");
    expect(supabase.rows.get("host_locks")).toHaveLength(1);
    expect(supabase.rows.get("host_locks")?.[0]).toMatchObject({
      owner_session_id: "session-a",
    });
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

    supabase.touchedTables.length = 0;
    await repository.loadVotingAdminState();
    expect(supabase.touchedTables).not.toContain("ballots");
    expect(supabase.touchedTables).not.toContain("ballot_choices");
    expect(supabase.touchedTables).not.toContain("ballot_revisions");
    expect(supabase.touchedTables).not.toContain("ballot_invalidations");
    expect(supabase.touchedTables).not.toContain("active_voter_presence");

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

    expect(supabase.operations.some((operation) => operation.operation === "select")).toBe(false);
    expect(writeTables).toContain("admin_actions");
    expect(writeTables).toContain("host_locks");
    expect(writeTables).toContain("voting_windows");
    expect(writeTables).not.toContain("charts");
    expect(writeTables).not.toContain("players");
    expect(writeTables).not.toContain("draws");
    expect(writeTables).not.toContain("drawn_charts");
    expect(writeTables).not.toContain("ballots");
    expect(writeTables).not.toContain("ballot_choices");
    expect(writeTables).not.toContain("ballot_revisions");
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

  it("persists result reveal controls without rewriting ballots or result rows", async () => {
    const supabase = new FakeNormalizedSupabaseClient();
    const repository = new NormalizedOperationalStateRepository({
      eventId: "result-admin-partial-test",
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
    stores.votingWindowStore.closeVoting(1, 1_000);
    stores.resultStore.computeRound({
      roundNumber: 1,
      draws: [firstDraw, secondDraw],
      ballots: [],
      eligiblePlayers: [{ id: player.id, startggUsername: player.startggUsername }],
      now: "2026-06-30T00:00:02.000Z",
    });
    stores.hostLockStore.acquire("session-a", "host-token-a", 0);

    await repository.save(createOperationalStateSnapshot(stores, "2026-06-30T00:00:03.000Z"));

    supabase.touchedTables.length = 0;
    await repository.loadResultAdminState();
    expect(supabase.touchedTables).not.toContain("ballots");
    expect(supabase.touchedTables).not.toContain("ballot_choices");
    expect(supabase.touchedTables).not.toContain("ballot_revisions");
    expect(supabase.touchedTables).not.toContain("ballot_invalidations");
    expect(supabase.touchedTables).not.toContain("active_voter_presence");

    const baseline = createOperationalStateSnapshot(stores, "2026-06-30T00:00:04.000Z");

    stores.resultStore.advanceReveal(1, "2026-06-30T00:00:05.000Z");
    stores.votingWindowStore.setResultsPhase(1, "results_revealing");
    stores.hostLockStore.refresh("session-a", "host-token-a", 5_000);
    stores.auditStore.record({
      sessionId: "session-a",
      action: "advance_result_reveal",
      summary: "Advanced Round 1 reveal to set_1_counts.",
      metadata: { roundNumber: 1 },
      now: "2026-06-30T00:00:05.000Z",
    });

    supabase.operations.length = 0;
    supabase.rpcCalls.length = 0;

    await repository.persistResultAdminState({
      baseline,
      current: createOperationalStateSnapshot(stores, "2026-06-30T00:00:06.000Z"),
    });

    const writeTables = supabase.operations
      .filter((operation) => operation.operation !== "select")
      .map((operation) => operation.table);

    expect(supabase.operations.some((operation) => operation.operation === "select")).toBe(false);
    expect(supabase.rpcCalls.map((call) => call.functionName)).toEqual([
      "normalized_acquire_event_persistence_lock",
      "normalized_release_event_persistence_lock",
    ]);
    expect(writeTables).toContain("result_snapshots");
    expect(writeTables).toContain("voting_windows");
    expect(writeTables).toContain("admin_actions");
    expect(writeTables).toContain("host_locks");
    expect(writeTables).not.toContain("ballots");
    expect(writeTables).not.toContain("ballot_choices");
    expect(writeTables).not.toContain("ballot_revisions");
    expect(writeTables).not.toContain("draws");
    expect(writeTables).not.toContain("drawn_charts");
    expect(writeTables).not.toContain("result_rows");
    expect(supabase.rows.get("result_snapshots")?.[0]).toMatchObject({
      round_number: 1,
      reveal_phase: "set_1_counts",
    });
    expect(supabase.rows.get("voting_windows")?.[0]).toMatchObject({
      round_number: 1,
      status: "results_revealing",
    });
  });
});
