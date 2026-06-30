import "server-only";
import type { Database } from "@/lib/db/database.types";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";

type DatabaseTimeRpcClient = {
  rpc(
    functionName: "normalized_database_time",
    args: Record<string, never>,
  ): Promise<{
    data: Database["public"]["Functions"]["normalized_database_time"]["Returns"] | null;
    error: { message: string } | null;
  }>;
};

function shouldUseDatabaseTime() {
  return process.env.TOURNAMENT_STATE_BACKEND === "supabase";
}

export async function getAuthoritativeNowMs() {
  if (!shouldUseDatabaseTime()) {
    return Date.now();
  }

  const supabase = createServiceRoleSupabaseClient() as unknown as DatabaseTimeRpcClient;
  const { data, error } = await supabase.rpc("normalized_database_time", {});

  if (error) {
    throw new Error(`Could not read hosted Supabase database time: ${error.message}`);
  }

  const nowMs = Date.parse(data ?? "");

  if (!Number.isFinite(nowMs)) {
    throw new Error("Hosted Supabase database time returned an invalid timestamp.");
  }

  return nowMs;
}
