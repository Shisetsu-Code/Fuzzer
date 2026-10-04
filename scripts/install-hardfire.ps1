param([string]$HardFireHome='C:\HardFire')
$ErrorActionPreference='Stop'
$sourceRoot=Split-Path $PSScriptRoot
$mcpPath=Join-Path $HardFireHome 'src\local-mcp.js'
$moduleRoot=Join-Path $HardFireHome 'src\fuzzer'
$text=Get-Content -LiteralPath $mcpPath -Raw
$originalHash=(Get-FileHash -LiteralPath $mcpPath).Hash
$marker="  register('hardfire_status'"
if (!$text.Contains($marker)) {throw 'Registro HardFire no reconocido; no se modifica.'}
$backup=Join-Path $sourceRoot ('outputs\hardfire-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item -LiteralPath $mcpPath -Destination (Join-Path $backup 'local-mcp.js')
if (Test-Path -LiteralPath $moduleRoot) {Copy-Item -LiteralPath $moduleRoot -Destination (Join-Path $backup 'fuzzer') -Recurse}
try {
    New-Item -ItemType Directory -Path $moduleRoot -Force | Out-Null
    foreach ($folder in @('providers','lib','integrations')) {Copy-Item -LiteralPath (Join-Path $sourceRoot $folder) -Destination $moduleRoot -Recurse -Force}
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'package.json') -Destination (Join-Path $moduleRoot 'package.json') -Force
    & node --check (Join-Path $moduleRoot 'integrations\hardfire\mcp-tools.js')
    if ($LASTEXITCODE -ne 0) {throw 'Modulo Fuzzer invalido'}
    if (!$text.Contains('registerFuzzerTools')) {
        if ((Get-FileHash -LiteralPath $mcpPath).Hash -ne $originalHash) {throw 'El registro MCP cambio durante la instalacion; no se sobrescribe.'}
        $block="  const {registerFuzzerTools}=await import('./fuzzer/integrations/hardfire/mcp-tools.js');`r`n  registerFuzzerTools({register,z,text,controller});`r`n`r`n"
        $text=$text.Replace($marker,$block+$marker).Replace("['hardfire_status','hardfire_browser'","['pragmatic_fuzz_start','pragmatic_fuzz_result','hardfire_status','hardfire_browser'")
        Set-Content -LiteralPath $mcpPath -Value $text -Encoding utf8
    }
    & node --check $mcpPath
    if ($LASTEXITCODE -ne 0) {throw 'Registro MCP invalido'}
} catch {
    Copy-Item -LiteralPath (Join-Path $backup 'local-mcp.js') -Destination $mcpPath -Force
    if (Test-Path -LiteralPath (Join-Path $backup 'fuzzer')) {foreach($item in (Get-ChildItem -LiteralPath (Join-Path $backup 'fuzzer'))) {Copy-Item -LiteralPath $item.FullName -Destination $moduleRoot -Recurse -Force}}
    throw
}
Write-Output ('Instalado. Respaldo: '+$backup)
Write-Output 'Guarda los HAR activos y reinicia HardFire para cargar las funciones pragmatic_fuzz_start/result.'
