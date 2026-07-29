param(
  [string]$DatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)

$ErrorActionPreference = "Stop"

$parsed = [System.Uri]$DatabaseUrl
if ($parsed.Scheme -notin @("postgres", "postgresql") -or $parsed.Host -notin @("127.0.0.1", "localhost")) {
  throw "Refusing to run destructive Karaoke Party database tests against a non-local target."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "psql or Docker is required. Start the canonical local Supabase stack and retry."
  }

  $config = Get-Content -Raw (Join-Path $repoRoot "supabase\config.toml")
  $projectId = [regex]::Match($config, '(?m)^project_id\s*=\s*"([a-zA-Z0-9_-]+)"').Groups[1].Value
  $configuredPort = [regex]::Match($config, '(?ms)^\[db\].*?^port\s*=\s*(\d+)').Groups[1].Value
  if (-not $projectId -or -not $configuredPort -or $parsed.Port -ne [int]$configuredPort) {
    throw "The Docker psql fallback requires the canonical configured local database port."
  }

  $container = "supabase_db_$projectId"
  $runningContainer = (& docker ps --filter "name=^/$container`$" --filter "status=running" --format "{{.Names}}" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $runningContainer -ne $container) {
    throw "Native psql is unavailable and the canonical local Supabase database container is not running."
  }

  $env:KARAOKE_LOCAL_DB_CONTAINER = $container
  $env:PATH = "$PSScriptRoot;$env:PATH"
  if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    throw "The local Docker psql fallback could not be resolved."
  }
}

$schemaTest = Join-Path $repoRoot "supabase\tests\karaoke_party_schema_test.sql"

& psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $schemaTest
if ($LASTEXITCODE -ne 0) { throw "Karaoke Party schema/security tests failed." }

& psql $DatabaseUrl -v ON_ERROR_STOP=1 -c "delete from public.karaoke_rooms where room_code='CDEFGHJ';"
if ($LASTEXITCODE -ne 0) { throw "Concurrency cleanup/setup guard failed." }

$setupSql = @'
select public.karaoke_create_room(
  'CDEFGHJ', '30000000-0000-4000-8000-000000000001', repeat('1',64), repeat('2',64),
  statement_timestamp() + interval '12 hours',
  '30000000-0000-4000-8000-000000000002', repeat('3',64)
);
select public.karaoke_join_room('CDEFGHJ', repeat('4',64), 'Alice',
  '30000000-0000-4000-8000-000000000003', repeat('4',64));
select public.karaoke_join_room('CDEFGHJ', repeat('5',64), 'Bob',
  '30000000-0000-4000-8000-000000000004', repeat('5',64));
select public.karaoke_add_song('CDEFGHJ', repeat('4',64), 'fffffffffff', 'A1', 'A',
  'https://i.ytimg.com/vi/fffffffffff/default.jpg', 120, statement_timestamp(),
  '30000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000006', repeat('6',64));
select public.karaoke_add_song('CDEFGHJ', repeat('5',64), 'ggggggggggg', 'B1', 'B',
  'https://i.ytimg.com/vi/ggggggggggg/default.jpg', 120, statement_timestamp(),
  '30000000-0000-4000-8000-000000000007',
  '30000000-0000-4000-8000-000000000008', repeat('7',64));
select public.karaoke_claim_controller('CDEFGHJ', repeat('1',64),
  '30000000-0000-4000-8000-000000000009', false,
  (select state_version from public.karaoke_rooms where room_code='CDEFGHJ'),
  '30000000-0000-4000-8000-000000000010', repeat('8',64));
select public.karaoke_claim_next_song('CDEFGHJ', repeat('1',64),
  '30000000-0000-4000-8000-000000000009',
  (select state_version from public.karaoke_rooms where room_code='CDEFGHJ'),
  '30000000-0000-4000-8000-000000000011', repeat('9',64));
select public.karaoke_mark_song_playing('CDEFGHJ', repeat('1',64),
  '30000000-0000-4000-8000-000000000009',
  (select current_song_id from public.karaoke_playback_state ps join public.karaoke_rooms r on r.id=ps.room_id where r.room_code='CDEFGHJ'),
  (select state_version from public.karaoke_rooms where room_code='CDEFGHJ'),
  '30000000-0000-4000-8000-000000000012', repeat('a',64));
'@

& psql $DatabaseUrl -v ON_ERROR_STOP=1 -c $setupSql
if ($LASTEXITCODE -ne 0) { throw "Concurrency setup failed." }

$holderSql = @'
begin;
select public.karaoke_lock_room((select id from public.karaoke_rooms where room_code='CDEFGHJ'));
select pg_sleep(15);
commit;
'@
$completionOne = @'
select public.karaoke_complete_and_select_next(
  'CDEFGHJ', repeat('1',64), '30000000-0000-4000-8000-000000000009',
  (select current_song_id from public.karaoke_playback_state ps join public.karaoke_rooms r on r.id=ps.room_id where r.room_code='CDEFGHJ'),
  (select state_version from public.karaoke_rooms where room_code='CDEFGHJ'), 'ended',
  '30000000-0000-4000-8000-000000000013', repeat('b',64));
