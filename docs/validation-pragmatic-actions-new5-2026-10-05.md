# Cinco DEMOs nuevos en GitHub Actions

**Pruebas terminadas: cinco juegos distintos, dos tandas completas y un diagnóstico adicional de Dragon’s Gate. Los cinco resultados de ambas tandas son `PARTIAL`; no se envió ni verificó una compra o un giro.** Se guardaron y revisaron los resultados, los HAR saneados y las capturas. La segunda tanda reconoció tres estados adicionales, pero el criterio de quietud siguió deteniendo el recorrido.

Los juegos se seleccionaron porque no aparecen en los registros consultados de Fuzzer, Snapshot, Tester-Spin y el contexto previo disponible. El [manifiesto original](evidence/pragmatic-actions-new5-2026-10-05-manifest.json) conserva las fuentes y 72 exclusiones, incluidas variantes de nombres. Su estado `PROPOSED_NOT_RUN` corresponde a la selección previa, conservada como snapshot; las ejecuciones se documentan aquí. No se afirma ausencia de pruebas en un historial no disponible. La petición y los nombres de archivo corresponden al 5 de octubre de 2026 en Argentina; las ejecuciones ocurrieron el 6 de octubre en UTC.

## Resultado de la segunda tanda

[Run 37401583652](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37401583652), Fuzzer `2d3c5617c44ec9b29330d893d231c19c310c6327`. Los [artefactos completos revisados](evidence/pragmatic-actions-new5-2026-10-05/run-37401583652/) incluyen procedencia, hashes y un análisis derivado independiente.

| Juego | Acciones / nodos / pendientes | Duración | Evidencia observada | Protocolo capturado |
|---|---:|---:|---|---|
| Dragon’s Gate – Bonus Choice | 1 / 1 / 1 | 112,871 s | Confirmación de compra por $100 demo abierta; no se aceptó | 1 `doInit` |
| Inca Queen | 2 / 2 / 3 | 443,497 s | Ante OFF→ON reconocido como nuevo estado; otra rama abre compra de respins por $500 demo | 4 `doInit` |
| Big Bass Blast | 2 / 2 / 5 | 490,060 s | Ante visible ON; menú de compra por $200 demo reconocido, con aceptar/cancelar detectados | 6 `doInit` |
| Hundreds and Thousands | 2 / 1 / 2 | 179,702 s | Ante visible ON y confirmación por $200 demo abierta; sin nuevo nodo aceptado | 2 `doInit` |
| Blazing Wilds Megaways | 1 / 2 / 5 | 503,539 s | Menú de compra por $200 demo reconocido; sus controles destino quedaron pendientes | 6 `doInit` |

En total: **8 acciones nuevas del explorador, 8 nodos, 8 aristas y 16 pendientes `ACTIVE_TIMEOUT`**. Once pendientes ocurrieron durante replay: dos en Inca, cuatro en Big Bass y cinco en Blazing. Sus trazas llegaron a la clave de estado esperada, pero la espera no permitió continuar. La acción destino —por ejemplo, aceptar la compra— no se ejecutó. Un control en una tarea pendiente no cuenta como clic, compra ni opción de bonus ejecutada.

El contador de acciones no incluye todos los clics de preparación, replay o continuación. Los IDs sucesivos de pestaña corresponden a sesiones nuevas de preparación; no significan que estuvieran cargadas simultáneamente.

Los **19 intercambios de `/gameService` son `doInit`, todos HTTP 200 y con body presente**. Hay cero `doSpin`, cero `doBonus`, cero `doCollect`, cero compras enviadas y cero compras verificadas. Todos los paquetes dicen `EXPORTED`, sin warnings, con `cleanupPending:false`, `retainedTabIds:[]` y `completeGame:false`.

### Modificadores y controles observados

Las capturas muestran Ante Bet OFF→ON en Inca ($2→$60), Big Bass ($2→$3) y Hundreds ($2→$4), con saldo demo intacto. Son cambios visuales; sin un giro no se verificó su payload, débito ni coste efectivo.

