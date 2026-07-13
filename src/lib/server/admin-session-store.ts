import "server-only";
import { createHash } from "node:crypto";
import { ADMIN_SESSION_TTL_SECONDS, type AdminSessionPayload } from "@/lib/admin/session";
import type { Database } from "@/lib/db/database.types";
import { getTournamentEventId } from "@/lib/server/env";
import { getTournamentStateBackend } from "@/lib/server/persistence";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";

type AdminSessionRow = Database["public"]["Tables"]["admin_sessions"]["Row"];
type AdminSessionInsert = Database["public"]["Tables"]["admin_sessions"]["Insert"];

type SupabaseError = {
  message: string;
};

type AdminSessionSelectBuilder = {
  eq(column: string, value: string): AdminSessionSelectBuilder;
  maybeSingle(): Promise<{
    data: AdminSessionRow | null;
    error: SupabaseError | null;
  }>;
};

type AdminSessionUpdateBuilder = {
  eq(column: string, value: string): AdminSessionUpdateBuilder;
  gt(column: string, value: string): AdminSessionUpdateBuilder;
  is(column: string, value: null): AdminSessionUpdateBuilder;
  select(columns: string): AdminSessionUpdateBuilder;
  maybeSingle(): Promise<{
    data: AdminSessionRow | null;
    error: SupabaseError | null;
  }>;
};

type AdminSessionTableClient = {
  select(columns: string): AdminSessionSelectBuilder;
  insert(row: AdminSessionInsert): Promise<{
    error: SupabaseError | null;
  }>;
  update(row: Partial<AdminSessionInsert>): AdminSessionUpdateBuilder;
  upsert(row: AdminSessionInsert): Promise<{
    error: SupabaseError | null;
  }>;
};

export type AdminSessionSupabaseClient = {
  from(table: "admin_sessions"): AdminSessionTableClient;
};

type NormalizedAdminSessionStoreDependencies = {
  eventId?: string;
  supabase?: AdminSessionSupabaseClient;
};

function createAdminSessionSupabaseClient() {
  return createServiceRoleSupabaseClient() as unknown as AdminSessionSupabaseClient;
}

export function hashAdminSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function adminSessionExpiryIso(now = Date.now()) {
  return new Date(now + ADMIN_SESSION_TTL_SECONDS * 1000).toISOString();
}

function isoFromMs(value: number) {
  return new Date(value).toISOString();
}

function isSessionActive(row: AdminSessionRow, now = Date.now()) {
  return !row.revoked_at && Date.parse(row.expires_at) > now;
}

function tokenCarriesSessionId(token: string, sessionId: string) {
  const [encodedPayload] = token.split(".");

  if (!encodedPayload) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      sessionId?: unknown;
    };

    return payload.sessionId === sessionId;
  } catch {
    return false;
  }
}

export function shouldUseNormalizedAdminSessions() {
  return getTournamentStateBackend() === "supabase";
}

export class NormalizedAdminSessionStore {
  private readonly eventId: string;
  private readonly supabase: AdminSessionSupabaseClient;

  constructor(dependencies: NormalizedAdminSessionStoreDependencies = {}) {
    this.eventId = dependencies.eventId ?? getTournamentEventId();
    this.supabase = dependencies.supabase ?? createAdminSessionSupabaseClient();
  }

  async create(session: AdminSessionPayload, token: string) {
    const createdAt = isoFromMs(session.issuedAt);
    const { error } = await this.supabase.from("admin_sessions").insert({
      id: session.sessionId,
      event_id: this.eventId,
      session_token_hash: hashAdminSessionToken(token),
      created_at: createdAt,
      last_seen_at: createdAt,
      expires_at: isoFromMs(session.expiresAt),
      revoked_at: null,
    });

    if (error) {
      throw new Error(`Could not create normalized admin session: ${error.message}`);
    }
  }

  async validate(session: AdminSessionPayload, token: string, now = Date.now()) {
    const row =
      (await this.findByToken(token)) ??
      (tokenCarriesSessionId(token, session.sessionId)
        ? await this.findBySessionId(session.sessionId)
        : null);

    return Boolean(row && row.id === session.sessionId && isSessionActive(row, now));
  }

  async touch(input: {
    currentSession: AdminSessionPayload;
    currentToken: string;
    refreshedSession: AdminSessionPayload;
    refreshedToken: string;
    now?: number;
  }) {
    const now = input.now ?? Date.now();

    if (!tokenCarriesSessionId(input.currentToken, input.currentSession.sessionId)) {
      throw new Error("Admin session required.");
    }

    const { data, error } = await this.supabase
      .from("admin_sessions")
      .update({
        session_token_hash: hashAdminSessionToken(input.refreshedToken),
        last_seen_at: isoFromMs(now),
        expires_at: isoFromMs(input.refreshedSession.expiresAt),
      })
      .eq("event_id", this.eventId)
      .eq("id", input.currentSession.sessionId)
      .is("revoked_at", null)
      .gt("expires_at", isoFromMs(now))
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(`Could not refresh normalized admin session: ${error.message}`);
    }

    if (!data) {
      throw new Error("Admin session required.");
    }
  }

  async revoke(session: AdminSessionPayload, token: string, now = Date.now()) {
    const row =
      (await this.findByToken(token)) ??
      (tokenCarriesSessionId(token, session.sessionId)
        ? await this.findBySessionId(session.sessionId)
        : null);

    if (!row || row.id !== session.sessionId) {
      return;
    }

    const { error } = await this.supabase
      .from("admin_sessions")
      .update({
        last_seen_at: isoFromMs(now),
        revoked_at: isoFromMs(now),
      })
      .eq("event_id", this.eventId)
      .eq("id", row.id)
      .is("revoked_at", null)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(`Could not revoke normalized admin session: ${error.message}`);
    }
  }

  private async findByToken(token: string) {
    const { data, error } = await this.supabase
      .from("admin_sessions")
      .select("*")
      .eq("event_id", this.eventId)
      .eq("session_token_hash", hashAdminSessionToken(token))
      .maybeSingle();

    if (error) {
      throw new Error(`Could not load normalized admin session: ${error.message}`);
    }

    return data;
  }

  private async findBySessionId(sessionId: string) {
    const { data, error } = await this.supabase
      .from("admin_sessions")
      .select("*")
      .eq("event_id", this.eventId)
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not load normalized admin session: ${error.message}`);
    }

    return data;
  }
}

export function createNormalizedAdminSessionStore(
  dependencies: NormalizedAdminSessionStoreDependencies = {},
) {
  return new NormalizedAdminSessionStore(dependencies);
}
