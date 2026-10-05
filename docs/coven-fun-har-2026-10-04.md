# Coven Rising: entrada DEMO del catálogo .fun

El HAR manual `www.pragmaticplay.fun_Archive [26-10-04 21-24-31].har` contiene 53 intercambios gameService para `vs20coven`. El catálogo .fun abre `https://demogamesfree.pragmaticplay.net/hub-demo/openGame.do`, que crea una sesión nueva y redirige al juego. El endpoint de tráfico es `/hub-demo/ge/v5/gameService`. No se reutilizan URLs autenticadas ni mgckey del HAR.

La configuración confirma compras de 100× y 200×, ambas ejecutadas manualmente. Cada una empezó con doce free spins y terminó con `fs_total=12`, seguido de doCollect con `na=s`. Ante nivel 1 multiplica la apuesta por tres: request `l=20,bl=1`, respuesta `l=60`. Los requests de continuación no equivalen a giros elegidos manualmente. El HAR no certifica el inventario de elecciones locales de UI.

Fuzzer ahora acepta el lanzador público hub-demo con un gameSymbol válido y parámetros permitidos. Se rechazan URLs html5Game, credenciales de sesión, parámetros desconocidos y parámetros duplicados. El sitio .fun completo no se añade como entrada directa: se utiliza el lanzador oficial que muestra la captura. Las páginas .com continúan disponibles.

## Reintento automático

Trabajo `cadd51fb-36f3-44b3-9e7e-fb8faa5552a6`, 198 segundos, 200 pasos máximos y sin límite fijo de ramas. El experimento económico observó `2 → 3 → 4 → 3 → 2` y restauró la apuesta.

| Opción | Resultado |
| --- | --- |
| Compra 100× | COMPLETE, 42 pasos, cierre y dos giros ordinarios posteriores confirmados |
| Compra 200× | COMPLETE, 44 pasos, cierre y dos giros ordinarios posteriores confirmados |
| Ante 3× | PENDING, RETURN_TO_BASE_UNCONFIRMED |

La acción de Ante devolvió `ok=true,normalRoundsVerified=true`: se activó y confirmó sus tiradas. La comprobación adicional al finalizar la rama falló; no se convierte ese resultado en COMPLETE. No hubo errores de carga del runtime en este reintento. Una corrida no prueba fiabilidad general ni determina la causa de los fallos anteriores del catálogo .com.

El resultado global sigue siendo PARTIAL. Se guardaron los cuatro HAR (tres ramas y raíz) localmente. Las pestañas propias se cerraron y el MCP quedó disponible. El [contrato individual](../contracts/pragmatic/vs20coven.json) separa evidencia manual y reintento automático. La suite completa pasa con 52 pruebas, incluyendo la aceptación del lanzador fresco y el rechazo de URLs con credenciales.
