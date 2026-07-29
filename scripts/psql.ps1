if ($args.Count -lt 1) {
  throw "A database URL is required."
}

$databaseUrl = [System.Uri][string]$args[0]
$psqlArguments = @($args | Select-Object -Skip 1)
if ($databaseUrl.Scheme -notin @("postgres", "postgresql") -or
    $databaseUrl.Host -notin @("127.0.0.1", "localhost")) {
  throw "Refusing to use the Docker psql fallback for a non-local target."
}

$container = $env:KARAOKE_LOCAL_DB_CONTAINER
if (-not $container -or $container -notmatch '^supabase_db_[a-zA-Z0-9_-]+$') {
  throw "The canonical local database container was not verified."
}

$fileIndex = [Array]::IndexOf($psqlArguments, "-f")
if ($fileIndex -ge 0) {
  if ($fileIndex + 1 -ge $psqlArguments.Count) {
    throw "psql -f requires a file path."
  }
  $sqlPath = $psqlArguments[$fileIndex + 1]
  $forwarded = @()
  for ($index = 0; $index -lt $psqlArguments.Count; $index++) {
    if ($index -ne $fileIndex -and $index -ne ($fileIndex + 1)) {
      $forwarded += $psqlArguments[$index]
    }
  }
  Get-Content -Raw -LiteralPath $sqlPath |
    docker exec -i $container psql -U postgres -d postgres @forwarded
} else {
  docker exec -i $container psql -U postgres -d postgres @psqlArguments
}
exit $LASTEXITCODE