'@
$completionTwo = @'
select public.karaoke_complete_and_select_next(
  'CDEFGHJ', repeat('1',64), '30000000-0000-4000-8000-000000000009',
  (select current_song_id from public.karaoke_playback_state ps join public.karaoke_rooms r on r.id=ps.room_id where r.room_code='CDEFGHJ'),
  (select state_version from public.karaoke_rooms where room_code='CDEFGHJ'), 'ended',
  '30000000-0000-4000-8000-000000000014', repeat('c',64));
'@

$holder = Start-Job -ScriptBlock {
  param($Url,$Sql)
  & psql $Url -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "holder psql failed" }
} -ArgumentList $DatabaseUrl,$holderSql

$lockObserved = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  $probe = & psql $DatabaseUrl -v ON_ERROR_STOP=1 -tA -c "select not pg_try_advisory_xact_lock(hashtextextended('karaoke-room:' || (select id::text from public.karaoke_rooms where room_code='CDEFGHJ'), 0));"
  if ($LASTEXITCODE -ne 0) { throw "Room-lock probe failed." }
  if (($probe | Out-String).Trim() -eq "t") {
    $lockObserved = $true
    break
  }
  Start-Sleep -Milliseconds 100
}
if (-not $lockObserved) { throw "Concurrency holder did not acquire the room lock." }

$first = Start-Job -ScriptBlock {
  param($Url,$Sql)
  & psql $Url -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "first completion psql failed" }
} -ArgumentList $DatabaseUrl,$completionOne
$second = Start-Job -ScriptBlock {
  param($Url,$Sql)
  & psql $Url -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "second completion psql failed" }
} -ArgumentList $DatabaseUrl,$completionTwo

$jobs = @($holder,$first,$second)
$jobs | Wait-Job | Out-Null
foreach ($job in $jobs) {
  Receive-Job $job
  if ($job.State -ne "Completed") { throw "A concurrency worker failed: $($job.State)" }
}
$jobs | Remove-Job

$verifySql = @'
do $$
declare
  v_room_id uuid;
begin
  select id into v_room_id from public.karaoke_rooms where room_code='CDEFGHJ';
  if (select count(*) from public.karaoke_song_requests where room_id=v_room_id and status='completed') <> 1 then
    raise exception 'duplicate completion completed more or fewer than one song';
  end if;
  if (select count(*) from public.karaoke_song_requests where room_id=v_room_id and status='selected') <> 1 then
    raise exception 'duplicate completion did not select exactly one next song';
  end if;
  if (select count(*) from public.karaoke_room_actions where room_id=v_room_id and action_type='complete_song') <> 1 then
    raise exception 'duplicate completion wrote more or fewer than one completion action';
  end if;
end $$;
delete from public.karaoke_rooms where room_code='CDEFGHJ';
'@

& psql $DatabaseUrl -v ON_ERROR_STOP=1 -c $verifySql
if ($LASTEXITCODE -ne 0) { throw "Karaoke Party concurrency assertions failed." }

& psql $DatabaseUrl -v ON_ERROR_STOP=1 -c "delete from public.karaoke_rooms where room_code='EFGHJKL';"
if ($LASTEXITCODE -ne 0) { throw "Cleanup/add concurrency guard failed." }

$cleanupSetupSql = @'
select public.karaoke_create_room(
  'EFGHJKL', '50000000-0000-4000-8000-000000000001', repeat('6',64), repeat('7',64),
  statement_timestamp() + interval '30 minutes',
  '50000000-0000-4000-8000-000000000002', repeat('9',64)
);
select public.karaoke_join_room('EFGHJKL', repeat('8',64), 'Cleanup Racer',
  '50000000-0000-4000-8000-000000000003', repeat('a',64));
'@

& psql $DatabaseUrl -v ON_ERROR_STOP=1 -c $cleanupSetupSql
if ($LASTEXITCODE -ne 0) { throw "Cleanup/add concurrency setup failed." }

$cleanupHolderSql = @'
begin;
select public.karaoke_lock_room((select id from public.karaoke_rooms where room_code='EFGHJKL'));
select pg_sleep(15);
commit;
'@
$cleanupWorkerSql = @'
do $$
declare
  v_result jsonb;
begin
  v_result := public.karaoke_cleanup_expired_rooms(
    statement_timestamp() + interval '1 hour', 500, interval '7 days');
  if not (v_result ? 'expiredRooms')
     or not (v_result ? 'purgedRooms')
     or not (v_result ? 'deletedSearchCacheRows')
     or not (v_result ? 'deletedRateLimitBuckets')
     or (v_result->>'expiredRooms')::integer < 1 then
    raise exception 'cleanup did not return the expected result or expire a room: %', v_result;
  end if;
