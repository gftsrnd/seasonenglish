param([string]$Destination)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $Destination) { $Destination = Join-Path $workspace ('.tmp/backups/4300-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$target = [IO.Path]::GetFullPath($Destination)
if (-not $target.StartsWith($workspace.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Backup destination must stay inside this workspace.'
}
New-Item -ItemType Directory -Force -Path $target | Out-Null
# Explicit dev container names prevent accidentally targeting 4175.
$id = 'e4s-4300-' + [Guid]::NewGuid().ToString('N')
docker exec e4s-dev-postgres-1 pg_dump -U e4s -d e4s -Fc -f "/tmp/$id.dump"
if ($LASTEXITCODE -ne 0) { throw 'Database backup failed.' }
docker cp "e4s-dev-postgres-1:/tmp/$id.dump" (Join-Path $target 'database.dump')
if ($LASTEXITCODE -ne 0) { throw 'Database backup copy failed.' }
docker run --rm --volumes-from e4s-dev-minio-1:ro --mount "type=bind,source=$target,target=/backup" --entrypoint tar pgvector/pgvector:pg18 -czf /backup/object-storage.tar.gz -C /data .
if ($LASTEXITCODE -ne 0) { throw 'Object storage backup failed.' }
@{
  project = 'e4s-dev'
  createdAtUtc = [DateTime]::UtcNow.ToString('o')
  databaseSha256 = (Get-FileHash -LiteralPath (Join-Path $target 'database.dump') -Algorithm SHA256).Hash
  objectStorageSha256 = (Get-FileHash -LiteralPath (Join-Path $target 'object-storage.tar.gz') -Algorithm SHA256).Hash
  note = 'Contains personal data. Keep private. Restore both archives to isolated matching PostgreSQL/MinIO versions before switching traffic.'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'manifest.json') -Encoding utf8
Write-Output "4300 database and object storage backed up to $target"
