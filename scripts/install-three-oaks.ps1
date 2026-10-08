param([string]$HardFireHome='C:\HardFire')
$ErrorActionPreference='Stop'
$sourceRoot=Split-Path $PSScriptRoot
$moduleRoot=Join-Path $HardFireHome 'src\fuzzer'
$target=Join-Path $moduleRoot 'integrations\hardfire\mcp-tools.js'
if(!(Test-Path -LiteralPath $target)){throw 'Instala primero Fuzzer en HardFire con install-hardfire.ps1.'}
$text=[IO.File]::ReadAllText($target)
$marker=" register('pragmatic_explore_start'"
if(!$text.Contains($marker)){throw 'Registro Fuzzer no reconocido; no se modifica.'}
$source=[IO.File]::ReadAllText((Join-Path $sourceRoot 'integrations\hardfire\mcp-tools.js'))
$start=$source.IndexOf(" register('three_oaks_explore_start'")
$end=$source.IndexOf($marker,$start)
if($start -lt 0 -or $end -le $start){throw 'Bloque 3 Oaks no encontrado.'}
$block=$source.Substring($start,$end-$start)
$backup=Join-Path $sourceRoot ('outputs\three-oaks-install-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item -LiteralPath $target -Destination (Join-Path $backup 'mcp-tools.js')
$files=@('providers\three-oaks\discovery.js','providers\three-oaks\protocol.js','integrations\hardfire\three-oaks-session.js','integrations\hardfire\three-oaks-explorer.js')
foreach($relative in $files){$current=Join-Path $moduleRoot $relative;if(Test-Path -LiteralPath $current){$saved=Join-Path $backup $relative;New-Item -ItemType Directory -Path (Split-Path $saved) -Force | Out-Null;Copy-Item -LiteralPath $current -Destination $saved}}
try{
 foreach($relative in $files){$destination=Join-Path $moduleRoot $relative;New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null;Copy-Item -LiteralPath (Join-Path $sourceRoot $relative) -Destination $destination -Force; & node --check $destination;if($LASTEXITCODE -ne 0){throw ('Modulo invalido: '+$relative)}}
 if($text.Contains(" register('three_oaks_explore_start'")){
  $oldStart=$text.IndexOf(" register('three_oaks_explore_start'");$oldEnd=$text.IndexOf($marker,$oldStart)
  if($oldEnd -le $oldStart){throw 'Bloque instalado no reconocido.'}
  $text=$text.Substring(0,$oldStart)+$block+$text.Substring($oldEnd)
 }else{$text=$text.Replace($marker,$block+$marker)}
 [IO.File]::WriteAllText($target,$text);& node --check $target;if($LASTEXITCODE -ne 0){throw 'Registro MCP invalido.'}
}catch{
 Copy-Item -LiteralPath (Join-Path $backup 'mcp-tools.js') -Destination $target -Force
 foreach($relative in $files){$saved=Join-Path $backup $relative;if(Test-Path -LiteralPath $saved){Copy-Item -LiteralPath $saved -Destination (Join-Path $moduleRoot $relative) -Force}}
 throw
}
Write-Output ('3 Oaks instalado sin sobrescribir Pragmatic. Respaldo: '+$backup)
Write-Output 'Guarda los HAR activos, espera el cierre de los trabajos y reinicia HardFire para cargar las herramientas.'