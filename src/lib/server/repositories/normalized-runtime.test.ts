import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENT_SCOPED_DATABASE_TABLES, type EventScopedDatabaseTable } from "@/lib/db/schema";
import {
  createNormalizedRuntimeRepositories,
  PlayerRepository,
} from "@/lib/server/repositories/normalized-runtime";

vi.mock("server-only", () => ({}));

type QueryCall = {
  table: EventScopedDatabaseTable;
  columns: string;
  column: "event_id";
  value: string;
};

type PlayerRepositoryDependencies = NonNullable<ConstructorParameters<typeof PlayerRepository>[0]>;
type MockSupabaseClient = NonNullable<PlayerRepositoryDependencies["supabase"]>;

function createMockSupabase(calls: QueryCall[]): MockSupabaseClient {
  return {
    from(table) {
      return {
        select(columns) {
          return {
            eq(column, value) {
              calls.push({ table, columns, column, value });
              return { table, columns, column, value };
            },
          };
        },
      };
    },
  };
}

describe("normalized runtime repositories", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the repository boundary server-only", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/server/repositories/normalized-runtime.ts"),
      "utf8",
    );

    expect(source).toContain('import "server-only"');
  });

  it("assigns every event-scoped runtime table to a repository boundary", () => {
    const repositories = createNormalizedRuntimeRepositories({
      eventId: "phase-2-test",
      supabase: createMockSupabase([]),
    });
    const assignedTables = Object.values(repositories).flatMap((repository) => repository.tables);

    expect([...assignedTables].sort()).toEqual([...EVENT_SCOPED_DATABASE_TABLES].sort());
    expect(new Set(assignedTables).size).toBe(EVENT_SCOPED_DATABASE_TABLES.length);
  });

  it("scopes repository queries to the configured event id", () => {
    const calls: QueryCall[] = [];
    const repository = new PlayerRepository({
      eventId: "event-a",
      supabase: createMockSupabase(calls),
    });

    repository.scopedSelect("players", "id,startgg_username");

    expect(calls).toEqual([
      {
        table: "players",
        columns: "id,startgg_username",
        column: "event_id",
        value: "event-a",
      },
    ]);
  });

  it("rejects tables outside the repository boundary", () => {
    const repository = new PlayerRepository({
      eventId: "event-a",
      supabase: createMockSupabase([]),
    });

    expect(() => repository.scopedSelect("ballots" as (typeof repository.tables)[number])).toThrow(
      /players repository cannot query ballots/,
    );
  });

  it("uses TOURNAMENT_EVENT_ID when dependencies do not pass an explicit event id", () => {
    const calls: QueryCall[] = [];

    vi.stubEnv("TOURNAMENT_EVENT_ID", "env-event");

    const repositories = createNormalizedRuntimeRepositories({
      supabase: createMockSupabase(calls),
    });

    repositories.hostLockRepository.scopedSelect("host_locks");

    expect(calls).toEqual([
      {
        table: "host_locks",
        columns: "*",
        column: "event_id",
        value: "env-event",
      },
    ]);
  });
});
