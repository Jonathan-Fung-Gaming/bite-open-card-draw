import "server-only";

type ServerEnv = {
  nextPublicSiteUrl: string;
  nextPublicSupabaseUrl: string;
  nextPublicSupabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  adminPasswordHash: string;
  sessionSecret: string;
};

function requireEnv(name: keyof NodeJS.ProcessEnv) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

export function getServerEnv(): ServerEnv {
  return {
    nextPublicSiteUrl: requireEnv("NEXT_PUBLIC_SITE_URL"),
    nextPublicSupabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    nextPublicSupabaseAnonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    adminPasswordHash: requireEnv("ADMIN_PASSWORD_HASH"),
    sessionSecret: requireEnv("SESSION_SECRET"),
  };
}
