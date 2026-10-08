// Focused table/device races against an already migrated disposable database.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const container = process.env.CROSSPLAY_TEST_CONTAINER ?? 'crossplay-test-clock-smoke';
const database = process.env.CROSSPLAY_TABLES_DATABASE;
if (!/^crossplay-test-[a-z0-9-]+$/.test(container) || !/^crossplay_tables_[a-z0-9_]+$/.test(database ?? '')) throw Error('Use the isolated table database.');
const inspected = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
assert(inspected.Config.Image.startsWith('postgres:17') && inspected.HostConfig.PortBindings['5432/tcp'].every(p => p.HostIp === '127.0.0.1'));
const args = ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
const sql = statement => execFileSync('docker', args, { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const json = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
assert.equal(sql('select crossplay.tables_version()'), '20261008030000');
const owner = randomUUID(), actor = { userId: owner };
sql(`insert into auth.users(id) values('${owner}'); insert into crossplay.organizers(user_id) values('${owner}');`);
function fixture() {
  const tid = randomUUID(), rid = randomUUID(), mid = randomUUID(), a = randomUUID(), b = randomUUID(), controller = randomUUID(), device = randomUUID();
  const session = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  const cfg = json({ roundCount: 2, timeLimitSeconds: 1200, penaltyIntervalSeconds: 10, penaltyPoints: 2 });
  sql(`insert into crossplay.tournaments(id,slug,name,status,config,frozen_config,seed,started_at) values('${tid}','race-${tid}','Tables race','active',${cfg},${cfg},'fixture',now());
    insert into crossplay.tournament_staff values('${tid}','${owner}','owner');
    insert into crossplay.entrants(tournament_id,id,name,normalized_name,seed) values('${tid}','${a}','Alex','alex',1),('${tid}','${b}','Robin','robin',2);
    insert into crossplay.rounds(tournament_id,id,number,status,engine_version,input_hash,input_version,input_snapshot) values('${tid}','${rid}',1,'published','fixture','fixture',0,'{}');
    insert into crossplay.matches(tournament_id,round_id,id,table_number,kind) values('${tid}','${rid}','${mid}',1,'played');
    insert into crossplay.match_sides values('${tid}','${rid}','${mid}',1,'${a}'),('${tid}','${rid}','${mid}',2,'${b}');
    select crossplay.table_execute(${json(actor)},'configure_tables',${json({tournamentId:tid,numbers:[1,2]})},'${randomUUID()}',0);
    select crossplay.table_execute(${json(actor)},'assign_device',${json({tournamentId:tid,deviceId:device,label:'Phone',tableNumber:1})},'${randomUUID()}',1);
    select crossplay.table_enter_match(${json(actor)},${json({matchId:mid,deviceId:device,controllerId:controller,expectedOperationsVersion:2,sessionHash:session,inviteHash:session})},'${randomUUID()}');`);
  return { tid, rid, mid, controller, device, session };
}
const execute = (f, command, extra = {}, version = 1) => `select crossplay.execute(${json(actor)},'${command}',${json({ tournamentId: f.tid, confirmationName: 'Tables race', ...extra })},'${randomUUID()}',${version});`;
const append = f => `select crossplay.clock_execute(${json({matchSessionHash:f.session})},'append_events',${json({ matchId: f.mid, controllerId: f.controller, epoch: 1, events: [{ sequence: 1, kind: 'start', atMs: 1000, elapsedMs: 0 }] })},'${randomUUID()}',0);`;
const replace = f => `select crossplay.table_enter_match(${json(actor)},${json({matchId:f.mid,deviceId:randomUUID(),controllerId:randomUUID(),expectedOperationsVersion:2,expectedClockVersion:0,expectedEpoch:1,mode:'replace',reason:'Replacement race',sessionHash:randomUUID().replaceAll('-','')+randomUUID().replaceAll('-',''),inviteHash:randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','')})},'${randomUUID()}');`;
const release = f => `select crossplay.table_enter_match(${json(actor)},${json({matchId:f.mid,deviceId:f.device,controllerId:f.controller,expectedOperationsVersion:2,expectedClockVersion:0,expectedEpoch:1,mode:'release',reason:'Release race'})},'${randomUUID()}');`;
const move = (f, version=2) => `select crossplay.table_execute(${json(actor)},'move_match',${json({tournamentId:f.tid,matchId:f.mid,targetTable:2,reason:'Move race'})},'${randomUUID()}',${version});`;
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
let f = fixture(); await race('replacement before append', replace(f), append(f), 'FORBIDDEN');
f = fixture(); await race('append before replacement', append(f), replace(f), 'STALE_CLOCK_VERSION');
f = fixture(); await race('competing replacements', replace(f), replace(f), 'STALE_TABLE_VERSION');
f = fixture(); await race('replacement before report', replace(f), `select crossplay.clock_execute(${json({matchSessionHash:f.session})},'submit_shared_report',${json({matchId:f.mid,raw1:401,raw2:399,expectedRevision:0,clockVersion:0})},'${randomUUID()}');`, 'FORBIDDEN');
f = fixture(); await race('final result before replacement', execute(f,'finalize_result',{matchId:f.mid,expectedRevision:0,kind:'played',raw1:401,raw2:399,overtime1:0,overtime2:0,reason:'Verified'}), replace(f), 'RESULT_LOCKED');
f = fixture(); await race('archive before replacement', execute(f,'archive_tournament'), replace(f), 'TOURNAMENT_ARCHIVED');
f = fixture(); await race('reset before replacement', execute(f,'reset_tournament'), replace(f), 'TOURNAMENT_NOT_ACTIVE');
f = fixture(); await race('replacement before stale move', replace(f), move(f), 'STALE_TABLE_VERSION');
f = fixture(); await race('release before move', release(f), move(f,3));
assert.equal(sql(`select table_number from crossplay.match_locations where match_id='${f.mid}'`),'2');
f = fixture(); sql(release(f));
const open = `select crossplay.table_enter_match(${json(actor)},${json({matchId:f.mid,deviceId:f.device,controllerId:f.controller,expectedOperationsVersion:3})},'${randomUUID()}');`;
await race('move before stale open', move(f,3), open, 'STALE_TABLE_VERSION');
console.log('Table/device observed-lock races passed. Synthetic records remain only in the disposable database.');
