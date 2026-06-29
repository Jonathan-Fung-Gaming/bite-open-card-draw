import { spawnSync } from "node:child_process";
import net from "node:net";

async function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;

      server.close(() => {
        if (!port) {
          reject(new Error("Could not allocate an e2e port."));
          return;
        }

        resolve(String(port));
      });
    });
  });
}

function run(command, args, env) {
  const executable = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : command;
  const finalArgs = process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
  const result = spawnSync(executable, finalArgs, {
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function sanitizeEnv(env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) => Boolean(key) && !key.startsWith("=") && typeof value === "string",
    ),
  );
}

const requestedArgs = process.argv.slice(2);
const e2ePort = process.env.E2E_PORT || (await findOpenPort());
const e2eBaseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${e2ePort}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const env = sanitizeEnv({
  ...process.env,
  E2E_PORT: e2ePort,
  E2E_BASE_URL: e2eBaseURL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || e2eBaseURL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "local-anon-key",
  TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL:
    process.env.TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL || "true",
  TOURNAMENT_TEST_PUBLIC_SITE_URL: process.env.TOURNAMENT_TEST_PUBLIC_SITE_URL || e2eBaseURL,
});

run(npmCommand, ["run", "build"], env);
run(npxCommand, ["playwright", ...requestedArgs], env);
