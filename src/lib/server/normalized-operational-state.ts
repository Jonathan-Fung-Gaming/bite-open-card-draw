import "server-only";
import { randomUUID } from "node:crypto";
import { deterministicUuid } from "@/lib/charts/normalize";
import { loadRuntimeCharts } from "@/lib/charts/runtime-catalog";
import type { NormalizedChart } from "@/lib/charts/types";
import type { Database, Json } from "@/lib/db/database.types";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import { toDrawnChartSummary } from "@/lib/draw/draw-engine";
import {
  OPERATIONAL_STATE_SCHEMA_VERSION,
  cloneOperationalStateSnapshot,
  type OperationalStateSnapshot,
} from "@/lib/persistence/operational-state";
import { mergeOperationalStateSnapshots } from "@/lib/persistence/merge";
import type {
  OperationalStateRepository,
  PersistMergedStateInput,
} from "@/lib/persistence/repository";
import type { ResultRevealPhase, ResultSetSnapshot } from "@/lib/results/result-engine";
import { ROUND_SET_DEFINITIONS, type RoundSetDefinition } from "@/lib/tournament";
import type { BallotSetChoice, PhoneRoundStatus, RoundBallot } from "@/lib/vote/ballot";
import type { EligiblePlayerSnapshot } from "@/lib/vote/voting-window";
import { getTournamentEventId } from "@/lib/server/env";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";

type TableName = keyof Database["public"]["Tables"] & string;
type TableRow<TTable extends TableName> = Database["public"]["Tables"][TTable]["Row"];
type TableInsert<TTable extends TableName> = Database["public"]["Tables"][TTable]["Insert"];

type SupabaseError = {
  message: string;
};

type EventSelectBuilder<TTable extends TableName> = {
  eq(
    column: string,
    value: string,
  ): Promise<{
    data: TableRow<TTable>[] | null;
    error: SupabaseError | null;
  }>;
};

type DeleteBuilder = {
  eq(
    column: string,
    value: string,
  ): Promise<{
    error: SupabaseError | null;
  }> & {
    in(
      column: string,
      values: string[],
    ): Promise<{
      error: SupabaseError | null;
    }>;
  };
};

type NormalizedTableClient<TTable extends TableName> = {
  select(columns: string): EventSelectBuilder<TTable>;
  insert(rows: TableInsert<TTable>[]): Promise<{
    error: SupabaseError | null;
  }>;
  upsert(
    rows: TableInsert<TTable>[] | TableInsert<TTable>,
    options?: { onConflict?: string },
  ): Promise<{
    error: SupabaseError | null;
  }>;
  delete(): DeleteBuilder;
};

type NormalizedRuntimeRpcName =
  | "normalized_acquire_event_persistence_lock"
  | "normalized_release_event_persistence_lock"
  | "normalized_replace_draw_state";

export type NormalizedOperationalSupabaseClient = {
  from<TTable extends TableName>(table: TTable): NormalizedTableClient<TTable>;
  rpc(
    functionName: NormalizedRuntimeRpcName,
    args: Record<string, Json | string>,
  ): Promise<{
    data: Json | null;
    error: SupabaseError | null;
  }>;
};

type NormalizedOperationalStateRepositoryDependencies = {
  eventId?: string;
  supabase?: NormalizedOperationalSupabaseClient;
  now?: () => string;
};

const EVENT_TABLE_DELETE_BATCHES: readonly (readonly TableName[])[] = [
  [
    "active_voter_presence",
    "tiebreaks",
    "result_rows",
    "ballot_invalidations",
    "ballot_revisions",
    "ballot_choices",
    "round_player_eligibility",
    "chart_exclusions",
    "voting_windows",
  ],
  ["result_snapshots", "ballots"],
  ["admin_actions", "players", "event_runtime_state"],
];

const EVENT_LOCK_TTL_MS = 30_000;
const EVENT_LOCK_TIMEOUT_MS = 35_000;
const EVENT_LOCK_RETRY_MS = 100;

