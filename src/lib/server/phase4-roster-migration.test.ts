import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260714020000_phase4_targeted_roster_transactions.sql",
);
const migration = readFileSync(migrationPath, "utf8");

function functionSource(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const revokeName = migration.indexOf(`on function public.${name}`, start);
  const end = migration.lastIndexOf("\n", revokeName);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(revokeName).toBeGreaterThan(start);
  expect(end).toBeGreaterThan(start);

  return migration.slice(start, end);
}

describe("Phase 4 targeted roster migration", () => {
  it("publishes only a sanitized browser-readable event/scope/version row", () => {
    expect(migration).toContain("create table if not exists public.event_invalidation_generations");
    expect(migration).toContain("primary key (event_id, scope)");
    expect(migration).toContain("check (length(trim(event_id)) > 0)");
    expect(migration).toContain("check (length(trim(scope)) > 0)");
    expect(migration).toContain("check (version >= 0)");
    expect(migration).toContain(
      "alter table public.event_invalidation_generations enable row level security",
    );
    expect(migration).toContain(
      "grant select on table public.event_invalidation_generations to anon, authenticated",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.event_invalidation_generations to service_role",
    );
    expect(migration).toContain("alter publication supabase_realtime");
    expect(migration).not.toMatch(
      /event_invalidation_generations\s*\([^;]*(username|payload|token|secret|hash)/i,
    );
  });

  it("keeps roster RPCs service-role-only and host-authorized in their transactions", () => {
    expect(migration).toContain("revoke all on function public.normalized_read_roster_version");

    for (const name of [
      "normalized_rename_roster_player",
      "normalized_set_roster_player_active_states",
    ]) {
      expect(migration).toContain(`revoke execute on function public.${name}`);
      expect(migration).toContain(`grant execute on function public.${name}`);
    }

    for (const name of [
      "normalized_rename_roster_player",
      "normalized_set_roster_player_active_states",
    ]) {
      const source = functionSource(name);

      expect(source).toContain("security definer");
      expect(source).toContain("set search_path = public");
      expect(source).toContain("pg_advisory_xact_lock");
      expect(source).toContain("normalized_acquire_phase4_event_lock");
      expect(source).toContain("normalized_release_event_persistence_lock");
      expect(source).toContain("normalized_assert_phase1_host");
      expect(source).toContain("for update");
      expect(source).toContain("v_expected_version");
      expect(source).toContain("expectedUpdatedAt");
      expect(source.match(/insert into public\.admin_actions/g)).toHaveLength(1);
    }
  });

  it("confines mutations to player, audit, and sanitized version rows", () => {
    for (const name of [
      "normalized_rename_roster_player",
      "normalized_set_roster_player_active_states",
    ]) {
      const source = functionSource(name);

      expect(source).toContain("public.players");
      expect(source).toContain("public.admin_actions");
      expect(source).toContain("public.event_invalidation_generations");
      expect(source).not.toMatch(
        /(insert into|update|delete from) public\.(round_player_eligibility|voting_windows)/,
      );
      expect(source).not.toContain("'payload', v_payload");

      const fingerprint = source.slice(
        source.indexOf("v_request_fingerprint := encode("),
        source.indexOf("perform pg_advisory_xact_lock"),
      );

      expect(fingerprint).not.toContain("hostTokenHash");
      expect(fingerprint).not.toContain("adminSessionId");
    }
  });

  it("enforces rename, atomic batch, version, and idempotency contracts", () => {
    const rename = functionSource("normalized_rename_roster_player");
    const statuses = functionSource("normalized_set_roster_player_active_states");

    expect(rename).toContain("Roster player was not found for this event.");
    expect(rename).toContain("start.gg username is required.");
    expect(rename).toContain("has_tournament_history");
    expect(rename).toContain("Active start.gg username already exists");
    expect(rename).toContain("requestFingerprint");
    expect(rename).toContain("return v_existing_result");

    expect(statuses).toContain("between 1 and 100 players");
    expect(statuses).toContain("changes contains a duplicate playerId");
    expect(statuses).toContain("One or more roster players were not found for this event.");
    expect(statuses).toContain("One or more roster players changed before the status update.");
    expect(statuses).toContain("requested active roster contains duplicate");
    expect(statuses).toContain("player.active is distinct from");
    expect(statuses).toContain("requestFingerprint");
    expect(statuses).toContain("return v_existing_result");
  });

  it("adds roster version to the public generation key without a roster payload", () => {
    const source = functionSource("normalized_read_public_generation_key");

    expect(source).toContain("'rosterVersion', roster_generation.version");
    expect(source).toContain("roster_generation.version::text");
    expect(source).not.toContain("startgg_username");
    expect(source).not.toContain("jsonb_agg(player");
  });
});
