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
        $block="  const {registerFuzzerTools}=await import('./fuzzer/integrations/hardfire/mcp-tools.js');`r`n  registerFuzzerTools({register,z,text,controller});`r`n`r`n"
        $text=$text.Replace($marker,$block+$marker)
    }
    # Existing installations already contain registerFuzzerTools; expose newly
    # registered MCP commands without injecting a duplicate registration.
    $oldList="['pragmatic_fuzz_start','pragmatic_fuzz_result','hardfire_status','hardfire_browser'"
    $baseList="['hardfire_status','hardfire_browser'"
    $newList="['pragmatic_fuzz_start','pragmatic_fuzz_result','pragmatic_explore_start','pragmatic_explore_result','pragmatic_drawn_buttons','pragmatic_batch_start','pragmatic_batch_result','pragmatic_guided_start','pragmatic_guided_observe','pragmatic_guided_status','pragmatic_guided_act','pragmatic_guided_skip','pragmatic_guided_reset','pragmatic_guided_close','pragmatic_tree_start','pragmatic_tree_result','pragmatic_tree_approve','pragmatic_tree_skip','pragmatic_tree_run','pragmatic_tree_live_observe','pragmatic_tree_live_act','pragmatic_tree_live_release','pragmatic_tree_close','hardfire_status','hardfire_browser'"
    if ($text.Contains($oldList)) {$text=$text.Replace($oldList,$newList)}
    elseif ($text.Contains($baseList)) {$text=$text.Replace($baseList,$newList)}
    elseif ($text.Contains("'pragmatic_guided_start'") -and !$text.Contains("'pragmatic_tree_start'")) {
        $text=$text.Replace("'pragmatic_guided_close','hardfire_status'","'pragmatic_guided_close','pragmatic_tree_start','pragmatic_tree_result','pragmatic_tree_approve','pragmatic_tree_skip','pragmatic_tree_run','pragmatic_tree_live_observe','pragmatic_tree_live_act','pragmatic_tree_live_release','pragmatic_tree_close','hardfire_status'")
        if (!$text.Contains("'pragmatic_tree_start'")) {throw 'Lista MCP personalizada; insercion guiada no posible.'}
    }
    elseif (!$text.Contains("'pragmatic_tree_start'")) {throw 'Lista de herramientas HardFire no reconocida; no se modifica.'}
    if ((Get-FileHash -LiteralPath $mcpPath).Hash -ne $originalHash) {throw 'El registro MCP cambio durante la instalacion; no se sobrescribe.'}
    Set-Content -LiteralPath $mcpPath -Value $text -Encoding utf8
    & node --check $mcpPath
    if ($LASTEXITCODE -ne 0) {throw 'Registro MCP invalido'}
} catch {
    Copy-Item -LiteralPath (Join-Path $backup 'local-mcp.js') -Destination $mcpPath -Force
    if (Test-Path -LiteralPath (Join-Path $backup 'fuzzer')) {foreach($item in (Get-ChildItem -LiteralPath (Join-Path $backup 'fuzzer'))) {Copy-Item -LiteralPath $item.FullName -Destination $moduleRoot -Recurse -Force}}
    throw
}
Write-Output ('Instalado. Respaldo: '+$backup)
Write-Output 'Guarda los HAR activos y reinicia HardFire para cargar pragmatic_guided_start/act y las otras funciones Fuzzer.'
