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

## Resultado DEMO

Pendiente de la ejecución A/B instrumentada. Ningún resultado parcial se convierte en completo por disponer de un benchmark.
