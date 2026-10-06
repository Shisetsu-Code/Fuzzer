# Repetición dirigida de Dragon tras excluir Stop — 6 de octubre de 2026

Complemento de la [evaluación de cinco DEMOs](validation-route-recovery-2026-10-06.md). Fuente `9ea1c18c9902784b3194ee4a7e488bc969e37db8`, [Actions 37461892226](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37461892226), artefacto `11414040748`. Los [datos y hashes derivados](evidence/route-recovery-dragon-followup-2026-10-06.json) son persistentes; el ZIP original es temporal.

**La falsa elección de Stop desapareció, pero la continuación de la compra no quedó resuelta.** La prueba termina `PARTIAL` por `DEADLINE`, no por agotamiento completo de las opciones. No acredita ninguna decisión interna de bonus.

Se observaron nueve rutas lógicas: cinco con evidencia válida y cuatro resueltas; una se recuperó después de un fallo. Hubo catorce intentos de ruta, incluidos replay, y cinco reintentos. Se ejecutaron seis acciones destino con evidencia válida. Dos envíos corresponden a la misma compra `pur=0`, no a dos modalidades distintas. El contador de decisiones es cero y el protocolo conservado no contiene un `doBonus` que acredite la selección.

Quedan cinco tareas diferidas por presupuesto. Las dos compras enviadas terminaron `OPERATION_STALLED` con `CAN_SPIN_NOT_READY`, `STOP_ACTIVE` y `PROTOCOL_NOT_READY`. El efecto inicial se conserva, pero no se declara cerrada la operación.

Duración observada: **626,339 segundos**, incluidos carga, recorridos, guardado y cierre. La observación completa promedió 2.466 ms. `cleanupPending:false`; el resultado y el protocolo se conservaron. `PARTIAL_EXPORT` indica seis imágenes omitidas por presupuesto, no pérdida de esos dos archivos. Se verificaron los hashes de todos los archivos del manifiesto.

La suite local final volvió a pasar **373/373** en 29,08 segundos, sin fallos ni omisiones. La matriz Windows/Linux y Node 22/24 de esa fuente está aprobada en [37461892050](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37461892050). Una ejecución local previa fue interrumpida por el límite de 45 segundos de la herramienta; no se contabilizó como aprobada y se repitió hasta obtener la salida completa.

## Conclusión del objetivo

La recuperación de ramas está implementada y demostrada; no certifica que el detector vea todos los controles ni que el adaptador ejecute cada continuación. El siguiente trabajo funcional debe centrarse en esas dos fronteras: aceptar/cancelar visibles pero ausentes del grafo en Big Bass/Hundreds, y el avance de la operación en Dragon/Inca/Blazing. No se justifica ampliar ciegamente los presupuestos ni presentar más reintentos como más cobertura de compras.
