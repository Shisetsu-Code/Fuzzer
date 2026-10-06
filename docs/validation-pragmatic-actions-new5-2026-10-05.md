# Cinco DEMOs nuevos en GitHub Actions

**Primera tanda completada y revisada.** Los cinco juegos dejaron evidencia íntegra y resultados `PARTIAL`. La repetición con el marcador de actividad corregido está en marcha; esta versión no anticipa su resultado.

La tanda solicitada el 5 de octubre de 2026 (Argentina) se ejecuta el 6 de octubre en UTC. Los juegos seleccionados no aparecen en los registros consultados del repositorio, Snapshot, Tester-Spin y el contexto previo disponible. El [manifiesto de selección](evidence/pragmatic-actions-new5-2026-10-05-manifest.json) conserva las fuentes, las exclusiones y los límites de esa afirmación; no permite descartar pruebas en un historial inaccesible.

## Ejecución identificada

- [Tanda real en Actions, run 37400090388](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37400090388).
- Fuzzer ejecutado: `571026fe225b5a511d804bb39a29a2fd7ab2e526`.
- HardFire: `adf6de5ec14e394f77fb1816d5f46e5deb250b0a`, con sus implementaciones reales de controlador, grabador, captura de red e inyección de runtime.
- Electron fijado a `44.4.0`, Ubuntu y Xvfb; las versiones efectivamente cargadas se conservan en cada resultado.
- Una pestaña aislada por trabajo, dos trabajos simultáneos. Vista de juego de 1280 × 720. Velocidad solicitada 4×; la lectura dentro del frame DEMO se informa por separado.
- Límite por juego: 100 acciones, profundidad 8 y 20 minutos; recuperación global adicional de 90 segundos y límite externo de trabajo de 30 minutos.

El host aporta la fachada de pestañas de CI y llama al explorador existente. Cada sesión comienza a grabar antes de navegar al catálogo oficial, y guarda su HAR antes de cerrar su pestaña.

## Resultados por juego

La primera tanda terminó con cinco exportaciones completas y cierre confirmado en los cinco juegos. Se revisaron los hashes del ZIP y de cada archivo, los resultados, los cuerpos de protocolo y las capturas. Los [artefactos preservados en el repositorio](evidence/pragmatic-actions-new5-2026-10-05/run-37400090388/) evitan depender de la retención de un día de Actions.

| Juego | Acciones / pendientes | Duración | Estado observado al terminar | Peticiones de juego |
|---|---:|---:|---|---|
| Dragon's Gate – Bonus Choice | 1 / 1 | 158,246 s | Confirmación de compra de bonus por $100 demo | 1 `doInit` |
| Inca Queen | 2 / 2 | 203,287 s | Ante Bet activado ($2 → $60); otra rama abre compra de respins por $500 demo | 2 `doInit` |
| Big Bass Blast | 2 / 2 | 208,587 s | Ante Bet activado ($2 → $3); otra rama abre compra por $200 demo | 2 `doInit` |
| Hundreds and Thousands | 2 / 2 | 213,469 s | Ante Bet activado ($2 → $4); otra rama abre compra por $200 demo | 2 `doInit` |
| Blazing Wilds Megaways | 1 / 1 | 95,294 s | Confirmación de compra de free spins por $200 demo | 1 `doInit` |

Los ocho pendientes son `ACTIVE_TIMEOUT`. No se capturó ningún `doSpin`, `doBonus`, `doCollect` ni envío de compra con `pur`. Las ocho inicializaciones tienen HTTP 200 y cuerpos presentes. Los clics de UI sí surtieron efecto, pero los menús no se confirmaron y los cambios de Ante Bet no se verificaron con un giro. El total es **cero compras verificadas, cero modificadores verificados y cero elecciones de bonus**. En los cinco resultados `cleanupPending:false` y `completeGame:false`.

La velocidad 4× se leyó dentro de los frames DEMO de Inca, Big Bass, Hundreds y Blazing. La lectura de Dragon fue `null`; sólo consta que se solicitó 4×. El símbolo observado procede del HAR: `vs50dragatebch`, `vs20thunder`, `vs10bbasblitz`, `vs100hsandks` y `vswaysfirewmw`, respectivamente.

### Fallo del marcador de actividad

`waitTransition` exige una ventana de quietud después de detectar tráfico. El adaptador de CI incluía `HarRecorder.lastNetworkEventAt`, que la versión fijada de HardFire actualiza para **todos** los mensajes de CDP, incluidos los ajenos a la red. Una regresión con el `waitTransition` real reproduce `ACTIVE_TIMEOUT` al inyectar únicamente mensajes `Runtime.consoleAPICalled`, incluso con controles estables y HAR vacío.

