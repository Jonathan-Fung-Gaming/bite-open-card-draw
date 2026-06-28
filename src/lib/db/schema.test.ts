import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_DATABASE_TABLES, ROUND_SET_SEED_ROWS } from "./schema";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260628050200_initial_schema.sql"),
  "utf8",
);

describe("Phase 2 database schema", () => {
  it("creates the required core tables", () => {
    for (const table of CORE_DATABASE_TABLES) {
      expect(migration).toMatch(new RegExp(`create table if not exists public\\.${table}\\b`, "i"));
    }
  });

  it("enables row level security on every core table", () => {
    for (const table of CORE_DATABASE_TABLES) {
      expect(migration).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    }
  });

  it("seeds the locked round set configuration", () => {
    for (const seed of ROUND_SET_SEED_ROWS) {
      expect(migration).toContain(
        `(${seed.roundNumber}, ${seed.setOrder}, '${seed.chartType}', ${seed.chartLevel}, '${seed.displayLabel}', 7, 2)`,
      );
    }
  });

  it("prevents duplicate active start.gg usernames at the database boundary", () => {
    expect(migration).toContain("players_active_username_unique");
    expect(migration).toContain("where active = true");
  });

  it("requires completed per-set ballot choices", () => {
    expect(migration).toContain("ballot_choices_completion_check");
    expect(migration).toContain("cardinality(banned_chart_ids) between 1 and 2");
  });
});
