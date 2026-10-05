# Corrección de Ante y cinco juegos nuevos

La evidencia de Coven mostraba dos giros correctos de Ante `bl=1`, seguidos por un tercer giro enviado por la verificación duplicada. Ese giro activó naturalmente doce free spins y produjo un falso pendiente del Ante. El recorrido ahora reutiliza la evidencia de dos giros de un modificador solamente si una observación fresca sigue en base sin opciones. Las compras conservan la verificación terminal.

Una verificación terminal que activa un bonus natural continúa sus controles conocidos, sin repetir la compra. Si aparecen elecciones aleatorias, se registra `NATURAL_BONUS_CHOICE_REQUIRED` antes de encolarlas: no se confunden con rutas deterministas de compra. Siguen vigentes los presupuestos de tiempo, pasos y profundidad.

Las regresiones reprodujeron la duplicación, el abandono de un bonus continuable y las elecciones inmediatas o posteriores de un bonus aleatorio. La suite final pasa con 57 pruebas. La revisión independiente no encontró bloqueantes tras incorporar los guards de elecciones.

## Muestra nueva

Cinco juegos elegidos aleatoriamente sin reemplazo del catálogo contenido en el HAR .fun proporcionado por el usuario, excluyendo los siete juegos anteriores. Se utiliza el lanzador oficial hub-demo, 200 pasos máximos, 360 segundos de recorrido y sin límite fijo de ramas.

| Juego | Estado | Evidencia |
| --- | --- | --- |
| Rise of Pyramids | PARTIAL | Dos compras anunciadas; una con CONTROL_UNAVAILABLE y otra enviada con TRANSITION_TIMEOUT |
| Starlight Wins | ERROR | Two ordinary rounds not confirmed durante la preparación |
| Alien Invaders | PARTIAL | Ante 1,25× COMPLETE; compras enviadas, una con TRANSITION_TIMEOUT y otra con RETURN_TO_BASE_UNCONFIRMED |
| Jungle Gorilla | PARTIAL | Sin compras anunciadas; restauró apuesta, pero PROBE_SPINS_NOT_COMPLETED |
| John Hunter and the Secrets of Da Vinci's Treasure | COMPLETE | Sin compras anunciadas, giros y experimento de apuestas confirmados |

Resultado: uno COMPLETE, tres PARTIAL y uno ERROR. No hubo errores de carga del runtime en esta muestra; no se atribuyen todos los fallos al problema del Ante ni se declaran resueltas otras transiciones. El Ante de Alien terminó sin verificación duplicada. COMPLETE en Da Vinci corresponde a las funciones anunciadas en esta sesión, no a cobertura exhaustiva de todos los bonus naturales posibles.

La ronda usó el primer parche del recorrido. Durante la revisión se añadió el guard que mantiene las elecciones aleatorias fuera del grafo, instalado al terminar sin reiniciar trabajos. Ninguna rama de esta muestra registró bonus de verificación ni elecciones de ese tipo; esos guards se comprobaron con regresiones. El reintento posterior de Coven usa la versión final.

Los resultados y HAR disponibles permanecen locales en `outputs/pragmatic-five-antefix` y HardFire-HARs. El fallo de preparación de Starlight no devolvió ruta HAR en la respuesta MCP; los otros cuatro juegos sí. No se publican los HAR completos.

## Reintento de Coven con la versión final

El primer trabajo `354b4b18-d83c-42a0-8d40-7920dfd9d420` falló antes de las tiradas: `Completed doInit not captured; inventory remains UNKNOWN`. Se hizo un único reintento nuevo, `02460e0e-669c-4197-a56d-2172e3927dd2`, que terminó PARTIAL en 133 segundos:

- Compra 100×: enviada, ACTION_FAILED. El estado final tenía `respinInProgress=true`, StageResult y ningún free spin activo; el controlador devolvió `Protocol does not prove an active feature spin`.
- Compra 200×: COMPLETE, 62 pasos, cierre y giros ordinarios posteriores confirmados.
- Ante 3×: ACTION_FAILED antes de activarse, `Ante Bet manager is not actionable`.

Esta corrida no confirma el Ante de Coven de extremo a extremo ni demuestra que todas sus transiciones estén corregidas. No repitió el caso original de dos Ante verificados más un tercer giro duplicado; ese cambio se verifica con regresión y con el Ante completo de Alien en la muestra nueva. Los nuevos errores quedan separados del fallo original en el [contrato de Coven](../contracts/pragmatic/vs20coven.json). Los HAR disponibles se guardaron y todas las pestañas propias se cerraron. El MCP respondió al finalizar con únicamente IMPORT, MCP y la pestaña original about:blank.
