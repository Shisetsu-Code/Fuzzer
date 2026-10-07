# Continuación de Fuzzer: estabilidad de las entradas de recuperación

## Alcance

Continuación sobre `641dee8ec509393b6dddc04f77663673a0847d54`, rama `codex/explorer-reliability`, PR #1. Fecha local: 6 de octubre de 2026; algunas ejecuciones cruzan la medianoche UTC.

Se mantiene el objetivo: recorrer todas las opciones observadas, aunque compartan resultado, sin exigir su clasificación económica. FIFO BFS, sesiones aisladas, captura del protocolo, máximo dos jobs simultáneos y cuatro pestañas DEMO globales permanecen sin cambios. La animación sigue solicitada a 4x; la ventana de estabilidad es tiempo real, no tiempo acelerado.

## Defecto reproducido y corrección

El adaptador de modo `actions` ya suministraba `recoveryQuietMs=4000` y `recoveryGapMs=4000`, pero `finishOperation` mantenía un umbral fijo de 1000 ms de quietud para el clic central y temporizadores separados para Stop y el centro. Por ello un Stop podía ir seguido de un clic central antes de cuatro segundos.

La recuperación ahora usa el intervalo configurado tanto para avanzar como para el clic central. Un cambio observado de controles/configuración, flags o protocolo reinicia la estabilidad. Se reutiliza `createNavigationKey` para ignorar claves aleatorias del snapshot, saldo y resultados; estos no son nuevas opciones ni progreso de interfaz. Un temporizador compartido se actualiza al terminar la llamada de entrada, no antes de esperar su resultado. Una elección aceptada también reinicia este temporizador.

No se altera la velocidad, el scheduler, la clasificación de opciones, los límites de operación, la política de captura ni los payloads. Esto corrige una infracción comprobada de la regla de estabilidad; no demuestra por sí solo que las continuaciones pendientes de Dragon queden resueltas. Tampoco ofrece atomicidad general frente a cambios de UI ocurridos entre una observación y el clic.

## Verificación local

Entorno: Node 22.16.0, Linux. Snapshot original: 409/409 pruebas aprobadas.

Cinco regresiones nuevas ejecutadas primero contra el código original: 0/5 aprobadas, todas por la condición temporal esperada. Con el cambio: 5/5 aprobadas. Cubren tráfico nuevo, controles cambiados sin tráfico, Stop inmediato, Stop con respuesta demorada 2500 ms y vencimiento del plazo durante la espera de estabilidad. En el código original aparecían clics centrales a 5500 ms tras tráfico en 4500 ms, o solo 1000/500 ms después del retorno de Stop.

Suite completa final: **414/414**, cero fallos, cero omisiones, aproximadamente 27.0 s. Suite dirigida de operación/continuación/bonus/recuperación: 31/31. `git diff --check` sin errores. La regresión existente que cambia `snapshot.key` aleatoriamente sigue pasando sin modificarla. Revisión propia del diff; no revisión independiente.

```sh
npm test
node --test test/recovery-stability.test.js test/operation-completion.test.js test/bonus-transition.test.js test/operation-continuation.test.js
```

Blobs Git de los archivos probados:

- `providers/pragmatic/operation-completion.js`: `6c58a7e76f3e1cc3043339c8d804f320e897e9d2`.
- `test/recovery-stability.test.js`: `5d5a54877ea751045886f5b300e9085c50f01bff`.

La matriz Windows/Linux de Actions y la repetición live del nuevo commit se verifican por separado; no se deducen del resultado local.

## Evidencia live anterior al parche

Fuente: [tanda 37548617313](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37548617313), commit `641dee8`, HardFire `adf6de5ec14e394f77fb1816d5f46e5deb250b0a`. Los cuatro artefactos siguientes se descargaron y sus SHA-256 se cotejaron con GitHub. Blazing no forma parte de esta evaluación parcial de la tanda.

| Juego | Rutas válidas / descubiertas | Rutas resueltas | Tiempo total | Resultado observado |
|---|---:|---:|---:|---|
| Dragon's Gate | 7/13 | 5 | 611.266 s | Dos elecciones efectivamente ejecutadas: respins y free spins. Ambas continuaciones pendientes. |
| Inca Queen | 10/16 | 7 | 614.121 s | Dos envíos de compra; detenciones por feature/Stop/cascada. |
| Big Bass Blast | 9/13 | 8 | 632.079 s | Aceptar y cancelar recorridos; una compra alcanzó `OPERATION_COMPLETE`. |
| Hundreds and Thousands | 9/13 | 7 | 609.780 s | Aceptar y cancelar recorridos; dos compras sin cierre dentro del límite. |

Todos terminaron `PARTIAL`, `stopReason=DEADLINE`, `completeGame=false` y `cleanupPending=false`. Una ruta válida no implica operación cerrada; el denominador comprende solo rutas descubiertas, no todas las posibles del juego. Los dos envíos `pur=0` no representan dos modalidades distintas. En Big Bass, el cierre no incluye un giro normal adicional de verificación: ese paso no es obligatorio en modo `actions`.

Artefactos y hashes:

- Dragon, `11451649256`: `cda90e396b9bf786f3b096075d22cc8c91eec62a427035076c36ca045a7c2945`.
- Inca, `11451753963`: `0031b527d82fcc2275f56c94e16c5bd87ad3fb69cd6c8d77193ee84f4b5ea57c`.
- Big Bass, `11451923184`: `23fd47f1582ff35ece7b086b863440baba9798e3a5b7eed7f0b8d459d43d60ee`.
- Hundreds, `11452716496`: `4d075cdb7ef82bd0efa64edef8a472ba06d8c13d1c1ec1066201a3581cb9db2a`.

Los informes mantienen omisiones de capturas por presupuesto en Inca, Big Bass y Hundreds; no se infiere cobertura de pantallas ausentes. Algunos registros de creación de sesión carecen de confirmación de velocidad, aunque la configuración solicitada es 4x.

## Latencia y siguiente validación

El profiler de Dragon de esa misma tanda registra 239 snapshots: media 1.334 s, 318.709 s acumulados sobre 610.025 s instrumentados, aproximadamente 52.2%. El JPEG suma 22.664 s en siete capturas, aproximadamente 3.7%. Las lecturas de menú/estado/saldo/controles ya se solapan: no deben sumarse como tiempos de pared independientes. Estos datos son observacionales y anteriores al parche; no prueban una aceleración causada por él.

La repetición dirigida de Dragon debe comprobar que ambas elecciones siguen descubriéndose y que los inputs de recuperación respetan la quietud/cooldown configurados. El criterio adicional de éxito es el cierre de la operación, no solo HTTP 200 o selección de bonus. Hasta observarlo, las continuaciones siguen pendientes y la PR permanece en borrador.
