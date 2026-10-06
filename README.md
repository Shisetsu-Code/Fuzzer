# Fuzzer

Scripts independientes por proveedor para ejecutar demos mediante el MCP local HardFire. No depende de Firetrace. La primera implementación corresponde a Pragmatic; otros proveedores no están implementados todavía.

## Estado actual y recorrido recomendado

El recorrido actual por botones observados usa `pragmatic_explore_start/result`. El flujo económico anterior `pragmatic_fuzz_start/result` sigue disponible; sus límites y verificaciones son distintos. El extractor `pragmatic_drawn_buttons` permite inspeccionar los botones sin hacer clics.

```json
{"game_url":"https://www.pragmaticplay.fun/en/slots/death-dominion/","max_actions":200,"max_depth":8,"timeout_ms":1800000}
```

Enviar esos argumentos a `pragmatic_explore_start`, guardar el `job_id` y consultar `pragmatic_explore_result`. No volver a iniciar para consultar progreso. Para una primera muestra acotada se pueden usar 100 acciones y 20 minutos; el máximo admitido es 200 acciones, diez niveles y 30 minutos. Una compra tiene hasta tres minutos dentro del tiempo restante. La preparación, el guardado y el cierre pueden añadir tiempo al presupuesto de exploración.

HardFire proporciona `hardfire_browser({mode:"visible"})`, `hardfire_tabs` y `hardfire_set_speed({tab_id,speed:4})`. La velocidad corresponde a cada pestaña; hay que verificar también las pestañas nuevas. La instalación local usada en las pruebas tenía 4× por defecto. El explorador no tiene un argumento `speed` ni instala esa configuración del navegador: acelerar animaciones no acelera red, recargas ni esperas de observación.

La [repetición de Death Dominion del 5 de octubre](docs/validation-death-dominion-2026-10-05.md) verificó las cuatro compras y los cuatro Ante Bet/Super Spin, con payload y respuesta por opción. El recorrido global quedó `PARTIAL` por ocho acciones de menú sin cambio observable; no falló ninguna de las ocho operaciones objetivo. El [contrato individual sanitizado](contracts/pragmatic/vs20ddominion.json) y el [grafo observado](docs/evidence/death-dominion-2026-10-05.json) están versionados. La [muestra de cinco juegos nuevos](docs/validation-pragmatic-new5-2026-10-05.md) documenta también los fallos que siguen abiertos.

El grafo se guarda por trabajo, pero todavía no se reanuda automáticamente en otro trabajo. Los resultados aleatorios de un bonus no se comparan ni se convierten en rutas de compra. Después de cada compra el explorador exige una tirada normal y el regreso a controles disponibles. Consulte [estados, continuaciones, límites y formato HAR](docs/state-explorer.md), [extracción de botones](docs/drawn-buttons.md) y [controles internos del proveedor](docs/pragmatic-direct-controls.md).

La [revisión de fiabilidad del 5 de octubre](docs/reliability-review-2026-10-05.md) conserva la identidad de la primera apuesta enviada después de cada acción, registra como pendientes los controles visibles sin área de clic y evita que un timeout establezca una ruta. Incluye pruebas de regresión e integración; no agrega validaciones DEMO nuevas a las muestras anteriores.

La [revisión de continuaciones](docs/continuation-reliability-2026-10-05.md) permite recuperar la ausencia confirmada del spin antes del clic, corrige la actividad de componentes deshabilitados y ancla por separado la petición de verificación. Cada operación conserva un diagnóstico de cierre en `completion`; un clic aceptado sin petición nueva permanece pendiente y no se repite automáticamente.

Como máximo dos trabajos simultáneos y cuatro pestañas DEMO cargadas en total, incluidas las auxiliares. Guardar evidencia y cerrar las pestañas propias antes del siguiente trabajo; no reiniciar HardFire con trabajos activos. Conservar un HAR automático por juego después de guardar su evidencia estructurada; los HAR manuales no se eliminan.

Si falla el guardado o cierre, el recorrido se detiene y el trabajo conserva su capacidad ocupada. El resultado indica `cleanupPending` y `retainedTabIds`. Cuando el trabajo termina, `pragmatic_fuzzer_cleanup({"job_id":"ID_DEL_TRABAJO"})` reintenta únicamente el guardado y cierre de sus pestañas retenidas; no vuelve a ejecutar acciones ni inicia otras sesiones. El mismo cierre se comparte entre llamadas concurrentes. Los HAR recuperados aparecen en `cleanupHars`; el error histórico y las rutas pendientes siguen visibles. Sin una identidad o un cierre propio registrado, se informa que la recuperación automática no está disponible. Los registros de recuperación viven en el proceso MCP actual.

