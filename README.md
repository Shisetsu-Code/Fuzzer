# Fuzzer

Explorador de controles y caminos de DEMOs oficiales mediante HardFire. Fuzzer controla su propia sesión de Electron/Chromium; no usa el navegador personal del usuario. La primera implementación es Pragmatic. Otros proveedores no están implementados.

## Objetivo actual

**Recorrer opciones observadas y registrar qué hacen, sin tener que clasificarlas primero como compra, Ante Bet o giro normal.** Desde A se sigue una rama; si aparecen opciones se guardan todas y se prueba una. Las alternativas se reconstruyen desde A en sesiones aisladas. Cuando procede, una única tirada DEMO por intento comprueba una opción que devuelve a base. Saldo, controles y tráfico son evidencias, no excusas para frenar por telemetría ajena.

Una acción válida, una operación cerrada y un árbol completamente conocido no son lo mismo. El modo recomendado `actions` no exige una tirada adicional de certificación después de cada compra. El flujo económico anterior y el modo `strict` tienen requisitos diferentes.

El [objetivo, auditoría y aprendizajes del 6 de octubre](docs/objective-and-recovery-2026-10-06.md) es la referencia actual. El [contrato del explorador](docs/state-explorer.md) describe resultados y límites. Las validaciones históricas no deben extrapolarse a todos los juegos o versiones.

## Recuperación implementada

Un primer fallo recuperable ya no retira definitivamente la rama. El motor prioriza alternativas nuevas y después procesa una cola de recuperación, con dos reintentos por ruta en modo `actions`. Cada reintento guarda y cierra la sesión anterior antes de crear otra. Los errores persistentes quedan bloqueados con causa; los límites dejan trabajo diferido. Ninguno se convierte en éxito.

La identidad del menú excluye flags transitorios y resultados aleatorios. Un replay diferente puede descubrir otra variante segura sin fingir que es el destino esperado. Las decisiones se registran antes del clic, incluso si este falla. Si el proveedor espera una elección soportada y no hay picker reconocido, se utilizan los controles nuevos dibujados con geometría válida, no un inventario de nombres por juego.

`result.json` conserva `attemptHistory`, `queued`, `pending`, `recovery` y `stopReason`. `validActionCount` cuenta intentos; `validRouteCount` distingue rutas del planificador. No son contadores de compras semánticas. El grafo todavía no se reanuda automáticamente en otro proceso o ejecución de Actions.

## Uso local

Instalar bajo la cuenta de Windows que ejecuta HardFire con `scripts/install-hardfire.ps1`. El instalador verifica hashes y respalda el registro. Guardar los HAR y cerrar trabajos antes de reiniciar HardFire para cargar el módulo.

Herramientas recomendadas: `pragmatic_explore_start`, `pragmatic_explore_result` y `pragmatic_drawn_buttons` para inspección sin clics. Ejemplo de argumentos para start:

```json
{"game_url":"https://www.pragmaticplay.fun/en/slots/inca-queen/","max_actions":100,"max_depth":8,"timeout_ms":600000}
```

Guardar el `job_id` y consultar result: **no volver a iniciar para consultar progreso**. Los argumentos MCP admiten 1–200 acciones, profundidad 1–10 y 10.000–1.800.000 ms; los defaults del explorador son 20, 4 y 600.000 ms. Los ajustes internos de recuperación se documentan en el contrato JavaScript, no se anuncian como argumentos MCP inexistentes.

HardFire configura la velocidad por pestaña. Las pruebas de Actions solicitan 4× y registran la observada. Acelerar animaciones no acelera red, capturas ni los presupuestos del explorador. Las herramientas locales de velocidad son independientes de Fuzzer.

Máximo dos trabajos simultáneos y cuatro pestañas DEMO cargadas en total, incluidas auxiliares. No reiniciar HardFire con trabajos activos ni borrar HAR manuales. Si falla guardar/cerrar, `cleanupPending` y `retainedTabIds` mantienen la propiedad. `pragmatic_fuzzer_cleanup({"job_id":"ID"})` reintenta únicamente la limpieza de un trabajo terminado; no vuelve a apostar ni reanuda el árbol.

## Pruebas y GitHub Actions

Node.js 22 o posterior. `npm test` ejecuta la suite sin navegador adicional; la matriz `Tests` usa Node 22/24 en Linux/Windows. Las pruebas con fronteras de navegador simuladas no certifican los juegos reales.

El workflow `Pragmatic live DEMOs` carga Electron con HardFire fijado a un commit y una pestaña aislada de 1280 × 720 por trabajo, máximo dos trabajos simultáneos. El mensaje del último commit de una PR del mismo repo debe contener `[live-demo:all]` para los cinco juegos del manifiesto o `[live-demo:inca-queen]` para uno. Sin marcador no se ejecutan juegos. `workflow_dispatch` también existe cuando está disponible en la rama predeterminada.

La configuración actual del workflow es **100 intentos de acción destino, profundidad 8 y 10 minutos por juego**. Una transición tiene hasta 15 s; una operación sin progreso queda pendiente después de 15 s, conservando un máximo absoluto de 180 s. Lecturas ya iniciadas, guardado y cierre pueden añadir tiempo. No son garantías de latencia.

Los artefactos incluyen `result.json`, `summary.json`, `protocol.har.gz`, métricas y hasta ocho JPEG65, sujetos a presupuestos de exportación. Los perfiles y HAR crudos permanecen privados. Los resúmenes quedan en el log como `FUZZER_SUMMARY_JSON=`. Un job rojo puede ser una salida deliberada `PARTIAL`, no una cancelación de GitHub.

## Evidencia y límites

`EXHAUSTED_OBSERVED_CONTROLS` significa que se agotó el trabajo observado sin pendientes; no demuestra opciones ocultas o aleatorias. `completeGame` sigue siendo `false`. Una respuesta HTTP 200 capturada acredita transporte, no validación exhaustiva de los errores semánticos del juego ni cierre del bonus.

Referencia de esta revisión: [objetivo y recuperación](docs/objective-and-recovery-2026-10-06.md). Evidencia anterior: [benchmark](docs/performance-benchmark-2026-10-06.md), [tanda de Actions](docs/validation-pragmatic-actions-new5-2026-10-05.md), [Death Dominion](docs/validation-death-dominion-2026-10-05.md), [otras cinco demos](docs/validation-pragmatic-five-2026-10-04.md), [fiabilidad](docs/reliability-review-2026-10-05.md), [continuaciones](docs/continuation-reliability-2026-10-05.md). Estos informes conservan su fecha y alcance; no describen automáticamente la versión actual.

Extracción: [botones dibujados](docs/drawn-buttons.md), [controles del proveedor](docs/pragmatic-direct-controls.md). Los contratos históricos permanecen en `contracts/pragmatic/`. Las herramientas anteriores `pragmatic_fuzz_start/result` siguen disponibles, pero no son el mismo criterio funcional del explorador actual.

El runtime/helper original de Pragmatic procede de Parser, referencia `56817ddd45a864ad91087fa576319b9aad0e6436`. No se despliega un servicio Cloudflare ni un servicio de apuestas reales; esta integración es para DEMOs oficiales autorizados.
