# Continuaciones y evidencia de verificación

Revisión iniciada desde `3e1b19cdb4f3803dea12b904b1dad54ab0d6e710`, después de la primera [tanda de fiabilidad](reliability-review-2026-10-05.md). Fecha: 5 de octubre de 2026.

## Problemas reproducidos

### Flags normales mientras sigue abierta una continuación

El cierre comprobaba flags y protocolo durante dos observaciones y luego intentaba el spin normal. Si el control no estaba disponible, terminaba inmediatamente con `NORMAL_SPIN_CONTROL_UNAVAILABLE`. Los mismos flags suprimían tanto el avance de la operación como el clic central de continuación.

La reproducción determinista presentó una compra HTTP 200, `na=s`, `canSpin=true`, sin bloqueos ni elecciones, y un control normal todavía ausente. El código anterior terminó a los 500 ms: un intento rechazado, cero continuaciones. Nunca llegó al intervalo de cinco segundos. Este mecanismo concuerda con la contradicción documentada en Sleeping Dragon, cuya captura mostraba una pantalla de continuación cuando el explorador intentaba verificar el spin.

### Un control deshabilitado podía bloquear el cierre

El lector de protocolo consideraba activo un `XTButton` cuyo objeto estaba activo y cuyo `xtEnabled` no era falso, aunque `button.enabled` fuera falso. El extractor de dibujos sí descartaba ese componente. Un Stop deshabilitado podía producir `stopActive=true`; el cierre quedaba bloqueado aunque ese botón no formara parte de los controles ejecutables.

### Evidencia de verificación sin una petición nueva

El marcador de verificación se fijaba antes de comprobar si se pudo hacer clic. Además, el resultado copiaba la última transacción bajo `verification`. Así, tanto un control ausente como un clic aceptado sin petición nueva podían devolver la compra original como evidencia de su propio giro posterior.

## Criterio de recuperación

Se distinguen tres hechos: disponibilidad lógica, intento físico y petición capturada. Solo un rechazo explícito anterior al clic permite volver a buscar el control. Un clic aceptado o un resultado incierto no autoriza repetir el spin por el mero transcurso del tiempo.

La indisponibilidad confirmada conserva la operación y permite resolver su continuación dentro del plazo existente. Las elecciones y el menú abiertos impiden el clic central; la actividad reciente lo aplaza. Una vez aceptado el clic normal, el recorrido espera su petición: tampoco ejecuta otras continuaciones sobre el protocolo anterior aunque los flags cambien. Cuando aparece el primer envío, vuelve a seguir su evolución normal.

La verificación conserva una frontera propia de secuencia, tomada antes del clic. Se vuelve a comprobar el protocolo fresco después de capturar los controles; un cambio de secuencia, una respuesta incompleta o un estado no terminal obliga a reobservar. Su evidencia permanece vacía hasta observar el primer envío posterior. El tipo y payload de ese envío quedan anclados; una respuesta posterior exitosa no puede sustituir una verificación inicial fallida o incompleta. Se mantiene la identidad independiente de la compra original.

## Diagnóstico de una operación pendiente

`edge.operation.completion` conserva un resumen de la fase y de los bloqueos que impiden terminar: flags relevantes, estado resumido del protocolo, fronteras de envío y verificación, último intento y referencia de evidencia. Permite distinguir, por ejemplo, un Stop activo de una petición de verificación que todavía no apareció.

El resumen utiliza campos seleccionados. No copia el runtime completo, el buffer de tráfico, marcadores de sesión ni datos de cartera. Los resultados de continuación se conservan con razones acotadas y sanitizadas.

Cuando los flags y el protocolo son terminales pero el tráfico cambia en cada observación, el motivo es `READINESS_NOT_STABLE`. `completion.readiness` conserva muestras estables, muestras requeridas, quietud y momento de evaluación. Los contadores y la captura corresponden a la última observación realmente evaluada; el timeout no los mezcla con una captura posterior que quedó fuera del plazo.

## Verificación automatizada

La suite completa pasó de 216 a **245 pruebas**, con **cero fallos y cero omitidas**, en Node 24.19.0 sobre Linux. `npm test` terminó en aproximadamente 24,4 segundos. Las 29 pruebas nuevas cubren 19 escenarios del motor de finalización, ocho escenarios adicionales del adaptador real y dos casos de disponibilidad de componentes.

Las reproducciones de los defectos fallaron antes de aplicar sus correcciones. Una guarda de comportamiento existente ya pasaba y se conservó como regresión. La revisión independiente detectó dos casos adicionales: recuperación después de un clic aceptado sin petición y protocolo que cambia antes del clic sin aumentar el número de spins. Ambos se reprodujeron en rojo y se corrigieron. No quedaron hallazgos críticos o importantes pendientes en el alcance revisado. `git diff --check` pasó.

El workflow `Tests` ejecuta la misma suite en Node 22 y 24 sobre Linux y Windows. El resultado remoto corresponde al commit de la PR y se consulta en sus checks; no se deduce de la ejecución local.

## Alcance respecto a los juegos históricos

La [muestra de cinco juegos](validation-pragmatic-new5-2026-10-05.md) contiene métricas agregadas y capturas, pero no los flags finales completos de Harvest Moon. Su pantalla base visible no demuestra cuál de las condiciones internas bloqueó el cierre. La discrepancia de controles deshabilitados es un defecto reproducido del código, no una causa histórica confirmada de ese juego.

Esta tanda no cambia los resultados históricos ni certifica nuevas compras. El agente HardFire estaba desconectado durante la revisión. La validación automatizada mantiene reales el recorrido, el parser, el cierre y la exportación; sustituye las fronteras externas de Electron y la sesión del juego.

La siguiente prueba en el runtime real deberá confirmar la identidad de la versión instalada, recorrer las compras observadas de Sleeping Dragon y Harvest Moon y conservar los nuevos diagnósticos junto al HAR. Para acreditar cada compra se exigirá su respuesta, el cierre del bonus y un giro normal posterior con evidencia propia. Las ramas que agoten el plazo conservarán su bloqueo concreto.
