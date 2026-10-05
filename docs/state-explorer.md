# Exploración por estados observados

Herramientas MCP locales: `pragmatic_explore_start` y `pragmatic_explore_result`. Solo demos públicas oficiales. La ejecución puede realizar compras con saldo DEMO.

Ejemplo: `pragmatic_explore_start({game_url:"https://www.pragmaticplay.fun/en/slots/candy-rush/",max_actions:20,max_depth:4,timeout_ms:600000})`. Consultar el job_id con result; no repetir start para consultar estado.

## Límites y ejemplo de una prueba extendida

| Argumento | Por defecto | Rango admitido |
|---|---:|---:|
| `max_actions` | 20 | 1–200 |
| `max_depth` | 4 | 1–10 |
| `timeout_ms` | 600.000 | 10.000–1.800.000 |

Para la [repetición de Death Dominion](validation-death-dominion-2026-10-05.md) se usaron 200 acciones, ocho niveles y 30 minutos. La muestra de otros cinco juegos usó 100 acciones y 20 minutos. Son argumentos de esas pruebas, no cambios de los valores por defecto. Cada operación conserva un máximo de tres minutos dentro del plazo restante. Preparar, guardar y cerrar puede añadir tiempo. Las acciones de continuación dentro de una operación no se cuentan como nuevas ramas de menú.

HardFire controla la velocidad por pestaña mediante `hardfire_set_speed({tab_id,speed:4})`; verificarla con `hardfire_tabs`, incluidas las pestañas nuevas de replay. El explorador hereda la configuración del navegador y no tiene un argumento de velocidad. La instalación comprobada creaba pestañas a 4×. Red, recargas, esperas y captura siguen en tiempo real.

`result.json` conserva el resultado completo, `progress.json` guarda avances y `pragmatic_explore_result` devuelve el estado y las referencias locales. Un reinicio pierde los trabajos consultables en memoria; los archivos sobreviven. Los estados y opciones no se cargan automáticamente en otro trabajo.

La cola reproduce rutas separadas y puede volver a abrir el mismo menú para probar distintos hijos. No garantiza prioridad de compra/Ante Bet frente a acciones de navegación. El reporte de cobertura económica debe identificar cada `pur` y `bl` verificados, separado de `PARTIAL` por botones no reactivos. Death Dominion demostró esa distinción: ocho opciones objetivo verificadas y ocho acciones de menú pendientes. El valor `completeGame:false` se conserva.

El explorador usa una cola de menús y acciones observadas hasta que se envía una apuesta. Conserva los controles que deja el filtro conocido y selecciona por disponibilidad, sin dispatch por nombres buy/purchase/confirm/cancel. Reproduce cada ruta de menú en una nueva sesión aislada; comprueba el estado y la presencia del control antes de ejecutar coordenadas frescas. Guardar un estado ya visitado impide expandir cancelaciones indefinidamente. Los estados aleatorios posteriores a una apuesta no entran en esa cola.

Observación de menús: diez segundos sin actividad; hasta sesenta segundos por acción cuando sigue cambiando el buffer HTTP/WS. Si se captura un nuevo doSpin, se pasa inmediatamente a completar la operación. Un timeout o una ruta de menú que no coincide produce PARTIAL con evidencia; nunca significa juego completo.

`ACTIVE_TIMEOUT` deja la acción pendiente incluso cuando la última captura tiene una clave distinta. Esa captura se conserva como evidencia, pero no establece una ruta verificada ni autoriza un giro de seguimiento. Durante replay, alcanzar la clave esperada mediante un timeout tampoco permite pulsar el hijo.

## Separación de elecciones y resultados del bonus

Tras el envío de la apuesta, `operation-completion.js` espera los giros automáticos y resuelve las continuaciones del proveedor. Las elecciones requieren un dibujo visible asociado al control activo; una elección se pulsa una sola vez mientras su panel permanece igual, aunque llegue una respuesta del servidor. Sin una elección visible pendiente, hace clic central cada cinco segundos aunque existan botones de fondo o StageSpin permanezca activo detrás de una intro. La actividad reciente aplaza ese clic. El cierre requiere controles normales disponibles, ausencia de bonus/respin/menú, respuesta completa y protocolo listo. Después de una compra pulsa una vez el spin normal y confirma su respuesta y el retorno a controles normales. Un giro de antebet ya enviado se verifica directamente, sin añadir otra tirada.

