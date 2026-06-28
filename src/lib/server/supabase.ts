import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { getServerEnv } from "./env";

export function createServiceRoleSupabaseClient() {
  const env = getServerEnv();

  return createClient<Database>(env.nextPublicSupabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
