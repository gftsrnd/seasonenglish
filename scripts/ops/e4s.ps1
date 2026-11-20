<#
.SYNOPSIS
  One entry point for running E4S with Docker, so nobody has to remember compose flags.

.DESCRIPTION
  Environments:
    live     project e4s-local, docker-compose.yml + docker-compose.tunnel.yml, https://e4s.gfts.vn (127.0.0.1:4175)
    sandbox  project e4s-dev,   docker-compose.yml + docker-compose.dev4300.yml, http://127.0.0.1:4300

  Actions:
    status   containers + readiness
    deploy   [backup] -> build api/worker/web -> start them -> wait for readiness   (no migrations)
    migrate  [backup] -> run pending SQL migrations only (scripts/migrate-only.ts; no seed, no data sync)
    backup   Postgres dump (.dump) + MinIO files (.tar.gz) into -BackupDir
    restore  Restore a Postgres dump (and optionally a MinIO archive) produced by `backup`
    logs     follow api/worker/web logs

  Anything that changes the live site requires -ConfirmLive.
  The base compose file alone (no overlay) is for a fresh local checkout and SEEDS demo data: never point it at e4s-local.

.EXAMPLE
  ./scripts/ops/e4s.ps1 -Env sandbox -Action deploy
  ./scripts/ops/e4s.ps1 -Env live -Action backup
  ./scripts/ops/e4s.ps1 -Env live -Action deploy -ConfirmLive
  ./scripts/ops/e4s.ps1 -Env sandbox -Action restore -Dump backups/e4s-dev-20261120-1500.dump -MinioArchive backups/e4s-dev-20261120-1500-minio.tar.gz
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet("live", "sandbox")][string]$Env,
  [Parameter(Mandatory = $true)][ValidateSet("status", "deploy", "migrate", "backup", "restore", "logs")][string]$Action,
  [string]$EnvFile = ".env",
  [string]$BackupDir = "backups",
  [string]$Dump,
  [string]$MinioArchive,
  [string[]]$Services = @("api", "worker", "web"),
  [switch]$SkipBackup,
  # Skip the typed confirmation of `restore` (automation / sandbox only).
  [switch]$Yes,
  [switch]$ConfirmLive
)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "../..")
Set-Location $root

$cfg = if ($Env -eq "live") {
  @{ Project = "e4s-local"; Overlay = "docker-compose.tunnel.yml"; Url = "http://127.0.0.1:4175/api/readiness" }
} else {
  @{ Project = "e4s-dev"; Overlay = "docker-compose.dev4300.yml"; Url = "http://127.0.0.1:4300/api/readiness" }
}
if (-not (Test-Path $EnvFile)) { throw "Env file '$EnvFile' not found. Copy .env.example to .env and fill it in (see docs/env.md)." }
$compose = @("compose", "--env-file", $EnvFile, "-p", $cfg.Project, "-f", "docker-compose.yml", "-f", $cfg.Overlay)

function Invoke-Compose([string[]]$Arguments) {
  # Docker writes progress to stderr; in Windows PowerShell that must not count as a failure. Exit codes decide.
  $previous = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  try { & docker @compose @Arguments } finally { $ErrorActionPreference = $previous }
  if ($LASTEXITCODE -ne 0) { throw "docker compose $($Arguments -join ' ') failed ($LASTEXITCODE)" }
}

function Assert-LiveConfirmed {
  if ($Env -eq "live" -and -not $ConfirmLive) { throw "This changes the live site (e4s.gfts.vn). Re-run with -ConfirmLive after the owner has agreed." }
}

function Wait-Ready {
  for ($i = 0; $i -lt 40; $i++) {
    try { $r = Invoke-RestMethod -Uri $cfg.Url -TimeoutSec 5; if ($r.status -eq "ready") { Write-Host "Ready: $($cfg.Url)"; return } } catch {}
    Start-Sleep -Seconds 3
  }
  throw "Not ready after 2 minutes: $($cfg.Url). Check: ./scripts/ops/e4s.ps1 -Env $Env -Action logs"
}