La operación se ancla al primer `doSpin` nuevo posterior al contador observado antes de la acción. `operation.submission` conserva su secuencia, tipo, endpoint y payload sanitizados. Aunque ya hayan llegado giros automáticos al observar, una compra conserva su `pur` y su requisito de verificación. El estado más reciente del protocolo sigue gobernando las continuaciones; solo el estado/completitud de la respuesta original puede actualizarse en la evidencia de envío. Una respuesta original incompleta o fallida no se certifica por el éxito de un giro posterior. Sin el envío identificable queda `OPERATION_SUBMISSION_UNAVAILABLE`.

Las elecciones visibles dentro de una compra se guardan en `edge.operation.decisions` con alternativas, selección y relación padre. Para otra alternativa se reproduce solo el camino del menú hasta enviar la compra, y luego se seleccionan las opciones observadas por identidad de control. Nunca se exige la misma configuración de símbolos, premios ni estados aleatorios. Los estados del bonus no crean nodos ni acciones de replay; una operación termina como una hoja (`to: null`). Los prefijos de elección recorridos se recuerdan durante el trabajo para evitar compras duplicadas innecesarias. Un bonus incidental activado por una tirada normal o de antebet se resuelve para terminar la operación, pero sus elecciones no crean compras ni ramas para repetir un resultado aleatorio.

Cada operación tiene un límite de tres minutos, sujeto al plazo restante del trabajo; un fallo conserva la captura y queda pendiente. El guardado de HAR espera hasta diez segundos por respuestas pendientes; si no terminan, guarda lo disponible con `_captureIncomplete`, cierra la pestaña propia y conserva el aviso en `_incompleteSources` del HAR consolidado. No informa cuerpos incompletos como capturas completas. El grafo sigue guardándose por trabajo; todavía no hay reanudación automática entre trabajos.

Los estados de menú se identifican por paths disponibles, etiquetas dibujadas, sprites, configuración de apuesta y flags del runtime. No representan todo el estado oculto: contenido no expuesto por el scanner puede coincidir. Los controles comunes se excluyen mediante el filtro existente; esto no es ausencia total de conocimiento del proveedor. La entrada reutiliza el manejo de cookies, edad e intro. La oclusión frente a overlays sigue sin verificación; un control activo del fondo puede ser candidato. No afirmar cobertura exhaustiva de todas las opciones.

Límites: dos trabajos MCP a la vez, máximo cuatro pestañas de juego incluyendo los otros trabajos Fuzzer. Cada nuevo explorador usa una pestaña propia a la vez. Límite de acciones, profundidad y tiempo; los pendientes se guardan. Capturas JPEG y progress.json/result.json se guardan en el directorio state-explorer por job. Los HAR de cada reconstrucción se consolidan en all-branches.har antes de eliminar únicamente esos HAR temporales propios. El HAR combinado registra respuestas de las distintas sesiones y no representa una sola sesión cronológica. No toca HAR manuales.

Un cierre fallido conserva la propiedad de la pestaña y detiene la creación de nuevas sesiones. `cleanupPending:true` mantiene ocupado el cupo; los registros se comparten entre registros MCP del mismo controlador. La operación `pragmatic_fuzzer_cleanup` recibe el `job_id` de un trabajo terminado y reintenta sus cierres registrados, guardando primero la evidencia. Conserva el snapshot si falla la escritura y mantiene la obligación de guardar si `recorder.stop()` falla después de desactivar `recording`. Solo un guardado y cierre exitosos liberan la propiedad. Un reintento fallido mantiene la pestaña y el cupo; uno exitoso no vuelve a explorar las rutas pendientes. No admite trabajos todavía en ejecución ni reinicia el navegador.

El HAR consolidado se escribe por entradas para evitar el límite de un string gigante. Los cuerpos idénticos se guardan una vez; las siguientes entradas conservan `_bodyReference` con índice y SHA-256 y text vacío. Para leer el cuerpo repetido resolver esa referencia; lectores HAR genéricos pueden mostrarlo vacío. Las peticiones y metadatos de cada entrada se conservan. Validación inicial: Candy y Alien, 12 acciones cada uno, cobertura PARTIAL; evidencia recuperada después de un fallo de consolidación. Las incidencias y límites están en outputs/state-explorer-probe-20261005/results.md. No se afirmó cobertura completa ni finalización del bonus.

## Protección de carga y renderizado