Se corrige el origen del marcador sin cambiar la espera ni los criterios de finalización: se cuentan eventos `Network.*` durante la grabación, actividad de NetworkTap, frames WebSocket y cambios de los cuerpos capturados o pendientes. Los mensajes de inspección no cuentan como tráfico. La nueva prueba debe permitir `STATE_CHANGED` frente a mensajes Runtime y seguir detectando actividad HTTP/WS real.

Los artefactos de la primera tanda conservan el subconjunto `/gameService`, pero no el historial de eventos del depurador ni el tráfico de fondo. Por eso demuestran el bloqueo después de los clics y el defecto del contrato, pero **no prueban por sí solos qué tipo de evento reiniciaba la espera en esos procesos históricos**. La repetición comprueba el efecto real de la corrección.

## Repetición con el marcador corregido

- [Run 37401583652](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37401583652), sobre `2d3c5617c44ec9b29330d893d231c19c310c6327`.
- Mismos cinco juegos, presupuesto, reglas del explorador, HardFire y Electron que la primera tanda. Sólo cambian el marcador de actividad y sus pruebas.
- Las [pruebas en Actions](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37401583675) pasan 282/282 por entorno (Node 22/24, Linux/Windows), sin omisiones.
- El [probe con Electron real](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37401583782) completa la entrada, grabación y cierre; es una prueba sin juego.
- Dragon vuelve a quedar en confirmación con `ACTIVE_TIMEOUT`; Inca descubre un segundo nodo tras activar Ante Bet, pero todavía no acredita un giro. La tabla definitiva requiere recuperar los cinco artefactos.

Para identificar qué mantiene activa la espera se añade un diagnóstico de hasta 32 muestras de actividad, separadas por al menos dos segundos, con contadores HTTP/WS, cuerpos pendientes, número de entradas y un hash del marcador. Los nombres de métodos CDP se contabilizan sin sus parámetros. El historial queda fuera del marcador y no altera la espera. Se prepara una ejecución dirigida únicamente a Dragon; no se anticipa su resultado.

## Criterio de evidencia

Una compra acreditada debe conservar su petición y respuesta completas, el cierre observado de su operación y una petición propia de giro normal posterior. Un HTTP 200 aislado no acredita ese recorrido. Se distinguen opciones de compra únicas, intentos repetidos, elecciones, modificadores y pendientes.

`EXHAUSTED_OBSERVED_CONTROLS` se limita a los controles observados durante la exploración. `PARTIAL` conserva los avances y el motivo de cada pendiente. El estado de exportación es independiente del estado del juego, y `completeGame` permanece en `false`.

La exportación incluye el resultado estructurado, su resumen, el protocolo `/gameService` saneado y hasta ocho JPEG de calidad 65. Los cuerpos referenciados se resuelven sobre el HAR original antes de filtrar. Los hashes del manifiesto permiten comprobar la integridad de los archivos exportados. Los registros de Actions conservan también el resumen con el prefijo `FUZZER_SUMMARY_JSON=`.

## Incidencias de infraestructura anteriores a la tanda real

Estos intentos no se cuentan como juegos probados:

1. El [run 37394550052](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37394550052), sobre `362d0f719b9746bbd07c6c98e5de480c25a88eaa`, no creó trabajos de juego. El workflow usaba el contexto `runner.temp` en un `env` de trabajo; se corrigió a un directorio bajo `github.workspace`.
2. El [run 37394763268](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37394763268), sobre `0ccbd5a5744091baab26dfe0cba8cb18a4e90bfd`, importó el módulo pero no llamó a `main()`. Electron conservaba `--no-sandbox` en `argv[1]`; la antigua guarda esperaba allí la ruta del script. No se abrieron juegos ni se generaron HAR. Una prueba con Electron real reprodujo la discrepancia y permitió retirar ese intento inactivo.
3. El [check corregido 37396276567](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37396276567) comprobó la nueva selección del archivo de entrada con Electron `44.4.0`: `legacyGuardMatches:false`, `guardMatches:true`. El workflow real exige además un marcador escrito al entrar en `main()`, antes de abrir ventanas, dentro de 30 segundos.

## Verificación del código

