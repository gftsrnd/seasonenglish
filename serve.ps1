# Tiny static file server for previewing index.html locally (Windows PowerShell 5.1, no dependencies).
# Usage:  powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]
param([int]$Port = 8080)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/  (Ctrl+C to stop)"

$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'
  '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'
  '.json'='application/json; charset=utf-8'; '.md'='text/markdown; charset=utf-8'
  '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'; '.ico'='image/x-icon'
  '.txt'='text/plain; charset=utf-8'
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request; $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
      # dev helper: POST /__save/<file> writes the body into docs\screenshots (used to collect in-page screenshots); localhost only
      if ($req.HttpMethod -eq 'POST' -and $path.StartsWith('/__save/')) {
        $name = [IO.Path]::GetFileName($path.Substring(8)); $dir = Join-Path $root 'docs\screenshots'; if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
        $ms = New-Object IO.MemoryStream; $req.InputStream.CopyTo($ms); [IO.File]::WriteAllBytes((Join-Path $dir $name), $ms.ToArray())
        $res.StatusCode = 200; $msg = [Text.Encoding]::UTF8.GetBytes("saved $name $($ms.Length)"); $res.OutputStream.Write($msg, 0, $msg.Length); $res.OutputStream.Close(); continue
      }
      if ($path -eq '/') { $path = '/index.html' }
      $file = Join-Path $root ($path.TrimStart('/') -replace '/', '\')
      if ((Test-Path $file -PathType Leaf) -and ([IO.Path]::GetFullPath($file)).StartsWith($root)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-store')
        $res.StatusCode = 200
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
        $msg = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
    } catch {
      try { $res.StatusCode = 500 } catch {}
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}
