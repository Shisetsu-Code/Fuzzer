# Exploración de acciones válidas — 6 de octubre de 2026

## Objetivo

Pulsar un control observado, recorrer las nuevas opciones y reconstruir desde A cada alternativa pendiente. No exigir una clasificación compra/ante/giro para aceptar evidencia de que una ruta funciona.

`runStateExplorer` y `pragmatic_explore_start` usan `mode: actions` por defecto. `strict` conserva el criterio anterior para comparación y sus pruebas. Las rutas y coordenadas siguen procediendo exclusivamente de controles observados; sólo se admiten DEMOs oficiales y sesiones propias aisladas.

## Cambios

- Un menú disponible y estable en dos observaciones permite avanzar sin esperar el silencio de assets o telemetría. No permite avanzar si la propia solicitud o captura está pendiente.
- La lectura del protocolo incluye solicitudes activas, no sólo el HAR finalizado. Conserva IDs durante su finalización y relaciona de forma uno-a-uno los dos observadores. Coincidencias ambiguas o datos discrepantes bloquean nuevos inputs; no fabrican operaciones.
- La captura de una operación no impone otro giro porque se etiquete como compra. Si una acción deja la superficie base lista, sin menú, gasto ni petición nueva, se permite una sola tirada DEMO de comprobación aunque no se haya identificado un ante.
- Cada arista lleva `validity`: evidencia de transición de interfaz, respuesta aceptada o prueba ejecutada. `terminal` y la finalización de la secuencia permanecen separados. Una operación capturada puede ser válida y conservar una continuación pendiente.
- En modo actions se conservan las alternativas de decisiones observadas sin descartarlas por la etiqueta de la operación. Que una alternativa aleatoria vuelva a aparecer no se garantiza: si falta durante replay, queda pendiente.
- Antes de cada clic de navegación se guarda la ruta en curso y la cola. Un primer clic fallido exige una sesión nueva antes de probar el hermano. Los intentos fallidos consumen presupuesto, y las acciones confirmadas conservan su contador separado.
- La comprobación de un giro vuelve a observar los controles, usa un punto de clic no ambiguo y revisa el protocolo justo antes del envío. No reintenta una entrega incierta.
- El checkpoint local se escribe en un temporal con flush y rename. Actions conserva además su journal atómico, HAR propio y recuperación fuera del proceso Electron.

## Alcance y límites

No es un nuevo motor universal de proveedores. La lectura y continuaciones aún usan el adaptador Pragmatic. La asociación entre CDP y webRequest exige método, URL, payload conocido compatible y una ventana temporal; más de un candidato produce incertidumbre, no una deduplicación silenciosa. No se añaden listeners de webRequest ni se reemplazan APIs del juego.

Los controles observados no equivalen a cobertura total del juego. Se mantienen `completeGame:false`, límites de tiempo, profundidad y acciones, y los pendientes. Los checkpoints conservan el trabajo para inspección/recuperación; no autorizan repetir automáticamente una operación incierta tras un reinicio.

Las capturas publicadas excluyen credenciales, perfiles y HAR crudo. Dos jobs de Actions como máximo, una pestaña aislada por job. El smoke de esta entrega usa 12 acciones, profundidad 8 y seis minutos por juego, más el margen de guardado existente.

## Validación

Baseline local: 285/285. Tras los cambios: 308/308 (Node 22), sin fallos ni omisiones. Se observaron primero las regresiones fallando. Incluye pruebas del adaptador real con fronteras de navegador simuladas para la captura sin giro adicional y la comprobación sin clasificación de ante. Estas pruebas no equivalen a una sesión DEMO; los resultados de Actions se documentan por separado.
