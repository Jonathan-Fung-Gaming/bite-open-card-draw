import "server-only";
import type { Json } from "@/lib/db/database.types";
import {
  OPERATIONAL_STATE_SCHEMA_VERSION,
  type OperationalStateSnapshot,
} from "@/lib/persistence/operational-state";
import type { OperationalStateRepository } from "@/lib/persistence/repository";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";

const SNAPSHOT_ID = "primary";

type SupabaseError = {
  message: string;
};

type SnapshotTableClient = {
  select(columns: string): {
    eq(column: string, value: string): {
      maybeSingle(): Promise<{
        data: { state: unknown } | null;
        error: SupabaseError | null;
      }>;
    };
  };
  upsert(row: Record<string, unknown>): Promise<{
    error: SupabaseError | null;
  }>;
};

type SnapshotSupabaseClient = {
  from(table: "tournament_state_snapshots"): SnapshotTableClient;
};

function createSnapshotSupabaseClient() {
  return createServiceRoleSupabaseClient() as unknown as SnapshotSupabaseClient;
}

export class SupabaseOperationalStateRepository implements OperationalStateRepository {
  async load() {
    const supabase = createSnapshotSupabaseClient();
    const { data, error } = await supabase
      .from("tournament_state_snapshots")
      .select("state")
      .eq("id", SNAPSHOT_ID)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not load tournament state from Supabase: ${error.message}`);
    }

    return (data?.state as OperationalStateSnapshot | null) ?? null;
  }

  async save(snapshot: OperationalStateSnapshot) {
    const supabase = createSnapshotSupabaseClient();
    const { error } = await supabase.from("tournament_state_snapshots").upsert({
      id: SNAPSHOT_ID,
      schema_version: OPERATIONAL_STATE_SCHEMA_VERSION,
      state: snapshot as unknown as Json,
      updated_at: snapshot.savedAt,
    });

    if (error) {
      throw new Error(`Could not persist tournament state to Supabase: ${error.message}`);
    }
  }
}
