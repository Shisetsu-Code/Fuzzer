# Evaluación real de recuperación y cumplimiento — 6 de octubre de 2026

Este informe complementa el [objetivo y auditoría](objective-and-recovery-2026-10-06.md) y el [contrato del explorador](state-explorer.md). No sustituye los resultados parciales por una declaración de juego completo.

## Dictamen

**La recuperación acotada está implementada y tiene evidencia real; el objetivo completo de descubrir y ejecutar todas las alternativas todavía no está cumplido.** El motor ya no descarta definitivamente una rama tras el primer error, pero los reintentos no arreglan por sí solos controles que el detector no reconoce o continuaciones que no avanzan.

La evaluación considera útil una ruta con transición o petición capturada; no exige clasificar compra/ante/giro. Aun con ese criterio, un menú visible con controles ausentes del grafo es un fallo de cobertura, no una clasificación pendiente.

## Tanda de cinco juegos

Fuente `61561dba5e41b2efb300c03b6c6c780b6d3add98`, [Actions 37459984251](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37459984251). Presupuesto por juego: 100 intentos de acción destino, profundidad 8, 10 minutos, dos reintentos por ruta. Hasta dos jobs simultáneos; 4× solicitado al navegador. La duración incluye carga, exploración, guardado y cierre; no es tiempo entre clics.

| Juego | Duración | Rutas válidas / descubiertas | Resultado y pendiente |
|---|---:|---:|---|
| Dragon’s Gate | 456,440 s | 5 / 5 | Una compra intentada tres veces queda bloqueada. El detector confundió Stop con decisión; corregido después en `9ea1c18c`. |
| Inca Queen | 629,158 s | 10 / 12 | Cinco rutas diferidas por deadline. La prioridad de rutas nuevas consumió el presupuesto antes de entrar a la recuperación. |
| Big Bass Blast | 123,640 s | 4 / 4 | Agotó lo detectado sin pendientes, pero no envió compras. No demuestra cobertura completa del menú. |
| Hundreds and Thousands | 123,378 s | 1 / 2 | La ruta de compra falla tres veces con `ACTIVE_TIMEOUT`. El menú sí aparece visualmente. |
| Blazing Wilds Megaways | 391,669 s | 4 / 8 | Una ruta recuperada; cinco bloqueos: tres de hit area ambigua, una operación estancada y un replay distinto. |

Son rutas del planificador, no compras distintas. Las tres compras de Dragon son tres intentos de la misma opción; su contador de tres decisiones era incorrecto porque señalaba Stop. No se usa ese contador como éxito de bonus.

Todos los jobs guardaron el resultado y cerraron sus sesiones (`cleanupPending:false`). Inca y Blazing tuvieron `PARTIAL_EXPORT` únicamente por límite de capturas: omitieron cuatro y siete imágenes respectivamente. El resultado y el protocolo están presentes. Se inspeccionaron los ZIP y se verificó cada SHA-256 declarado en los manifiestos. Los [datos derivados y la procedencia](evidence/route-recovery-2026-10-06.json) conservan IDs de artefactos, hashes, métricas y límites.

### Recuperación acreditada

En Blazing, la ruta `5f63cd91c55d2521d96d60bf` falló primero con `REPLAY_MISMATCH` y en el segundo intento terminó `OPERATION_COMPLETE`. El fallo permanece en `attemptHistory`, pero no como bloqueo final. Es una recuperación real, no solo una prueba simulada.

Dragon y Hundreds demuestran el otro extremo: después de tres intentos, un fallo persistente queda explícitamente bloqueado y la ejecución acaba sin un bucle infinito. Inca demuestra que un presupuesto agotado conserva trabajo diferido; no garantiza que todos los reintentos ocurran dentro de ese presupuesto.

## Bloqueos observados, no supuestos

En Dragon, el servidor ya anunciaba `na=b` mientras la pantalla conservaba el Stop de los rodillos y todavía no mostraba la elección. La primera alternativa genérica seleccionó ese Stop y bloqueó el camino normal de continuación. Se corrigió el filtro de controles base en `9ea1c18c9902784b3194ee4a7e488bc969e37db8`. Tres pruebas nuevas reproducen Stop solo, Stop junto a opciones, y el panel que aparece después de una continuación; fallaron antes de la corrección y pasan después. Los controles Stop con contexto de feature ambiguo no se descartan por una coincidencia genérica de texto.

En Hundreds, `screenshots/02.jpg` del artefacto `11412467927` muestra claramente aceptar y cancelar. El grafo solo conserva el estado inicial y la ruta termina en timeout. En Big Bass, la captura de confirmación del artefacto base `11408161362` también muestra esos dos controles, pero la tanda nueva solo recorrió el activador y el fondo del menú. **Es necesario corregir la cobertura/readiness del detector; aumentar reintentos no resuelve esa omisión.** La causa exacta dentro del scanner y del runtime de esos dos juegos no está demostrada por el resumen y no se atribuye a una clase concreta sin inspeccionarla.

En Inca persistieron `FEATURE_BLOCKING`, `STOP_ACTIVE` y `CASCADE_ACTIVE`. En Blazing permanecieron `FREE_SPINS_ACTIVE` y `STOP_ACTIVE` tras enviar la compra. La respuesta inicial no demuestra haber terminado esas secuencias.

## Latencias y carreras

La observación completa promedió 3.033 ms en Dragon, 1.021 ms en Inca, 1.244 ms en Big Bass, 842 ms en Hundreds y 622 ms en Blazing. El camino del adaptador de clic promedió 579, 2.104, 168, 116 y 637 ms, respectivamente; no incluye el cierre de la operación. No deben sumarse tiempos de lecturas paralelas como si fueran tiempos secuenciales.

La operación más larga de esta tanda duró unos 35,5 s en Dragon y 31,1 s en Inca. El límite de 15 s es de **ausencia de progreso observado**, no un corte total de 15 s desde el clic; la lectura del navegador y los cambios de estado también afectan el tiempo. Los datos no acreditan que todos los caminos se ejecuten rápido ni que la mejora de rendimiento sea uniforme entre juegos.

Las regresiones cubren reintentos fuera de la sesión original, prioridad de hermanas nuevas, control deshabilitado, captura incierta, deadlines después de `await`, elección fallida con alternativas conservadas y respuesta tardía sin doble selección. Se evita un lock anidado al enviar la decisión por el mismo camino de clic físico. El guardado/cierre fallido detiene nuevos intentos.

Quedan límites: las lecturas no son una instantánea atómica de la UI; el bloqueo local no coordina acciones manuales de otras herramientas; un comando de navegador ya enviado no tiene cancelación transaccional garantizada; la geometría no prueba toda oclusión. HTTP 200 con cuerpo sigue siendo evidencia de transporte, no un validador exhaustivo de errores semánticos. El grafo no se reanuda automáticamente en otro proceso o run.

## Pruebas

La base tenía 346 pruebas. La recuperación elevó la suite a 370; la corrección de Stop, a **373/373**, sin fallos ni omisiones en la ejecución local final. Los cuatro jobs de Node 22/24 sobre Windows/Linux aprobaron en [Actions 37461892050](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37461892050). También aprobó el arranque Electron de esa fuente en [37461891951](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37461891951). Se revisó el diff y el árbol publicado coincide byte por byte con el probado localmente. La revisión fue realizada en esta sesión, no por un revisor independiente.

La repetición dirigida de Dragon usa [Actions 37461892226](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37461892226), fuente `9ea1c18c`. Sus conclusiones se registran por separado de la primera tanda; no se extrapola la corrección a los otros cuatro juegos.
