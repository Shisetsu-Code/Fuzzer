param([string]$Name = 'fuzzer-har')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskEntrypoint = Join-Path $taskRoot 'dist/har-mcp.cjs'
if (-not (Test-Path -LiteralPath $taskEntrypoint -PathType Leaf)) { throw 'Falta dist/har-mcp.cjs. Ejecuta npm ci y npm run har:build.' }
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskCodex = (Get-Command codex -ErrorAction Stop).Source
$taskExistingText = & $taskCodex mcp get $Name --json 2>$null
if ($LASTEXITCODE -eq 0) {
    $taskExisting = $taskExistingText | ConvertFrom-Json
    if ($taskExisting.transport.command -ne $taskNode -or $taskExisting.transport.args[0] -ne $taskEntrypoint) { throw "Ya existe un MCP llamado $Name con otra configuración; no se reemplazó." }
    Write-Output "MCP $Name ya configurado."
    exit 0
}
& $taskCodex mcp add $Name -- $taskNode $taskEntrypoint
if ($LASTEXITCODE -ne 0) { throw 'No se pudo registrar el MCP.' }
& $taskCodex mcp get $Name --json
if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar el registro MCP.' }
