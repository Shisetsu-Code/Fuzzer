# Controles observados, menú V2 y configuración de apuesta

Leer primero [HANDOFF.md](../HANDOFF.md). Este documento registra implementación y límites de la revisión posterior; los resultados de juegos se publican por separado y no se infieren de las pruebas unitarias.

## Aclaración del objetivo

Los controles universales de sonido, ayuda, ajustes, autoplay, velocidad y spin/stop de base están excluidos deliberadamente del árbol. Su ausencia no indica una brecha. Las acciones específicas, confirmaciones, cancelaciones y decisiones deben recorrerse desde controles realmente observados; no es necesario clasificarlas económicamente antes de actuar. Spin/Stop necesarios para ejecutar una operación tienen un tratamiento separado.

## Hallazgo medido antes del arreglo

La auditoría de Hundreds and Thousands en Actions, run `37522091831`, job `112469802172`, fuente `50eaecf4`, registró el scanner y un inventario independiente de componentes activos sin disparar handlers. **ButtonNo y ButtonYes0 ya estaban en la salida del scanner, con CATButton y rectángulos de clic válidos.** Estaban bajo `FeaturePurchase/FSPurchaseOptions/ConfirmationWindow`. El filtro de controles universales no los descarta. Por tanto la hipótesis anterior «el scanner no encuentra aceptar/cancelar» era demasiado amplia y es incorrecta para este caso.

Pese a los controles nuevos, la transición terminó `ACTIVE_TIMEOUT` tras 15.483 ms y el menú no llegó al grafo. La frontera problemática es el reconocimiento/readiness del menú: la integración se basaba en el indicador legado `FeaturePurchaseWindowIsOpen`. Se añade el contexto de controles de compra proyectados y habilitados, conservando el indicador cuando exista. Una entrada `FSPurchaseMainButton` por sí sola nunca acredita menú abierto; un control deshabilitado o sin geometría tampoco. La tirada normal se rechaza igualmente si el menú V2 está observado.

El mismo inventario muestra `Buy_BetButtons/Content/BetUp_Button` y `BetDown_Button` habilitados en el menú, con eventos SmartIncreaseBet/SmartDecreaseBet. Los controles de apuesta de base estaban deshabilitados allí. No se fabrican payloads ni se adivinan índices.

## Apuestas: cobertura finita y explícita

En modo actions se incluyen +/- solamente con un menú de compra observado. Conservan el rol `wager-adjustment`; fuera del menú siguen siendo controles universales excluidos. Primero se prueban los controles funcionales al importe actual, después las variaciones.

El valor de apuesta se lee de variables runtime conocidas, con su fuente. La identidad incluye ese valor y las etiquetas/precios de los controles, nunca el saldo. Antes del clic se vuelve a comprobar importe/fuente; un cambio rechaza la observación con `ACTION_CONFIGURATION_CHANGED`. No hay acceso concurrente de inputs en una misma sesión.

El límite por defecto es **un paso de ajuste por ruta**, por lo que se contempla el importe actual y un paso arriba/abajo cuando estén disponibles. Los hijos funcionales se recorren en los estados nuevos. Más +/- en esa ruta quedan como `WAGER_SAMPLING_LIMIT`, no como fallo del juego. `maxWagerStepsPerRoute` admite 0..3 en el motor/API JS, pero no está expuesto todavía como parámetro del MCP.

Los nodos conservan el importe observado, las exclusiones y su motivo; los edges de ajuste conservan antes/después y las etiquetas vistas. `coverage.allAmountsTested` es siempre false: esto **no** declara haber probado todos los importes ni todas sus combinaciones. Los valores runtime no sustituyen el coste real de la petición.

## Decisiones y carreras

Una elección visible con protocolo completo que pide bonus/opciones puede ejecutarse aunque persista `StageSpin` detrás. Sin respuesta completa ese indicador sigue bloqueando el envío. Se mantiene el latch de una elección cuando el panel se oculta momentáneamente: reaparecer el mismo panel sin nuevo intercambio no autoriza otro clic. La alternativa se registra antes del intento y los hermanos conservan su recuperación desde A.

Persisten la validación de captura pendiente/incierta, marcador de protocolo, control habilitado, geometría y presupuesto justo antes del clic. Una comprobación no convierte todas las lecturas de UI en una transacción atómica ni demuestra un orden de oclusión general; los casos no acreditados deben quedar pendientes.

## Infraestructura y continuidad

El primer inventario no entró al runner por un argumento relativo de Electron. Se corrigió con una regresión para rutas relativas/absolutas y `--app=`. Otro inventario quedó cancelado mientras esperaba: `cancel-in-progress:false` no conservaba múltiples runs pendientes. Los tres workflows que comparten `pragmatic-live-demos` ahora usan `queue:max`, manteniendo un lote activo y máximo dos jobs dentro del lote. No se incrementó la concurrencia ni se cancelaron sesiones de juego activas.

Referencia oficial del comportamiento de cola: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency . El inventario corregido terminó en 65.680 ms, guardó evidencia y cerró su sesión. Era una prueba de dos acciones; `PARTIAL/ACTION_LIMIT` no es cancelación de GitHub ni cobertura completa.

## Validación determinista antes de publicar

Se reprodujeron fallos antes del arreglo: controles de apuesta descartados dentro del menú; identidad que no distinguía importes; cambio de importe antes del clic; StageSpin que suprimía una elección válida; panel que se ocultaba y reactivaba el mismo clic; indicador legado falso con confirmación V2. Los tests de seguridad conservan los rechazos de controles deshabilitados, geometría ausente y respuesta/captura pendiente.

La copia local completa pasó **392/392** en Node 22.16.0, cero fallos/omisiones, 27,44 s. La publicación se divide entre motor y regresiones/export de diagnóstico; comprobar el SHA de cada run antes de atribuirle un número de tests. Esta cifra no acredita un recorrido DEMO. Las nuevas pruebas reales se solicitan por marcador explícito en el commit del motor.
