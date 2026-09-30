// New migration only, isolated Docker database. Never targets the hosted Supabase project.
import { spawn, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const container = process.env.CROSSPLAY_TEST_CONTAINER || "crossplay-test-db";
if (!/^crossplay-test-[a-z0-9-]+$/.test(container)) throw Error("Use an isolated Crossplay test container.");
const database = `crossplay_clock_${Date.now()}`;
execFileSync("docker", ["exec", container, "createdb", "-U", "postgres", database]);
const command = ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
function sql(source) {
  return execFileSync("docker", command, { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
for (const path of ["supabase/tests/crossplay_baseline.sql", "supabase/migrations/20260928010000_crossplay_schema.sql", "supabase/migrations/20260930020000_crossplay_shared_clock.sql", "supabase/tests/crossplay_clock_test.sql"]) sql(readFileSync(path, "utf8"));
const literal = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const owner = randomUUID(), tid = randomUUID(), round = randomUUID(), mid = randomUUID(), mid2 = randomUUID(), a = randomUUID(), b = randomUUID();
const organizer = { userId: owner }, shared = { matchSessionHash: "a".repeat(64) }, individual = { sessionHash: "b".repeat(64) };
sql(`insert into auth.users values('${owner}'); insert into crossplay.organizers(user_id) values('${owner}');
insert into crossplay.tournaments(id,slug,name,status,config,frozen_config,seed,started_at)
values('${tid}','clock-race','Clock race','active','{"roundCount":2,"penaltyIntervalSeconds":10,"penaltyPoints":2,"timeLimitSeconds":1200}',
'{"roundCount":2,"penaltyIntervalSeconds":10,"penaltyPoints":2,"timeLimitSeconds":1200}','fixture',now());
insert into crossplay.tournament_staff values('${tid}','${owner}','owner');
insert into crossplay.entrants(tournament_id,id,name,normalized_name,seed) values('${tid}','${a}','Alex Chen','alex chen',0),('${tid}','${b}','Robin Patel','robin patel',1);
insert into crossplay.rounds(tournament_id,id,number,status,engine_version,input_hash,input_version,input_snapshot) values('${tid}','${round}',1,'published','test','test',0,'{}');
insert into crossplay.matches(tournament_id,round_id,id,table_number,kind) values('${tid}','${round}','${mid}',1,'played');
insert into crossplay.match_sides values('${tid}','${round}','${mid}',1,'${a}'),('${tid}','${round}','${mid}',2,'${b}');
insert into crossplay.entrant_credentials(id,tournament_id,entrant_id,invite_hash,expires_at) values('${a}','${tid}','${a}','${"1".repeat(64)}',now()+interval '1 day');
insert into crossplay.entrant_sessions values('${individual.sessionHash}','${tid}','${a}','${a}',null,now()+interval '1 day');`);
function statement(name, payload, actor = shared, version = null, request = randomUUID()) {
  return `select crossplay.clock_execute(${literal(actor)},'${name}',${literal(payload)},'${request}',${version ?? "null"});`;
}
function run(name, payload, actor = shared, version = null) { return JSON.parse(sql(statement(name, payload, actor, version))); }
run("issue_match_link", { matchId: mid, inviteHash: "2".repeat(64) }, organizer);
run("claim_match_link", { matchId: mid, inviteHash: "2".repeat(64), sessionHash: shared.matchSessionHash }, {});

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
async function race(firstSql, secondSql, expectedError) {
  const first = startPsql();
  first.proc.stdin.write(`begin; ${firstSql}\n\\echo FIRST_WRITTEN\n`);
  await first.marker("FIRST_WRITTEN");
  const second = startPsql();
  second.proc.stdin.end(secondSql);
  let blocked = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    blocked = sql("select exists(select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock')") === "t";
    if (blocked) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  first.proc.stdin.end("commit;\n");
  const [one, two] = await Promise.all([first.completion, second.completion]);
  assert.equal(blocked, true, "second backend observed waiting on actual PostgreSQL lock");
  assert.equal(one.code, 0, one.stderr);
  if (expectedError) {
    assert.notEqual(two.code, 0, "conflicting mutation must fail");
    assert.match(two.stderr, new RegExp(expectedError));
  } else {
    assert.equal(two.code, 0, two.stderr);
    assert.deepEqual(JSON.parse(one.stdout.split("\n")[0]), JSON.parse(two.stdout.trim()), "idempotent replay returns identical snapshot");
  }
}

const controller = randomUUID();
await race(statement("claim_clock", { matchId: mid, controllerId: controller }), statement("claim_clock", { matchId: mid, controllerId: randomUUID() }), "CONTROLLER_CONFLICT");
assert.equal(sql(`select count(*) from crossplay.match_starts where match_id='${mid}'`), "1", "only one saved starter");
const state = JSON.parse(sql(`select crossplay.clock_read(${literal(shared)},'${mid}')`));
const start = { matchId: mid, controllerId: controller, epoch: 1, events: [{ sequence: 1, kind: "start", side: state.state.activeSide, atMs: 1000, elapsedMs: 0 }] };
const request = randomUUID();
await race(statement("append_events", start, shared, 0, request), statement("append_events", start, shared, 0, request), null);
const switchPayload = { matchId: mid, controllerId: controller, epoch: 1, events: [{ sequence: 2, kind: "switch", side: state.state.activeSide, atMs: 1100, elapsedMs: 100 }] };
await race(statement("append_events", switchPayload, shared, 1), statement("append_events", { ...switchPayload, events: [{ ...switchPayload.events[0], elapsedMs: 200 }] }, shared, 1), "STALE_CLOCK_VERSION");
assert.equal(sql(`select used_ms1+used_ms2 from crossplay.match_clock_sessions where match_id='${mid}'`), "100", "losing writer cannot add time");

const secondRound = randomUUID();
sql(`insert into crossplay.rounds(tournament_id,id,number,status,engine_version,input_hash,input_version,input_snapshot) values('${tid}','${secondRound}',2,'published','test','test',0,'{}');
insert into crossplay.matches(tournament_id,round_id,id,table_number,kind) values('${tid}','${secondRound}','${mid2}',1,'played');
insert into crossplay.match_sides values('${tid}','${secondRound}','${mid2}',1,'${a}'),('${tid}','${secondRound}','${mid2}',2,'${b}');`);
const manualReport = `select crossplay.execute(${literal(individual)},'submit_report',${literal({ tournamentId: tid, matchId: mid2, expectedRevision: 0, raw1: 401, raw2: 399, overtime1: 0, overtime2: 0 })},'${randomUUID()}',null);`;
await race(statement("claim_clock", { matchId: mid2, controllerId: randomUUID() }, organizer), manualReport, "CLOCK_REPORT_REQUIRED");
assert.equal(sql(`select count(*) from crossplay.match_reports where match_id='${mid2}'`), "0", "concurrent manual report cannot bypass clock rules");
console.log(JSON.stringify({ database, focusedMigrationChecks: "PASS", controllerRace: "PASS", idempotentReplayRace: "PASS", divergentTimelineRace: "PASS", manualReportRace: "PASS" }));
