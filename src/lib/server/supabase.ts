import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { getServerEnv } from "./env";

const SUPABASE_READ_RETRY_DELAYS_MS = [750, 2_000, 5_000] as const;
const SUPABASE_READ_RETRY_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504, 522, 524]);
const SUPABASE_SAFE_READ_METHODS = new Set(["GET", "HEAD"]);
const SUPABASE_SAFE_READ_RPC_PATHS = new Set(["/rest/v1/rpc/normalized_database_time"]);

function getSupabaseFetchMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) {
    return init.method.toUpperCase();
  }

  return typeof Request !== "undefined" && input instanceof Request
    ? input.method.toUpperCase()
    : "GET";
}

function isSupabaseReadRetryEligible(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  attempt: number,
) {
  const method = getSupabaseFetchMethod(input, init);

  return (
    attempt < SUPABASE_READ_RETRY_DELAYS_MS.length &&
    (SUPABASE_SAFE_READ_METHODS.has(method) ||
      (method === "POST" && isSafeSupabaseReadRpc(input)))
  );
}

function isSafeSupabaseReadRpc(input: RequestInfo | URL) {
  const url =
    typeof input === "string"
      ? new URL(input)
      : input instanceof URL
        ? input
        : new URL(input.url);

  return SUPABASE_SAFE_READ_RPC_PATHS.has(url.pathname);
}

async function waitForSupabaseReadRetry(attempt: number) {
  await new Promise((resolve) => setTimeout(resolve, SUPABASE_READ_RETRY_DELAYS_MS[attempt]));
}

async function supabaseServerFetch(input: RequestInfo | URL, init?: RequestInit) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(input, init);

      if (
        SUPABASE_READ_RETRY_STATUS_CODES.has(response.status) &&
        isSupabaseReadRetryEligible(input, init, attempt)
      ) {
        await response.body?.cancel().catch(() => undefined);
        await waitForSupabaseReadRetry(attempt);
        continue;
      }

      return response;
    } catch (error) {
      if (!isSupabaseReadRetryEligible(input, init, attempt)) {
        throw error;
      }

      await waitForSupabaseReadRetry(attempt);
    }
  }
}

export function createServiceRoleSupabaseClient() {
  const env = getServerEnv();

  return createClient<Database>(env.nextPublicSupabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: supabaseServerFetch,
    },
  });
}