Inca registra un modificador habilitado en el resumen (`modifierCount:1`), pero `performed:false`, `request:null` y `cost:null`. Los otros dos cambios visuales terminaron antes de generar esa clasificación estructurada. No hay modificadores verificados con apuestas.

En Big Bass y Blazing, los nodos nuevos incluyen aceptar/cancelar y otros colliders. Esos controles no equivalen a modalidades de compra adicionales. Todos sus recorridos posteriores se detuvieron durante la apertura repetida del menú.

### Comparación con la primera tanda

La [primera tanda, run 37400090388](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37400090388), ejecutó `571026fe225b5a511d804bb39a29a2fd7ab2e526`. Sus [artefactos preservados](evidence/pragmatic-actions-new5-2026-10-05/run-37400090388/) acreditan ocho acciones, cinco nodos y ocho pendientes directos; sólo ocho `doInit`, sin giros ni compras.

| Juego | Nodos: primera → segunda | Pendientes: primera → segunda | Cambio observado |
|---|---:|---:|---|
| Dragon’s Gate | 1 → 1 | 1 → 1 | Sigue en confirmación |
| Inca Queen | 1 → 2 | 2 → 3 | Se reconoce el estado Ante ON; los replays siguen bloqueados |
| Big Bass Blast | 1 → 2 | 2 → 5 | Se reconoce el menú de compra; los destinos no se ejecutan |
| Hundreds and Thousands | 1 → 1 | 2 → 2 | Persiste el bloqueo de las dos acciones |
| Blazing Wilds Megaways | 1 → 2 | 1 → 5 | Se reconoce el menú de compra; los destinos no se ejecutan |

El aumento de pendientes refleja nuevas tareas descubiertas y detenidas durante replay. No son compras fallidas adicionales ni más opciones únicas. Las duraciones de la primera tanda fueron 158,246; 203,287; 208,587; 213,469 y 95,294 segundos, respectivamente.

## Diagnóstico dirigido de la espera

[Run 37402505219](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37402505219), únicamente Dragon’s Gate, sobre `5d371c3562fcb51ef45452f29b79bdfaafaba8f1`. Esta versión añade observabilidad y conserva el comportamiento del motor. El [resultado completo](evidence/pragmatic-actions-new5-2026-10-05/run-37402505219/dragon-s-gate-bonus-choice/result.json) contiene `execution.runtime[].activity`.

El diagnóstico terminó en 136,998 segundos, con una acción y `ACTIVE_TIMEOUT` tras 65,575 segundos de transición. La captura mantiene la confirmación de $100 abierta. El HAR contiene sólo un `doInit` HTTP 200; no se envió una compra. La evidencia se exportó y la pestaña se cerró.

### Defecto corregido

El adaptador de CI usaba `HarRecorder.lastNetworkEventAt` como señal de tráfico. La versión fijada de HardFire actualiza ese reloj con todos los mensajes CDP, incluidos Runtime y Page. Una regresión con el `waitTransition` real reproduce un timeout al inyectar sólo mensajes Runtime, con controles estables y HAR vacío.

Se reemplazó ese reloj por eventos `Network.*`, actividad HTTP de NetworkTap, frames WebSocket y cambios de cuerpos capturados o pendientes. El mismo caso de regresión reconoce `STATE_CHANGED` tras dos observaciones, a los 1.000 ms del reloj controlado. Los tiempos de espera y las reglas de finalización del motor no cambiaron. El listener se retira de forma idempotente al sustituir la grabación, fallar su inicio o cerrar la pestaña.

La repetición demuestra que esta corrección no resolvió todos los timeouts.

### Actividad que quedó registrada

El diagnóstico conserva hasta 32 muestras, con un intervalo mínimo de dos segundos, y contadores por nombre de método CDP. No publica parámetros, URLs ni cuerpos en ese historial. El historial queda fuera del marcador, para que observarlo no genere actividad.

| Muestra | Tiempo relativo | Eventos Network | Eventos Web | Frames WS | Cuerpos pendientes | Entradas del recorder |
|---|---:|---:|---:|---:|---:|---:|
| Primera | 20.827 ms | 3.778 | 781 | 0 | 0 | 96 |
| Última | 132.850 ms | 3.872 | 842 | 0 | 1 | 110 |