function createNormalizedSupabaseClient() {
  return createServiceRoleSupabaseClient() as unknown as NormalizedOperationalSupabaseClient;
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asEligiblePlayers(value: Json | null | undefined): EligiblePlayerSnapshot[] {
  return Array.isArray(value)
    ? value
        .map((entry) => asRecord(entry as Json))
        .filter(
          (entry) => typeof entry.id === "string" && typeof entry.startggUsername === "string",
        )
        .map((entry) => ({
          id: entry.id as string,
          startggUsername: entry.startggUsername as string,
        }))
    : [];
}

function isoFromMs(value: number) {
  return new Date(value).toISOString();
}

function msFromIso(value: string) {
  return Date.parse(value);
}

function stableJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function ballotPersistenceKey(ballot: RoundBallot) {
  return `${ballot.roundNumber}:${ballot.playerId}`;
}

function isUuid(value: string | null | undefined): value is string {
  return Boolean(
    value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  );
}

function requireRoundSet(roundSetId: string): RoundSetDefinition {
  const set = ROUND_SET_DEFINITIONS.find((candidate) => candidate.id === roundSetId);

  if (!set) {
    throw new Error(`Unknown round_set_id in normalized runtime state: ${roundSetId}`);
  }

  return set;
}

function chartInsertFromNormalized(chart: NormalizedChart): TableInsert<"charts"> {
  return {
    id: chart.id,
    source_row_hash: String(chart.sourceRowNumber),
    name: chart.name,
    name_kr: chart.nameKr,
    artist: chart.artist,
    label: chart.label,
    chart_type: chart.chartType,
    chart_level: chart.level,
    display_difficulty: chart.displayDifficulty,
    song_key: chart.songKey,
    chart_key: chart.chartKey,
    source_bg_img: chart.sourceBgImg,
    local_image_path: chart.localImagePath,
    tournament_scope: chart.tournamentScope,
  };
}

function chartInsertFromSummary(chart: DrawnChartSummary): TableInsert<"charts"> {
  const chartType = chart.displayDifficulty.startsWith("D") ? "d" : "s";
  const chartLevel = Number(chart.displayDifficulty.slice(1));

  return {
    id: chart.id,
    name: chart.name,
    name_kr: null,
    artist: chart.artist,
    label: null,
    chart_type: chartType,
    chart_level: Number.isFinite(chartLevel) ? chartLevel : 0,
    display_difficulty: chart.displayDifficulty,
    song_key: chart.songKey,
    chart_key: chart.chartKey,
    source_bg_img: chart.sourceBgImg,
    local_image_path: chart.localImagePath,
    tournament_scope: true,
  };
}

function fallbackChartSummary(chartId: string, displayDifficulty = "S16"): DrawnChartSummary {
  return {
    id: chartId,
    name: chartId,
    artist: "Unknown",
    displayDifficulty,
    songKey: `unknown-${chartId}`,
    chartKey: `unknown-${chartId}`,
    sourceBgImg: "",
    localImagePath: null,
  };
}

function buildWheelSlots(candidates: DrawnChartSummary[], zeroBallotTiebreak = false) {
  if (zeroBallotTiebreak) {
    return [...candidates];
  }

  if (candidates.length < 2 || candidates.length > 4) {
    return [];
  }

  return Array.from(
    { length: 12 },
    (_, index) => candidates[index % candidates.length] as DrawnChartSummary,
  );
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class NormalizedOperationalStateRepository implements OperationalStateRepository {
  private readonly eventId: string;
  private readonly supabase: NormalizedOperationalSupabaseClient;
  private readonly now: () => string;

  constructor(dependencies: NormalizedOperationalStateRepositoryDependencies = {}) {
    this.eventId = dependencies.eventId ?? getTournamentEventId();
    this.supabase = dependencies.supabase ?? createNormalizedSupabaseClient();
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async load(): Promise<OperationalStateSnapshot | null> {
    return this.loadUnlocked();
  }

  async loadVotingAdminState(): Promise<OperationalStateSnapshot | null> {
    return this.loadUnlocked({ includeBallotTables: false });
  }

  async loadResultAdminState(): Promise<OperationalStateSnapshot | null> {
    return this.loadUnlocked({ includeBallotTables: false });
  }

  async save(snapshot: OperationalStateSnapshot): Promise<void> {
    await this.withEventPersistenceLock(() => this.saveUnlocked(snapshot));
  }

  async persistMerged(input: PersistMergedStateInput): Promise<OperationalStateSnapshot> {
    return this.withEventPersistenceLock(async () => {
      const latest = await this.loadUnlocked();
      const merged = mergeOperationalStateSnapshots({
        ...input,
        latest,
      });

      await this.saveUnlocked(merged);

      return cloneOperationalStateSnapshot(merged);
    });
  }

  async persistHostLock(hostLock: OperationalStateSnapshot["hostLock"]): Promise<void> {
    await this.saveHostLockOnlyUnlocked(hostLock);
  }

  async persistVotingState(input: PersistMergedStateInput): Promise<OperationalStateSnapshot> {
    return this.withEventPersistenceLock(async () => {
      const latest = await this.loadUnlocked();
      const merged = mergeOperationalStateSnapshots({
        ...input,
        latest,
      });

      await this.saveVotingStateUnlocked(merged, input);

      return cloneOperationalStateSnapshot(merged);
    });
  }

  async persistVotingAdminState(input: PersistMergedStateInput): Promise<OperationalStateSnapshot> {
    return this.withEventPersistenceLock(async () => {
      await this.saveVotingAdminStateUnlocked(input.current);

      return cloneOperationalStateSnapshot(input.current);
    });
  }

  async persistResultAdminState(input: PersistMergedStateInput): Promise<OperationalStateSnapshot> {
    return this.withEventPersistenceLock(async () => {
      await this.saveResultAdminStateUnlocked(input.current);

      return cloneOperationalStateSnapshot(input.current);
    });
  }

  private async loadUnlocked(
    options: { includeBallotTables?: boolean } = {},
  ): Promise<OperationalStateSnapshot | null> {
    const includeBallotTables = options.includeBallotTables ?? true;
    const emptyRows = <TTable extends TableName>(table: TTable) => {
      void table;

      return Promise.resolve([] as TableRow<TTable>[]);
    };
    const [
      runtimeState,
      players,
      chartExclusions,
      adminActions,
      draws,
      drawnCharts,
      votingWindows,
      roundEligibility,
      activeVoterPresence,
      ballots,
      ballotChoices,
      ballotRevisions,
      ballotInvalidations,
      resultSnapshots,
      resultRows,
      tiebreaks,
      hostLocks,
    ] = await Promise.all([
      this.selectEventRows("event_runtime_state"),
      this.selectEventRows("players"),
      this.selectEventRows("chart_exclusions"),
      this.selectEventRows("admin_actions"),
      this.selectEventRows("draws"),
      this.selectEventRows("drawn_charts"),
      this.selectEventRows("voting_windows"),
      this.selectEventRows("round_player_eligibility"),
      includeBallotTables
        ? this.selectEventRows("active_voter_presence")
        : emptyRows("active_voter_presence"),
      includeBallotTables ? this.selectEventRows("ballots") : emptyRows("ballots"),
      includeBallotTables ? this.selectEventRows("ballot_choices") : emptyRows("ballot_choices"),
      includeBallotTables
        ? this.selectEventRows("ballot_revisions")
        : emptyRows("ballot_revisions"),
      includeBallotTables
        ? this.selectEventRows("ballot_invalidations")
        : emptyRows("ballot_invalidations"),
      this.selectEventRows("result_snapshots"),
      this.selectEventRows("result_rows"),
      this.selectEventRows("tiebreaks"),
      this.selectEventRows("host_locks"),
    ]);

    const hasRuntimeRows =
      runtimeState.length > 0 ||
      players.length > 0 ||
      draws.length > 0 ||
      ballots.length > 0 ||
      resultSnapshots.length > 0;

    if (!hasRuntimeRows) {
      return null;
    }

    const chartSummaries = this.loadRuntimeChartSummaries();
    const drawHistory = this.buildDrawHistory(draws, drawnCharts, chartSummaries);
    const results = this.buildResults(
      resultSnapshots,
      resultRows,
      tiebreaks,
      draws,
      chartSummaries,
    );
    const phoneStatus = this.buildPhoneStatus(votingWindows, results);

    return {
      schemaVersion: OPERATIONAL_STATE_SCHEMA_VERSION,
      savedAt: this.now(),
      audit: {
        records: adminActions
          .sort((left, right) => right.created_at.localeCompare(left.created_at))
          .map((row) => {
            const metadata = asRecord(row.metadata);

            return {
              id: row.id,
              createdAt: row.created_at,
              sessionId:
                typeof metadata.sessionId === "string"
                  ? metadata.sessionId
                  : (row.admin_session_id ?? "unknown-session"),
              action: row.action_type,
              summary: row.action_summary,
              reason: row.reason,
              metadata: asRecord(metadata.metadata as Json),
              affectedRecords: Array.isArray(metadata.affectedRecords)
                ? (metadata.affectedRecords as Array<{ type: string; id: string }>)
                : [],
              dangerous: Boolean(metadata.dangerous ?? row.requires_password_reentry),
              tournamentChanging: Boolean(metadata.tournamentChanging ?? true),
            };
          }),
      },
      hostLock: {
        lock:
          hostLocks.length > 0
            ? {
                ownerSessionId:
                  hostLocks[0]?.owner_session_id ?? hostLocks[0]?.admin_session_id ?? "",
                hostTokenHash: hostLocks[0]?.host_token_hash ?? "",
                acquiredAt: msFromIso(hostLocks[0]?.acquired_at ?? this.now()),
                heartbeatAt: msFromIso(hostLocks[0]?.heartbeat_at ?? this.now()),
                expiresAt: msFromIso(hostLocks[0]?.expires_at ?? this.now()),
              }
            : null,
      },
      roster: {
        players: players
          .map((row) => ({
            id: row.id,
            startggUsername: row.startgg_username,
            normalizedUsername: row.startgg_username_normalized,
            active: row.active,
            hasTournamentHistory: row.has_tournament_history,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }))
          .sort((left, right) => left.startggUsername.localeCompare(right.startggUsername)),
        currentRoundEligibility: roundEligibility
          .filter((row) => !row.active_at_round_start)
          .map((row) => ({
            playerId: row.player_id,
            roundNumber: row.round_number as 1 | 2 | 3 | 4,
            reason: row.reason ?? "Restored normalized eligibility entry.",
            addedAt: row.added_at ?? row.created_at,
          })),
      },
      draw: {
        drawHistory,
        selectedSongKeys: [],
        chartExclusions: chartExclusions.map((row) => {
          const chart = chartSummaries.get(row.chart_id);

          return {
            chartKey: chart?.chartKey ?? row.chart_id,
            excluded: row.excluded,
            reason: row.reason,
            updatedAt: row.updated_at,
          };
        }),
      },
      ballot: {
        ballots: this.buildBallots(ballots, ballotChoices, ballotRevisions, players),
        ballotInvalidations: ballotInvalidations.map((row) => ({
          id: row.id,
          roundNumber: row.round_number as 1 | 2 | 3 | 4,
          invalidatedAt: row.invalidated_at,
          reason: row.reason,
          adminSessionId: row.admin_session_id,
          ballotIds: [...row.ballot_ids],
          ballots: cloneJson(asRecord(row.payload).ballots ?? []) as RoundBallot[],
        })),
        phoneStatus,
        presenceClaims: activeVoterPresence.map((row) => ({
          roundNumber: row.round_number as 1 | 2 | 3 | 4,
          playerId: row.player_id,
          deviceId: row.device_id,
          claimedAt: row.claimed_at,
          expiresAt: row.expires_at,
        })),
      },
      votingWindow: {
        windows: votingWindows.map((row) => ({
          roundNumber: row.round_number as 1 | 2 | 3 | 4,
          status: row.status as never,
          eligiblePlayers: asEligiblePlayers(row.eligible_players),
          openedAt: row.opened_at ?? row.created_at,
          closesAt: row.closes_at,
          closedAt: row.closed_at,
          extensionUsed: row.extension_used,
          finalWarningStartedAt: row.final_warning_started_at,
          pausedAt: row.paused_at,
          pausedFromStatus: row.paused_from_status as never,
          remainingMsWhenPaused:
            row.remaining_ms_when_paused ??
            (row.remaining_seconds_at_pause === null
              ? null
              : row.remaining_seconds_at_pause * 1000),
          updatedAt: row.updated_at,
        })),
      },
      result: {
        results,
      },
      roundState: {
        currentRound: (runtimeState[0]?.current_round ?? 1) as 1 | 2 | 3 | 4,
        rehearsalMode: runtimeState[0]?.rehearsal_mode ?? false,
      },
    };
  }

  private async saveUnlocked(snapshot: OperationalStateSnapshot): Promise<void> {
    await this.deleteEventRowsInBatches();

    await Promise.all([
      this.saveRuntimeState(snapshot),
      this.saveCharts(snapshot),
      this.savePlayers(snapshot),
      this.saveAdminActions(snapshot),
    ]);

    await Promise.all([this.saveChartExclusions(snapshot), this.saveDraws(snapshot)]);

    await this.saveVotingWindows(snapshot);

    await Promise.all([
      this.saveBallots(snapshot),
      this.saveResults(snapshot),
      this.saveBallotInvalidations(snapshot),
      this.savePresence(snapshot),
      this.saveHostLock(snapshot),
    ]);
  }

  private async saveHostLockOnlyUnlocked(hostLock: OperationalStateSnapshot["hostLock"]) {
    if (!hostLock.lock) {
      await this.deleteEventRows("host_locks");
      return;
    }

    await this.upsertOne(
      "host_locks",
      {
        event_id: this.eventId,
        lock_name: "tournament-host",
        admin_session_id: isUuid(hostLock.lock.ownerSessionId)
          ? hostLock.lock.ownerSessionId
          : null,
        owner_session_id: hostLock.lock.ownerSessionId,
        host_token_hash: hostLock.lock.hostTokenHash,
        acquired_at: isoFromMs(hostLock.lock.acquiredAt),
        heartbeat_at: isoFromMs(hostLock.lock.heartbeatAt),
        expires_at: isoFromMs(hostLock.lock.expiresAt),
      },
      { onConflict: "event_id,lock_name" },
    );
  }

  private async saveVotingStateUnlocked(
    snapshot: OperationalStateSnapshot,
    changedInput?: PersistMergedStateInput,
  ) {
    const changedBallots = this.getChangedVotingBallots(snapshot, changedInput);

    await this.deleteEventRows("active_voter_presence");
    await Promise.all([
      this.deleteEventRowsByColumnValues(
        "ballot_revisions",
        "ballot_id",
        changedBallots.map((ballot) => ballot.id),
      ),
      this.deleteEventRowsByColumnValues(
        "ballot_choices",
        "ballot_id",
        changedBallots.map((ballot) => ballot.id),
      ),
    ]);
    await this.upsertVotingWindows(snapshot);
    await Promise.all([this.saveBallots(snapshot, changedBallots), this.savePresence(snapshot)]);
  }

  private async saveVotingAdminStateUnlocked(snapshot: OperationalStateSnapshot) {
    await Promise.all([
      this.deleteEventRows("active_voter_presence"),
      this.deleteEventRows("round_player_eligibility"),
      this.deleteEventRows("admin_actions"),
    ]);

    await Promise.all([
      this.upsertVotingWindows(snapshot),
      this.saveRoundPlayerEligibility(snapshot),
      this.saveAdminActions(snapshot),
      this.savePresence(snapshot),
      this.saveHostLockOnlyUnlocked(snapshot.hostLock),
    ]);
  }

  private async saveResultAdminStateUnlocked(snapshot: OperationalStateSnapshot) {
    await Promise.all([
      this.deleteEventRows("active_voter_presence"),
      this.deleteEventRows("round_player_eligibility"),
      this.deleteEventRows("admin_actions"),
    ]);

    await Promise.all([
      this.upsertVotingWindows(snapshot),
      this.saveRoundPlayerEligibility(snapshot),
      this.upsertResultSnapshots(snapshot),
      this.upsertTiebreaks(snapshot),
      this.saveDraws(snapshot),
      this.saveAdminActions(snapshot),
      this.savePresence(snapshot),
      this.saveHostLockOnlyUnlocked(snapshot.hostLock),
    ]);
  }

  private getChangedVotingBallots(
    snapshot: OperationalStateSnapshot,
    changedInput?: PersistMergedStateInput,
  ) {
    if (!changedInput?.baseline) {
      return snapshot.ballot.ballots;
    }

    const baseline = new Map(
      changedInput.baseline.ballot.ballots.map((ballot) => [ballotPersistenceKey(ballot), ballot]),
    );
    const current = new Map(
      changedInput.current.ballot.ballots.map((ballot) => [ballotPersistenceKey(ballot), ballot]),
    );
    const changedKeys = new Set<string>();

    for (const [key, currentBallot] of current) {
      if (stableJson(baseline.get(key)) !== stableJson(currentBallot)) {
        changedKeys.add(key);
      }
    }

    return snapshot.ballot.ballots.filter((ballot) =>
      changedKeys.has(ballotPersistenceKey(ballot)),
    );
  }

  private async withEventPersistenceLock<T>(callback: () => Promise<T>) {
    const lockToken = await this.acquireEventPersistenceLock();

    try {
      return await callback();
    } finally {
      await this.releaseEventPersistenceLock(lockToken);
    }
  }

  private async acquireEventPersistenceLock() {
    const lockToken = randomUUID();
    const startedAt = Date.now();

    while (Date.now() - startedAt < EVENT_LOCK_TIMEOUT_MS) {
      const lockedUntil = new Date(Date.now() + EVENT_LOCK_TTL_MS).toISOString();
      const { data, error } = await this.supabase.rpc("normalized_acquire_event_persistence_lock", {
        p_event_id: this.eventId,
        p_lock_token: lockToken,
        p_locked_until: lockedUntil,
      });

      if (error) {
        throw new Error(`Could not acquire normalized runtime event lock: ${error.message}`);
      }

      if (data === true) {
        return lockToken;
      }

      await sleep(EVENT_LOCK_RETRY_MS);
    }

    throw new Error(
      `Timed out waiting for normalized runtime event lock for event ${this.eventId}.`,
    );
  }

  private async releaseEventPersistenceLock(lockToken: string) {
    const { error } = await this.supabase.rpc("normalized_release_event_persistence_lock", {
      p_event_id: this.eventId,
      p_lock_token: lockToken,
    });

    if (error) {
      throw new Error(`Could not release normalized runtime event lock: ${error.message}`);
    }
  }

  private async selectEventRows<TTable extends TableName>(table: TTable) {
    const { data, error } = await this.supabase
      .from(table)
      .select("*")
      .eq("event_id", this.eventId);

    if (error) {
      throw new Error(`Could not load ${table} normalized runtime rows: ${error.message}`);
    }

    return data ?? [];
  }

  private async deleteEventRows(table: TableName) {
    const { error } = await this.supabase.from(table).delete().eq("event_id", this.eventId);

    if (error) {
      throw new Error(`Could not clear ${table} normalized runtime rows: ${error.message}`);
    }
  }

  private async deleteEventRowsByColumnValues(table: TableName, column: string, values: string[]) {
    if (values.length === 0) {
      return;
    }

    const { error } = await this.supabase
      .from(table)
      .delete()
      .eq("event_id", this.eventId)
      .in(column, values);

    if (error) {
      throw new Error(`Could not clear ${table} normalized runtime rows: ${error.message}`);
    }
  }

  private async deleteEventRowsInBatches() {
    for (const batch of EVENT_TABLE_DELETE_BATCHES) {
      await Promise.all(batch.map((table) => this.deleteEventRows(table)));
    }
  }

  private async insertMany<TTable extends TableName>(table: TTable, rows: TableInsert<TTable>[]) {
    if (rows.length === 0) {
      return;
    }

    const { error } = await this.supabase.from(table).insert(rows);

    if (error) {
      throw new Error(`Could not insert ${table} normalized runtime rows: ${error.message}`);
    }
  }

  private async upsertMany<TTable extends TableName>(
    table: TTable,
    rows: TableInsert<TTable>[],
    options?: { onConflict?: string },
  ) {
    if (rows.length === 0) {
      return;
    }

    const { error } = await this.supabase.from(table).upsert(rows, options);

    if (error) {
      throw new Error(`Could not upsert ${table} normalized runtime rows: ${error.message}`);
    }
  }

  private async upsertOne<TTable extends TableName>(
    table: TTable,
    row: TableInsert<TTable>,
    options?: { onConflict?: string },
  ) {
    const { error } = await this.supabase.from(table).upsert(row, options);

    if (error) {
      throw new Error(`Could not upsert ${table} normalized runtime row: ${error.message}`);
    }
  }

  private loadRuntimeChartSummaries() {
    return new Map(loadRuntimeCharts().map((chart) => [chart.id, toDrawnChartSummary(chart)]));
  }

  private async saveRuntimeState(snapshot: OperationalStateSnapshot) {
    await this.upsertOne("event_runtime_state", {
      event_id: this.eventId,
      current_round: snapshot.roundState.currentRound,
      rehearsal_mode: snapshot.roundState.rehearsalMode,
      updated_at: snapshot.savedAt,
    });
  }

  private async savePlayers(snapshot: OperationalStateSnapshot) {
    await this.insertMany(
      "players",
      snapshot.roster.players.map((player) => ({
        id: player.id,
        event_id: this.eventId,
        startgg_username: player.startggUsername,
        startgg_username_normalized: player.normalizedUsername,
        active: player.active,
        has_tournament_history: player.hasTournamentHistory,
        created_at: player.createdAt,
        updated_at: player.updatedAt,
      })),
    );
  }

  private async saveAdminActions(snapshot: OperationalStateSnapshot) {
    await this.insertMany(
      "admin_actions",
      snapshot.audit.records.map((record) => ({
        id: record.id,
        event_id: this.eventId,
        admin_session_id: isUuid(record.sessionId) ? record.sessionId : null,
        action_type: record.action,
        action_summary: record.summary,
        reason: record.reason,
        requires_password_reentry: record.dangerous,
        created_at: record.createdAt,
        metadata: {
          metadata: record.metadata,
          affectedRecords: record.affectedRecords,
          dangerous: record.dangerous,
          tournamentChanging: record.tournamentChanging,
          sessionId: record.sessionId,
        } as Json,
      })),
    );
  }

  private async saveCharts(snapshot: OperationalStateSnapshot) {
    const rows = new Map<string, TableInsert<"charts">>();
    const runtimeChartsByKey = new Map(loadRuntimeCharts().map((chart) => [chart.chartKey, chart]));
    const addNormalized = (chart: NormalizedChart) =>
      rows.set(chart.id, chartInsertFromNormalized(chart));

    const addSummary = (chart: DrawnChartSummary) =>
      rows.set(chart.id, chartInsertFromSummary(chart));

    for (const draw of snapshot.draw.drawHistory) {
      draw.charts.forEach(addSummary);
    }

    for (const result of snapshot.result.results) {
      for (const set of result.sets) {
        set.rows.forEach((row) => addSummary(row.chart));
        addSummary(set.selectedChart);
        set.wheelSlots.forEach(addSummary);
      }
    }

    for (const exclusion of snapshot.draw.chartExclusions ?? []) {
      const chart = runtimeChartsByKey.get(exclusion.chartKey);

      if (chart) {
        addNormalized(chart);
      }
    }

    await this.upsertMany("charts", [...rows.values()]);
  }

  private async saveChartExclusions(snapshot: OperationalStateSnapshot) {
    const chartsByKey = new Map(loadRuntimeCharts().map((chart) => [chart.chartKey, chart]));

    await this.insertMany(
      "chart_exclusions",
      (snapshot.draw.chartExclusions ?? []).map((exclusion) => ({
        id: deterministicUuid(`${this.eventId}:chart-exclusion:${exclusion.chartKey}`),
        event_id: this.eventId,
        chart_id: chartsByKey.get(exclusion.chartKey)?.id ?? deterministicUuid(exclusion.chartKey),
        excluded: exclusion.excluded,
        reason: exclusion.reason,
        created_at: exclusion.updatedAt,
        updated_at: exclusion.updatedAt,
      })),
    );
  }

  private async saveDraws(snapshot: OperationalStateSnapshot) {
    const { error } = await this.supabase.rpc("normalized_replace_draw_state", {
      p_event_id: this.eventId,
      p_payload: {
        draws: snapshot.draw.drawHistory.map((draw) => ({
          id: draw.id,
          roundSetId: draw.roundSetId,
          version: draw.version,
          status: draw.supersededAt ? "superseded" : "active",
          eligiblePoolCount: draw.eligiblePoolCount,
          eligibleChartIds: draw.eligibleChartIds ?? [],
          excludedChartKeysSnapshot: draw.excludedChartKeysSnapshot ?? [],
          selectedSongKeysSnapshot: draw.selectedSongKeysSnapshot ?? [],
          sameRoundBlockedSongKeysSnapshot: draw.sameRoundBlockedSongKeysSnapshot ?? [],
          createdAt: draw.createdAt,
          supersededAt: draw.supersededAt,
          reason: draw.reason,
          charts: draw.charts.map((chart) => ({ id: chart.id })),
        })),
      },
    });

    if (error) {
      throw new Error(`Could not replace normalized draw state transactionally: ${error.message}`);
    }
  }

  private async saveVotingWindows(snapshot: OperationalStateSnapshot) {
    await this.insertMany(
      "voting_windows",
      snapshot.votingWindow.windows.map((window) => ({
        event_id: this.eventId,
        round_number: window.roundNumber,
        status: window.status,
        opened_at: window.openedAt,
        closes_at: window.closesAt,
        paused_at: window.pausedAt,
        paused_from_status: window.pausedFromStatus,
        remaining_seconds_at_pause:
          window.remainingMsWhenPaused === null
            ? null
            : Math.ceil(window.remainingMsWhenPaused / 1000),
        remaining_ms_when_paused: window.remainingMsWhenPaused,
        extension_used: window.extensionUsed,
        final_warning_started_at: window.finalWarningStartedAt,
        closed_at: window.closedAt,
        eligible_players: window.eligiblePlayers as unknown as Json,
        created_at: window.openedAt,
        updated_at: window.updatedAt,
      })),
    );

    await this.saveRoundPlayerEligibility(snapshot);
  }

  private async saveRoundPlayerEligibility(snapshot: OperationalStateSnapshot) {
    const rows = new Map<string, TableInsert<"round_player_eligibility">>();

    for (const window of snapshot.votingWindow.windows) {
      for (const player of window.eligiblePlayers) {
        rows.set(`${window.roundNumber}:${player.id}`, {
          event_id: this.eventId,
          round_number: window.roundNumber,
          player_id: player.id,
          active_at_round_start: true,
          created_at: window.openedAt,
        });
      }
    }

    for (const entry of snapshot.roster.currentRoundEligibility) {
      rows.set(`${entry.roundNumber}:${entry.playerId}`, {
        event_id: this.eventId,
        round_number: entry.roundNumber,
        player_id: entry.playerId,
        active_at_round_start: false,
        reason: entry.reason,
        added_at: entry.addedAt,
        created_at: entry.addedAt,
      });
    }

    await this.insertMany("round_player_eligibility", [...rows.values()]);
  }

  private async upsertVotingWindows(snapshot: OperationalStateSnapshot) {
    await this.upsertMany(
      "voting_windows",
      snapshot.votingWindow.windows.map((window) => ({
        event_id: this.eventId,
        round_number: window.roundNumber,
        status: window.status,
        opened_at: window.openedAt,
        closes_at: window.closesAt,
        paused_at: window.pausedAt,
        paused_from_status: window.pausedFromStatus,
        remaining_seconds_at_pause:
          window.remainingMsWhenPaused === null
            ? null
            : Math.ceil(window.remainingMsWhenPaused / 1000),
        remaining_ms_when_paused: window.remainingMsWhenPaused,
        extension_used: window.extensionUsed,
        final_warning_started_at: window.finalWarningStartedAt,
        closed_at: window.closedAt,
        eligible_players: window.eligiblePlayers as unknown as Json,
        created_at: window.openedAt,
        updated_at: window.updatedAt,
      })),
      { onConflict: "event_id,round_number" },
    );
  }

  private async saveBallots(snapshot: OperationalStateSnapshot, ballots = snapshot.ballot.ballots) {
    await this.upsertMany(
      "ballots",
      ballots.map((ballot) => ({
        id: ballot.id,
        event_id: this.eventId,
        round_number: ballot.roundNumber,
        player_id: ballot.playerId,
        submitted: true,
        submitted_at: ballot.submittedAt,
        last_revision_at: ballot.submittedAt,
        latest_revision_number: ballot.revision,
        edit_token_hash: ballot.editTokenHash ?? null,
        manual_override: ballot.manualOverride,
        override_reason: ballot.manualReason,
        replaced_existing_ballot: ballot.replacedExistingBallot,
        created_at: ballot.submittedAt,
        updated_at: ballot.submittedAt,
      })),
      { onConflict: "event_id,round_number,player_id" },
    );
    await this.insertMany(
      "ballot_choices",
      ballots.flatMap((ballot) =>
        ballot.choices.map((choice) => ({
          event_id: this.eventId,
          ballot_id: ballot.id,
          draw_id: choice.drawId,
          round_set_id: choice.roundSetId,
          no_bans: choice.noBans,
          banned_chart_ids: choice.bannedChartIds,
          created_at: ballot.submittedAt,
          updated_at: ballot.submittedAt,
        })),
      ),
    );
    await this.insertMany(
      "ballot_revisions",
      ballots.map((ballot) => ({
        event_id: this.eventId,
        ballot_id: ballot.id,
        revision_number: ballot.revision,
        accepted: true,
        submitted_at: ballot.submittedAt,
        payload: {
          source: ballot.source,
          choices: ballot.choices,
        } as Json,
      })),
    );
  }

  private async saveBallotInvalidations(snapshot: OperationalStateSnapshot) {
    await this.insertMany(
      "ballot_invalidations",
      (snapshot.ballot.ballotInvalidations ?? []).map((record) => ({
        id: record.id,
        event_id: this.eventId,
        round_number: record.roundNumber,
        invalidated_at: record.invalidatedAt,
        reason: record.reason,
        admin_session_id: record.adminSessionId,
        ballot_ids: record.ballotIds,
        payload: {
          ballots: record.ballots,
        } as Json,
      })),
    );
  }

  private async saveResults(snapshot: OperationalStateSnapshot) {
    await this.insertMany(
      "result_snapshots",
      snapshot.result.results.map((result) => ({
        id: result.id,
        event_id: this.eventId,
        round_number: result.roundNumber,
        computed_at: result.computedAt,
        stage_revealed_at: result.finalRevealedAt,
        reveal_phase: result.revealPhase,
        reveal_phase_started_at: result.revealPhaseStartedAt,
        final_revealed_at: result.finalRevealedAt,
        eligible_players: result.eligiblePlayers as unknown as Json,
        metadata: {},
      })),
    );
    await this.insertMany(
      "result_rows",
      snapshot.result.results.flatMap((result) =>
        result.sets.flatMap((set) =>
          set.rows.map((row, index) => ({
            event_id: this.eventId,
            result_snapshot_id: result.id,
            draw_id: set.drawId,
            round_set_id: set.roundSetId,
            chart_id: row.chart.id,
            ban_count: row.banCount,
            reveal_order: index + 1,
            is_selected: row.selected,
            is_tiebreak_candidate: row.tiedForFewest,
            created_at: result.computedAt,
          })),
        ),
      ),
    );
    await this.insertMany(
      "tiebreaks",
      snapshot.result.results.flatMap((result) =>
        result.sets
          .filter((set) => set.tiebreakUsed && set.tiebreakWinnerChartId)
          .map((set) => ({
            event_id: this.eventId,
            result_snapshot_id: result.id,
            draw_id: set.drawId,
            round_set_id: set.roundSetId,
            candidate_chart_ids: set.tiebreakCandidateIds,
            winner_chart_id: set.tiebreakWinnerChartId as string,
            decided_at: result.computedAt,
            decision_source: set.zeroBallotTiebreak ? "server_zero_ballot" : "server",
            winner_reveal_started_at: set.winnerRevealStartedAt,
          })),
      ),
    );
  }

  private async upsertResultSnapshots(snapshot: OperationalStateSnapshot) {
    await this.upsertMany(
      "result_snapshots",
      snapshot.result.results.map((result) => ({
        id: result.id,
        event_id: this.eventId,
        round_number: result.roundNumber,
        computed_at: result.computedAt,
        stage_revealed_at: result.finalRevealedAt,
        reveal_phase: result.revealPhase,
        reveal_phase_started_at: result.revealPhaseStartedAt,
        final_revealed_at: result.finalRevealedAt,
        eligible_players: result.eligiblePlayers as unknown as Json,
        metadata: {},
      })),
      { onConflict: "event_id,round_number" },
    );
  }

  private async upsertTiebreaks(snapshot: OperationalStateSnapshot) {
    await this.upsertMany(
      "tiebreaks",
      snapshot.result.results.flatMap((result) =>
        result.sets
          .filter((set) => set.tiebreakUsed && set.tiebreakWinnerChartId)
          .map((set) => ({
            event_id: this.eventId,
            result_snapshot_id: result.id,
            draw_id: set.drawId,
            round_set_id: set.roundSetId,
            candidate_chart_ids: set.tiebreakCandidateIds,
            winner_chart_id: set.tiebreakWinnerChartId as string,
            decided_at: result.computedAt,
            decision_source: set.zeroBallotTiebreak ? "server_zero_ballot" : "server",
            winner_reveal_started_at: set.winnerRevealStartedAt,
          })),
      ),
      { onConflict: "event_id,result_snapshot_id,draw_id" },
    );
  }

  private async savePresence(snapshot: OperationalStateSnapshot) {
    await this.insertMany(
      "active_voter_presence",
      (snapshot.ballot.presenceClaims ?? []).map((claim) => ({
        event_id: this.eventId,
        round_number: claim.roundNumber,
        player_id: claim.playerId,
        device_id: claim.deviceId,
        claimed_at: claim.claimedAt,
        last_seen_at: claim.claimedAt,
        expires_at: claim.expiresAt,
      })),
    );
  }

  private async saveHostLock(snapshot: OperationalStateSnapshot) {
    const lock = snapshot.hostLock.lock;

    if (!lock) {
      return;
    }

    await this.upsertOne(
      "host_locks",
      {
        event_id: this.eventId,
        lock_name: "tournament-host",
        admin_session_id: isUuid(lock.ownerSessionId) ? lock.ownerSessionId : null,
        owner_session_id: lock.ownerSessionId,
        host_token_hash: lock.hostTokenHash,
        acquired_at: isoFromMs(lock.acquiredAt),
        heartbeat_at: isoFromMs(lock.heartbeatAt),
        expires_at: isoFromMs(lock.expiresAt),
      },
      { onConflict: "event_id,lock_name" },
    );
  }

  private buildDrawHistory(
    draws: TableRow<"draws">[],
    drawnCharts: TableRow<"drawn_charts">[],
    charts: Map<string, DrawnChartSummary>,
  ) {
    const drawnByDrawId = new Map<string, TableRow<"drawn_charts">[]>();

    for (const drawnChart of drawnCharts) {
      const rows = drawnByDrawId.get(drawnChart.draw_id) ?? [];

      rows.push(drawnChart);
      drawnByDrawId.set(drawnChart.draw_id, rows);
    }

    return draws
      .map((draw) => {
        const set = requireRoundSet(draw.round_set_id);

        return {
          id: draw.id,
          roundSetId: draw.round_set_id,
          roundNumber: set.roundNumber,
          setOrder: set.setOrder,
          displayLabel: set.displayLabel,
          version: draw.draw_version,
          eligiblePoolCount: draw.eligible_pool_count,
          eligibleChartIds: [...draw.eligible_chart_ids],
          excludedChartKeysSnapshot: [...draw.excluded_chart_keys_snapshot],
          selectedSongKeysSnapshot: [...draw.selected_song_keys_snapshot],
          sameRoundBlockedSongKeysSnapshot: [...draw.same_round_blocked_song_keys_snapshot],
          charts: (drawnByDrawId.get(draw.id) ?? [])
            .sort((left, right) => left.draw_order - right.draw_order)
            .map(
              (row) =>
                charts.get(row.chart_id) ?? fallbackChartSummary(row.chart_id, set.displayLabel),
            ),
          createdAt: draw.created_at,
          supersededAt: draw.superseded_at,
          reason: draw.reason ?? "Restored normalized draw.",
        };
      })
      .sort(
        (left, right) =>
          left.roundNumber - right.roundNumber ||
          left.setOrder - right.setOrder ||
          left.version - right.version,
      );
  }

  private buildBallots(
    ballots: TableRow<"ballots">[],
    choices: TableRow<"ballot_choices">[],
    revisions: TableRow<"ballot_revisions">[],
    players: TableRow<"players">[],
  ): RoundBallot[] {
    const choicesByBallotId = new Map<string, TableRow<"ballot_choices">[]>();
    const revisionPayloads = new Map<string, Record<string, unknown>>();
    const playersById = new Map(players.map((player) => [player.id, player]));

    for (const choice of choices) {
      const rows = choicesByBallotId.get(choice.ballot_id) ?? [];

      rows.push(choice);
      choicesByBallotId.set(choice.ballot_id, rows);
    }

    for (const revision of revisions) {
      revisionPayloads.set(revision.ballot_id, asRecord(revision.payload));
    }

    return ballots.map((ballot) => {
      const payload = revisionPayloads.get(ballot.id);
      const source = payload?.source === "manual_admin" ? "manual_admin" : "player";

      return {
        id: ballot.id,
        roundNumber: ballot.round_number as 1 | 2 | 3 | 4,
        playerId: ballot.player_id,
        playerStartggUsername:
          playersById.get(ballot.player_id)?.startgg_username ?? ballot.player_id,
        choices: (choicesByBallotId.get(ballot.id) ?? []).map((choice): BallotSetChoice => {
          const set = requireRoundSet(choice.round_set_id);

          return {
            drawId: choice.draw_id,
            roundSetId: choice.round_set_id,
            displayLabel: set.displayLabel,
            noBans: choice.no_bans,
            bannedChartIds: [...choice.banned_chart_ids],
          };
        }),
        submittedAt: ballot.submitted_at ?? ballot.updated_at,
        revision: ballot.latest_revision_number,
        editTokenHash: ballot.edit_token_hash,
        source,
        manualReason: ballot.override_reason,
        manualOverride: ballot.manual_override,
        replacedExistingBallot: ballot.replaced_existing_ballot,
      };
    });
  }

  private buildResults(
    snapshots: TableRow<"result_snapshots">[],
    rows: TableRow<"result_rows">[],
    tiebreaks: TableRow<"tiebreaks">[],
    draws: TableRow<"draws">[],
    charts: Map<string, DrawnChartSummary>,
  ) {
    const drawVersions = new Map(draws.map((draw) => [draw.id, draw.draw_version]));
    const rowsBySnapshotAndDraw = new Map<string, TableRow<"result_rows">[]>();
    const tiebreakBySnapshotAndDraw = new Map<string, TableRow<"tiebreaks">>();

    for (const row of rows) {
      const key = `${row.result_snapshot_id}:${row.draw_id}`;
      const existing = rowsBySnapshotAndDraw.get(key) ?? [];

      existing.push(row);
      rowsBySnapshotAndDraw.set(key, existing);
    }

    for (const tiebreak of tiebreaks) {
      tiebreakBySnapshotAndDraw.set(`${tiebreak.result_snapshot_id}:${tiebreak.draw_id}`, tiebreak);
    }

    return snapshots.flatMap((snapshot) => {
      const sets = [...rowsBySnapshotAndDraw.entries()]
        .filter(([key]) => key.startsWith(`${snapshot.id}:`))
        .map(([, setRows]): ResultSetSnapshot | null => {
          const firstRow = setRows[0];

          if (!firstRow) {
            return null;
          }

          const set = requireRoundSet(firstRow.round_set_id);
          const orderedRows = [...setRows].sort(
            (left, right) => left.reveal_order - right.reveal_order,
          );
          const chartRows = orderedRows.map((row) => ({
            chart: charts.get(row.chart_id) ?? fallbackChartSummary(row.chart_id, set.displayLabel),
            banCount: row.ban_count,
            selected: row.is_selected,
            tiedForFewest: row.is_tiebreak_candidate,
          }));
          const selectedChart =
            chartRows.find((row) => row.selected)?.chart ??
            chartRows[0]?.chart ??
            fallbackChartSummary("unknown");
          const tiebreak = tiebreakBySnapshotAndDraw.get(`${snapshot.id}:${firstRow.draw_id}`);
          const candidates =
            tiebreak?.candidate_chart_ids.map(
              (chartId) => charts.get(chartId) ?? fallbackChartSummary(chartId, set.displayLabel),
            ) ?? [];
          const zeroBallotTiebreak = tiebreak?.decision_source === "server_zero_ballot";
          const wheelSlots = buildWheelSlots(candidates, zeroBallotTiebreak);

          return {
            drawId: firstRow.draw_id,
            drawVersion: drawVersions.get(firstRow.draw_id) ?? 1,
            roundSetId: firstRow.round_set_id,
            setOrder: set.setOrder,
            displayLabel: set.displayLabel,
            rows: chartRows,
            maxBanCount: Math.max(...chartRows.map((row) => row.banCount), 0),
            leastBanCount: Math.min(...chartRows.map((row) => row.banCount), 0),
            selectedChart,
            tiebreakUsed: Boolean(tiebreak),
            tiebreakCandidateIds: tiebreak?.candidate_chart_ids ?? [],
            tiebreakWinnerChartId: tiebreak?.winner_chart_id ?? null,
            wheelSlots,
            wheelSupported: wheelSlots.length > 0,
            zeroBallotTiebreak,
            winnerRevealStartedAt: tiebreak?.winner_reveal_started_at ?? null,
          };
        })
        .filter((set): set is ResultSetSnapshot => Boolean(set))
        .sort((left, right) => left.setOrder - right.setOrder);

      if (sets.length !== 2 || !sets[0] || !sets[1]) {
        return [];
      }

      const resultSets: [ResultSetSnapshot, ResultSetSnapshot] = [sets[0], sets[1]];

      return [
        {
          id: snapshot.id,
          roundNumber: snapshot.round_number as 1 | 2 | 3 | 4,
          computedAt: snapshot.computed_at,
          eligiblePlayers: asEligiblePlayers(snapshot.eligible_players),
          sets: resultSets,
          revealPhase: snapshot.reveal_phase as ResultRevealPhase,
          revealPhaseStartedAt: snapshot.reveal_phase_started_at ?? snapshot.computed_at,
          finalRevealedAt: snapshot.final_revealed_at,
        },
      ];
    });
  }

  private buildPhoneStatus(
    votingWindows: TableRow<"voting_windows">[],
    results: OperationalStateSnapshot["result"]["results"],
  ) {
    const statusByRound = new Map<1 | 2 | 3 | 4, PhoneRoundStatus>();

    for (const window of votingWindows) {
      statusByRound.set(window.round_number as 1 | 2 | 3 | 4, { phase: "voting_open" });

      if (["voting_closed", "results_computed", "results_revealing"].includes(window.status)) {
        statusByRound.set(window.round_number as 1 | 2 | 3 | 4, { phase: "closed_revealing" });
      }
    }

    for (const result of results) {
      if (result.revealPhase === "final") {
        statusByRound.set(result.roundNumber, {
          phase: "revealed",
          selectedCharts: result.sets.map((set) => ({
            id: set.selectedChart.id,
            name: set.selectedChart.name,
            artist: set.selectedChart.artist,
            displayDifficulty: set.selectedChart.displayDifficulty,
            localImagePath: set.selectedChart.localImagePath,
          })),
        });
      }
    }

    return [...statusByRound.entries()].map(([roundNumber, status]) => ({
      roundNumber,
      status,
    }));
  }
}