function Invoke-Backup {
  New-Item -ItemType Directory -Force $BackupDir | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  $base = Join-Path $BackupDir "$($cfg.Project)-$stamp"
  $pg = "$($cfg.Project)-postgres-1"
  # pg_dump inside the container; written through docker cp so the binary dump is never re-encoded by the shell.
  & docker exec $pg sh -c "pg_dump -U e4s -d e4s -Fc -f /tmp/e4s-backup.dump"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
  & docker cp "${pg}:/tmp/e4s-backup.dump" "$base.dump" | Out-Null
  & docker exec $pg rm -f /tmp/e4s-backup.dump | Out-Null
  $volume = "$($cfg.Project)_e4s-minio"
  $abs = (Resolve-Path $BackupDir).Path
  & docker run --rm -v "${volume}:/data:ro" -v "${abs}:/backup" alpine:3.20 tar czf "/backup/$($cfg.Project)-$stamp-minio.tar.gz" -C /data .
  if ($LASTEXITCODE -ne 0) { throw "MinIO archive failed" }
  Get-Item "$base.dump", "$base-minio.tar.gz" | ForEach-Object { "{0}  {1:N1} MB" -f $_.FullName, ($_.Length / 1MB) }
}

switch ($Action) {
  "status" {
    & docker @compose ps --format "table {{.Name}}\t{{.Status}}"
    try { Invoke-RestMethod -Uri $cfg.Url -TimeoutSec 5 } catch { Write-Warning "Readiness check failed: $_" }
  }
  "backup" { Invoke-Backup }
  "deploy" {
    Assert-LiveConfirmed
    if (-not $SkipBackup) { Invoke-Backup }
    # Keep the running images as a rollback tag before rebuilding.
    $tag = "rollback-" + (Get-Date -Format "yyyyMMdd-HHmm")
    foreach ($s in $Services) { & docker tag "$($cfg.Project)-${s}:latest" "$($cfg.Project)-${s}:$tag" 2>$null }
    Write-Host "Previous images tagged :$tag (rollback: docker tag <image>:$tag <image>:latest, then deploy with -SkipBackup and no build)."
    Invoke-Compose (@("build") + $Services)
    Invoke-Compose (@("up", "-d", "--no-deps", "--no-build") + $Services)
    Wait-Ready
  }
  "migrate" {
    Assert-LiveConfirmed
    if (-not $SkipBackup) { Invoke-Backup }
    # Only SQL migrations (scripts/migrate-only.ts): no demo seed, no password reset, no canonical-assessment sync.
    Invoke-Compose @("run", "--rm", "--build", "--no-deps", "migrate", "pnpm", "exec", "tsx", "scripts/migrate-only.ts")
  }
  "restore" {
    Assert-LiveConfirmed
    if (-not $Dump) { throw "-Dump <file.dump> is required" }
    if (-not (Test-Path $Dump)) { throw "Dump '$Dump' not found" }
    if (-not $Yes -or $Env -eq "live") {
      $answer = Read-Host "Restore $Dump into $($cfg.Project)? This REPLACES the current database. Type the project name to continue"
      if ($answer -ne $cfg.Project) { throw "Cancelled." }
    }
    if (-not $SkipBackup) { Invoke-Backup }
    $pg = "$($cfg.Project)-postgres-1"
    # Plain docker stop/start: `compose start` refuses when one-shot helpers (minio-init) were removed.
    & docker stop "$($cfg.Project)-api-1" "$($cfg.Project)-worker-1" | Out-Null
    & docker cp $Dump "${pg}:/tmp/e4s-restore.dump" | Out-Null
    & docker exec $pg sh -c "pg_restore -U e4s -d e4s --clean --if-exists --no-owner /tmp/e4s-restore.dump; rm -f /tmp/e4s-restore.dump"
    if ($MinioArchive) {
      & docker stop "$($cfg.Project)-minio-1" | Out-Null
      $abs = (Resolve-Path (Split-Path $MinioArchive)).Path; $name = Split-Path $MinioArchive -Leaf
      & docker run --rm -v "$($cfg.Project)_e4s-minio:/data" -v "${abs}:/backup:ro" alpine:3.20 sh -c "rm -rf /data/* /data/.[!.]* 2>/dev/null; tar xzf /backup/$name -C /data"
      & docker start "$($cfg.Project)-minio-1" | Out-Null
    }
    & docker start "$($cfg.Project)-api-1" "$($cfg.Project)-worker-1" | Out-Null
    Wait-Ready
  }
  "logs" { & docker @compose logs -f --tail 100 api worker web }
}
