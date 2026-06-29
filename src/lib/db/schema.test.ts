import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORE_DATABASE_TABLES,
  EVENT_SCOPED_DATABASE_TABLES,
  GENERATED_DATABASE_TYPE_TABLES,
  ROUND_SET_SEED_ROWS,
} from "./schema";

const migrationsDirectory = path.join(process.cwd(), "supabase/migrations");
const migration = readdirSync(migrationsDirectory)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => readFileSync(path.join(migrationsDirectory, fileName), "utf8"))
  .join("\n");

describe("Phase 2 database schema", () => {
  it("creates the required core tables", () => {
    for (const table of CORE_DATABASE_TABLES) {
      expect(migration).toMatch(new RegExp(`create table if not exists public\\.${table}\\b`, "i"));
    }
  });

  it("enables row level security on every core table", () => {
    for (const table of CORE_DATABASE_TABLES) {
      expect(migration).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, "i"),
      );
    }
  });

  it("seeds the locked round set configuration", () => {
    for (const seed of ROUND_SET_SEED_ROWS) {
      expect(migration).toContain(
        `('${seed.id}', ${seed.roundNumber}, ${seed.setOrder}, '${seed.chartType}', ${seed.chartLevel}, '${seed.displayLabel}', 7, 2)`,
      );
    }
  });

  it("prevents duplicate active start.gg usernames at the database boundary", () => {
    expect(migration).toContain("players_active_event_username_unique");
    expect(migration).toContain("on public.players (event_id, startgg_username_normalized)");
    expect(migration).toContain("where active = true");
  });

  it("requires completed per-set ballot choices", () => {
    expect(migration).toContain("ballot_choices_completion_check");
    expect(migration).toContain("cardinality(banned_chart_ids) between 1 and 2");
  });

  it("adds event scope to every mutable runtime table", () => {
    for (const table of EVENT_SCOPED_DATABASE_TABLES) {
      const addsEventColumn = new RegExp(
        `alter table public\\.${table}\\s+add column if not exists event_id`,
        "i",
      ).test(migration);
      const createsEventColumn = new RegExp(
        `create table if not exists public\\.${table}\\s*\\([\\s\\S]*?event_id text not null`,
        "i",
      ).test(migration);

      expect(addsEventColumn || createsEventColumn).toBe(true);
      expect(migration).toMatch(
        new RegExp(
          `constraint ${table}_event_id_not_blank check \\(length\\(trim\\(event_id\\)\\) > 0\\)`,
          "i",
        ),
      );
    }
  });

  it("uses event-scoped unique constraints for data that can collide across event runs", () => {
    expect(migration).toContain(
      "admin_sessions_event_token_hash_unique unique (event_id, session_token_hash)",
    );
    expect(migration).toContain(
      "draws_event_round_set_version_unique unique (event_id, round_set_id, draw_version)",
    );
    expect(migration).toContain(
      "voting_windows_event_round_unique unique (event_id, round_number)",
    );
    expect(migration).toContain(
      "ballots_event_round_player_unique unique (event_id, round_number, player_id)",
    );
    expect(migration).toContain(
      "result_snapshots_event_round_unique unique (event_id, round_number)",
    );
    expect(migration).toContain("host_locks_event_lock_name_unique unique (event_id, lock_name)");
  });

  it("stores draw-level identity for ballot choices, result rows, and tiebreaks", () => {
    expect(migration).toMatch(
      /alter table public\.ballot_choices\s+add column if not exists draw_id uuid references public\.draws\(id\)/i,
    );
    expect(migration).toMatch(
      /alter table public\.result_rows\s+add column if not exists draw_id uuid references public\.draws\(id\)/i,
    );
    expect(migration).toMatch(
      /alter table public\.tiebreaks\s+add column if not exists draw_id uuid references public\.draws\(id\)/i,
    );
    expect(migration).toContain("result_rows_event_snapshot_draw_chart_unique");
    expect(migration).toContain("result_rows_event_snapshot_draw_reveal_unique");
    expect(migration).toContain("tiebreaks_event_snapshot_draw_unique");
  });

  it("prevents normalized ballot and result rows from mixing static round sets with active draws", () => {
    expect(migration).toContain("validate_draw_scoped_runtime_row");
    expect(migration).toContain("matching_draw.round_set_id <> new.round_set_id");
    expect(migration).toContain("ballot_choices banned_chart_ids must all belong to draw_id");
    expect(migration).toContain("result_rows chart_id");
    expect(migration).toContain("tiebreaks candidates and winner must all belong to draw_id");
  });

  it("stores public ballot edit tokens only as server-side hashes", () => {
    expect(migration).toMatch(/alter table public\.ballots\s+add column if not exists edit_token_hash text/i);
    expect(migration).toContain("Never expose to browser clients");
  });

  it("guards core draw invariants at the database boundary", () => {
    expect(migration).toContain("draws_one_active_per_event_set");
    expect(migration).toContain("where status = 'active' and superseded_at is null");
    expect(migration).toContain("validate_drawn_chart_invariants");
    expect(migration).toContain("excluded chart % cannot be drawn");
    expect(migration).toContain("same-round duplicate song % cannot be drawn twice");
    expect(migration).toContain("selected in an earlier round and cannot be drawn");
    expect(migration).toContain("validate_voting_window_draw_completion");
    expect(migration).toContain("exactly 7 drawn charts");
  });

  it("keeps generated database types aligned with all runtime tables", () => {
    expect([...GENERATED_DATABASE_TYPE_TABLES].sort()).toEqual([...CORE_DATABASE_TABLES].sort());
  });
});