end $$;
'@
$addWorkerSql = @'
do $$
begin
  begin
    perform public.karaoke_add_song(
      'EFGHJKL', repeat('8',64), 'hhhhhhhhhhh', 'Race Song', 'Race Artist',
      'https://i.ytimg.com/vi/hhhhhhhhhhh/default.jpg', 120, statement_timestamp(),
      '50000000-0000-4000-8000-000000000004',
      '50000000-0000-4000-8000-000000000005', repeat('b',64));
  exception when sqlstate '55000' then
    if sqlerrm <> 'room_closed_or_expired' then
      raise;
    end if;
  end;
end $$;
'@

$cleanupHolder = Start-Job -ScriptBlock {
  param($Url,$Sql)
  & psql $Url -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "cleanup holder psql failed" }
} -ArgumentList $DatabaseUrl,$cleanupHolderSql

$cleanupLockObserved = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  $probe = & psql $DatabaseUrl -v ON_ERROR_STOP=1 -tA -c "select not pg_try_advisory_xact_lock(hashtextextended('karaoke-room:' || (select id::text from public.karaoke_rooms where room_code='EFGHJKL'), 0));"
  if ($LASTEXITCODE -ne 0) { throw "Cleanup/add room-lock probe failed." }
  if (($probe | Out-String).Trim() -eq "t") {
    $cleanupLockObserved = $true
    break
  }
  Start-Sleep -Milliseconds 100
}
if (-not $cleanupLockObserved) { throw "Cleanup/add holder did not acquire the room lock." }

$cleanupWorker = Start-Job -ScriptBlock {
  param($Url,$Sql)
  & psql $Url -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "cleanup worker psql failed" }
} -ArgumentList $DatabaseUrl,$cleanupWorkerSql
$addWorker = Start-Job -ScriptBlock {
  param($Url,$Sql)
  & psql $Url -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "add worker psql failed" }
} -ArgumentList $DatabaseUrl,$addWorkerSql

$cleanupJobs = @($cleanupHolder,$cleanupWorker,$addWorker)
$cleanupJobs | Wait-Job | Out-Null
foreach ($job in $cleanupJobs) {
  Receive-Job $job
  if ($job.State -ne "Completed") { throw "A cleanup/add concurrency worker failed: $($job.State)" }
}
$cleanupJobs | Remove-Job

$cleanupVerifySql = @'
do $$
declare
  v_room_id uuid;
  v_room_status text;
  v_room_version bigint;
  v_song_count integer;
  v_add_action_count integer;
begin
  select id, status, state_version
  into v_room_id, v_room_status, v_room_version
  from public.karaoke_rooms
  where room_code='EFGHJKL';

  if v_room_id is null or v_room_status <> 'expired' or v_room_version not in (3, 4) then
    raise exception 'cleanup/add race left an invalid room state: id %, status %, version %',
      v_room_id, v_room_status, v_room_version;
  end if;
  if exists (
    select 1 from public.karaoke_rooms
    where id=v_room_id and (closed_at is null or expires_at > closed_at)
  ) then
    raise exception 'cleanup/add race did not close the expired room at its cleanup cutoff';
  end if;
  if exists (
    select 1 from public.karaoke_playback_state
    where room_id=v_room_id
      and (player_state <> 'idle' or current_song_id is not null
        or controller_instance_id is not null or controller_lease_expires_at is not null)
  ) then
    raise exception 'cleanup/add race left active playback or controller state';
  end if;
  if (select count(*) from public.karaoke_room_actions
      where room_id=v_room_id and action_type='expire_room') <> 1 then
    raise exception 'cleanup/add race did not write exactly one expire_room action';
  end if;

  select count(*) into v_song_count
  from public.karaoke_song_requests where room_id=v_room_id;
  select count(*) into v_add_action_count
  from public.karaoke_room_actions where room_id=v_room_id and action_type='add_song';

  if v_song_count = 0 then
    if v_add_action_count <> 0 or v_room_version <> 3 then
      raise exception 'cleanup-first outcome has invalid add action/version state';
    end if;
  elsif v_song_count = 1 then
    if v_add_action_count <> 1 or v_room_version <> 4 or exists (
      select 1 from public.karaoke_song_requests
      where room_id=v_room_id and (status <> 'removed' or finish_reason <> 'room_expired')
    ) then
      raise exception 'add-first outcome was not serialized and removed by cleanup';
    end if;
  else
    raise exception 'cleanup/add race inserted an unexpected number of songs: %', v_song_count;
  end if;
end $$;
delete from public.karaoke_rooms where room_code='EFGHJKL';
'@

& psql $DatabaseUrl -v ON_ERROR_STOP=1 -c $cleanupVerifySql
if ($LASTEXITCODE -ne 0) { throw "Karaoke Party cleanup/add concurrency assertions failed." }

Write-Output "Karaoke Party schema, security, queue, and concurrency tests passed."
