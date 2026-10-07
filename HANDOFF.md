# Fuzzer — continuidad actual

## Objetivo y autorización

Recorrer todas las opciones observadas, aunque compartan resultado, y registrar
sus efectos/peticiones. Descubrimiento y ejecución están integrados: no exigir
clasificación previa compra/Ante/giro. Conservar hermanas y reconstruir desde A.
Solo DEMO oficial, sin login, dinero real ni modificación de payloads.

Rama `codex/explorer-reliability`, PR #1. Mantener `main` intacto y la PR en
borrador mientras falten continuaciones/cobertura. Máximo dos trabajos y cuatro
pestañas DEMO globales. Mantener 4x solicitado y cuatro segundos de estabilidad.
Presupuesto de exploración: máximo 20 minutos por juego, más el cierre seguro.

## Continuación autónoma — 6 de octubre de 2026, hora argentina

Base de esta revisión: `dd9313b363113ed4a1e1c4e87a41155b7f68e929`.
El workflow anterior aún forzaba 600000 ms, aunque el runner aceptaba 1200000.
El scheduler conservaba su cola solo en memoria; recovery.json exportaba
resultados parciales, pero no reanudaba la planificación.

Ahora `runStateExplorer` supervisa una campaña con tramos cooperativos de ocho
intentos de ruta. Cierra y guarda antes del siguiente tramo, conserva FIFO,
colas de reintentos, elecciones, contadores y evidencia. No renueva el plazo,
las acciones ni los reintentos. El MCP de ejecución usa 100 acciones, profundidad
8 y 20 minutos por defecto. Su antigua entrada discovery-only no cambia de
modo silenciosamente: `pragmatic_explore_start` ejecuta; `pragmatic_fuzz_start`
con `execute:false` solo descubre.

`campaign.json` y `campaign.lock` son privados. El checkpoint del scheduler
incluye una tarea interrumpida: se considera incierta y solo puede reintentarse
en una sesión nueva. Un lock retenido, diario sucio, corrupción, configuración
incompatible, fallo de escritura, cierre incierto o fallo de HAR impide avanzar.
La reanudación de disco exige un cierre previamente confirmado; no se implementó
reinicio general automático del host tras un crash. No borrar locks a ciegas.

Los HAR originales se conservan para consolidar los tramos siguientes. El
exportador omite planificación privada y deduplica exclusivamente archivos
incluidos en el agregado con hash coincidente; dos solicitudes iguales de
sesiones distintas siguen siendo dos solicitudes.

## Verificación y límites de lo demostrado

Ver informe `docs/autonomous-continuity-2026-10-06.md` para comandos y resultados.
Pruebas deterministas e integración con adaptador real y límites de navegador
simulados no equivalen a completar juegos live. Los bloqueos de continuaciones
Dragon/Inca/Hundreds/Blazing no se dan por arreglados con esta arquitectura.
`completeGame` sigue siendo false; rutas válidas, operaciones cerradas y cobertura
son métricas distintas. Mantener los errores y alternativas en el resultado.

La validación live del nuevo commit se revisa en Actions; no deducir su éxito
por estar iniciada ni por tener unit tests verdes.

## Archivos

`providers/pragmatic/state-explorer.js`: BFS, retries, checkpoint y validación.
`lib/explorer-campaign.js`: supervisor, presupuesto global, journal y ownership.
`integrations/hardfire/state-explorer.js`: entradas revalidadas y sesiones.
`integrations/hardfire/har-consolidation.js`: agregado y huellas de fuentes.
`scripts/ci/export-live-evidence.mjs`: exportación saneada, sin checkpoint privado.

El registro anterior completo, con resultados y decisiones históricas, está en
`docs/handoff-before-autonomy-2026-10-06.md`. Sus límites y recuentos son históricos,
no describen automáticamente el estado de esta continuación.
