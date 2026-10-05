# Cinco juegos nuevos tras el HAR de Loki

Se aplicaron dos correcciones: las respuestas `rs_c` permiten continuar una cascada antes de que aparezcan free spins; la verificación de rondas espera que desaparezca la cascada, aunque el runtime anuncie temporalmente `canSpin=true`. Dos regresiones fallaron antes del cambio y pasaron después. Suite completa: 63 pruebas, cero fallos. Los módulos instalados en Electron coinciden por SHA256 con los probados.

Pruebas locales por MCP, navegador Electron oculto a 4×, saldo DEMO y sesión aislada nueva por prueba. Selección aleatoria sin reemplazo del catálogo conocido, excluyendo las tandas anteriores. No se ajustaron controles por juego. Los HAR originales quedan locales; los resultados publicados no incluyen credenciales.

| Juego | Resultado inicial | Evidencia |
| --- | --- | --- |
| Romeo and Juliet | COMPLETE | Cuatro requests normales, ronda ganadora cobrada, apuesta restaurada; sin compras detectadas. El request de la prueba cambia c a 0.1 pero la respuesta conserva c=0.08: el cambio visual no demuestra aceptación del importe por el servidor. |
| Dragon King Hot Pots | PARTIAL | Compra 100× termina con fs_total=8 y doCollect → na=s; pendiente cierre cliente y dos rondas normales posteriores. Ante 2× confirmado con dos rondas bl=1, incluido cobro. |
| Gatot Kaca's Fury | ERROR de entrada | La página .fun redirige al catálogo, con ERR_ABORTED (-3). Se repitió en otra sesión y reprodujo el fallo antes de ejecutar compras. |
| Great Reef | COMPLETE | Cuatro requests normales, cobro terminal y apuesta restaurada; sin compras detectadas. msg_code=0 en doInit no es error. |
| Out of the Woods | PARTIAL | Compras 100× y 500× ejecutadas, fs_total=10 y doCollect → na=s en ambas; pendiente validación posterior. Ante 5× y 10× completados con dos rondas por nivel; respuestas l=125 y l=250 conservando request l=25. |

Se auditaron los HAR de las ramas ejecutadas: ningún error de aplicación no cero ni HTTP fallido en gameService. Un bonus cobrado no certifica por sí solo una rama COMPLETE. En Dragon King el último estado tiene canSpin=true, logicIsFreeSpin=false y spinBlockingFeatureIsRunning=true, con StageResult; no se fuerza otra compra ni se ignora el bloqueo. La clasificación automática se conserva como parcial.

La muestra ejercita tres compras y tres niveles Ante; no cubre todas las familias ni demuestra todavía que todas las pantallas de continuación puedan resolverse automáticamente.

## Gatot: reintento con lanzador oficial

El lanzador oficial hub-demo abrió una sesión nueva para vs20gatotfury y permitió completar el experimento de apuesta 2 → 3 → 4 → 3 → 2. Descubrió tres compras de 100×, 200× y 300× sin un límite fijo de opciones. Las tres se ejecutaron y cobraron: terminaron con fs_total=12, 17 y 24 respectivamente, na=c y luego doCollect → na=s. Ninguna tiene dos rondas normales posteriores capturadas, por lo que las tres quedan RETURN_TO_BASE_UNCONFIRMED, no COMPLETE. El runtime declara Ante, pero su control no fue identificado: queda UNKNOWN/PENDING y no se inventa ausencia ni ejecución.

Resultado final de los cinco juegos, conservando separados los errores de entrada .fun: dos COMPLETE y tres PARTIAL. Se ejecutaron seis compras hasta su cobro y tres niveles Ante hasta dos rondas normales. No hubo errores gameService en los HAR auditados. Todas las pestañas creadas por las pruebas quedaron cerradas al terminar; el MCP conserva solo la pestaña fuente about:blank aislada.
