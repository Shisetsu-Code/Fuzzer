# Objetivo, recuperación y evaluación — 6 de octubre de 2026

## Contrato del producto

Fuzzer debe descubrir caminos ejecutables de los DEMOs oficiales: observar controles disponibles, pulsar una opción, seguir las nuevas opciones y registrar su efecto. No necesita decidir primero si una acción es compra, Ante Bet o giro normal. La clasificación económica es información adicional, no una puerta de entrada al recorrido.

Desde A se sigue una rama en la sesión actual. Cada bifurcación conserva sus alternativas. Para una hermana se guarda el HAR, se confirma el cierre, se crea una sesión aislada y se reconstruye el camino desde A. Si la acción no inicia una operación ni abre otro menú y el juego vuelve a base comprobable, se permite un giro DEMO de comprobación, como máximo uno por intento de ruta. Repetir una ruta en otra sesión puede producir otro giro: no es garantía de una sola apuesta en toda la vida del proyecto.

Tres resultados son distintos: **acción con efecto observado**, **operación finalizada**, **cobertura del grafo observado**. Una acción aceptada puede conservar su validez aunque su continuación falle. Un menú abierto no acredita sus hijos; una petición con HTTP 200 no acredita el cierre; haber agotado lo observado no demuestra que no existan opciones ocultas o aleatorias. `completeGame` permanece `false`.

## Qué fallaba y qué cambió

Base de esta revisión: `f0f4a907d3ecf8c3361a16296f5c49358d6a7427`. Implementación: `61561dba5e41b2efb300c03b6c6c780b6d3add98`.

| Hallazgo reproducido | Corrección |
|---|---|
| El primer timeout quitaba una tarea de la cola y la dejaba solo en el informe. | Cola separada de recuperación: primero trabajo nuevo, después reintentos FIFO. Dos reintentos por ruta por defecto en modo `actions`. |
| El resultado no separaba intentos repetidos de rutas lógicas. | `routeId`, `attempt`, `attemptHistory`, `recovery`, `stopReason` y `validRouteCount`. Se preservan los fallos históricos aunque el reintento funcione. |
| Flags transitorios y saldo confundían identidad de navegación con resultado del juego. | Clave canónica de controles/configuración; disponibilidad y protocolo se validan por separado. |
| Un replay diferente descartaba un menú nuevo utilizable. | Se aprende el estado real y su ruta observada si está listo, sin fingir que coincide con el objetivo anterior. |
| Un menú nuevo pasaba por la espera de cinco segundos del giro de comprobación. | Si ya es un menú listo, se conserva directamente como siguiente nodo. |
| Una elección fallida perdía las alternativas. | Las opciones se registran antes del clic, con `selected:null` hasta confirmar el intento. |
| El detector de decisiones dependía de algunos nombres de picker. | Si el protocolo espera `b`/`fso` y no hay picker reconocido, se usan controles dibujados nuevos, habilitados y con geometría, excluyendo controles anteriores y universales. |
| La misma disposición puede ser una nueva decisión o una respuesta tardía de la anterior. | Se distingue una nueva solicitud de elección de una respuesta de cierre. Una confirmación tardía que ya dice girar/cobrar no rearma el clic. |
| Una captura incierta o un botón recién deshabilitado podían sobrevivir hasta el clic. | Revalidación inmediatamente anterior al envío; rechazo de `uncertain`, cambio del marcador y `enabled:false`. |
| Un `await` de continuación podía consumir el plazo y dejar otro clic basado en la lectura anterior. | Revisión del plazo tras la espera y no combinar continuación y clic central en la misma observación. |
| Una operación sin progreso consumía 180 segundos. | En `actions`, 15 segundos sin progreso significativo producen `OPERATION_STALLED`; se conserva el límite absoluto de 180 segundos. |

### Evidencia que motivó el detector de decisiones

En [la ejecución base](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37452387389), Dragon's Gate envió `doSpin` con `pur=0`; la respuesta anunciaba `na=b`, `ch_k=f,r` y `ch_v=0,1`. La captura del artefacto `11407656215` mostraba **5 FREE SPINS / 3 RESPINS** dentro de Prosperity Bonus. El resultado tenía cero decisiones y acabó con `PROTOCOL_NOT_READY`. No era necesario esperar más: faltaba reconocer esos controles.

El artefacto de Big Bass Blast `11408161362` conservaba un `REPLAY_MISMATCH`: durante la reconstrucción apareció otra configuración y el motor descartó esa ruta. Eso motivó aprender variantes observadas de forma segura, no ignorar todos los checks de identidad.

## Ejecución y recuperación

Los fallos recuperables de transición, replay, control desaparecido y elección se reprograman al final de una **cola de recuperación independiente**. No desplazan alternativas nuevas. Cada recuperación empieza en una sesión limpia; no repite un clic incierto en la pestaña anterior. Dos reintentos significan como máximo tres intentos de esa ruta, siempre que quede presupuesto global. Errores no reconocidos y fallos de limpieza no se reintentan a ciegas.

`attemptHistory` es historia, no lista de tareas. `queued` contiene trabajo sin ejecutar; `pending` contiene bloqueos finales o tareas diferidas por presupuesto. Un reintento resuelto deja de ser un bloqueo final, sin borrar su primer error. La validez previa tampoco se borra por un fallo posterior.

La identidad de ruta incluye estado de origen, camino y plan de decisiones. Los contadores son de **rutas del planificador**, no de compras semánticamente diferentes: caminos distintos pueden activar la misma función. `validActionCount` cuenta intentos con evidencia; `validRouteCount` cuenta rutas lógicas con al menos un intento válido. `choiceCount` es observaciones de decisiones, no opciones únicas exhaustivas.

## Presupuestos y tiempos