El explorador activa la pestaña propia y comprueba los píxeles del área del juego antes de observar o hacer clic. Una pantalla negra/empty espera hasta 60 segundos, solicita refresco de superficie cada dos segundos y exige dos muestras dibujadas consecutivas. No identifica una imagen negra como estado nuevo ni dispara clics sobre ella. Si no se recupera devuelve SURFACE_NOT_PAINTED, separado de REPLAY_MISMATCH. Es una heurística de píxeles; no garantiza ausencia de intro o de overlays.

La activación, comprobación, captura y clic están protegidos por una cola compartida entre los trabajos de este explorador. No bloquea acciones manuales ni otras herramientas externas. El registro de discrepancias ahora guarda estado esperado, observado y pasos de replay con evidencia. Las cargas de sesiones siguen aisladas; el HAR combinado conserva cuerpos repetidos mediante referencias.

Repetición tras la protección de carga (2026-10-05): Candy y Alien, 8 acciones cada uno, sin ERROR, SURFACE_NOT_PAINTED ni REPLAY_MISMATCH. Las dos rutas antes fallidas de Alien llegaron al estado esperado y ejecutaron BetDown/Level1. El cierre del menú de opciones también cambió de estado. Cada juego conservó 2 QUIET_TIMEOUT por cambios de apuesta; quedaron 11 y 10 acciones pendientes por ACTION_LIMIT. No equivale a juego completo. Evidencia: outputs/state-explorer-paint-20261005/results.md en el workspace principal. Suite completa: 156 pruebas pasaron.

## Saldo y spin de modificadores

Cada transición guarda balanceBefore, balanceAfter, balanceSource, balanceDelta y payloadObserved. El saldo se obtiene de Vars/XT (BalanceDisplayed, CreditDisplayed, Balance, Credit, CurrentBalance o CurrentCredit). Si no hay valor utilizable, consulta la última respuesta form con balance y deja constancia de la fuente; desconocido no autoriza giro. El marcador de tráfico considera cualquier cambio del buffer HTTP/WS, de forma conservadora.

Un saldo igual no prueba que no hubo apuesta: una tirada puede devolver lo mismo o más. El débito es una evidencia adicional; tráfico nuevo impide añadir un spin aunque el saldo final sea igual. Solo un cambio comprobado a un betLevelIndex positivo, saldo conocido sin variación, ausencia de tráfico nuevo, menú cerrado y CanSpin true habilita un spin normal DEMO. Se revalida el estado y el tráfico justo antes de tocar el control de spin observado. Cancelar, cerrar un menú o un cambio de apuesta base no dispara esta regla. Se registra como followup.kind=ONE_NORMAL_DEMO_SPIN y se aplica también durante replay.

Esta implementación reconoce BetLevelSettings/betLevelIndex del runtime Pragmatic; modificadores que usen otra representación quedan sin spin automático. No es detección causal universal de todos los antebet. La comparación de balance por sí sola nunca confirma la finalización de una compra.

Prueba real del detector (2026-10-05), Alien Invaders: BalanceDisplayed.GetDouble=100000 antes/después de abrir compras; modifierEnabled=false y performed=false. Al activar Ante Bet: saldo 100000→100000, payloadObserved=false, modifierEnabled=true y ONE_NORMAL_DEMO_SPIN performed=true. HAR consolidado: exactamente un request doSpin, bl=1, HTTP 200. Prueba acotada a dos acciones raíz; otras ramas quedan por ACTION_LIMIT. Suite completa: 159 tests pasaron. Evidencia local: outputs/state-explorer-wager-20261005/evidence.json.

## Regla de cinco segundos y elecciones anidadas

La regla actual sustituye el requisito exclusivo de betLevelIndex: después de una acción espera al menos cinco segundos y vuelve a observar. Un cambio de configuración respecto a la entrada, con saldo conocido sin variación, sin tráfico nuevo, menú cerrado y spin disponible, permite exactamente un giro normal de comprobación solo si los controles especiales siguen en la superficie de juego original. Nuevos controles o un panel central bloquean el giro: se agregan como hijos y se recorren por replay. Una superficie sin controles tampoco autoriza un giro. Cancelar y volver a la configuración inicial no dispara la regla. Los ajustes conocidos de apuesta se descartan incluso dentro de compras; las elecciones de Ante Bet se conservan.

La comparación geométrica usa posiciones normalizadas de los controles observados, con tolerancia 0.035. Es una heurística, no una prueba de oclusión; no garantiza detectar todos los overlays. La entrada, el saldo y el botón de spin aún usan runtime compartido Pragmatic. No hay un inventario ni coordenadas por juego.

