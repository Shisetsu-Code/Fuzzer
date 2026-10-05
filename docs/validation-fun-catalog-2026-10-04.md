# Entrada desde el catálogo .fun

Se probó la navegación real desde las páginas `/en/slots/<slug>/` de www.pragmaticplay.fun. Cada sesión y cada rama abre la página, confirma el aviso de edad previamente autorizado y pulsa su botón Play Demo. El sitio crea el iframe DEMO y su sesión. No se reutilizan cookies entre pestañas ni URLs autenticadas; tampoco se vuelve a pulsar Play Demo cuando el iframe ya tiene su URL.

La herramienta requiere la página individual elegida en el catálogo, no la raíz. Las páginas .com y el lanzador hub-demo directo permanecen compatibles, pero la documentación recomienda .fun. La validación rechaza otras rutas, queries, fragmentos y dominios que imitan el nombre.

## Cinco casos comparables

Se repitieron cinco juegos incompletos anteriores, sin cambiar sus reglas de interacción, con 200 pasos máximos y 360 segundos de recorrido por juego. No es una muestra aleatoria nueva.

| Juego | Resultado revisado | Detalle |
| --- | --- | --- |
| Jungle Gorilla | COMPLETE | Giros ordinarios y experimento de apuesta; sin compras ni Ante anunciados, su ausencia no es un fallo |
| Starlight Wins | ERROR | Two ordinary rounds not confirmed al preparar la sesión |
| Rise of Pyramids | PARTIAL tras auditar HAR | Ambas compras enviadas, pero las respuestas finales conservan cascadas activas |
| Alien Invaders | PARTIAL | Ambas compras ejecutadas y cerradas; regreso a base sin confirmar. Ante no disponible para activar |
| Coven Rising | PARTIAL | Compra 200× y Ante 3× completos; compra 100× pendiente por continuación de respin |

Los resultados originales están en `outputs/pragmatic-fun-catalog`. Rise fue marcado COMPLETE por la versión que ejecutó esta ronda. La auditoría lo rechaza: la compra 0 acaba con `rs_c=2`; la compra 1 tiene una respuesta final de comprobación con `rs_c=1`. No se cuenta como juego completo. Su segundo request de compra sí existe en el HAR, aunque no apareció en el resumen paginado de esa rama.

El Ante de Coven conserva dos doSpin nuevos con `bl=1` y respuestas normales sin free spins ni cascadas. La compra 200× cerró el bonus y llegó al cobro de la secuencia posterior. Los HAR de Jungle confirman los giros normales; no hay opciones económicas adicionales anunciadas en esa sesión. No se presume que todos los juegos tengan compras o Ante.

## Corrección adicional derivada de la auditoría

El cliente puede mostrar canSpin antes de que el protocolo haya terminado una cascada. Se conservaron los campos rs_c/rs_p/rs_m/rs_t y los códigos msg_code/ext_code. Ahora un rs_c activo bloquea tanto la declaración de base como la certificación de giros ordinarios. Dos regresiones devolvían true antes de la corrección y false después. La suite final pasa con 61 pruebas. La revisión independiente no encontró bloqueantes en el guard.

La ronda de cinco se ejecutó antes de ese guard adicional, y sus resultados se presentan auditados; no se atribuye la corrección a una ejecución que todavía no la incluía. El guard fue instalado después, sin interrumpir juegos ni grabaciones. Evita falsos completos, pero puede dejar pendientes más explícitos hasta implementar las continuaciones necesarias.

El reintento de Jungle con la versión final, trabajo `16f4674e-c811-451a-a567-3f7669cbe74f`, terminó PARTIAL con `PROBE_SPINS_NOT_COMPLETED`: restauró la apuesta y no anunció compras ni Ante, pero no confirmó los giros del experimento. Se conserva separado en `outputs/pragmatic-fun-finalcheck`. El COMPLETE de Jungle en la ronda de cinco es histórico; este reintento muestra que todavía no es consistente. Ningún pendiente se debe a exigir funciones que el juego no anuncia.

La entrada del catálogo funciona. Esta prueba no demuestra que elimine todos los fallos del controlador ni que el sitio anterior sea la causa de ellos. Los HAR completos siguen privados y locales; no se publican.
