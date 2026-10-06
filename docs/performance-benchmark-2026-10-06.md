# Benchmark y paralelismo del explorador

## Objetivo solicitado

Medir por qué tarda cada acción y comparar ejecución secuencial con paralelismo acotado, sin cambiar las reglas de validez, repetir clics inciertos ni mezclar sesiones DEMO.

## Alcance de esta tanda

- Medición monotónica de lectura del runtime, comprobación de pintura, captura de pantalla, recortes/codificación, escritura, espera del lock, pausas, reset/replay, clic y cierre.
- Estadísticas por fase: número de muestras, tiempo acumulado, promedio, p50, p95 y máximo; distinguir tiempo inclusivo de tiempo exclusivo para no sumar fases anidadas dos veces.
- Trazas acotadas sin URLs, payloads, cookies, nombres de controles ni secretos. Mantener evidencia incluso al terminar una rama parcialmente.
- Modo secuencial de referencia y modo de paralelismo acotado para trabajo independiente. Las operaciones de UI siguen ordenadas y dentro del lock; las comprobaciones previas al clic se conservan.
- Comparación reproducible en GitHub Actions con el mismo código, presupuesto y juego; informar variabilidad y no confundir un microbenchmark con una mejora del recorrido completo.
- Mantener el límite existente de dos trabajos simultáneos y cuatro pestañas DEMO totales. No paralelizar clics de una misma sesión.

## Orden de implementación

1. Añadir pruebas del medidor, límites de memoria y ejecución concurrente con drenaje ante errores.
2. Instrumentar el recorrido existente sin modificar sus criterios de avance.
3. Paralelizar únicamente lecturas y escrituras independientes, con opción de referencia secuencial.
4. Ejecutar regresiones y comparación A/B; publicar resultados reales y sus límites.

## Implementación

`lib/performance.js` usa reloj monotónico, histogramas de dos cifras significativas para todas las muestras, hasta 96 nombres de fase más un acumulador `other`, y 1.024 eventos de traza. Los totales, promedios y máximos no dependen del límite de traza. `active` muestra el subpaso que continúa pendiente; `droppedEvents` señala truncación. El tiempo propio resta la unión de los hijos directos, no la suma de hijos paralelos. No sumar hermanos paralelos para obtener tiempo de pared.

Las fases incluyen `surface.queue`, `paint.capture`, `paint.rect`, `runtime.*`, `capture.jpeg`, codificación de recortes, escrituras, `session.*`, `dispatch.action`, `dispatch.replay`, `settle.*`, `wait.*`, `adapter.finish` y consolidación HAR. Los eventos de dispatch son intentos de llamada al controlador, no comprobantes de recepción del servidor.

La CPU y RSS reportadas son del proceso Node/Electron principal. No incluyen la CPU del renderer ni la GPU; un tiempo alto en capturePage requiere investigar también esos procesos. Un snapshot puede contener varias mediciones anidadas: sus tiempos inclusivos no se suman entre sí.

`performanceMode: 'sequential'` mantiene las tareas independientes en serie; `'parallel'` (predeterminado del explorador) permite hasta cuatro lecturas/escrituras independientes. La codificación JPEG sigue siendo síncrona en el mismo proceso; no se afirma paralelismo de CPU. Las tareas iniciadas se drenan ante un error antes de liberar el lock; no se duplica el clic y no se rebajan los timeouts. Una respuesta que cambie durante la lectura invalida el marcador previo al clic, en ambos modos.

`benchmark: true` en `runStateExplorer` agrega `result.performance` y un `performance.json` acotado. La traza completa se exporta aparte, saneada, bajo los límites de bytes y hashes existentes. Cada 15 segundos el proceso imprime sus spans activos y fases más costosas en Actions; es una cadencia de diagnóstico, no una garantía si el propio event loop está bloqueado. Los checkpoints de progreso conservan el resumen disponible antes de cada nueva acción.

Para el runner: `FUZZER_BENCHMARK=1` y `FUZZER_PERFORMANCE_MODE=sequential|parallel`. El workflow `Performance benchmark` ejecuta un microbenchmark; el marcador `[benchmark-live:dragon-s-gate-bonus-choice]` solicita además dos sesiones DEMO aisladas, una por modo, con dos acciones y el mismo presupuesto de 240.000 ms. Comparte el grupo de exclusión de las tandas DEMO existentes. No cancela una tanda activa.

## Verificación local

Base: 316 pruebas aprobadas. Pruebas añadidas: estadísticas anidadas con hijos superpuestos, propagación del error original, truncación acotada, orden de resultados, concurrencia limitada, drenaje tras fallo, export saneado, y el adaptador real en ambos modos con respuestas pendientes/cambiantes y cierres fallidos. Las fronteras de Electron se simulan en las pruebas de integración; no equivalen a juegos reales.

El microbenchmark alterna el orden de los modos, descarta una iteración de calentamiento y verifica por hash los 24 archivos de 64 KiB de cada iteración. Incluye cuatro esperas controladas de 10 ms para aislar el scheduling. En esta máquina dio aproximadamente 44,4 ms secuencial frente a 12,4 ms paralelo (medianas de cinco repeticiones): **esto NO es una mejora medida del juego, de screenshots ni de la red real**.

