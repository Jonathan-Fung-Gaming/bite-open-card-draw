param(
  [string]$DatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)

$ErrorActionPreference = "Stop"

$parsed = [System.Uri]$DatabaseUrl
if ($parsed.Scheme -notin @("postgres", "postgresql") -or
    $parsed.Host -notin @("127.0.0.1", "localhost")) {
  throw "Refusing to run destructive Pumbility database tests against a non-local target."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "psql or Docker is required. Start the canonical local Supabase stack and retry."
  }

  $config = Get-Content -Raw (Join-Path $repoRoot "supabase/config.toml")
  $projectId = [regex]::Match(
    $config, '(?m)^project_id\s*=\s*"([a-zA-Z0-9_-]+)"'
  ).Groups[1].Value
  $configuredPort = [regex]::Match(
    $config, '(?ms)^\[db\].*?^port\s*=\s*(\d+)'
  ).Groups[1].Value
  if (-not $projectId -or -not $configuredPort -or $parsed.Port -ne [int]$configuredPort) {
    throw "The Docker psql fallback requires the canonical configured local database port."
  }

  $container = "supabase_db_$projectId"
  $runningContainer = (& docker ps --filter "name=^/$container`$" `
    --filter "status=running" --format "{{.Names}}" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $runningContainer -ne $container) {
    throw "The canonical local Supabase database container is not running."
  }

  $env:KARAOKE_LOCAL_DB_CONTAINER = $container
  $env:PATH = "$PSScriptRoot$([IO.Path]::PathSeparator)$env:PATH"
  if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    throw "The local Docker psql fallback could not be resolved."
  }
}

$schemaTest = Join-Path $repoRoot "supabase/tests/pumbility_schema_test.sql"
& psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $schemaTest
if ($LASTEXITCODE -ne 0) { throw "Pumbility schema/security/behavior tests failed." }

$rollbackTest = Join-Path $repoRoot "supabase/tests/pumbility_rollback_rehearsal.sql"
& psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $rollbackTest
if ($LASTEXITCODE -ne 0) { throw "Pumbility compensating rollback rehearsal failed." }

function Invoke-ClaimRace {
  param(
    [string]$FirstSql,
    [string]$SecondSql,
    [string]$WhereSql,
    [string]$Description
  )

  & psql $DatabaseUrl -v ON_ERROR_STOP=1 -c "delete from pumbility.jobs where external_key like 'race-test-%';"
  if ($LASTEXITCODE -ne 0) { throw "$Description cleanup failed." }

  $first = Start-Job -ScriptBlock {
    param($Url, $Sql)
    & psql $Url -v ON_ERROR_STOP=1 -tA -c $Sql
    if ($LASTEXITCODE -ne 0) { throw "first claim failed" }
  } -ArgumentList $DatabaseUrl, $FirstSql
  $second = Start-Job -ScriptBlock {
    param($Url, $Sql)
    & psql $Url -v ON_ERROR_STOP=1 -tA -c $Sql
    if ($LASTEXITCODE -ne 0) { throw "second claim failed" }
  } -ArgumentList $DatabaseUrl, $SecondSql

  $jobs = @($first, $second)
  $jobs | Wait-Job | Out-Null
  foreach ($job in $jobs) {
    Receive-Job $job
    if ($job.State -ne "Completed") { throw "$Description claim worker failed: $($job.State)" }
  }
  $jobs | Remove-Job

  $count = (& psql $DatabaseUrl -v ON_ERROR_STOP=1 -tA -c `
    "select count(*) from pumbility.jobs where $WhereSql;") | Out-String
  if ($LASTEXITCODE -ne 0 -or $count.Trim() -ne "1") {
    throw "$Description created more or fewer than one running owner."
  }
}

$globalOne = @"
select pumbility.claim_job(
  'race-test-global-a', 'analysis', 'prepare', 'phoenix2', '{}'::jsonb, 'race-a', 300
);
"@
$globalTwo = @"
select pumbility.claim_job(
  'race-test-global-b', 'analysis', 'prepare', 'phoenix2', '{}'::jsonb, 'race-b', 300
);
"@
Invoke-ClaimRace $globalOne $globalTwo `
  "kind='analysis' and status='running' and external_key like 'race-test-%'" `
  "Global analysis race"

$playerOne = @"
select pumbility.claim_job(
  'race-test-player-a', 'player_recommendation', 'fetch', 'phoenix2',
  jsonb_build_object('playerKey', 'race-player'), 'race-a', 300
);
"@
$playerTwo = @"
select pumbility.claim_job(
  'race-test-player-b', 'player_recommendation', 'fetch', 'phoenix2',
  jsonb_build_object('playerKey', 'race-player'), 'race-b', 300
);
"@
Invoke-ClaimRace $playerOne $playerTwo `
  "kind='player_recommendation' and status='running' and payload->>'playerKey'='race-player'" `
  "Same-player recommendation race"

& psql $DatabaseUrl -v ON_ERROR_STOP=1 -c "delete from pumbility.jobs where external_key like 'race-test-%';"
if ($LASTEXITCODE -ne 0) { throw "Pumbility concurrency cleanup failed." }

Write-Output "Pumbility schema, security, job, publication, and concurrency tests passed."
