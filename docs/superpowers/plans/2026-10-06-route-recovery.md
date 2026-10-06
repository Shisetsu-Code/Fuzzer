# Recuperación de rutas y evaluación del objetivo — Implementation Plan

> For agentic workers: execute with superpowers:executing-plans and test-driven-development. This is an approved implementation task, not a claim of completed coverage.

**Goal:** Recorrer las opciones observadas de cada DEMO, registrar si provocan una transición o petición aceptada, seguir decisiones y reconstruir desde A las alternativas, sin exigir clasificarlas como compra/ante/giro.

**Architecture:** Mantener el explorador y su adaptador existentes. Separar el historial de intentos fallidos de las ramas todavía recuperables y de los bloqueos finales. Los reintentos usan sesiones nuevas después de guardar y cerrar la anterior; los clics de una sesión nunca se paralelizan.

**Tech Stack:** JavaScript ESM, Node 22/24, node:test, HardFire/Electron y GitHub Actions.

**Spec:** Solicitud del usuario del 6 de octubre de 2026: aplicar recuperación de ramas, evaluar bloqueos, carreras y flujo, y documentar el objetivo y aprendizajes. Base inspeccionada: f0f4a907d3ecf8c3361a16296f5c49358d6a7427.

## Global Constraints

- Solo DEMOs oficiales, sin login ni dinero real. No modificar respuestas del servidor ni inventar controles.
- Máximo dos trabajos de juego simultáneos; conservar los límites de pestañas y la propiedad hasta guardar/cerrar.
- Un clic incierto nunca se repite en la misma sesión. Un fallo de limpieza detiene nuevos intentos.
- No quitar presupuestos finitos ni declarar todo el juego completo por vaciar una cola.
- Mantener datos crudos en staging privado y exportación saneada.

## Review Focus

- Timeout recuperable: las otras alternativas deben avanzar antes del reintento.
- Error persistente: número finito de intentos y bloqueo con causa, sin bucle infinito.
- Deadline durante una espera: no debe salir otro clic después del plazo.
- Replay con el menú correcto y flags transitorios distintos: no confundir identidad de menú con resultado aleatorio.
- Operación aceptada con continuación sin resolver: conservar su validez y sus decisiones pendientes, sin certificar cierre.

## Task 1 — Cola recuperable y contabilidad

Files: providers/pragmatic/state-explorer.js; test/route-recovery.test.js.

- [x] Escribir regresiones de timeout, replay transitorio, fallo permanente, presupuesto y cierre fallido; comprobar que fallan en la base.
- [x] Añadir reintentos acotados por ruta al final de la cola, con historial separado; eliminar pendientes recuperados sin borrar evidencia histórica.
- [x] Hacer que las estadísticas distingan intentos, rutas válidas, rutas bloqueadas y fin por presupuesto.
- [x] Ejecutar las pruebas específicas y toda la suite antes de publicar.

## Task 2 — Frontera de observación y ejecución

Files: integrations/hardfire/state-explorer.js; providers/pragmatic/operation-completion.js; test/route-recovery.test.js y pruebas de integración existentes.

- [x] Reproducir fallos de identidad de menú, decisiones y checks pre-clic presentes en la versión inspeccionada.
- [x] Aplicar cambios mínimos solo donde las pruebas demuestren el problema; conservar revalidación de controles/protocolo.
- [x] Probar deadline, control deshabilitado, petición pendiente y resultado tardío; no hacer Promise.race que deje clics huérfanos.

## Task 3 — Evaluación y documentación

Files: README.md; docs/objective-and-recovery-2026-10-06.md; scripts/ci/export-live-evidence.mjs si necesita exponer las métricas nuevas.

- [x] Documentar objetivo, flujo, criterio de parada, límites, riesgos y lecciones del benchmark.
- [ ] Revisar resultados finales de pruebas Node 22/24 Linux/Windows y DEMOs del commit 61561dba5e41b2efb300c03b6c6c780b6d3add98.
- [x] Separar cobertura demostrada por simulación, evidencia DEMO y bloqueos no resueltos. No presentar un reintento como corrección del bloqueo subyacente.

## Registro de ejecución

Base: 346 pruebas. Correcciones RED/GREEN de recuperación, estados, decisiones, captura incierta y deadlines: 370/370 locales. Se añadió recuperación física de decisiones a partir de la captura de Dragon, sin nombres particulares. La suite completa detectó el rearme duplicado de una elección por respuesta tardía; corregido antes de publicar. Ruling: conservar strict sin reintentos por defecto para no modificar inadvertidamente el contrato económico; actions utiliza dos. Revisión propia, sin revisor independiente disponible.
