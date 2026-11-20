# Prueba los scripts SQL en un PostgreSQL local (sin Supabase).
# Recrea la base "t360_pruebas", aplica la simulacion de Supabase y sql/01..04, y ejecuta
# sql/98_pruebas_funcionales.sql y sql/99_pruebas_seguridad.sql (ambas terminan en ROLLBACK).
# Se detiene en el primer error.
# PostgreSQL portable: carpeta bin de la distribucion "zip" de PostgreSQL 17 para Windows (initdb + pg_ctl).
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File tools\probar-sql-local.ps1 -PgBin "C:\ruta\pgsql\bin" [-Puerto 55433]
# (Archivo en ASCII a proposito: Windows PowerShell 5.1 lee los .ps1 sin BOM como ANSI.)
param([Parameter(Mandatory = $true)][string]$PgBin, [int]$Puerto = 55433)

$raiz = Split-Path -Parent $PSScriptRoot
$psql = Join-Path $PgBin 'psql.exe'
$env:PGCLIENTENCODING = 'UTF8'
& $psql -h localhost -p $Puerto -U postgres -v ON_ERROR_STOP=1 -q -X -c "drop database if exists t360_pruebas;" -c "create database t360_pruebas;"
if ($LASTEXITCODE -ne 0) { exit 1 }

$scripts = @('sql\local\00_simulacion_supabase.sql', 'sql\01_base.sql', 'sql\02_identidad.sql', 'sql\03_catalogos.sql',
             'sql\04_seguridad.sql')
# Migraciones fechadas, en orden de nombre
$scripts += Get-ChildItem (Join-Path $raiz 'sql\migraciones') -Filter '*.sql' | Sort-Object Name | ForEach-Object { 'sql\migraciones\' + $_.Name }
$scripts += @('sql\97_pruebas_importacion.sql', 'sql\98_pruebas_funcionales.sql', 'sql\99_pruebas_seguridad.sql')
foreach ($s in $scripts) {
  Write-Host "== $s"
  & $psql -h localhost -p $Puerto -U postgres -d t360_pruebas -v ON_ERROR_STOP=1 -q -X -f (Join-Path $raiz $s)
  if ($LASTEXITCODE -ne 0) { Write-Host "ERROR en $s" -ForegroundColor Red; exit 1 }
}
Write-Host 'Todos los scripts y pruebas se ejecutaron sin errores.' -ForegroundColor Green
