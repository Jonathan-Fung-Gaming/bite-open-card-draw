import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const repositoryRoot = resolve(import.meta.dirname, "..");
const config = readFileSync(resolve(repositoryRoot, "supabase", "config.toml"), "utf8");
const projectId = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/mu.exec(config)?.[1];

if (!projectId) {
  console.error("The local Supabase project id is missing or invalid.");
  process.exit(1);
}

const executable = process.platform === "win32" ? process.execPath : "npx";
const cliArguments =
  process.platform === "win32"
    ? [
        resolve(process.execPath, "..", "node_modules", "npm", "bin", "npx-cli.js"),
        "supabase",
        "status",
        "--output",
        "env",
      ]
    : ["supabase", "status", "--output", "env"];
const status = spawnSync(executable, cliArguments, {
  cwd: repositoryRoot,
  encoding: "utf8",
  shell: false,
  stdio: ["ignore", "pipe", "pipe"],
});

if (status.status !== 0) {
  console.error("Local Supabase is unavailable. Start it, reset the database, and retry.");
  process.exit(status.status ?? 1);
}

const local = {};
for (const line of status.stdout.split(/\r?\n/u)) {
  const match = /^([A-Z_]+)="(.*)"$/u.exec(line.trim());
  if (match) local[match[1]] = match[2];
}

const apiUrl = new URL(local.API_URL);
if (!new Set(["127.0.0.1", "localhost", "::1"]).has(apiUrl.hostname)) {
  console.error("Refusing to run integration tests against a non-loopback host.");
  process.exit(1);
}

if (!local.ANON_KEY || !local.SERVICE_ROLE_KEY) {
  console.error("Local Supabase did not provide the required API keys.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--test", resolve(repositoryRoot, "tests", "protein-phase7-weight-history.integration.mjs")],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      SUPABASE_TEST_ANON_KEY: local.ANON_KEY,
      SUPABASE_TEST_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
      SUPABASE_TEST_URL: apiUrl.href.replace(/\/$/u, ""),
    },
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
