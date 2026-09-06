import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
const base = process.env.BASE_SHA || process.argv[2];
const head = process.env.HEAD_SHA || process.argv[3] || "HEAD";
const paths = execFileSync("git", ["diff", "--name-only", base, head], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);
const changed = paths.some((p) => /^supabase\/migrations\/\d+_.+\.sql$/.test(p));
const support = (p) =>
  /^(supabase\/|docs\/|scripts\/(migration-scope|test-changed-migrations)\.mjs$|\.github\/workflows\/ci\.yml$|AGENTS\.md$)/.test(
    p,
  );
const migrationSupport = paths.some((p) =>
  /^(supabase\/|scripts\/(migration-scope|test-changed-migrations)\.mjs$|docs\/.*(?:schema|migration))/i.test(
    p,
  ),
);
const only = (changed || migrationSupport) && paths.every(support);
const output = `migration_changed=${changed}\nmigration_only=${only}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
else process.stdout.write(output);