## Flujo económico anterior desde el chat conectado al MCP local

1. Consultar `hardfire_tabs` y elegir un `tab_id` existente.
2. Llamar `pragmatic_fuzz_start` con ese ID y la URL pública del juego. `execute=false` descubre funciones y compara variables/apuestas; `execute=true` recorre las compras y elecciones descubiertas.
3. Guardar el `job_id` y consultar `pragmatic_fuzz_result`. Nunca repetir el inicio para consultar progreso.

```json
{"tab_id":3,"game_url":"https://www.pragmaticplay.fun/en/slots/coven-rising/","execute":true,"max_steps":200,"timeout_ms":360000}
```

El trabajo usa pestañas DEMO nuevas con sesiones aisladas. No navega ni graba sobre la pestaña original. Cada rama reproduce su ruta en una demo nueva; guarda su HAR antes de cerrar la pestaña propia. La mayoría de edad debe haber sido confirmada por el usuario si el sitio la solicita.

## Organización

- `providers/pragmatic/flow.js`: árbol de este proveedor, con límites y estados COMPLETE/EXPANDED/PENDING.
- `providers/pragmatic/session.js`: variables económicas, autoridad del servidor, órdenes y captura de payloads.
- `providers/pragmatic/parser/runtime.js`: código de interacción reutilizado de Shisetsu-Code/Parser.
- `providers/pragmatic/exceptions.js`: lugar reservado para excepciones demostradas de juegos específicos.
- `integrations/hardfire`: conexión directa con Electron y registro de las funciones MCP.
- `test`: pruebas del árbol, compras, payloads, dominios DEMO y referencias de marcos.

No hay un motor universal que adivine controles de todos los proveedores. El formato de resultados y el transporte se pueden compartir; los botones, estados y continuaciones pertenecen al proveedor.

## Evidencia y límites

`purInit` confirma las compras Buy Feature habilitadas en la sesión; controles internos vacíos no las crean. Antebet y otros modificadores se registran aparte cuando el runtime los expone. Una función anunciada pero no ejecutable permanece pendiente, no se declara ausente.

El experimento `BET_IMPACT_PROBE` ejecuta `+ + − −`: guarda cinco snapshots numéricos, espera estabilidad de apuesta/precios y comprueba la restauración. Barre hasta 2.000 variables numéricas o booleanas sin depender de nombres económicos, excluyendo eventos y nombres sensibles. La apuesta de referencia todavía se obtiene de variables conocidas de Pragmatic. En el nivel superior hace dos spins DEMO y guarda requests/responses sanitizados. La restauración se intenta también si falla la prueba; no reduce la apuesta cuando un incremento al máximo no cambió su valor.

`impact` conserva valores, deltas y multiplicadores observados. Usa `DERIVED` para series proporcionales reversibles, `TRANSIENT` para series que no regresan, y `UNKNOWN` para el resto. No asigna certeza causal ni diferencia DIRECT de DERIVED sin evidencia adicional. El precio `purchase-config.bet * BetDisplayed` se etiqueta como cálculo derivado. No prueba por sí mismo que una compra se ejecutó. Los snapshots numéricos completos quedan en el contrato local; la consulta MCP devuelve la comparación y un resumen de cada snapshot.

La segunda fase con 4–6 apuestas distintas, detección automática de la variable base y clasificación THRESHOLD/SERVER_ECHO todavía no está implementada. Se conserva el tráfico para contrastar esa evidencia posteriormente.

Los contratos exportados contienen payloads permitidos sin tokens de sesión ni credenciales. Los HAR completos siguen siendo archivos privados locales y pueden contener datos sensibles; no se versionan. El contrato se guarda en `.hardfire/fuzzer` bajo el perfil que ejecuta Electron. Los trabajos consultables en memoria se pierden al reiniciar el proceso; el archivo conserva la evidencia.

Si falta una respuesta, cambia un control, aparece una elección no reconocida o se alcanza un límite, la rama queda pendiente. El explorador nuevo tiene una regla explícita de clic central cada cinco segundos para continuaciones, condicionada al tráfico y a las elecciones visibles; no reenvía una compra dentro de la misma operación por un timeout. Una alternativa se prueba reconstruyendo su ruta en una sesión nueva.

## Instalación y comprobación

