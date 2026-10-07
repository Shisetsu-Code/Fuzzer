# Explorador de estados: contrato actual

Referencia vigente desde la revisión del 6 de octubre de 2026. Los informes fechados de versiones anteriores documentan historia y evidencia, no parámetros actuales. Ver [objetivo y auditoría](objective-and-recovery-2026-10-06.md).

## Entrada y objetivo

`pragmatic_explore_start` / `pragmatic_explore_result`, solo DEMOs oficiales. Start devuelve un `job_id`; consultar result no requiere iniciar otra ejecución. El flujo recomendado es `actions`: determinar qué caminos producen efectos y conservar sus peticiones/controles, sin exigir distinguir compra, ante o giro normal.

| Argumento MCP | Default | Rango |
|---|---:|---:|
| `mode` | `actions` | `actions` / `strict` |
| `max_actions` | 20 | 1–200 |
| `max_depth` | 4 | 1–10 |
| `timeout_ms` | 600.000 | 10.000–1.800.000 |

Ejemplo: `pragmatic_explore_start({game_url:"https://www.pragmaticplay.fun/en/slots/inca-queen/",max_actions:100,max_depth:8,timeout_ms:600000})`.

La API JavaScript `runStateExplorer(controller, options)` conserva esos parámetros en camelCase y admite `mode`, `maxRetries` (default 2 en `actions`), `maxRouteAttempts` (default maxActions × [maxRetries+1]), `operationStallMs` (default 15.000), `benchmark` y `performanceMode`. El MCP expone `mode`; los ajustes de recuperación y benchmark aquí descritos son internos de JavaScript, no argumentos MCP nuevos.

## Flujo

Se observa el estado base A y se encolan los controles utilizables. Se revalida el objetivo antes de pulsarlo. Si aparece un menú listo, se registran sus opciones y se continúa hacia el primer hijo en la misma sesión. Las hermanas conservan la ruta de reconstrucción. Si comenzó una operación, se siguen sus decisiones/continuaciones; un resultado aleatorio de rodillos no se transforma en una ruta nueva.

Si no hay menú ni operación activa y la superficie es base comprobable, `afterAction` puede hacer un único giro DEMO de comprobación por intento, no antes de cinco segundos del clic anterior. No necesita que el efecto se haya clasificado como Ante Bet. Cancelar y después comprobar un giro no demuestra que cancelar fuera una compra: quedan registrados el camino y su efecto.

En modo `actions`, el cierre de una compra no obliga a realizar otro giro de certificación. En modo `strict` se conservan los requisitos anteriores de verificación. No mezclar esos resultados.

La clave de navegación se forma con controles ordenados, etiquetas/sprites, disponibilidad, configuración de apuesta y menú abierto. No incluye saldo ni flags transitorios. La seguridad de entrada es un chequeo separado: protocolo pendiente/incierto o cambiado, control deshabilitado y geometría ambigua impiden pulsar.

## Recuperación de ramas

Hay dos colas: nuevas rutas y recuperaciones. Las nuevas se procesan primero. Un timeout/replay/control temporal recuperable entra en la segunda cola y se intenta después desde A en una sesión nueva. Por defecto son hasta tres intentos totales por ruta. Una rama permanentemente bloqueada no consume tiempo infinito ni borra sus hermanas.

Al descubrir decisiones se guardan todas las alternativas antes de ejecutar una. Si el clic falla, `selected` permanece `null`. En una operación que espera `na=b` o `na=fso`, si el picker convencional no está reconocido, los controles dibujados nuevos pueden formar la decisión: deben tener área válida y no ser controles previos/universales. Se pulsarán físicamente mediante el mismo camino guardado que las otras acciones.

Un layout idéntico no significa automáticamente otra elección. Una respuesta tardía de la anterior no autoriza repetirla; una nueva respuesta completada que pide otra decisión sí puede hacerlo. El avance automático no se combina con un clic central basado en la misma lectura previa.

Si un replay llega a otra variante segura, se registra el camino realmente observado y sus opciones. El destino original sigue pendiente; no se sustituye por otro ni se pulsa a ciegas.

## Resultado y diagnóstico

`nodes` y `edges` conservan estados, acciones y evidencia. Cada intento tiene `routeId`, `attempt` y `attemptElapsedMs`. `validity.valid` informa efecto observado; `validity.terminal` corresponde al cierre comprobado de esa operación.

