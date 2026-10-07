# Cierre de bonus por tirada normal observada

## Contrato aprobado

Después de inactividad, atender primero las interacciones pendientes y probar
el control normal de giro observado en la pantalla base. La evidencia es una
nueva petición de giro con respuesta aceptada, no `canSpin`, una imagen del botón
ni la desaparición de flags. Es una heurística operacional para este adaptador
DEMO, no una afirmación universal sobre todos los proveedores o cualquier doSpin.

Base de trabajo: `7ea29026151af5677d179d1c769693238b164b56`. Su árbol
`22e6fad794727bae17fb1a941f2c9aa42637f252` se reconstruyó del source bundle
`b1958b4` y del cambio de pruebas de rutas canónicas; hash cotejado antes de editar.

## Implementación

- En modo actions, una compra o un bonus observado exige prueba empírica de
  salida. Cuatro segundos de quietud del protocolo y superficie observada,
  usando la estabilidad configurada; flags volátiles y saldo no renuevan ese reloj.
- Se aprende el control normal en la sesión base. Se vuelve a leer geometría y
  captura antes del clic físico, sin invocar su función interna ni fabricar payloads.
- Menús, Stop realmente visible, nuevos controles, áreas sin resolver, captura
  pendiente/incierta y una geometría cambiada bloquean ese clic. Las coordenadas
  del iframe se comparan en espacio de runtime y se ejecutan en espacio de página.
- Se buscan controles nuevos durante toda la operación, no solamente con na=b/fso.
  Un panel sin anuncio de protocolo conserva sus alternativas y puede continuarse
  aunque StageSpin esté desactualizado. No depende del texto inglés del botón.
- El primer giro posterior al clic queda anclado por secuencia. Se exige respuesta
  completa, tipo spin sin compra, próximo estado reconocido y ausencia de error
  explícito. HTTP 200 por sí solo no certifica la salida.
- Un clic sin respuesta dispone de diez segundos y no se repite en esa sesión.
  Las respuestas inciertas tampoco certifican éxito. Las fallas recuperables
  conservan los dos reintentos existentes, en sesiones limpias y tras rutas nuevas.
- Si la prueba revela un panel sin enviar el giro, se invalida esa frontera antes
  de seguir las opciones. El giro de una continuación no puede certificar el clic
  anterior. Hay como máximo dos intentos de prueba por operación, y el segundo
  requiere que el primero haya revelado una interacción; no se repite un no-op.
- Una respuesta de giro que inicia otro bonus confirma el cierre anterior. Se
  registra `verificationNextOperation` sin declarar completada la nueva operación
  aleatoria ni exigir que sus flags se limpien para cerrar la operación anterior.
- `closureEvidence` deja el control y secuencia que sustentan el cierre. Los
  flags contradictorios quedan como diagnóstico, no como veto circular.

No se cambian 4x, los veinte minutos globales de campaña, FIFO, límites de
concurrencia ni captura HAR. La identidad de campaña cambia de versión para no
restaurar checkpoints locales creados bajo un criterio de cierre incompatible.
Main permanece intacto y la PR en borrador.

## Evidencia de pruebas

Baseline: 436/436. Suite después del cambio: **463/463**, cero fallos,
cancelaciones u omisiones, Node 22.16.0/Linux, 27.183 s. `git diff --check` aprobado.
Las regresiones de cierre empírico, continuación tardía, mapeo iframe,
aceptación semántica, incertidumbre, reintentos y panel revelado fallaron antes
de sus correcciones. La prueba integrada usa el adaptador real con fronteras
de navegador simuladas. Las pruebas de compras que antes exigían cero giros
adicionales ahora exigen exactamente uno, como cambia el contrato aprobado.

```sh
npm test
node --test test/operation-exit-probe.test.js test/observed-exit-spin.test.js
node --test test/state-explorer-integration.test.js test/exit-probe-live.test.js
```

Revisión propia separada, no independiente. Se revisaron especialmente carreras
entre lectura e input, respuesta rechazada con HTTP 200, respuestas tardías,
conservación de alternativas y confusión entre bonus original y giro de prueba.

## Prueba dirigida live y límites

`Observed exit probe validation`, activada con `[exit-probe-live]`, recorre las
primeras tres acciones de Dragon en una sesión de hasta ocho minutos. Es una
prueba diagnóstica, no modifica el presupuesto del workflow de exploración.
Comparte la cola exclusiva de DEMOs. El paso final exige `closureEvidence`, una
verificación aceptada y cleanup confirmado; un workflow omitido no es evidencia.

El resultado de esta prueba se informa separado de las 463 pruebas deterministas.
No se afirma que todos los juegos estén resueltos por publicar este cambio.
La detección de pantallas sigue limitada a los controles/áreas del extractor de
runtime. Un área sin resolver impide la prueba y queda diagnosticada con las
capturas de cierre; no se implementó reconocimiento visual semántico universal.
Tampoco hay atomicidad universal entre lectura de pantalla y clic, ni reinicio
general del host tras un crash. `completeGame` sigue en false.

## Seguimiento live: un bonus activo no era un bonus bloqueado

La primera prueba real, commit `4f699e2`, run `37580145837`, registró una compra,
selección de respins y solicitudes del juego que avanzaron rs_c de 1 a 8 entre
06:14:26 y 06:16:18 UTC. No hubo prueba de giro normal ni cierre certificado.
El resultado conservó OPERATION_TIMEOUT a los 180140 ms, aunque el bonus seguía
progresando. La captura final muestra respins pendientes. Esto identifica otro
freno concreto: el límite interno heredado de tres minutos interrumpía una
operación sana antes de poder verificar su salida.

Se elimina ese corte implícito únicamente cuando el modo de prueba empírica
recibe un deadline de campaña finito: usa el tiempo restante de esa campaña.
Un timeout de operación indicado expresamente sigue aplicándose. Los callers
estrictos o sin deadline conservan el valor anterior de 180000 ms. Continúan los
quince segundos de inactividad, diez segundos de respuesta a la prueba y todos
los límites globales; no se conceden veinte minutos nuevos a cada operación.

La regresión reproduce una operación con tráfico válido cada cinco segundos
que termina a los 210 s: antes se cortaba a los 180 s; ahora intenta el spin
normal después de estabilizarse y conserva su respuesta. Pruebas adicionales
verifican el deadline global, el límite explícito y la parada por inactividad.

La repetición diagnóstica `3cfbe62`, run `37581150887`, falló antes de ejecutar
acciones: la entrada DEMO no expuso el runtime soportado. No es evidencia de
cierre ni de una regresión del nuevo criterio. Se conserva su error. Su ZIP:
`882289a591d8d65a3854c01ddd24463aacc385a4b6bad0f6dd082ba1125997c7`.

El ZIP de la primera prueba:
`1ecf42d736a69bbfe3e748d23da2df932da3f559245fbe5dc6c08135b559ce0f`.
Ambos hashes se verificaron al descargar. El diagnóstico dirigido pasa de cinco
a ocho minutos para observar esa operación sin el corte heredado; la campaña
normal mantiene veinte minutos. Su gate sigue exigiendo prueba real y limpieza.

Verificación final del seguimiento: **468/468** pruebas locales, cero fallos,
cancelaciones u omisiones, 27.373 s. `git diff --check` sin errores. La
validación live del código corregido se registra por separado.