Node.js 22 o posterior. `node --test test/*.test.js` ejecuta las pruebas sin instalar un navegador adicional. `scripts/install-hardfire.ps1` instala una copia del módulo y añade sus herramientas al MCP HardFire existente, con verificación de hash y respaldo del registro. Ejecutar bajo la cuenta de Windows con acceso a HardFire. Luego guardar cualquier HAR pendiente y reiniciar HardFire para que cargue el módulo.

El workflow `Tests` ejecuta `npm test` en Linux y Windows con Node 22 y 24. Las pruebas de integración del explorador ejecutan su lógica real y sustituyen los límites de Electron/captura/sesión; no cargan juegos ni equivalen a una certificación en vivo. El mock de módulos experimental se activa solo en sus procesos de prueba hijos. Los resultados de cada tanda se documentan junto a sus cambios.

### DEMOs reales en GitHub Actions

El workflow `Pragmatic live DEMOs` ejecuta el explorador existente con Electron y los módulos reales de HardFire fijados a un commit. El host de CI aporta una pestaña aislada de 1280 × 720 por trabajo; admite dos trabajos simultáneos y guarda el HAR antes de cerrar cada pestaña. Solicita velocidad 4× y registra por separado la velocidad observada dentro del frame DEMO.

La tanda se define en `docs/evidence/pragmatic-actions-new5-2026-10-05-manifest.json`. En una PR del mismo repositorio, el mensaje del último commit debe incluir `[live-demo:all]` para ejecutar los cinco o `[live-demo:inca-queen]` para repetir únicamente ese id. Un commit sin ese marcador no vuelve a jugar la tanda. También existe `workflow_dispatch` con `game_id`, cuando el workflow está disponible en la rama predeterminada.

Cada juego tiene un presupuesto de 100 acciones, profundidad 8 y 20 minutos. El artefacto conserva `result.json`, `summary.json`, un `protocol.har.gz` saneado y hasta ocho capturas JPEG65; la retención es de un día. El resumen también queda en el log con el prefijo `FUZZER_SUMMARY_JSON=`. Los HAR crudos y los perfiles de sesión quedan fuera de la subida.

El estado del juego y la exportación se informan por separado. `PARTIAL` conserva lo recorrido y sus pendientes; `EXHAUSTED_OBSERVED_CONTROLS` sólo significa que se agotaron los controles observados dentro de esa exploración. El resultado siempre mantiene `completeGame:false`. Un fallo de entrada no cuenta como juego recorrido, y HTTP 200 por sí solo no verifica el cierre de una compra.

`npm run pragmatic -- TAB_ID URL_PUBLICA execute` inicia un trabajo desde la consola. Usa el SDK MCP ya instalado en HardFire; `HARDFIRE_HOME` permite elegir su directorio y `MCP_URL` el endpoint local.

El catálogo comprobado es el MCP local de HardFire. No se publican estas funciones mediante Firetrace ni se despliega un servicio Cloudflare nuevo.

La entrada recomendada es la página del juego del catálogo `.fun`, por ejemplo `https://www.pragmaticplay.fun/en/slots/coven-rising/`. Cada rama abre esa página en una sesión aislada, confirma el aviso de edad previamente autorizado y pulsa su botón Play Demo. El sitio crea la sesión DEMO dentro de su iframe; no se vuelve a pulsar el botón una vez cargado. Solo se admiten rutas de juego `/en/slots/<slug>/` sin query ni fragmento. La raíz del catálogo sirve para elegir el juego; la herramienta requiere la URL de su página individual.

Se mantiene compatible el lanzador DEMO público `https://demogamesfree.pragmaticplay.net/hub-demo/openGame.do?gameSymbol=vs20coven&lang=en&cur=USD&gcpif=8012&jurisdiction=99` y las páginas anteriores `.com`. Se rechazan URLs de juego autenticadas, parámetros ajenos y credenciales copiadas del HAR. Ver el [contrato de Coven](contracts/pragmatic/vs20coven.json).

## Descubrimiento dinámico y familias

No se presupone que un juego tenga dos compras. `purInit` anuncia la lista actual del servidor, y el recorrido registra las opciones de los estados/menús observados. El grafo conserva cada opción con su padre, clase de control, costo disponible y estado UNTESTED/PENDING/EXPANDED/COMPLETE. Incluye opciones no ejecutadas. Los menús de compras activos que aparecen después de empezar también se inspeccionan; no se consideran un regreso terminal a base si aún tienen opciones.

No hay un número fijo de ramas por defecto. `max_branches` es un presupuesto opcional, independiente de la cantidad descubierta. Permanecen límites de tiempo, profundidad y pasos; si se alcanzan, las rutas conocidas quedan pendientes y `coverage.graphComplete` es false. Una cola vacía no prueba por sí misma que nunca aparecerán opciones nuevas.