En la ventana registrada aumentaron **94 eventos Network, 61 eventos Web y 14 entradas del recorder**. Se contabilizaron métodos de solicitud, respuesta, recepción de datos y finalización HTTP; no hubo frames ni métodos WebSocket. El protocolo exportado de `/gameService` siguió teniendo únicamente la inicialización. Se demuestra actividad de transporte y captura más amplia que ese protocolo; no se identifica un endpoint, servicio de telemetría o descarga concreto.

Las diez muestras reales están separadas entre 6,86 y 30,087 segundos. Los dos segundos son un mínimo de muestreo, no una cadencia garantizada. Hay pares de muestras sin variación, uno separado por 13,864 segundos. Eso no prueba que el motor recibiera esa ventana quieta: el snapshot lee el marcador para `wager`, puede capturar la pantalla y vuelve a leerlo para `traffic`. Falta una etiqueta de fase para reconstruir cada entrada exacta de `waitTransition`.

### Frontera de protocolo pendiente de implementar

El código también usa la variación del marcador amplio para calcular `payloadObserved`. En Inca, Big Bass y Blazing aparece `payloadObserved:true` con saldo intacto y sin giro o compra en el HAR. Ese booleano no acredita un payload de apuesta.

La siguiente corrección necesita separar actividad general, identidad de una solicitud propia del juego y estado de captura. No basta con usar sólo el HAR finalizado: `session.entries()` lee `recorder.toJSON()`, que omite los mapas `active` y `webActive`. La revisión offline con el recorder del pin reprodujo un `doSpin` todavía activo que no aparecía en esa lectura; el parser veía sólo `doInit` y un protocolo aparentemente completo. Incluyendo la solicitud activa, reconocía el spin y la incompletitud.

El cambio pendiente debe conservar identidad y orden al pasar de request activo a finalizado, tratar payloads/cuerpos pendientes como incertidumbre y evitar contar dos veces la misma solicitud vista por CDP y webRequest. La quietud debe exigir ausencia de solicitudes propias en vuelo y de captura incierta, además de un marcador estable. Antes del giro de prueba hay que refrescar esa frontera. Las rutas y coordenadas deben seguir saliendo exclusivamente de controles observados.

Esta separación **no está implementada ni validada en los cinco juegos en esta entrega**. No se saltó una espera ni se rebajó una verificación para convertir resultados parciales en completos.

## Configuración y alcance de la evidencia

Las tres ejecuciones usan HardFire `adf6de5ec14e394f77fb1816d5f46e5deb250b0a`, sus componentes reales de controlador, recorder, NetworkTap y runtime, y Electron `44.4.0`. Las versiones efectivas registradas son Node `24.21.0` y Chrome `152.0.7977.78`.

Cada trabajo mantiene una pestaña aislada de 1280×720; la matriz admite dos trabajos simultáneos. Se graba desde antes de entrar en el catálogo oficial y se guarda el HAR antes del cierre. Presupuesto por juego: 100 acciones nuevas, profundidad 8 y 20 minutos; watchdog adicional de 90 segundos y límite externo de trabajo de 30 minutos. Ninguna de las once ejecuciones de juego revisadas agotó ese presupuesto global.

Se solicitó velocidad 4×. El valor observado se leyó dentro del frame DEMO y se conserva por pestaña; `null` significa que no se obtuvo esa lectura, no que se demostrara otra velocidad. En la primera tanda Dragon tuvo lectura `null`; en la segunda y en el diagnóstico tuvo 4. La segunda tanda conserva también lecturas `null` en algunas sesiones de Inca, Big Bass y Blazing; no se supone 4× para esas sesiones.

Los símbolos proceden del HAR, no del nombre del catálogo: Dragon `vs50dragatebch`, Inca `vs20thunder`, Big Bass `vs10bbasblitz`, Hundreds `vs100hsandks` y Blazing `vswaysfirewmw`.

Una compra verificada exige su envío propio y respuesta completa, cierre observado de la operación y un giro normal posterior con ancla independiente. Un HTTP 200, un diálogo abierto o un collider detectado no prueban ese recorrido. `EXHAUSTED_OBSERVED_CONTROLS` sólo agotaría los controles observados, y `completeGame` permanece en `false`.