## Resultado DEMO instrumentado

[Actions 37446711832](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37446711832), código `9fb8e7ead6cf40a5b62f72eaa9457ed410281cca`, Dragon’s Gate, dos acciones nuevas por modo y 240.000 ms de presupuesto. Se ejecutaron dos sesiones aisladas en runners distintos. El [resumen numérico y procedencia](evidence/performance-2026-10-06/comparison.json) permite contrastar cada valor con los artefactos de Actions; los ZIP y todos los archivos enumerados en sus manifiestos se verificaron por SHA-256.

| Medición | Secuencial | Paralelo |
|---|---:|---:|
| Tiempo total del explorador | 269,503 s | 269,871 s |
| Capturas para comprobar pintura, acumulado | 139,470 s / 26 llamadas | 142,692 s / 28 llamadas |
| Capturas JPEG de evidencia, acumulado | 78,227 s / 12 llamadas | 75,919 s / 11 llamadas |
| Ambas capturas como proporción del tiempo de pared | 80,78% | 81,01% |
| Mediana de una captura de pintura | 6,717 s | 6,423 s |
| Mediana de una captura JPEG de evidencia | 6,849 s | 7,406 s |
| Lecturas agrupadas por snapshot, promedio | 352,934 ms | 175,779 ms |
| Snapshot completo, promedio | 17,935 s | 17,488 s |
| Recortes y guardado de recortes, acumulado | 154,923 ms | 160,698 ms |
| Espera del lock de superficie, acumulado | 0,631 ms | 0,149 ms |

Los porcentajes de captura se calcularon como unión de intervalos de `paint.capture` y `capture.jpeg`; no se sumaron padres e hijos. La traza no se truncó y no quedaron spans activos. `capture.jpeg` incluye obtener la imagen del navegador y convertirla a JPEG; no aísla la codificación de la captura completa. La codificación de todos los recortes sí está aislada: 64,803 ms y 74,390 ms en total.

**Hallazgo: alrededor del 81% del tiempo medido espera la captura de imágenes.** No es tiempo de analizar nombres de controles ni de escribir recortes. Las lecturas agrupadas se solaparon útilmente en esta muestra, pero el total no mejoró. No es correcto extrapolar el factor 3,60 del microbenchmark al juego real.

Ambos modos intentaron dos acciones nuevas, reprodujeron una acción previa y pulsaron una tirada de comprobación. Sólo la apertura de menú quedó como transición válida; el segundo resultado quedó sin confirmar al agotarse el presupuesto. No se verificó ningún recorrido completo. El tiempo extra sobre 240 segundos incluye operaciones ya en curso y cierre: el presupuesto no cancela un `capturePage` iniciado. El guardado y cierre del explorador terminaron, con `cleanupPending:false`.

La muestra es una pareja A/B, no una distribución de rendimiento de todo el catálogo. Las capturas por modo no fueron idénticas en cantidad y hubo diferencias de respuesta/temporización; las medianas son descriptivas, no una conclusión estadística de velocidad.

### Incidencia de recuperación descubierta y corregida

El runner imprimió su resumen y el perfil completo antes de salir. Después, `recover-live-evidence.mjs` no reconoció `performance.json` en su allowlist de archivos válidos: regeneró el export y añadió erróneamente `CI_ELECTRON_INTERRUPTED`. Los artefactos originales conservan esa etiqueta y advertencias `HAR_UNAVAILABLE` para temporales ya consolidados; el secuencial además conserva `BODY_UNAVAILABLE`. No se reescriben esas pruebas históricas ni se presentan como exports perfectos.

La allowlist ahora acepta el archivo de métricas **manteniendo la comprobación de tamaño, ruta y SHA-256**. Una regresión primero reprodujo la sustitución indebida y después confirmó que el export permanece byte a byte; alterar el archivo todavía activa recuperación. Se probó además con los dos ZIP reales descargados: ambos se reconocen sin regenerarse. Es una corrección de validación del export, no una nueva ejecución del juego.

### Prioridad que señalan las mediciones

La siguiente optimización de impacto debe reducir las capturas redundantes y medir alternativas de captura/compositor, preservando una imagen reciente y controles revalidados antes de cada clic. Lanzar más capturas del mismo frame en paralelo puede aumentar la cola y no se implementó como supuesto remedio. El lock no mostró contención con una sola sesión por proceso; relajarlo no solucionaría esta muestra.

La CPU registrada (10,47 s y 10,62 s) pertenece sólo al proceso principal. No identifica si el bloqueo de captura está en GPU, renderer, compositor, IPC o una política de temporización; se necesitaría instrumentar esa frontera antes de atribuirle una causa más específica.

## Verificación final de esta tanda

La implementación inicial pasó 340 pruebas locales y la matriz [Node 22/24 × Ubuntu/Windows](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37446711750) terminó verde. Se revisaron los totales del job Node 24 Windows: 340 aprobadas, cero fallos, canceladas u omitidas. Tras la corrección de recuperación, la suite local pasó **341 pruebas, cero fallos ni omitidas**; sus seis pruebas específicas de export/recuperación también pasaron.

Revisión inline del diff y del saneado; no se ejecutó un revisor independiente en este entorno. Ninguna suite de regresión certifica el recorrido DEMO como completo.
