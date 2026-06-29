import type { Database } from "@/lib/db/database.types";
import { ROUND_SET_DEFINITIONS } from "@/lib/tournament";

export const CORE_DATABASE_TABLES = [
  "players",
  "charts",
  "chart_exclusions",
  "rounds",
  "round_sets",
  "draws",
  "drawn_charts",
  "voting_windows",
  "round_player_eligibility",
  "active_voter_presence",
  "ballots",
  "ballot_choices",
  "ballot_revisions",
  "result_snapshots",
  "result_rows",
  "tiebreaks",
  "admin_sessions",
  "admin_actions",
  "host_locks",
  "image_assets",
  "tournament_state_snapshots",
] as const;

export type CoreDatabaseTable = (typeof CORE_DATABASE_TABLES)[number];

export const EVENT_SCOPED_DATABASE_TABLES = [
  "players",
  "chart_exclusions",
  "draws",
  "drawn_charts",
  "voting_windows",
  "round_player_eligibility",
  "active_voter_presence",
  "ballots",
  "ballot_choices",
  "ballot_revisions",
  "result_snapshots",
  "result_rows",
  "tiebreaks",
  "admin_sessions",
  "admin_actions",
  "host_locks",
] as const satisfies readonly CoreDatabaseTable[];

export type EventScopedDatabaseTable = (typeof EVENT_SCOPED_DATABASE_TABLES)[number];

export const GENERATED_DATABASE_TYPE_TABLES =
  CORE_DATABASE_TABLES satisfies readonly (keyof Database["public"]["Tables"])[];

export const ROUND_SET_SEED_ROWS = ROUND_SET_DEFINITIONS.map((set) => ({
  id: set.id,
  roundNumber: set.roundNumber,
  setOrder: set.setOrder,
  chartType: set.chartType.toLowerCase() as "s" | "d",
  chartLevel: set.chartLevel,
  displayLabel: set.displayLabel,
  drawCount: set.drawCount,
  maxBans: set.maxBans,
}));

export const SERVER_ONLY_SECRET_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_PASSWORD_HASH",
  "SESSION_SECRET",
] as const;

export const PUBLIC_BROWSER_ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export const SERVER_RUNTIME_ENV_KEYS = ["TOURNAMENT_EVENT_ID"] as const;