`familyHints` describe patrones observados como entry→buy o buy→pick, además de transiciones del protocolo. `relateFamilies` compara esos patrones entre contratos. Son relaciones candidatas para reutilizar conocimiento de interacción; no copian cantidad, compras ni payloads de un juego a otro. Cada juego tiene que confirmar su inventario propio. Las familias con grafos parciales no equivalen a descubrimiento completo.

Los nodos incluyen una referencia a la serie económica medida de esa opción, cuando existe; no se completa la economía de un hermano por semejanza. Seleccionar una compra anidada tampoco demuestra envío: si falta una confirmación o el spin requerido no está demostrado, permanece pendiente.

`pragmatic_fuzz_result` pagina las ramas con offset/limit y el grafo con graph_offset/graph_limit; graph.next_offset indica otra página. El contrato completo se guarda localmente. La [validación de cinco demos](docs/validation-pragmatic-five-2026-10-04.md) documenta inventarios, ramas pendientes y el reintento que confirmó una compra completa tras corregir el cierre. Siguen pendientes variantes de menús anidados y transiciones de bonus específicas.

La [evidencia manual y prueba automática de Helios](docs/helios-manual-har-2026-10-04.md) incorpora un [contrato individual](contracts/pragmatic/vs20olympuspot.json): compras 80×/200×, Ante 1,5× y payloads sanitizados. Se distinguen las opciones anunciadas de las ejecutadas y se conserva el cierre `fs_total`.

## Procedencia

El runtime de Pragmatic y su helper proceden de [Parser](https://github.com/Shisetsu-Code/Parser), referencia consultada `56817ddd45a864ad91087fa576319b9aad0e6436`. Fuzzer conserva el árbol y las invocaciones del cliente; añade recorrido por ramas, sesiones independientes, comparación de apuestas, captura y herramientas MCP propias.

## Continuaciones y Ante Bet

El controlador activo tiene prioridad sobre la respuesta del servidor. Cuando `StageSpin` sigue registrado, se termina la animación mediante su evento Stop antes de seleccionar opciones. `StageResultFreeSpin` programa sus propios giros: no se envía el botón normal de spin ni una petición directa al servidor para forzarlos. Su confirmación se basa en la instancia activa y `fsStartConfirmed`, además de los controles visibles.

El cierre puede ser una transición del cliente sin una petición nueva. Si se registró un `doCollect` exitoso con `na=s`, el runtime conserva el estado final del bonus y permanece el controlador de resultado, se usa su evento Win/Lose registrado para cerrar la pantalla. No se aplica a un bonus sin cobro confirmado.

`BetLevelV2.betLevelSettings.betLevelScale` permite enumerar uno o varios niveles de Ante Bet con su multiplicador respecto al nivel cero. Cada nivel se activa mediante el controlador real, validando disponibilidad. La verificación exige dos respuestas nuevas de giros normales con `bl` correcto y sin `pur`; activar el modo no prueba por sí solo su ejecución. Los modos no identificados permanecen pendientes.

Si la última acción de Ante ya confirmó esas dos tiradas y una observación nueva sigue en base sin opciones, el cierre reutiliza la evidencia; no envía dos giros adicionales. Si una comprobación terminal de otra rama activa un bonus natural, el recorrido continúa mediante sus controles conocidos y conserva los límites. Una elección dentro de ese bonus aleatorio queda `NATURAL_BONUS_CHOICE_REQUIRED`: no se agrega como ruta fija de compra que otra sesión no podría reproducir. Tampoco se certifica una función con el bonus abierto.

Las respuestas conservan `rs_c`, `rs_p`, `rs_m` y `rs_t`, además de los códigos `msg_code`/`ext_code`. Un contador activo en `rs_c`, incluidos contadores separados por comas, impide declarar base o certificar un giro ordinario aunque el cliente muestre brevemente `canSpin=true`. Esto evita falsos COMPLETE; no implica que todas las continuaciones de cascadas estén resueltas.

En `pragmatic_fuzz_start`, `timeout_ms` controla el presupuesto entre 1.000 y 600.000 ms; por defecto 180.000. En `pragmatic_explore_start`, admite entre 10.000 y 1.800.000 ms; por defecto 600.000. La preparación y el guardado de HAR pueden agregar tiempo. Agotar el presupuesto conserva las rutas pendientes y nunca convierte un resultado parcial en completo.
