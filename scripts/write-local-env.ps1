param(
  [string]$SiteUrl = "http://localhost:3000",
  [string]$SupabaseUrl = "",
  [string]$PublishableKey = "",
  [string]$OutputPath = ".env.local",
  [switch]$Overwrite,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
  Write-Host "Writes local environment values to .env.local."
  Write-Host ""
  Write-Host "Usage:"
  Write-Host "  rtk powershell -NoProfile -ExecutionPolicy Bypass -File scripts/write-local-env.ps1"
  Write-Host ""
  Write-Host "Optional prefilled browser-safe values:"
  Write-Host "  rtk powershell -NoProfile -ExecutionPolicy Bypass -File scripts/write-local-env.ps1 -SupabaseUrl <url> -PublishableKey <key>"
  Write-Host ""
  Write-Host "Use -Overwrite to replace an existing .env.local."
  exit 0
}

function Read-PlainValue {
  param(
    [string]$Prompt,
    [string]$Default = ""
  )

  if ([string]::IsNullOrWhiteSpace($Default)) {
    $value = Read-Host $Prompt
    if ($null -eq $value) {
      throw "No input received for $Prompt. Run this script in an interactive PowerShell terminal."
    }
    return $value.Trim()
  }

  $value = Read-Host "$Prompt [$Default]"
  if ($null -eq $value) {
    throw "No input received for $Prompt. Run this script in an interactive PowerShell terminal."
  }
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }

  return $value.Trim()
}

function Read-SecretValue {
  param([string]$Prompt)

  $secure = Read-Host $Prompt -AsSecureString
  if ($secure.Length -eq 0) {
    return ""
  }

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function New-SessionSecret {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes)
}

if ((Test-Path -LiteralPath $OutputPath) -and -not $Overwrite) {
  throw "$OutputPath already exists. Re-run with -Overwrite if you want to replace it."
}

Write-Host "This writes local environment values to $OutputPath."
Write-Host "Do not commit this file. It is ignored by .gitignore."
Write-Host ""

$siteUrlValue = Read-PlainValue -Prompt "NEXT_PUBLIC_SITE_URL" -Default $SiteUrl
$supabaseUrlValue = Read-PlainValue -Prompt "NEXT_PUBLIC_SUPABASE_URL" -Default $SupabaseUrl
$publishableKeyValue = Read-PlainValue -Prompt "NEXT_PUBLIC_SUPABASE_ANON_KEY / publishable key" -Default $PublishableKey

Write-Host ""
Write-Host "The next values are server-only. Input is hidden. Leave blank if you do not have one yet."

$serviceRoleKeyValue = Read-SecretValue -Prompt "SUPABASE_SERVICE_ROLE_KEY"
$adminPasswordHashValue = Read-SecretValue -Prompt "ADMIN_PASSWORD_HASH"
$sessionSecretValue = Read-SecretValue -Prompt "SESSION_SECRET (blank to generate)"

if ([string]::IsNullOrWhiteSpace($sessionSecretValue)) {
  $sessionSecretValue = New-SessionSecret
  Write-Host "Generated SESSION_SECRET."
}

$content = @"
# Local development only. Do not commit.
NEXT_PUBLIC_SITE_URL=$siteUrlValue
NEXT_PUBLIC_SUPABASE_URL=$supabaseUrlValue
NEXT_PUBLIC_SUPABASE_ANON_KEY=$publishableKeyValue
SUPABASE_SERVICE_ROLE_KEY=$serviceRoleKeyValue
ADMIN_PASSWORD_HASH=$adminPasswordHashValue
SESSION_SECRET=$sessionSecretValue
NODE_ENV=development
"@

Set-Content -LiteralPath $OutputPath -Value $content -Encoding UTF8
Write-Host ""
Write-Host "Wrote $OutputPath."
Write-Host "Next: keep service-role key, admin password hash, and session secret private."