`attemptHistory` contiene fallos históricos, incluidos los recuperados. `pending` contiene bloqueos finales (`disposition:blocked`) o trabajo diferido (`disposition:deferred`). `queued` conserva tareas sin ejecutar al finalizar. Los checkpoints de progreso incluyen ambas colas; todavía no existe reanudación automática entre procesos/runs.

`recovery` expone `maxRetries`, `routeAttempts`, `retries`, `discoveredRoutes`, `validRoutes`, `resolvedRoutes`, `recoveredRoutes`, `blockedRoutes`, `deferredRoutes`. Los bloqueos incluyen también controles sin dibujo/área y límites de profundidad, por lo que no son un denominador de compras. Las rutas se deduplican por origen/camino/plan, no por significado comercial.

El resumen de CI diferencia `validActionCount` (intentos) y `validRouteCount` (rutas con evidencia válida). Repetir una compra para alcanzar otra decisión puede aumentar ambos sin descubrir un tipo de compra nuevo. `choiceCount` cuenta observaciones de decisiones, no elecciones únicas certificadas.

`stopReason` distingue `BLOCKED_ROUTES`, `ACTION_LIMIT`, `ROUTE_ATTEMPT_LIMIT`, `DEADLINE`, `CLEANUP_FAILED` y `EXHAUSTED_OBSERVED_CONTROLS`. El estado sigue `PARTIAL` si hay pendientes. `completeGame:false` evita convertir un conjunto observado en afirmación sobre todo el juego.

## Tiempos, paralelismo y seguridad

En `actions` las transiciones usan pausa de 500 ms, quietud de 2 s y tope de 15 s. La operación tiene un límite de 15 s sin progreso significativo y un tope absoluto de 180 s. El plazo global puede acortarlos. Cada lectura añade su tiempo; los comandos de navegador ya enviados no tienen cancelación transaccional garantizada.

Se paralelizan lecturas/escrituras independientes de forma acotada. Los inputs se serializan. La lectura del protocolo anterior/posterior reduce carreras de captura, pero no hace atómica la UI ni bloquea a un usuario o herramienta externa. Las capturas raster repetidas no están en cada observación/clic de `actions`; se mantienen comprobación inicial y evidencia al cerrar una rama. El modo `strict` conserva su protección raster anterior.

Un guardado/cierre fallido detiene nuevos intentos y conserva la propiedad/cupo: `cleanupPending`, `retainedTabIds`. `pragmatic_fuzzer_cleanup` solo recupera limpieza de trabajos terminados. No se abren sesiones adicionales para ocultar una pestaña retenida. Máximo dos trabajos y cuatro pestañas DEMO en total.

## Evidencia

Se guarda HAR propio antes del cierre, se consolidan ramas y se exporta una copia saneada. Los cuerpos repetidos del HAR consolidado pueden usar `_bodyReference` con índice y SHA-256; resolver esa referencia antes de asumir un cuerpo vacío. La exportación pública resuelve referencias, elimina credenciales y aplica límites de tamaño. Revisar `exportStatus` y `warnings` por separado de la cobertura.

Los checkpoints conservan observaciones terminadas y la tarea en curso; el resultado no inventa un clic que todavía no terminó. Las peticiones activas se siguen por el registro vivo CDP/webRequest y no por quietud de todos los recursos de la página.

## Alcance de la evaluación

Pruebas deterministas e integración simulada prueban invariantes, no disponibilidad de todos los controles reales. HTTP 200 con cuerpo capturado es la señal actual de transporte aceptado, no validación exhaustiva del contenido semántico. Geometría no prueba oclusión general; decisiones condicionadas por azar y nuevos motores siguen siendo límites. Resultados y bloqueos concretos de esta revisión están en [la evaluación fechada](objective-and-recovery-2026-10-06.md).

Historia: [fiabilidad](reliability-review-2026-10-05.md), [continuaciones](continuation-reliability-2026-10-05.md), [benchmark](performance-benchmark-2026-10-06.md), [tanda de cinco en Actions](validation-pragmatic-actions-new5-2026-10-05.md) y [Death Dominion](validation-death-dominion-2026-10-05.md).