El [workflow 37400090425](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37400090425), sobre la misma versión de Fuzzer que la tanda real, pasó **277 pruebas por entorno**, sin fallos ni omisiones, en Node 22 y 24 sobre Linux y Windows. La prueba real de entrada de Electron también pasó. Estas pruebas automatizadas se distinguen de la evidencia de ejecución de cada juego.

## Recuperación del progreso al vencer el presupuesto

La revisión del runner identificó un caso adicional: `onProgress` comunicaba observaciones ya terminadas, pero el runner sólo registraba sus conteos. Si vencía su watchdog durante la siguiente tarea, el fallback podía exportar cero acciones y arrays vacíos. El HAR seguía siendo evidencia separada, pero se perdía el resultado estructurado de las operaciones anteriores.

La corrección conserva una copia profunda de cada checkpoint antes de esperar diagnósticos. Si falta un resultado final, recupera ese checkpoint como `PARTIAL` y añade un pendiente global con el error del runner. No crea una arista ni certifica la acción que seguía en curso. También conserva por separado un fallo de limpieza y sus IDs retenidos cuando todavía no existe un resultado final; el resumen exportado mantiene `cleanupPending:true` en ese caso.

Tres regresiones nuevas cubren una compra terminada seguida de otra acción bloqueada, la independencia respecto de mutaciones posteriores, la ausencia de progreso y la conservación del fallo de limpieza en la exportación. La corrección inicial del checkpoint pasó **269 pruebas** localmente. La versión ampliada con recuperación durable y cierre del host pasó **277 pruebas** en los cuatro entornos de Actions indicados arriba. Está incluida en la tanda corregida `37400090388`; no se atribuye a los intentos anteriores.

## Recuperación después de un crash nativo

El checkpoint privado se escribe con archivo exclusivo, `fsync` y renombrado atómico. Se actualiza al iniciar, al registrar progreso, cuando cambia el ownership y antes de cerrar. El callback `onSaved` se espera después de persistir el HAR y antes del cierre; si falla el journal, la sesión conserva su obligación de guardado.

Un paso independiente de Node, ejecutado siempre después de Electron, recupera el checkpoint y sus referencias explícitas mediante el mismo exportador. Preserva un export final cuyo manifiesto, tamaños y hashes sean válidos. Sin progreso observado conserva `ERROR` y cero acciones; con progreso conserva `PARTIAL` y sus pendientes. La recuperación no rescata datos que sólo existieran en la memoria del recorder.

La prueba de regresión termina un proceso abruptamente y recupera los datos desde otro. Su comprobación de terminación contempla los distintos resultados que Node informa en Windows y POSIX; usa una ruta nativa para el proceso de recuperación.

## Bloqueo del host reproducido y cierre corregido

La [evidencia de los probes](evidence/pragmatic-actions-startup-probe-2026-10-06.json) conserva resultados reales y los SHA-256 verificados de sus ZIP. El [run 37398841327](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37398841327), con Electron 44.4.0 y HardFire fijado, reprodujo que el orden original queda esperando `Page.addScriptToEvaluateOnNewDocument` antes de devolver la pestaña. Cargar `about:blank` antes del runtime desbloqueó CDP, la evaluación del renderer, el recorder, la captura y la persistencia de un HAR vacío.

Ese primer probe también mostró un fallo al cerrar. El host releía `WebContentsView.webContents` después de destruir el WebContents; ahora conserva su referencia estable y confirma el cierre con ella. En el [run 37399548934](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37399548934), la ruta de producción completó arranque, captura, HAR y cierre en 2.179 ms; la variante comparativa lo completó en 2.108 ms. Ambos resultados son pruebas sin juegos.

La tanda anterior `37396276232`, sobre `eefa33ddc8d3545fa52094b38402d0e7aa9abe6c`, tuvo dos trabajos que llegaron a `LIVE_START`, agotaron 21,5 minutos sin `LIVE_PROGRESS` y terminaron con `SIGTRAP`, sin export. El bloqueo reproducido con el mismo host constituye una atribución de alta confianza para retirar esa tanda; no es una marca directa de su estado histórico. No se le acredita recorrido de DEMO ni se afirma que se hubiera guardado un HAR original. La retirada se solicitó a las 01:31:13 UTC después de pasar el probe corregido. Los otros tres trabajos quedaron cancelados. El permiso temporal usado para retirar únicamente ese run se eliminó antes del relanzamiento.

## Límites y siguientes cambios

Se completará esta sección con los bloqueos observados, la recuperación de evidencia y las correcciones posteriores a la tanda. Los resultados de una versión no se trasladarán como validación en vivo de una versión posterior.