followup.result conserva el request doSpin y balance/w/na de la primera respuesta completa. Normaliza valores con separadores de miles. Solo para las respuestas iniciales na=s/c, cuyo saldo observado excluye el premio pendiente de cobro, mide el débito inicial como saldo anterior - balance y lo compara con c*l. Otros estados quedan UNKNOWN para no confundir ganancias acumuladas o saldos diferidos. HIGHER_THAN_BASE es evidencia de coste superior, no confirmación definitiva de Ante Bet; SAME_AS_BASE_UNCLASSIFIED no confirma una compra ni descarta una confirmación pendiente. Campos ausentes devuelven UNKNOWN. Esta medición no certifica el cierre del bonus.

Suite tras estos cambios: 168 pruebas pasaron. Prueba real y límites se guardan en outputs/state-explorer-choice-20261005 del workspace principal.

## Áreas superpuestas

Una repetición en Candy mostró que el centro del CancelCollider de fondo estaba ocupado por Super Spin 1: el clic físico activó esa opción. El explorador ahora reobserva todos los controles, incluidos los universales, y busca un punto dentro del área objetivo fuera de otras áreas iguales o menores. Prefiere el centro y prueba puntos relativos si está cubierto. Si no encuentra punto libre devuelve AMBIGUOUS_HIT_AREA; no invoca un handler para saltarse la interfaz. Esto evita colisiones geométricas conocidas pero sigue sin demostrar el orden de renderizado.

Validación local de la nueva regla (2026-10-05): la primera tanda exploró 10 acciones por juego, Candy y Alien, conservando 7 estados por juego. Alien abrió dos confirmaciones anidadas e inició las compras; no se certificó el cierre de los bonus. Candy dejó 15 ramas por ACTION_LIMIT; Alien 6 por ACTION_LIMIT y una QUIET_TIMEOUT. No hubo ERROR ni REPLAY_MISMATCH. Esa tanda detectó la colisión del CancelCollider y el saldo con separadores; ambas correcciones se probaron después.

Repetición con la corrección monetaria instalada: Alien, una apertura de compras sin giro añadido y una activación Ante Bet con un giro normal; doSpin bl=1, c=0.1, l=20, HTTP 200, débito 2.50 frente a base 2.00 (1.25x). Evidencia: outputs/state-explorer-final-20261005/ante-evidence.json. La prueba quedó PARTIAL por límite de dos acciones, sin afirmar cobertura completa.

Repetición de áreas superpuestas: Candy, siete acciones, tres modificadores con coste 8/20/200 sobre base 2 (4x/10x/100x). CancelCollider volvió al estado inicial sin spin añadido. Doce pendientes por ACTION_LIMIT, sin ERROR ni REPLAY_MISMATCH. Resultado y captura: outputs/state-explorer-final-20261005/results.md.

## Controles con dibujo pendiente

Los controles que el scanner considera activos pero no logra asociar a un dibujo visible se guardan por estado con UNRESOLVED_DRAWING y captura. Por ello una lista de acciones vacía no se informa como recorrido observado agotado si quedan esos controles sin resolver. Los elementos comunes continúan descartándose, incluido el placeholder HyperPlay/Disabled.

Un dibujo visible sin un rectángulo de clic finito y de tamaño positivo permanece como `UNRESOLVED_HIT_AREA`, con path y captura. No entra en las acciones ejecutables. Los pendientes también forman parte de la identidad observada del estado y bloquean el giro de comprobación de modificadores mientras haya controles sin resolver. La inspección de dibujos conserva su salida anterior cuando no se solicita un área ejecutable.

Tanda de diez demos nuevas (2026-10-05): 96 acciones, 58 estados, ocho juegos con menús especiales y dos sin compras observadas. Dieciséis giros de comprobación en siete juegos; peticiones de compra pur=0 en Eternal Diamonds, Big Bass Halloween Splash 1000 y Gates of Olympus Super Scatter. Cuatro clics QUIET_TIMEOUT con captura; otras ramas pendientes por ACTION_LIMIT/DEADLINE. No hubo ERROR ni REPLAY_MISMATCH en los diez juegos cargados. Sweet Bonanza Pop falló dos veces al entrar y se sustituyó por Eastern Fury. Hearts y Sweet Rush necesitaron la corrección de sprites invisibles; la repetición abrió sus menús sin reglas particulares. No se certifica finalización de bonus ni cobertura completa. Reporte: outputs/state-explorer-new10-20261005/results.md.
