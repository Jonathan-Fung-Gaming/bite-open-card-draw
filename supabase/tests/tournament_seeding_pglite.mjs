// Focused new-migration runner; no prior migrations are replayed.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const modulePath = process.env.PGLITE_MODULE;
if (!modulePath) throw new Error("Set PGLITE_MODULE to a locally installed @electric-sql/pglite module. This runner only creates a disposable in-memory database.");
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const database = new PGlite();
try {
  for (const path of ["supabase/tests/tournament_seeding_baseline.sql", "supabase/migrations/20260926010000_tournament_seeding.sql", "supabase/tests/tournament_seeding_test.sql"]) {
    await database.exec(readFileSync(path, "utf8"));
    process.stdout.write(`PASS ${path}\n`);
  }
  const rollback = await database.query("select count(*)::int as count from tournament_seeding.events");
  if (rollback.rows[0].count !== 0) throw new Error("Test rollback left data behind");
  process.stdout.write("PASS focused migration SQL, ACLs, source preservation, CAS, replay, rate limits, sessions, rollback\n");
} catch (error) { process.stderr.write(`FAIL ${error.message}\n${error.where || ""}\n`); process.exitCode = 1; }
finally { await database.close(); }
