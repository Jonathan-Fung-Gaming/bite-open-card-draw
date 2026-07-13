import "server-only";

type ServerEnv = {
  nextPublicSiteUrl: string;
  nextPublicSupabaseUrl: string;
  nextPublicSupabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  adminPasswordHash: string;
  sessionSecret: string;
  tournamentEventId: string;
};

type EnvRecord = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  NEXT_PUBLIC_E2E_DISABLE_ADMIN_SESSION_HEARTBEAT?: string;
  NEXT_PUBLIC_E2E_DISABLE_HOST_HEARTBEAT?: string;
  TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL?: string;
};

export function isProductionDeploymentEnv(env: EnvRecord = process.env) {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

export function assertProductionTestFlagsDisabled(env: EnvRecord = process.env) {
  if (!isProductionDeploymentEnv(env)) {
    return;
  }

  for (const flag of [
    "TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL",
    "NEXT_PUBLIC_E2E_DISABLE_ADMIN_SESSION_HEARTBEAT",
    "NEXT_PUBLIC_E2E_DISABLE_HOST_HEARTBEAT",
  ] as const) {
    if (env[flag] === "true") {
      throw new Error(`${flag} cannot be enabled in production deployment environments.`);
    }
  }
}

function requireEnv(name: keyof NodeJS.ProcessEnv) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

export function getServerEnv(): ServerEnv {
  assertProductionTestFlagsDisabled();

  return {
    nextPublicSiteUrl: requireEnv("NEXT_PUBLIC_SITE_URL"),
    nextPublicSupabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    nextPublicSupabaseAnonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    adminPasswordHash: requireEnv("ADMIN_PASSWORD_HASH"),
    sessionSecret: requireEnv("SESSION_SECRET"),
    tournamentEventId: requireEnv("TOURNAMENT_EVENT_ID"),
  };
}

export function getTournamentEventId() {
  assertProductionTestFlagsDisabled();

  const eventId = process.env.TOURNAMENT_EVENT_ID?.trim();

  if (!eventId) {
    throw new Error("Missing required server environment variable: TOURNAMENT_EVENT_ID");
  }

  return eventId;
}