| Frontera | Configuración en Actions o en `actions` |
|---|---|
| Juegos simultáneos | 2 trabajos; 1 pestaña aislada por host de CI. Se mantiene el máximo general de 4 pestañas DEMO. |
| Velocidad del host | 4× solicitada; velocidad observada registrada por pestaña. |
| Trabajo por juego en `.github/workflows/pragmatic-new5.yml` | 100 intentos de acción destino, profundidad de navegación 8, 600.000 ms (10 minutos). |
| Intentos de rutas, incluidos replay sin clic destino | Por defecto `maxActions * (maxRetries + 1)`; 300 en esa tanda. |
| Reintentos por ruta | 2 en `actions`; 0 por defecto en el motor `strict`. API JavaScript admite 0–5. |
| Observación de transición | pausa de 500 ms; quietud mínima 2 s; intento de transición 15 s. |
| Operación | 15 s sin progreso, máximo absoluto 180 s, siempre dentro del plazo global. |
| Giro de comprobación | No antes de 5 s desde la acción anterior y solo con las comprobaciones de base. |
| Watchdog adicional de CI | Presupuesto global + 90 s para salida y recuperación; job de Actions limitado a 30 min. |

Estos son presupuestos, **no latencias garantizadas**. El intervalo real añade lo que tarde cada lectura del navegador. Un comando de Electron/CDP ya iniciado no tiene cancelación transaccional garantizada y puede sobrepasar un plazo; no se autoriza por ello otro clic concurrente. El guardado y cierre también consumen tiempo. El presupuesto de inactividad de 15 s es configurable por `operationStallMs` en JavaScript; puede resultar insuficiente para una animación sin cambios observables, caso que se registra y reintenta, nunca se certifica como completo.

El [benchmark anterior](performance-benchmark-2026-10-06.md) midió aproximadamente 81% del tiempo en capturas antes de quitar comprobaciones raster repetidas. No debe atribuirse ese porcentaje a la versión actual. El paralelismo reduce esperas de lecturas independientes, pero no convierte todas las tareas del navegador en trabajo paralelo. Los tiempos de subfases concurrentes no se suman como tiempo de pared.

## Auditoría de bloqueos y carreras

Los clics siguen serializados bajo la exclusión de superficie. La selección física de una decisión llama al camino de clic guardado **fuera** del lock externo para evitar un lock anidado que se espere a sí mismo. Los reintentos esperan a que termine el intento anterior y a que su sesión guarde/cierre. No se añadieron procesos que pulsen mientras otra promesa de input sigue pendiente.

Las lecturas independientes pueden ocurrir en paralelo, pero la frontera de protocolo se compara antes/después y de nuevo antes del clic. Eso detecta cambios de solicitudes/capturas, no promete una instantánea atómica de toda la UI. Las acciones manuales o de otra herramienta no están cubiertas por el lock de este explorador.

Se comprobaron deadlines con reloj del adaptador, retrasos en checkpoints, cambios de respuesta con el mismo número de solicitudes, falta de cuerpo, controles deshabilitados, captura pendiente/incierta, elección con respuesta tardía, excepción al elegir y fallo de guardado/cierre. Si la limpieza falla, no se usa una sesión nueva para ocultar el problema.

## Evaluación del objetivo y límites abiertos

La lógica implementada satisface en pruebas deterministas el recorrido de controles, la conservación de alternativas y la recuperación acotada sin exigir clasificación económica. Eso **no basta para afirmar que ya recorre íntegramente todos los juegos**. La prueba decisiva es el grafo, las decisiones y las peticiones conservadas por cada DEMO, no el número de tests ni el color del workflow.

Persisten límites explícitos: solo Pragmatic está implementado; la UI depende del scanner del runtime y de geometría, sin prueba general de oclusión; las decisiones genéricas están acotadas a estados de elección soportados; ramas condicionadas por resultados aleatorios pueden no reaparecer; no hay reanudación automática de la cola entre procesos o runs de Actions. Los checkpoints conservan evidencia y trabajo pendiente para diagnóstico, no constituyen un scheduler distribuido.

La validez `ACCEPTED_REQUEST` usa actualmente respuesta HTTP 200 con cuerpo capturado de la operación identificada. No es un validador exhaustivo de errores semánticos contenidos dentro de HTTP 200. Para una certificación comercial haría falta esa validación adicional; no debe confundirse con identificar el tipo de apuesta.

La exploración puede parar correctamente por `BLOCKED_ROUTES`, `ACTION_LIMIT`, `ROUTE_ATTEMPT_LIMIT`, `DEADLINE` o `CLEANUP_FAILED`. Solo si no quedan pendientes informa `EXHAUSTED_OBSERVED_CONTROLS`. Ninguno de esos estados establece `completeGame:true`.

## Validación reproducible

Base local: 346/346 pruebas. Después de esta revisión: **370/370**, sin fallos ni omisiones, con Node 22.16.0; ejecución completa de aproximadamente 28 segundos. Son 24 pruebas nuevas: 20 de recuperación/decisiones, 3 escenarios del adaptador y 1 de exportación. Se observaron fallos RED antes de sus correcciones. La suite completa también detectó la doble selección con respuesta tardía y pasó después del arreglo. Revisión realizada en esta sesión; no se atribuye revisión independiente.

Fuentes ejecutables: `test/route-recovery.test.js`, `test/state-explorer-integration.test.js`, `test/operation-completion.test.js`, `test/recovery-export.test.js` y las regresiones previas. Comando: `npm test`. La matriz Linux/Windows y Node 22/24 está en [Actions](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37459984312). La repetición de los cinco DEMOs de esta implementación está en [la tanda 37459984251](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37459984251). Sus resultados deben inspeccionarse por juego; iniciar el workflow no cuenta como éxito.
