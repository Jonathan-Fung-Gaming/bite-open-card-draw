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
      upsert: async (
        input: StoredRow[] | StoredRow,
        options?: { ignoreDuplicates?: boolean; onConflict?: string },
      ) => {
        this.operations.push({ operation: "upsert", table });
        const rows = Array.isArray(input) ? input : [input];
        const existing = this.rows.get(table) ?? [];

        for (const row of this.cloneRows(rows)) {
          const keyColumns = options?.onConflict
            ? options.onConflict.split(",").map((column) => column.trim())
            : table === "host_locks"
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
            if (!options?.ignoreDuplicates) {
              existing[index] = row;
            }
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
  it("hydrates one coherent RPC snapshot including its public generation", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        eventId: "coherent-read-test",
        databaseTime: "2026-07-13T00:00:00.000Z",
        eventRuntimeState: [
          {
            event_id: "coherent-read-test",
            current_round: 1,
            rehearsal_mode: false,
            updated_at: "2026-07-13T00:00:00.000Z",
          },
        ],
        players: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            event_id: "coherent-read-test",
            startgg_username: "Alpha",
            startgg_username_normalized: "alpha",
            active: true,
            has_tournament_history: false,
            created_at: "2026-07-13T00:00:00.000Z",
            updated_at: "2026-07-13T00:00:00.000Z",
          },
        ],
        chartExclusions: [],
        adminActions: [],
        draws: [],
        drawnCharts: [],
        votingWindows: [],
        roundPlayerEligibility: [],
        activeVoterPresence: [],
        voterDeviceBindings: [],
        ballots: [],
        ballotChoices: [],
        ballotRevisions: [],
        ballotInvalidations: [],
        resultSnapshots: [],
        resultRows: [],
        tiebreaks: [],
        hostLocks: [],
        publicStateGenerations: [
          {
            event_id: "coherent-read-test",
            round_number: 1,
            generation: 7,
            transition_kind: "reroll_one_chart",
            result_mode: false,
            set_1_draw_id: "00000000-0000-4000-8000-000000000099",
            set_1_draw_version: 2,
            set_2_draw_id: null,
            set_2_draw_version: null,
            voting_status: "not_started",
            voting_closes_at: null,
            result_id: null,
            result_phase: null,
            result_phase_started_at: null,
            set_1_tiebreak_started_at: null,
            set_2_tiebreak_started_at: null,
            phone_release_state: "voting_open",
            phone_released_at: null,
            updated_at: "2026-07-13T00:00:00.000Z",
          },
        ],
      },
      error: null,
    }));
    const from = vi.fn(() => {
      throw new Error("coherent reads must not fall back to independent table selects");
    });
    const repository = new NormalizedOperationalStateRepository({
      eventId: "coherent-read-test",
      supabase: { rpc, from } as unknown as NormalizedOperationalSupabaseClient,
    });

    const restored = await repository.load();

    expect(rpc).toHaveBeenCalledWith("normalized_read_coherent_state", {
      p_event_id: "coherent-read-test",
      p_payload: { includeBallotTables: true },
    });
    expect(from).not.toHaveBeenCalled();
    expect(restored?.roster.players[0]?.startggUsername).toBe("Alpha");
    expect(restored?.publicStateGeneration?.rounds[0]).toMatchObject({
      generation: 7,
      transitionKind: "reroll_one_chart",
      activeDraws: [],
    });
  });

  it("hydrates an audit-only event so a committed host release clears stale process state", async () => {
    const eventId = "phase3-release-hydration-test";
    const sessionId = "00000000-0000-4000-8000-000000000001";
    const rpc = vi.fn(async () => ({
      data: {
        eventId,
        databaseTime: "2026-07-14T00:00:00.000Z",
        eventRuntimeState: [],
        players: [],
        chartExclusions: [],
        adminActions: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            event_id: eventId,
            admin_session_id: sessionId,
            mutation_request_id: "00000000-0000-4000-8000-000000000003",
            action_type: "host_lock_release",
            action_summary: "Released host control.",
            reason: null,
            requires_password_reentry: false,
            created_at: "2026-07-14T00:00:00.000Z",
            metadata: {
              dangerous: false,
              tournamentChanging: false,
              sessionId,
              metadata: {},
            },
          },
        ],
        draws: [],
        drawnCharts: [],
        votingWindows: [],
        roundPlayerEligibility: [],
        activeVoterPresence: [],
        voterDeviceBindings: [],
        ballots: [],
        ballotChoices: [],
        ballotRevisions: [],
        ballotInvalidations: [],
        resultSnapshots: [],
        resultRows: [],
        tiebreaks: [],
        hostLocks: [],
        publicStateGenerations: [],
      },
      error: null,
    }));
    const repository = new NormalizedOperationalStateRepository({
      eventId,
      supabase: {
        rpc,
        from: vi.fn(() => {
          throw new Error("coherent audit-only reads must not use table fallbacks");
        }),
      } as unknown as NormalizedOperationalSupabaseClient,
    });

    await expect(repository.load()).resolves.toMatchObject({
      audit: { records: [{ action: "host_lock_release" }] },
      hostLock: { lock: null },
    });
  });

  it("falls back to legacy reads only when the Phase 1 read RPCs are unavailable", async () => {
    const legacyClient = new FakeNormalizedSupabaseClient();
    const rpc = vi.fn(async (functionName: string) => ({
      data: null,
      error: {
        message: `Could not find the function public.${functionName} in the schema cache`,
      },
    }));
    const repository = new NormalizedOperationalStateRepository({
      eventId: "phase1-read-fallback-test",
      supabase: {
        rpc,
        from: legacyClient.from.bind(legacyClient),
      } as unknown as NormalizedOperationalSupabaseClient,
    });

    await expect(repository.readPublicGenerationKey()).resolves.toBe("legacy");
    await expect(repository.load()).resolves.toBeNull();

    expect(rpc).toHaveBeenCalledWith("normalized_read_public_generation_key", {
      p_event_id: "phase1-read-fallback-test",
    });
    expect(rpc).toHaveBeenCalledWith("normalized_read_coherent_state", {
      p_event_id: "phase1-read-fallback-test",
      p_payload: { includeBallotTables: true },
    });
    expect(legacyClient.touchedTables).toContain("event_runtime_state");
    expect(legacyClient.touchedTables).toContain("voting_windows");
  });

  it("does not hide unrelated Phase 1 read RPC errors behind the legacy fallback", async () => {
    const from = vi.fn(() => {
      throw new Error("Legacy reads must not run for an unrelated database error.");
    });
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "connection terminated unexpectedly" },
    }));
    const repository = new NormalizedOperationalStateRepository({
      eventId: "phase1-read-error-test",
      supabase: { rpc, from } as unknown as NormalizedOperationalSupabaseClient,
    });

    await expect(repository.readPublicGenerationKey()).rejects.toThrow(
      "Could not read the public-state generation key: connection terminated unexpectedly",
    );
    await expect(repository.load()).rejects.toThrow(
      "Could not read coherent tournament state: connection terminated unexpectedly",
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("preserves concurrent partial admin audit rows append-only", async () => {
    const supabase = new FakeNormalizedSupabaseClient();
    const repository = new NormalizedOperationalStateRepository({
      eventId: "audit-append-only-test",
      supabase: supabase as unknown as NormalizedOperationalSupabaseClient,
      now: () => "2026-07-03T00:00:00.000Z",
    });
    const baselineStores = createAdminStateStores();
    const firstWriter = createAdminStateStores();
    const secondWriter = createAdminStateStores();
    const baseline = createOperationalStateSnapshot(baselineStores, "2026-07-03T00:00:00.000Z");
    const firstAudit = firstWriter.auditStore.record({
      sessionId: "session-a",
      action: "pause_voting",
      summary: "Paused voting for Round 1.",
      metadata: { roundNumber: 1 },
      now: "2026-07-03T00:00:01.000Z",
    });
    const secondAudit = secondWriter.auditStore.record({
      sessionId: "session-b",
      action: "resume_voting",
      summary: "Resumed voting for Round 1.",
      metadata: { roundNumber: 1 },
      now: "2026-07-03T00:00:02.000Z",
    });

    await repository.persistVotingAdminState({
      baseline,
      current: createOperationalStateSnapshot(firstWriter, "2026-07-03T00:00:01.000Z"),
    });
    await repository.persistVotingAdminState({
      baseline,
      current: createOperationalStateSnapshot(secondWriter, "2026-07-03T00:00:02.000Z"),
    });

    expect(
      supabase.operations.some(
        (operation) => operation.operation === "delete" && operation.table === "admin_actions",
      ),
    ).toBe(false);
    expect(
      supabase.rows
        .get("admin_actions")
        ?.map((row) => row.id)
        .sort(),
    ).toEqual([firstAudit.id, secondAudit.id].sort());
  });

  it("stores one current chart exclusion row while audit records preserve every change", async () => {
    const supabase = new FakeNormalizedSupabaseClient();
    const repository = new NormalizedOperationalStateRepository({
      eventId: "chart-exclusion-current-state-test",
      supabase: supabase as unknown as NormalizedOperationalSupabaseClient,
      now: () => "2026-07-03T00:00:00.000Z",
    });
    const stores = createAdminStateStores();
    const [targetChart] = chartsFor("16", 10, "S16");

    stores.drawStateStore.setChartsForTest([targetChart!, ...chartsFor("16", 20, "S16")]);

    const changes = [
      { excluded: true, reason: "event rule exclusion", action: "chart_exclusion_add" },
      { excluded: false, reason: "metadata fixed", action: "chart_exclusion_remove" },
      { excluded: true, reason: "late event rule exclusion", action: "chart_exclusion_add" },
    ] as const;

    for (const [index, change] of changes.entries()) {
      stores.drawStateStore.updateChartExclusion({
        chartKey: targetChart!.chartKey,
        excluded: change.excluded,
        reason: change.reason,
      });
      stores.auditStore.record({
        sessionId: "session-a",
        action: change.action,
        summary: `${change.action} ${targetChart!.name}`,
        reason: change.reason,
        affectedRecords: [{ type: "chart", id: targetChart!.id }],
        dangerous: true,
        now: `2026-07-03T00:00:0${index + 1}.000Z`,
      });
    }

    await repository.save(createOperationalStateSnapshot(stores, "2026-07-03T00:00:04.000Z"));

    expect(supabase.rows.get("chart_exclusions")).toHaveLength(1);
    expect(supabase.rows.get("chart_exclusions")?.[0]).toMatchObject({
      event_id: "chart-exclusion-current-state-test",
      excluded: true,
      reason: "late event rule exclusion",
    });
    expect(supabase.rows.get("admin_actions")?.map((row) => row.action_type)).toEqual([
      "chart_exclusion_add",
      "chart_exclusion_remove",
      "chart_exclusion_add",
    ]);
  });

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
      priorSelectedSongBlocks: [],
      now: "2026-06-29T00:02:00.000Z",
    });

    await repository.save(createOperationalStateSnapshot(stores, "2026-06-29T00:03:00.000Z"));

    expect(
      supabase.operations.some(
        (operation) => operation.operation === "delete" && operation.table === "admin_actions",
      ),
    ).toBe(false);
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
    expect(supabase.rows.get("public_state_generations")).toHaveLength(4);
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

    expect(supabase.rpcCalls).toContainEqual({
      functionName: "normalized_read_coherent_state",
      args: {
        p_event_id: "phase-5-test",
        p_payload: { includeBallotTables: true },
      },
    });
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
      priorSelectedSongBlocks: [],
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

  it("keeps phones held when a final result is not publicly released", async () => {
    const supabase = new FakeNormalizedSupabaseClient();
    const repository = new NormalizedOperationalStateRepository({
      eventId: "final-stage-held-test",
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
      priorSelectedSongBlocks: [],
      now: "2026-06-30T00:01:00.000Z",
    });
    stores.resultStore.setRevealPhase(1, "final", "2026-06-30T00:02:00.000Z");
    stores.votingWindowStore.setResultsPhase(1, "results_revealing");

    await repository.save(createOperationalStateSnapshot(stores, "2026-06-30T00:03:00.000Z"));

    const held = await repository.load();

    expect(held?.ballot.phoneStatus).toEqual([
      { roundNumber: 1, status: { phase: "closed_revealing" } },
    ]);

    stores.votingWindowStore.setResultsPhase(1, "results_revealed");

    await repository.save(createOperationalStateSnapshot(stores, "2026-06-30T00:04:00.000Z"));

    const released = await repository.load();

    expect(released?.ballot.phoneStatus[0]?.status.phase).toBe("revealed");
  });

  it("keeps normalized host ownership single-writer through lifecycle RPCs", () => {
    const repository: import("@/lib/persistence/repository").OperationalStateRepository =
      new NormalizedOperationalStateRepository({
        eventId: "host-single-writer-test",
        supabase:
          new FakeNormalizedSupabaseClient() as unknown as NormalizedOperationalSupabaseClient,
      });

    expect(repository.persistHostLock).toBeUndefined();
  });

  it("keeps existing host locks when a full event save has no host-lock delta", async () => {
    const supabase = new FakeNormalizedSupabaseClient();
    const repository = new NormalizedOperationalStateRepository({
      eventId: "host-lock-full-save-test",
      supabase: supabase as unknown as NormalizedOperationalSupabaseClient,
      now: () => "2026-06-30T00:00:00.000Z",
    });
    const unrelatedStores = createAdminStateStores();

    supabase.rows.set("host_locks", [
      {
        id: "00000000-0000-4000-8000-000000000091",
        event_id: "host-lock-full-save-test",
        lock_name: "tournament-host",
        admin_session_id: null,
        owner_session_id: "session-a",
        host_token_hash: "a".repeat(64),
        acquired_at: "2026-06-30T00:00:00.000Z",
        heartbeat_at: "2026-06-30T00:00:00.000Z",
        expires_at: "9999-12-31T23:59:59.999Z",
        released_at: null,
      },
    ]);

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

  it("preserves RPC host lifecycle audit metadata across unrelated generic persistence", async () => {
    const eventId = "host-audit-immutability-test";
    const supabase = new FakeNormalizedSupabaseClient();
    const repository = new NormalizedOperationalStateRepository({
      eventId,
      supabase: supabase as unknown as NormalizedOperationalSupabaseClient,
      now: () => "2026-07-14T00:01:00.000Z",
    });
    const rpcAuditRow = {
      id: "00000000-0000-4000-8000-000000000092",
      event_id: eventId,
      admin_session_id: "00000000-0000-4000-8000-000000000093",
      mutation_request_id: "00000000-0000-4000-8000-000000000094",
      action_type: "host_lock_takeover",
      action_summary: "Forced takeover of the active host lock.",
      reason: "Original host device is unavailable.",
      requires_password_reentry: true,
      created_at: "2026-07-14T00:00:00.000Z",
      metadata: {
        requestId: "00000000-0000-4000-8000-000000000094",
        mode: "force",
        outcome: "forced_takeover",
        previousOwnerSessionId: "00000000-0000-4000-8000-000000000095",
        ownerSessionId: "00000000-0000-4000-8000-000000000093",
        dangerous: true,
        tournamentChanging: false,
        source: "normalized_acquire_host_lock",
      },
    } satisfies StoredRow;

    supabase.rows.set("event_runtime_state", [
      {
        event_id: eventId,
        current_round: 1,
        rehearsal_mode: false,
        updated_at: "2026-07-14T00:00:00.000Z",
      },
    ]);
    supabase.rows.set("admin_actions", [structuredClone(rpcAuditRow)]);

    const hydrated = await repository.load();

    expect(hydrated).not.toBeNull();
    await repository.save(hydrated!);

    expect(
      supabase.operations.some(
        (operation) => operation.operation === "upsert" && operation.table === "admin_actions",
      ),
    ).toBe(true);
    expect(supabase.rows.get("admin_actions")).toEqual([rpcAuditRow]);
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

  it("persists admin voting controls and audit without rewriting host or draw tables", async () => {
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
      "2026-06-30T00:00:10.000Z",
    );
    stores.hostLockStore.acquire("session-a", "host-token-a", 0);

    await repository.save(createOperationalStateSnapshot(stores, "2026-06-30T00:00:00.000Z"));
    supabase.rows.set("host_locks", [
      {
        event_id: "voting-admin-partial-test",
        lock_name: "tournament-host",
        owner_session_id: "session-a",
        admin_session_id: null,
        host_token_hash: "a".repeat(64),
        acquired_at: "1970-01-01T00:00:00.000Z",
        heartbeat_at: "1970-01-01T00:00:00.000Z",
        expires_at: "9999-12-31T23:59:59.999Z",
        released_at: null,
      },
    ]);

    supabase.touchedTables.length = 0;
    const votingAdminState = await repository.loadVotingAdminState();
    expect(supabase.touchedTables).toContain("ballots");
    expect(supabase.touchedTables).toContain("ballot_choices");
    expect(supabase.touchedTables).toContain("ballot_revisions");
    expect(supabase.touchedTables).toContain("ballot_invalidations");
    expect(supabase.touchedTables).toContain("active_voter_presence");
    expect(votingAdminState?.ballot.ballots).toHaveLength(1);
    expect(votingAdminState?.ballot.ballots[0]).toMatchObject({
      roundNumber: 1,
      playerId: player.id,
    });

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
    const deletedTables = supabase.operations
      .filter((operation) => operation.operation === "delete")
      .map((operation) => operation.table);

    expect(
      supabase.operations
        .filter((operation) => operation.operation === "select")
        .map((operation) => operation.table),
    ).toEqual([]);
    expect(writeTables).toContain("admin_actions");
    expect(writeTables).not.toContain("host_locks");
    expect(writeTables).toContain("voting_windows");
    expect(deletedTables).not.toContain("admin_actions");
    expect(writeTables).not.toContain("charts");
    expect(writeTables).not.toContain("players");
    expect(writeTables).not.toContain("draws");
    expect(writeTables).not.toContain("drawn_charts");
    expect(writeTables).not.toContain("ballots");
    expect(writeTables).not.toContain("ballot_choices");
    expect(writeTables).not.toContain("ballot_revisions");
    expect(supabase.rows.get("ballots")).toHaveLength(1);
    expect(supabase.rows.get("ballot_choices")).toHaveLength(2);
    expect(supabase.rows.get("voting_windows")?.[0]).toMatchObject({
      round_number: 1,
      status: "voting_closed",
    });
    expect(supabase.rows.get("admin_actions")?.[0]).toMatchObject({
      action_type: "close_voting",
    });
    expect(supabase.rows.get("host_locks")?.[0]).toMatchObject({
      owner_session_id: "session-a",
      heartbeat_at: "1970-01-01T00:00:00.000Z",
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
      priorSelectedSongBlocks: [],
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
    const deletedTables = supabase.operations
      .filter((operation) => operation.operation === "delete")
      .map((operation) => operation.table);

    expect(
      supabase.operations
        .filter((operation) => operation.operation === "select")
        .map((operation) => operation.table),
    ).toEqual(["result_snapshots"]);
    expect(supabase.rpcCalls.map((call) => call.functionName)).toEqual([
      "normalized_acquire_event_persistence_lock",
      "normalized_release_event_persistence_lock",
    ]);
    expect(writeTables).toContain("result_snapshots");
    expect(writeTables).toContain("voting_windows");
    expect(writeTables).toContain("admin_actions");
    expect(writeTables).not.toContain("host_locks");
    expect(deletedTables).not.toContain("admin_actions");
    expect(writeTables).not.toContain("ballots");
    expect(writeTables).not.toContain("ballot_choices");
    expect(writeTables).not.toContain("ballot_revisions");
    expect(writeTables).not.toContain("players");
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
