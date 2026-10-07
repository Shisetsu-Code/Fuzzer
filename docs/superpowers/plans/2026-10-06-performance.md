# Benchmark y paralelismo: plan de implementación

> Para ejecución inline: usar executing-plans. Especificación: docs/performance-benchmark-2026-10-06.md.

Objetivo: medir subpasos y comparar concurrencia acotada sin modificar la semántica de los clics. Node >=22; sin dependencias nuevas; no modificar main ni exceder dos trabajos DEMO.

- [x] Crear tests rojos para lib/performance.js; implementar reloj monotónico, spans anidados, histogramas y mapConcurrent con drenaje. Ocho tests verdes.
- [x] Instrumentar integrations/hardfire/{state-explorer,session,paint-guard,drawn-buttons}.js y providers/pragmatic/state-explorer.js. Conservar revalidación y locks.
- [x] Tests rojos de exportación; añadir traza saneada y acotada a scripts/ci/export-live-evidence.mjs.
- [x] Ejercitar el adaptador con benchmark activado en modo secuencial y paralelo, incluidos errores y solicitudes pendientes.
- [x] Regresión adicional: respuesta que cambia durante snapshot. Reproducida en ambos modos y corregida manteniendo el marcador anterior a la lectura.
- [x] Añadir microbenchmark reproducible, selección A/B y tabla de fases en Actions.
- [x] Revisar suite completa, publicar con lease del SHA remoto y validar Actions.
- [x] Recoger resultados A/B y documentar tiempos observados sin extrapolarlos a todo el catálogo.

Decisión: CPU JPEG no se mueve a workers en esta tanda; primero medir su peso. Se paralelizan sólo operaciones independientes hasta cuatro, esperando todas las ya iniciadas ante un error. No se cambian las esperas ni los criterios de validez para aparentar velocidad.

- [x] Corregir la allowlist de recuperación para preservar performance.json validado; regresión roja/verde y comprobación sobre ambos artefactos reales.
