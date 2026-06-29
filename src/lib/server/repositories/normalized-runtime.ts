import "server-only";
import type { EventScopedDatabaseTable } from "@/lib/db/schema";
import { getTournamentEventId } from "@/lib/server/env";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";

type EventScopedSelectBuilder = {
  eq(column: "event_id", value: string): unknown;
};

type EventScopedTableClient = {
  select(columns: string): EventScopedSelectBuilder;
};

type EventScopedSupabaseClient = {
  from(table: EventScopedDatabaseTable): EventScopedTableClient;
};

type RepositoryDependencies = {
  eventId?: string;
  supabase?: EventScopedSupabaseClient;
};

export type NormalizedRepositoryBoundary =
  | "players"
  | "chartExclusions"
  | "draws"
  | "votingWindows"
  | "ballots"
  | "results"
  | "adminSessions"
  | "adminAudit"
  | "hostLocks";

type RepositoryDefinition<TTable extends EventScopedDatabaseTable> = {
  boundary: NormalizedRepositoryBoundary;
  tables: readonly TTable[];
};

function createEventScopedSupabaseClient() {
  return createServiceRoleSupabaseClient() as unknown as EventScopedSupabaseClient;
}

export abstract class EventScopedRepository<TTable extends EventScopedDatabaseTable> {
  readonly boundary: NormalizedRepositoryBoundary;
  readonly eventId: string;
  readonly tables: readonly TTable[];
  protected readonly supabase: EventScopedSupabaseClient;

  protected constructor(
    definition: RepositoryDefinition<TTable>,
    dependencies: RepositoryDependencies = {},
  ) {
    this.boundary = definition.boundary;
    this.tables = definition.tables;
    this.eventId = dependencies.eventId ?? getTournamentEventId();
    this.supabase = dependencies.supabase ?? createEventScopedSupabaseClient();
  }

  scopedSelect(table: TTable, columns = "*") {
    if (!this.tables.includes(table)) {
      throw new Error(`${this.boundary} repository cannot query ${table}.`);
    }

    return this.supabase.from(table).select(columns).eq("event_id", this.eventId);
  }
}

const PLAYER_TABLES = ["players", "round_player_eligibility"] as const;
const CHART_EXCLUSION_TABLES = ["chart_exclusions"] as const;
const DRAW_TABLES = ["draws", "drawn_charts"] as const;
const VOTING_WINDOW_TABLES = ["voting_windows"] as const;
const BALLOT_TABLES = ["ballots", "ballot_choices", "ballot_revisions"] as const;
const RESULT_TABLES = ["result_snapshots", "result_rows", "tiebreaks"] as const;
const ADMIN_SESSION_TABLES = ["admin_sessions"] as const;
const ADMIN_AUDIT_TABLES = ["admin_actions"] as const;
const HOST_LOCK_TABLES = ["host_locks"] as const;

export class PlayerRepository extends EventScopedRepository<(typeof PLAYER_TABLES)[number]> {
  constructor(dependencies?: RepositoryDependencies) {
    super({ boundary: "players", tables: PLAYER_TABLES }, dependencies);
  }
}

export class ChartExclusionRepository extends EventScopedRepository<
  (typeof CHART_EXCLUSION_TABLES)[number]
> {
  constructor(dependencies?: RepositoryDependencies) {
    super({ boundary: "chartExclusions", tables: CHART_EXCLUSION_TABLES }, dependencies);
  }
}

export class DrawRepository extends EventScopedRepository<(typeof DRAW_TABLES)[number]> {
  constructor(dependencies?: RepositoryDependencies) {
    super({ boundary: "draws", tables: DRAW_TABLES }, dependencies);
  }
}

export class VotingWindowRepository extends EventScopedRepository<
  (typeof VOTING_WINDOW_TABLES)[number]
> {
  constructor(dependencies?: RepositoryDependencies) {
    super({ boundary: "votingWindows", tables: VOTING_WINDOW_TABLES }, dependencies);
  }
}

export class BallotRepository extends EventScopedRepository<(typeof BALLOT_TABLES)[number]> {
  constructor(dependencies?: RepositoryDependencies) {
    super({ boundary: "ballots", tables: BALLOT_TABLES }, dependencies);
  }
}

export class ResultRepository extends EventScopedRepository<(typeof RESULT_TABLES)[number]> {
  constructor(dependencies?: RepositoryDependencies) {
    super({ boundary: "results", tables: RESULT_TABLES }, dependencies);
  }
}

export class AdminSessionRepository extends EventScopedRepository<
  (typeof ADMIN_SESSION_TABLES)[number]
> {
  constructor(dependencies?: RepositoryDependencies) {
    super({ boundary: "adminSessions", tables: ADMIN_SESSION_TABLES }, dependencies);
  }
}

export class AdminAuditRepository extends EventScopedRepository<
  (typeof ADMIN_AUDIT_TABLES)[number]
> {
  constructor(dependencies?: RepositoryDependencies) {
    super({ boundary: "adminAudit", tables: ADMIN_AUDIT_TABLES }, dependencies);
  }
}

export class HostLockRepository extends EventScopedRepository<(typeof HOST_LOCK_TABLES)[number]> {
  constructor(dependencies?: RepositoryDependencies) {
    super({ boundary: "hostLocks", tables: HOST_LOCK_TABLES }, dependencies);
  }
}

export type NormalizedRuntimeRepositories = {
  playerRepository: PlayerRepository;
  chartExclusionRepository: ChartExclusionRepository;
  drawRepository: DrawRepository;
  votingWindowRepository: VotingWindowRepository;
  ballotRepository: BallotRepository;
  resultRepository: ResultRepository;
  adminSessionRepository: AdminSessionRepository;
  adminAuditRepository: AdminAuditRepository;
  hostLockRepository: HostLockRepository;
};

export function createNormalizedRuntimeRepositories(
  dependencies: RepositoryDependencies = {},
): NormalizedRuntimeRepositories {
  const sharedDependencies: RepositoryDependencies = {
    eventId: dependencies.eventId ?? getTournamentEventId(),
    supabase: dependencies.supabase ?? createEventScopedSupabaseClient(),
  };

  return {
    playerRepository: new PlayerRepository(sharedDependencies),
    chartExclusionRepository: new ChartExclusionRepository(sharedDependencies),
    drawRepository: new DrawRepository(sharedDependencies),
    votingWindowRepository: new VotingWindowRepository(sharedDependencies),
    ballotRepository: new BallotRepository(sharedDependencies),
    resultRepository: new ResultRepository(sharedDependencies),
    adminSessionRepository: new AdminSessionRepository(sharedDependencies),
    adminAuditRepository: new AdminAuditRepository(sharedDependencies),
    hostLockRepository: new HostLockRepository(sharedDependencies),
  };
}
