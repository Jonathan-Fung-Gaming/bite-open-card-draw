import { describe, expect, it, vi } from "vitest";
import { createAdminSessionToken } from "@/lib/admin/session";
import type { Database } from "@/lib/db/database.types";
import {
  hashAdminSessionToken,
  NormalizedAdminSessionStore,
  type AdminSessionSupabaseClient,
} from "./admin-session-store";

vi.mock("server-only", () => ({}));

type AdminSessionRow = Database["public"]["Tables"]["admin_sessions"]["Row"];
type AdminSessionInsert = Database["public"]["Tables"]["admin_sessions"]["Insert"];

class FakeAdminSessionSupabaseClient {
  rows: AdminSessionRow[] = [];

  from(table: "admin_sessions") {
    if (table !== "admin_sessions") {
      throw new Error(`Unexpected table ${table}`);
    }

    return {
      select: () => this.createSelectBuilder(),
      insert: async (row: AdminSessionInsert) => {
        this.rows.push(this.toRow(row));

        return { error: null };
      },
      upsert: async (row: AdminSessionInsert) => {
        const nextRow = this.toRow(row);
        const index = this.rows.findIndex((candidate) => candidate.id === nextRow.id);

        if (index >= 0) {
          this.rows[index] = nextRow;
        } else {
          this.rows.push(nextRow);
        }

        return { error: null };
      },
    };
  }

  private createSelectBuilder(filters: Array<[string, string]> = []) {
    return {
      eq: (column: string, value: string) => this.createSelectBuilder([...filters, [column, value]]),
      maybeSingle: async () => ({
        data:
          this.rows.find((row) =>
            filters.every(([column, value]) => row[column as keyof AdminSessionRow] === value),
          ) ?? null,
        error: null,
      }),
    };
  }

  private toRow(row: AdminSessionInsert): AdminSessionRow {
    return {
      id: row.id ?? "00000000-0000-4000-8000-000000000000",
      event_id: row.event_id ?? "local-dev",
      session_token_hash: row.session_token_hash,
      created_at: row.created_at ?? "2026-06-29T00:00:00.000Z",
      last_seen_at: row.last_seen_at ?? "2026-06-29T00:00:00.000Z",
      expires_at: row.expires_at,
      revoked_at: row.revoked_at ?? null,
    };
  }
}

describe("normalized admin session store", () => {
  it("stores only the token hash and validates active unrevoked sessions", async () => {
    const supabase = new FakeAdminSessionSupabaseClient();
    const store = new NormalizedAdminSessionStore({
      eventId: "phase-6-test",
      supabase: supabase as unknown as AdminSessionSupabaseClient,
    });
    const session = createAdminSessionToken(
      "secret",
      Date.parse("2026-06-29T00:00:00.000Z"),
      "11111111-1111-4111-8111-111111111111",
    );

    await store.create(session.payload, session.token);

    expect(supabase.rows[0]).toMatchObject({
      id: session.payload.sessionId,
      event_id: "phase-6-test",
      session_token_hash: hashAdminSessionToken(session.token),
      revoked_at: null,
    });
    expect(supabase.rows[0]?.session_token_hash).not.toBe(session.token);
    await expect(
      store.validate(session.payload, session.token, Date.parse("2026-06-29T00:01:00.000Z")),
    ).resolves.toBe(true);
    await expect(
      store.validate(session.payload, "wrong-token", Date.parse("2026-06-29T00:01:00.000Z")),
    ).resolves.toBe(false);
  });

  it("slides expiry, accepts prior signed tokens for the active session, and rejects revoked sessions", async () => {
    const supabase = new FakeAdminSessionSupabaseClient();
    const store = new NormalizedAdminSessionStore({
      eventId: "phase-6-test",
      supabase: supabase as unknown as AdminSessionSupabaseClient,
    });
    const session = createAdminSessionToken(
      "secret",
      Date.parse("2026-06-29T00:00:00.000Z"),
      "22222222-2222-4222-8222-222222222222",
    );
    const refreshed = createAdminSessionToken(
      "secret",
      Date.parse("2026-06-29T00:05:00.000Z"),
      session.payload.sessionId,
    );

    await store.create(session.payload, session.token);
    await store.touch({
      currentSession: session.payload,
      currentToken: session.token,
      refreshedSession: refreshed.payload,
      refreshedToken: refreshed.token,
      now: Date.parse("2026-06-29T00:05:00.000Z"),
    });

    expect(supabase.rows[0]).toMatchObject({
      session_token_hash: hashAdminSessionToken(refreshed.token),
      last_seen_at: "2026-06-29T00:05:00.000Z",
      expires_at: new Date(refreshed.payload.expiresAt).toISOString(),
      revoked_at: null,
    });
    await expect(
      store.validate(session.payload, session.token, Date.parse("2026-06-29T00:05:01.000Z")),
    ).resolves.toBe(true);
    await expect(
      store.validate(refreshed.payload, refreshed.token, Date.parse("2026-06-29T00:05:01.000Z")),
    ).resolves.toBe(true);

    await store.revoke(
      refreshed.payload,
      refreshed.token,
      Date.parse("2026-06-29T00:06:00.000Z"),
    );

    await expect(
      store.validate(refreshed.payload, refreshed.token, Date.parse("2026-06-29T00:06:01.000Z")),
    ).resolves.toBe(false);
    await expect(
      store.validate(session.payload, session.token, Date.parse("2026-06-29T00:06:01.000Z")),
    ).resolves.toBe(false);
    expect(supabase.rows[0]?.revoked_at).toBe("2026-06-29T00:06:00.000Z");
  });
});
