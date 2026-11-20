# Servidor estatico minimo para desarrollo: http://localhost:5610/
#   /                  -> index.html (app del colaborador)
#   /admin.html        -> panel administrativo
#   /prototipo/        -> prototipo de diseno de la Fase 2
# Solo escucha en localhost y solo sirve archivos de la carpeta del proyecto. No instala nada (usa .NET de Windows).
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File tools\servidor-local.ps1 [-Puerto 5610]
# (Archivo en ASCII a proposito: Windows PowerShell 5.1 lee los .ps1 sin BOM como ANSI.)
param([int]$Puerto = 5610)

$raiz = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$raizConSeparador = $raiz.TrimEnd('\') + '\'
$tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.webp' = 'image/webp'; '.ico' = 'image/x-icon'
}
# Carpetas que no se sirven aunque esten dentro del proyecto
$privadas = @('.git\', '.claude\', 'docs\', 'sql\', 'supabase\', 'tools\')

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Puerto/")
$listener.Start()
Write-Host "TRANSPORTES 360 en http://localhost:$Puerto/  (panel: /admin.html, prototipo: /prototipo/) - Ctrl+C para detener"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $resp = $ctx.Response
      $ruta = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrEmpty($ruta) -or $ruta.EndsWith('/')) { $ruta = $ruta + 'index.html' }
      $archivo = [System.IO.Path]::GetFullPath((Join-Path $raiz $ruta))
      $relativa = if ($archivo.Length -gt $raizConSeparador.Length) { $archivo.Substring($raizConSeparador.Length) } else { '' }
      $bloqueada = $false
      foreach ($p in $privadas) { if ($relativa.StartsWith($p, [System.StringComparison]::OrdinalIgnoreCase)) { $bloqueada = $true } }
      # Comparacion con separador final: impide salir de la carpeta del proyecto
      if (-not $bloqueada -and $archivo.StartsWith($raizConSeparador, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $archivo -PathType Leaf)) {
        $bytes = [System.IO.File]::ReadAllBytes($archivo)
        $ext = [System.IO.Path]::GetExtension($archivo).ToLower()
        if ($tipos.ContainsKey($ext)) { $resp.ContentType = $tipos[$ext] } else { $resp.ContentType = 'application/octet-stream' }
        $resp.Headers.Add('Cache-Control', 'no-store')
        $resp.Headers.Add('X-Content-Type-Options', 'nosniff')
        $resp.Headers.Add('Referrer-Policy', 'no-referrer')
        $resp.ContentLength64 = $bytes.Length
        if ($ctx.Request.HttpMethod -ne 'HEAD') { $resp.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $resp.StatusCode = 404
      }
      $resp.Close()
    } catch {
      Write-Host "Error atendiendo $($ctx.Request.Url): $($_.Exception.Message)"
      try { $ctx.Response.StatusCode = 500; $ctx.Response.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
}
