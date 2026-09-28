// Dedicated Docker Postgres 17 only. Creates a fresh DB and never resets an existing database.
// Run: node supabase/tests/crossplay_concurrency_test.mjs
import { spawn, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const container = process.env.CROSSPLAY_TEST_CONTAINER || "crossplay-test-db";
if (!/^crossplay-test-[a-z0-9-]+$/.test(container)) throw Error("Use an explicitly isolated Crossplay test container.");
const database = `crossplay_race_${Date.now()}`;
execFileSync("docker", ["exec", container, "createdb", "-U", "postgres", database]);
const command = ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
function sql(source) {
  return execFileSync("docker", command, { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const literal = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
for (const path of ["supabase/tests/crossplay_baseline.sql", "supabase/migrations/20260928010000_crossplay_schema.sql", "supabase/tests/crossplay_schema_test.sql"]) {
  sql(readFileSync(path, "utf8"));
}
const user = "10000000-0000-4000-8000-000000000009";
sql(`insert into auth.users values('${user}'); insert into crossplay.organizers(user_id) values('${user}');`);
const actor = { userId: user };
function statement(commandName, payload, identity = actor, requestId = randomUUID(), expectedVersion = null) {
  return `select crossplay.execute(${literal(identity)},'${commandName}',${literal(payload)},'${requestId}',${expectedVersion ?? "null"});`;
}
function run(commandName, payload, identity = actor) {
  const version = payload.tournamentId ? sql(`select version from crossplay.tournaments where id='${payload.tournamentId}'`) : null;
  return JSON.parse(sql(statement(commandName, payload, identity, randomUUID(), version)));
}
const created = run("create_tournament", { name: "Concurrency fixture", slug: "concurrency-fixture", config: { roundCount: 1, penaltyIntervalSeconds: 10, penaltyPoints: 2, timeLimitSeconds: null }, seed: "fixture" });
const tid = created.id;
const a = randomUUID(), b = randomUUID();
run("add_entrants", { tournamentId: tid, entrants: [{ id: a, name: "Alice", seed: 0 }, { id: b, name: "Bob", seed: 0 }] });
for (const [id, digit] of [[a, "a"], [b, "b"]]) {
  run("issue_invite", { tournamentId: tid, entrantId: id, inviteHash: digit.repeat(64) });
  run("claim_invite", { inviteHash: digit.repeat(64), sessionHash: (digit === "a" ? "c" : "d").repeat(64) }, {});
}
const round = run("generate_round", { tournamentId: tid, roundNumber: 1, pairs: [{ player1Id: a, player2Id: b }], engineVersion: "fixture", inputHash: "fixture" });
const version = sql(`select version from crossplay.tournaments where id='${tid}'`);

function startPsql() {
  const proc = spawn("docker", command, { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  proc.stdout.on("data", (chunk) => { stdout += chunk; });
  proc.stderr.on("data", (chunk) => { stderr += chunk; });
  const completion = new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
  async function marker(text) {
    const until = Date.now() + 10_000;
    while (!stdout.includes(text)) {
      if (proc.exitCode !== null || Date.now() > until) throw Error(`No marker ${text}: ${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  return { proc, completion, marker };
}
async function race(firstStatement, secondStatement, failure) {
  const first = startPsql();
  first.proc.stdin.write(`begin; ${firstStatement}\n\\echo FIRST_WRITTEN\n`);
  await first.marker("FIRST_WRITTEN");
  const second = startPsql();
  second.proc.stdin.end(secondStatement);
  // Observe the actual second backend waiting on PostgreSQL's lock before releasing the first.
  let blocked = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    blocked = sql("select exists(select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock')") === "t";
    if (blocked) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  first.proc.stdin.end("commit;\n");
  const [one, two] = await Promise.all([first.completion, second.completion]);
  assert.equal(blocked, true, "second transaction must wait on actual row/advisory lock");
  assert.equal(one.code, 0, one.stderr);
  assert.notEqual(two.code, 0, "conflicting mutation must fail");
  assert.match(two.stderr, new RegExp(failure));
}
const publish = { tournamentId: tid, roundId: round.roundId };
await race(statement("publish_round", publish, actor, randomUUID(), version), statement("publish_round", publish, actor, randomUUID(), version), "STALE_VERSION");
assert.equal(sql(`select count(*) from crossplay.rounds where tournament_id='${tid}' and status='published'`), "1");
assert.equal(sql(`select count(*) from crossplay.match_sides where tournament_id='${tid}'`), "2");
const mid = sql(`select id from crossplay.matches where tournament_id='${tid}'`);
const report = { tournamentId: tid, matchId: mid, expectedRevision: 0, raw1: 401, raw2: 399, overtime1: 20, overtime2: 0 };
const sessionA = { sessionHash: "c".repeat(64) }, sessionB = { sessionHash: "d".repeat(64) };
await race(statement("submit_report", report, sessionA), statement("submit_report", { ...report, raw1: 400 }, sessionB), "STALE_REVISION");
assert.equal(sql(`select count(*) from crossplay.match_reports where tournament_id='${tid}'`), "1");
assert.equal(sql(`select count(*) from crossplay.result_revisions where tournament_id='${tid}'`), "0");
const reportId = sql(`select current_report_id from crossplay.matches where tournament_id='${tid}' and id='${mid}'`);
run("confirm_report", { tournamentId: tid, matchId: mid, expectedRevision: 1, reportId }, sessionB);
assert.equal(sql(`select result->>'adjusted1' from crossplay.result_revisions where tournament_id='${tid}'`), "397");
assert.equal(sql(`select result->>'points2' from crossplay.result_revisions where tournament_id='${tid}'`), "2");
// Trusted request fingerprint survives server preprocessing differences after accepted mutation.
const requestId = randomUUID();
const before = sql(`select version from crossplay.tournaments where id='${tid}'`);
const payload = { tournamentId: tid, _requestHash: "fixture-http-request" };
const finished = sql(statement("finish_tournament", payload, actor, requestId, before));
assert.equal(sql(statement("finish_tournament", { ...payload, ignoredPreprocessingField: "changed" }, actor, requestId, before)), finished);
console.log(`Focused Crossplay PostgreSQL tests passed, including overlapping publication/report races and opponent confirmation (${database}).`);
