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

## Estado

Preparación. Aún no hay resultados de este benchmark. El informe se actualizará con mediciones y enlaces a las ejecuciones.
