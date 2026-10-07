// Focused lifecycle races against an already migrated disposable database.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const container = process.env.CROSSPLAY_TEST_CONTAINER ?? 'crossplay-test-clock-smoke';
const database = process.env.CROSSPLAY_LIFECYCLE_DATABASE;
if (!/^crossplay-test-[a-z0-9-]+$/.test(container) || !/^crossplay_lifecycle_[a-z0-9_]+$/.test(database ?? '')) throw Error('Use the isolated lifecycle database.');
const inspected = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
assert(inspected.Config.Image.startsWith('postgres:17') && inspected.HostConfig.PortBindings['5432/tcp'].every(p => p.HostIp === '127.0.0.1'));
const args = ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
const sql = statement => execFileSync('docker', args, { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const json = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
assert.equal(sql('select crossplay.lifecycle_version()'), '20261008010000');
const owner = randomUUID(), actor = { userId: owner };
sql(`insert into auth.users(id) values('${owner}'); insert into crossplay.organizers(user_id) values('${owner}');`);
function fixture(draft = false) {
  const tid = randomUUID(), rid = randomUUID(), mid = randomUUID(), a = randomUUID(), b = randomUUID(), controller = randomUUID();
  const invite = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  const cfg = json({ roundCount: 2, timeLimitSeconds: 1200, penaltyIntervalSeconds: 10, penaltyPoints: 2 });
  sql(`insert into crossplay.tournaments(id,slug,name,status,config,frozen_config,seed,started_at) values('${tid}','race-${tid}','Lifecycle race','${draft ? 'draft' : 'active'}',${cfg},${draft ? 'null' : cfg},'fixture',${draft ? 'null' : 'now()'});
    insert into crossplay.tournament_staff values('${tid}','${owner}','owner');
    insert into crossplay.entrants(tournament_id,id,name,normalized_name,seed) values('${tid}','${a}','Alex','alex',1),('${tid}','${b}','Robin','robin',2);
    insert into crossplay.rounds(tournament_id,id,number,status,engine_version,input_hash,input_version,input_snapshot) values('${tid}','${rid}',1,'${draft ? 'draft' : 'published'}','fixture','fixture',0,'{}');
    insert into crossplay.matches(tournament_id,round_id,id,table_number,kind) values('${tid}','${rid}','${mid}',1,'played');
    insert into crossplay.match_sides values('${tid}','${rid}','${mid}',1,'${a}'),('${tid}','${rid}','${mid}',2,'${b}');
    insert into crossplay.entrant_credentials(tournament_id,entrant_id,invite_hash,expires_at) values('${tid}','${a}','${invite}',now()+interval '1 day');
    ${draft ? '' : `insert into crossplay.match_clock_sessions(tournament_id,match_id,rules,active_side,controller_id,controller_actor) values('${tid}','${mid}',${cfg},1,'${controller}','${owner}'); insert into crossplay.match_starts(tournament_id,match_id,entrant_id,method,counts) values('${tid}','${mid}','${a}','random','{}');`}`);
  return { tid, rid, mid, controller, invite };
}
const execute = (f, command, extra = {}, version = 0) => `select crossplay.execute(${json(actor)},'${command}',${json({ tournamentId: f.tid, confirmationName: 'Lifecycle race', ...extra })},'${randomUUID()}',${version});`;
const append = f => `select crossplay.clock_execute(${json(actor)},'append_events',${json({ matchId: f.mid, controllerId: f.controller, epoch: 1, events: [{ sequence: 1, kind: 'start', atMs: 1000, elapsedMs: 0, side: 1 }] })},'${randomUUID()}',0);`;
function connection() {
  const proc = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '';
  proc.stdout.on('data', data => { output += data; }); proc.stderr.on('data', data => { error += data; });
  const done = new Promise((resolve, reject) => { proc.once('error', reject); proc.once('exit', code => resolve({ code, output, error })); });
  return { proc, done, marker: async value => {
    const until = Date.now() + 10000;
    while (!output.includes(value)) { if (proc.exitCode !== null || Date.now() > until) throw Error(`Missing ${value}: ${error}`); await new Promise(resolve => setTimeout(resolve, 20)); }
  } };
}
async function race(label, firstStatement, secondStatement, expectedError) {
  const first = connection(); first.proc.stdin.write(`begin; ${firstStatement}\n\\echo OWNED_LOCK\n`); await first.marker('OWNED_LOCK');
  const second = connection(); second.proc.stdin.end(secondStatement);
  let blocked = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (sql("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'") !== '0') { blocked = true; break; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  first.proc.stdin.end('commit;\n');
  const [one, two] = await Promise.all([first.done, second.done]);
  assert.equal(one.code, 0, one.error); assert(blocked, `${label}: second request must actually wait`);
  if (expectedError) { assert.notEqual(two.code, 0); assert(two.error.includes(expectedError), `${label}: ${two.error}`); }
  else assert.equal(two.code, 0, two.error);
  console.log(`PASS ${label}`);
}
let f = fixture(); await race('reset before clock append', execute(f, 'reset_tournament'), append(f), 'NOT_FOUND');
f = fixture(); await race('delete before invitation claim', execute(f, 'delete_tournament'), `select crossplay.execute('{}','claim_invite',${json({ inviteHash: f.invite, sessionHash: 'd'.repeat(64) })},'${randomUUID()}');`, 'INVALID_INVITE');
f = fixture(true); await race('archive before publish', execute(f, 'archive_tournament'), execute(f, 'publish_round', { roundId: f.rid }), 'TOURNAMENT_ARCHIVED');
f = fixture(); await race('clock append before reset', append(f), execute(f, 'reset_tournament'));
assert.equal(sql(`select count(*) from crossplay.match_clock_sessions where tournament_id='${f.tid}'`), '0');
f = fixture(); await race('report before stale reset', execute(f, 'finalize_result', { matchId: f.mid, expectedRevision: 0, kind: 'played', raw1: 401, raw2: 399, overtime1: 20, overtime2: 0, reason: 'Local race fixture' }), execute(f, 'reset_tournament'), 'STALE_VERSION');
assert.equal(sql(`select status from crossplay.matches where id='${f.mid}'`), 'final');
f = fixture(); await race('archive before clock control', execute(f, 'archive_tournament'), `select crossplay.clock_execute(${json(actor)},'claim_clock',${json({ matchId: f.mid, controllerId: f.controller })},'${randomUUID()}');`, 'TOURNAMENT_ARCHIVED');
console.log('Lifecycle lock races passed. Synthetic records remain only in the disposable database.');