Los exports incluyen resultado, resumen, HAR saneado de `/gameService` y hasta ocho JPEG de calidad 65. Los cuerpos referenciados se resuelven sobre el HAR original antes de filtrar. Los manifests verifican bytes y SHA-256; los archivos de procedencia guardan IDs, SHA del código y digest del ZIP de Actions. El análisis derivado se conserva separado del resultado original. La copia en el repositorio evita depender de la retención de un día de los artefactos de Actions.

## Verificación del código

La [evidencia de CI](evidence/pragmatic-actions-new5-2026-10-05/ci-validation.json) conserva los runs y los totales revisados. Las suites validan la integración de la PR; son evidencia distinta de los recorridos DEMO.

| Fuente de Fuzzer | Pruebas por entorno | Matriz |
|---|---:|---|
| `571026fe` | 277/277 | [Run 37400090425](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37400090425) |
| `2d3c5617` | 282/282 | [Run 37401583675](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37401583675) |
| `5d371c35` | 285/285 | [Run 37402505202](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37402505202) |

Cada matriz incluye Node 22 y 24 en Ubuntu y Windows, con cero fallos, omitidas, canceladas o pendientes. Las 17 pruebas específicas del host pasan. Los probes de entrada y host con Electron real también pasan, incluyendo el [último run 37402505216](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37402505216). Los probes vacíos acreditan arranque, captura, grabación y cierre; no acreditan un juego.

## Infraestructura corregida para ejecutar las pruebas

El workflow original no creaba trabajos por un contexto de directorio inválido; se corrigió a `github.workspace`. Después, Electron conservaba `--no-sandbox` en `argv[1]` y la guarda del módulo no llamaba a `main()`. Una prueba con Electron real reprodujo la discrepancia; el runner reconoce ahora el archivo de entrada y escribe un sentinel antes de abrir ventanas.

El host también esperaba CDP antes de inicializar el renderer. El [probe A/B 37398841327](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37398841327) reprodujo el bloqueo en `Page.addScriptToEvaluateOnNewDocument`. Cargar `about:blank` primero desbloqueó runtime, captura y grabación. Ese probe detectó además un acceso al getter del WebContentsView después de destruirlo. El host conserva ahora la referencia estable y confirma su cierre. El [probe corregido 37399548934](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37399548934) completó el ciclo en 2.179 ms y 2.108 ms. Los resultados y hashes están en la [evidencia de arranque](evidence/pragmatic-actions-startup-probe-2026-10-06.json).

Los intentos anteriores sin recorrido de juego no se cuentan como pruebas de los cinco DEMOs:

- [37394550052](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37394550052): workflow inválido, sin trabajos de juego.
- [37394763268](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37394763268): módulo importado sin entrar en `main()`, sin abrir juegos ni HAR.
- [37396276232](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37396276232): dos jobs agotaron 21,5 minutos sin progreso y terminaron con `SIGTRAP`, sin export. El bloqueo reproducido del mismo host justificó retirar esa tanda; es una atribución de alta confianza, no una marca directa del estado de esos procesos. Los otros tres jobs quedaron cancelados. El permiso temporal para retirar ese run se eliminó antes de la tanda real.

El runner conserva ahora copias profundas del progreso y checkpoints privados atómicos (`fsync` y rename), actualizados también al guardar el HAR y antes del cierre. Un proceso independiente recupera evidencia durable si Electron termina abruptamente. Sin progreso conserva `ERROR`; con progreso conserva `PARTIAL` y añade el pendiente global. No inventa la acción en curso ni recupera datos que sólo permanecían en RAM. Una regresión termina un proceso y recupera desde otro, con comprobaciones adecuadas para Windows y POSIX.

Las once ejecuciones reales revisadas conservaron evidencia exportada y cierre confirmado de sus pestañas. La rama y sus evidencias quedan en la [PR #1](https://github.com/Shisetsu-Code/Fuzzer/pull/1), en borrador, para revisar el resultado y continuar con la frontera de protocolo identificada.
