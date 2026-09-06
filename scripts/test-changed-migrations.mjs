import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const base = process.env.BASE_SHA || process.argv[2];
const head = process.env.HEAD_SHA || process.argv[3] || "HEAD";
const files = execFileSync(
  "git",
  ["diff", "--name-only", "--diff-filter=AM", base, head, "--", "supabase/migrations"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
const contracts = JSON.parse(readFileSync("supabase/migration-tests.json", "utf8"));
const db = process.env.MIGRATION_TEST_DATABASE_URL;
if (!db || !["localhost", "127.0.0.1"].includes(new URL(db).hostname))
  throw Error("Migration tests require a disposable loopback database.");
for (const file of files) {
  const contract = contracts[file];
  if (!contract) throw Error(`Add a focused migration-test contract for ${file}.`);
  for (const sql of [...contract.setup, file, ...contract.tests]) {
    if (!sql.startsWith("supabase/") || sql.includes("..")) throw Error("Invalid test path.");
    execFileSync("psql", [db, "-v", "ON_ERROR_STOP=1", "-f", sql], { stdio: "inherit" });
  }
}
