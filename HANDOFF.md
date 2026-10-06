# Fuzzer — continuidad del proyecto

Actualizado el 6 de octubre de 2026. Leer este archivo antes de continuar desde otro chat. Este primer registro se publica **antes** de implementar la siguiente corrección; no confundir el trabajo propuesto con trabajo terminado. Los resultados posteriores se añadirán al final con sus commits y ejecuciones.

## 1. Objetivo del usuario y alcance autorizado

Descubrir y probar caminos de las opciones de juegos DEMO oficiales: observar controles, pulsar una opción, seguir sus hijos, conservar las alternativas y reconstruir desde A para probar las hermanas. Registrar qué cambió y qué solicitudes/respuestas produjo cada camino. **No se exige clasificar primero compra, Ante Bet o giro normal.** Un giro de comprobación sirve para validar una ruta que vuelve a base sin otra operación o menú.

Solo DEMO, sin login, dinero real, depósitos ni modificación de solicitudes del proveedor. El usuario ha autorizado desarrollar, probar en GitHub Actions y actualizar documentación. Mantener `main` sin cambios y la PR #1 en borrador mientras persistan huecos de cobertura. No asumir trabajo en segundo plano ni afirmar que una ejecución iniciada ya terminó.

Aclaración del usuario en esta revisión: los botones universales que aparecen siempre en la interfaz están excluidos deliberadamente. **Una exclusión documentada no es un fallo de descubrimiento.** Sonido, ayuda, ajustes, autoplay, velocidad y spin/stop de base no deben inundar el árbol; spin/stop necesarios para operar tienen un tratamiento controlado independiente. Aceptar, cancelar, elecciones, continuar o modificadores propios de una función no se deben descartar por compartir un nombre o componente con controles comunes.

Existen botones para subir/bajar la apuesta antes de confirmar una compra. Hay que observar cómo cambian importe, precio y opciones disponibles. Son configuración de la ruta, no nuevas clases de compra por cada cifra. Evitar un árbol infinito de `+`, `-`, `+`, `-`. La cobertura declarada debe decir qué importes se probaron y cuáles no; probar uno no acredita todos.

## 2. Punto de partida verificable

Repositorio: `Shisetsu-Code/Fuzzer`. Rama de trabajo: `codex/explorer-reliability`. PR: https://github.com/Shisetsu-Code/Fuzzer/pull/1 . Base `main`: `0aed1ce909842ef71cedb3e67d76c6eead88f950`.

Al comenzar esta revisión HEAD era `23e5b45d53b6e4a14d10c5b1ff962e1013976d5f`. Su último cambio fue **solo el plan** `docs/superpowers/plans/2026-10-06-visible-controls-followup.md`; no solucionó los controles ausentes. Último cambio funcional anterior: `9ea1c18c9902784b3194ee4a7e488bc969e37db8`. Recuperación principal: `61561dba5e41b2efb300c03b6c6c780b6d3add98`.

HardFire fijado: `adf6de5ec14e394f77fb1816d5f46e5deb250b0a`. CI usa Electron 44.4.0/Chromium, Xvfb y SwiftShader, no Chrome/Edge instalado por el usuario. El host solicita velocidad 4x y registra la velocidad observada por pestaña. Eso no multiplica por cuatro red, capturas, lecturas o timeouts.

Baseline repetido en esta revisión: `npm test`, Node 22.16.0, **373/373**, cero fallos, cancelaciones u omisiones, 27,58 s. El árbol del source bundle coincide con `908d721230c6204f5f5118bc28deb5d89afbbc1e`. Esto acredita pruebas deterministas, no cobertura de juegos.

## 3. Lo ya implementado

- Navegación de controles observados y seguimiento de hijos en la sesión actual. Reinicio aislado para alternativas cuando no puede reutilizarse la rama.
- Separación de solicitudes relevantes del juego frente a recursos/telemetría; registro de solicitudes en vuelo y captura pendiente. Se conserva la identidad del envío inicial y de la verificación posterior.
- Dos reintentos por ruta, posteriores al trabajo nuevo, con guardado y cierre antes de abrir otra sesión. Historial de intentos, rutas recuperadas, bloqueos definitivos y tareas diferidas por presupuesto.
- Identidad de menú sin saldo ni flags transitorios; las variantes reales del replay se aprenden sin fingir que son el destino esperado.
- Conservación de alternativas de decisiones antes del clic; rechazo de controles deshabilitados, captura incierta y cambios de protocolo antes del envío. No repetir un clic incierto en la misma sesión.
- Bloqueo de superficie para entradas y protección contra locks anidados. Lecturas/escrituras independientes con concurrencia acotada; las entradas de una sesión nunca se paralelizan.
- HAR y checkpoints duraderos, cierre propio y recuperación de exportación. Los checkpoints **no** reanudan automáticamente la cola en otro proceso/run.
- Benchmark por subfase, promedios, percentiles, tiempos anidados y progreso periódico. Se quitaron las capturas raster redundantes del camino de observación, conservando evidencia de rama.
- Stop dejó de contarse como elección de bonus; eso eliminó un falso positivo, no solucionó por sí solo la selección real de Dragon.

## 4. Resultados reales y significado

La tanda https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37459984251 ejecutó cinco juegos con recuperación:

| Juego | Rutas válidas / descubiertas | Tiempo observado | Límite del resultado |
|---|---:|---:|---|
| Dragon’s Gate | 5/5 | 456 s | Compra sin continuación; Stop se corrigió después. |
| Inca Queen | 10/12 | 629 s | Continuaciones y cinco tareas diferidas por plazo. |
| Big Bass Blast | 4/4 | 124 s | Agotó lo detectado, sin compra enviada. No prueba menú completo. |
| Hundreds and Thousands | 1/2 | 123 s | Entrada de compra con tres ACTIVE_TIMEOUT; captura muestra aceptar/cancelar. |
| Blazing Wilds | 4/8 | 392 s | Una ruta se recuperó; quedan áreas ambiguas y bloqueos. |

Repetición de Dragon: https://github.com/Shisetsu-Code/Fuzzer/actions/runs/37461892226 , fuente `9ea1c18c`: 5/9 rutas válidas, una recuperada, 626 s, cinco tareas diferidas y ninguna decisión real acreditada. Dos envíos de `pur=0` son intentos de la misma compra, no dos modalidades. Las seis ejecuciones cerraron sus sesiones. Algunas exportaciones omitieron imágenes por presupuesto; conservaron protocolo y resultado.

Los informes previos interpretaron aceptar/cancelar ausentes del grafo como brecha a investigar. **Primero comprobar si el control falta en el scanner, lo excluye intencionalmente el filtro, aparece tarde, carece de geometría o existe pero el planificador no lo recorre.** No incluir todos los controles a ciegas ni convertir universalmente cada collider en una compra.

Distinciones obligatorias: acción con efecto, petición transportada, operación finalizada, ruta resuelta y cobertura de controles observados. `ACCEPTED_REQUEST` usa HTTP 200 y cuerpo capturado, no validación exhaustiva de errores semánticos. `EXHAUSTED_OBSERVED_CONTROLS` solo habla del alcance observado/filtrado. `completeGame` sigue siendo `false`.

## 5. Flujo y archivos importantes

`providers/pragmatic/drawn-buttons.js`: extrae XTButton/CATButton/UIButton, handlers, dibujos, collider y proyección de geometría. `known-controls.js`: decide exclusiones universales. `hit-point.js`: rechaza áreas de clic ambiguas.

`integrations/hardfire/state-explorer.js`: conecta observación, saldo, controles, protocolo e inputs; revalida antes de clicar. `providers/pragmatic/state-explorer.js`: grafo, replay, cola nueva/recuperación, intentos y cobertura. `operation-completion.js`: continuaciones, decisiones, identidad de operaciones y estancamiento. `wager-evidence.js`: saldo/configuración y giro de comprobación.

`integrations/hardfire/session.js`, `har.js`, `har-consolidation.js` y `paint-guard.js`: propiedad de sesión, persistencia, consolidación y exclusión de superficie. `scripts/ci/hardfire-host.mjs`: host Electron real. `run-live-demo.mjs`, `export-live-evidence.mjs`, `recover-live-evidence.mjs`: ejecución y evidencia pública saneada. `lib/performance.js`: mediciones/concurrencia.

El camino debe ser: observar -> conservar alternativas -> comprobar control vigente -> un clic -> observar resultado -> seguir hijo/decisión o hacer una única prueba desde base -> guardar/cerrar -> hermana o recuperación. Un fallo local no bloquea indefinidamente todas las alternativas. No declarar una compra completa porque abrió su confirmación.

## 6. Bloqueos, carreras y tiempos a revisar

Prioridad funcional: controles específicos que no llegan al árbol; decisiones/continuaciones que no se ejecutan; cambios de apuesta dentro de un menú sin perder la confirmación o duplicar rutas. Investigar evidencia anterior antes de ampliar timeouts.

El scanner/filtro es una frontera separada del ejecutor: reintentar no descubre un botón descartado. La instantánea de UI no es atómica; revisar captura pendiente, generación de sesión, marcador de protocolo, disponibilidad, controles superpuestos y cambios entre observación y clic. No inferir éxito de `ok:true` si el handler no generó ningún efecto. No encadenar dos continuaciones con la misma observación.

Presupuestos actuales: 100 acciones destino, profundidad 8, 10 minutos por juego en la tanda; dos reintentos; transición de 15 s con polling de 500 ms; operación 15 s sin progreso y máximo 180 s; comprobación no antes de 5 s desde la acción. Son límites de planificación, no garantías de latencia: un comando ya enviado al navegador puede sobrepasarlos. No matar un proceso sin preservar HAR.

Máximo dos trabajos DEMO simultáneos; un juego cargado por host actual de CI y máximo general cuatro pestañas DEMO según `AGENTS.md`. No lanzar tandas concurrentes para eludirlo. No cancelar runs activos que aún deban guardar/cerrar.

El antiguo benchmark midió ~81% en capturas, pero correspondía a otra versión. No atribuirlo a la actual. Sumar fases simultáneas falsea el tiempo de pared. No comparar tandas con distinto recorrido como un speedup controlado.

## 7. Trabajo solicitado ahora y orden

1. Publicar esta continuidad antes de tocar código (este commit).
2. Reproducir brecha scanner/filtro/planificador con los controles reales. Documentar qué se excluye y por qué.
3. Corregir únicamente la frontera demostrada, conservando las exclusiones universales. Añadir regresiones que fallen antes del arreglo.
4. Contemplar incremento/decremento de apuesta: contexto, importe antes/después, actualización de precio, geometría actual, alternativas nuevas y prevención de ciclos. Declarar el alcance de importes muestreados.
5. Resolver las decisiones de bonus usando controles observados y entradas soportadas, sin adivinar índices ni fabricar peticiones.
6. Ejecutar pruebas deterministas y casos DEMO dirigidos en Actions. Revisar grafo, entradas y respuestas, capturas, errores, tiempos y limpieza. Si hay bloqueo residual, dejar causa y reproducción exacta.
7. Actualizar este archivo, README, contrato y evaluación con commits/runs nuevos y el trabajo realmente pendiente.

## 8. Cómo continuar en otro chat

Dar el repositorio y pedir: «Lee HANDOFF.md en codex/explorer-reliability, comprueba HEAD y Actions y continúa desde el último resultado verificado, sin repetir trabajo ni declarar cobertura por una cola vacía». Leer después `docs/objective-and-recovery-2026-10-06.md`, `docs/validation-route-recovery-2026-10-06.md`, `docs/validation-dragon-followup-2026-10-06.md` y el plan visible-controls-followup. Respetar `AGENTS.md`; la referencia local Windows RTK puede no estar disponible en el contenedor.

Pruebas: `npm test` (Node >=22). CI: `.github/workflows/test.yml` ejecuta Node 22/24 en Windows/Linux. `.github/workflows/pragmatic-new5.yml` requiere marcador explícito `[live-demo:<game-id>]` o `[live-demo:all]`, o workflow_dispatch. No contar los jobs omitidos como DEMOs aprobados. Manifiesto de juegos: `docs/evidence/pragmatic-actions-new5-2026-10-05-manifest.json`.

Cuando la red del contenedor no permite clonar, usar el conector GitHub y el workflow de source bundle; verificar SHA256, commit de origen y árbol antes de editar. No inventar credenciales ni rutas locales. Los artefactos expiran: preservar informes saneados y hashes en el repo; nunca tokens/cookies o lanzamientos de sesión completos.


## 9. Actualización posterior verificada — controles y apuesta

La implementación posterior al punto de partida ya está en la rama. Estado verificado más reciente antes de esta actualización documental: `77f59c8165f057b5359d054d4d32bfc4b7b8af8f`.

Cambios funcionales posteriores:
- `4b5eea1d7d04b625da325fd4534282ab7cab242f`: menús V2 observados, muestreo acotado de +/- y decisiones físicas soportadas.
- `77f59c8165f057b5359d054d4d32bfc4b7b8af8f`: diferencia modal abierto/listo, restringe fondo durante compra y añade recuperación física protegida de Stop.

Los controles universales excluidos siguen fuera del árbol por diseño. Aceptar/cancelar dentro del modal no se consideran universales y deben descubrirse. Los +/- solo se habilitan como configuración contextual de compra, con un paso arriba/abajo por ruta y cobertura explícitamente parcial.

Validación determinista del último cambio: **404/404** en Node 22/24 sobre Windows/Linux.

Resultado dirigido `37527476771`:
- Hundreds and Thousands: la brecha de aceptar/cancelar quedó corregida. `ButtonYes0` llegó al grafo y envió `pur=0` con HTTP 200. Resultado `PARTIAL` por deadline porque la operación posterior no terminó.
- Dragon's Gate: compra `pur=0` aceptada; continúa bloqueado en `STOP_ACTIVE/PROTOCOL_NOT_READY` y sin decisión de bonus acreditada. La recuperación física de Stop pasa regresiones pero esta ejecución real no demostró cierre.
- Ambos cerraron sus sesiones; el rojo del workflow corresponde a resultados `PARTIAL`, no a un crash de infraestructura.

La tanda anterior `37523912578` comprobó en Dragon que el muestreo contextual de apuesta cambia 2 -> 3 y 2 -> 1.8, y el precio de compra 100 -> 150/90. Son importes de una misma ruta, no modalidades adicionales.

Documento detallado: `docs/control-wager-followup-2026-10-06.md`.

**Prioridad única inmediata:** diagnosticar con evidencia exacta la continuación posterior a `pur=0` de Dragon y corregir esa frontera sin ampliar timeouts ni reintroducir controles universales.


## 10. Corrección BFS para elecciones anunciadas que aparecen tarde

Commit funcional: `037d3439d84e333f978390b30453743f3e1ad8bc`.

Dragon aclaró una propiedad del contrato: una respuesta completa con `na=b`, `na=m` o `na=fso` anuncia una **frontera de decisión abierta** aunque los botones todavía no estén dibujados. Esa espera no debe confundirse con una operación estancada.

Antes, `finishOperation()` aplicaba el mismo presupuesto de inactividad de 15 s a cualquier operación. Si el panel de opciones aparecía después, la ruta terminaba `OPERATION_STALLED` antes de que el BFS pudiera registrar sus hijos.

Ahora:
- el watchdog corto de inactividad sigue aplicando a operaciones genéricas;
- cuando el protocolo completo anuncia una decisión y todavía no hay elecciones visibles, se continúa observando hasta que aparezcan o hasta el límite absoluto/global;
- al aparecer, se conservan todas las alternativas; se ejecuta una y las hermanas quedan representadas por `choicePlan` para reconstrucción desde la raíz;
- Stop continúa fuera del árbol; no se convierte en elección por esperar un panel;
- no se fabrican índices ni payloads: las opciones deben aparecer como controles observados/pickers soportados.

Regresión TDD: una decisión anunciada permanece invisible 20 s, superando el stall genérico de 15 s, luego muestra dos botones. Antes del cambio la prueba terminaba `OPERATION_STALLED`; después registra ambas opciones y ejecuta una. La regresión genérica de no-progreso permanece válida usando una operación que no anuncia decisión.

Verificación local sobre el source bundle de `77f59c8` más este cambio: **405/405 pruebas**, 0 fallos.

Esta corrección alinea el motor con el modelo esperado: BFS sobre estados/opciones observadas. La primera ejecución descubre una bifurcación, sigue una alternativa y conserva las hermanas; cada hermana se reconstruye desde A en una sesión limpia. Un panel que aparece tarde amplía el árbol cuando aparece; no requiere que la compra se haya “cerrado” previamente.


### FIFO BFS estricto

Además se corrigió el orden del planificador en `32e3516b339ffeec803b9c6937e39afc2afa4e54`. Antes, `actions` insertaba hijos nuevos al frente de la cola con `unshift()`, por lo que un nieto podía adelantarse a un hermano: por ejemplo `open -> a -> a1 -> b`. Eso era profundidad primero parcial.

Ahora todos los controles nuevos se agregan al final de la cola FIFO. El orden probado es `open -> a -> b -> a1`: los hermanos ya observados se ejecutan antes que los descendientes recién descubiertos. Cada ruta que requiere volver a un estado anterior se reconstruye desde A en una sesión limpia. La reutilización de sesión solo ocurre si el hijo recién observado ya es realmente el próximo elemento de la cola BFS; nunca adelanta un hijo sobre trabajo previamente encolado.

Verificación local combinando esta corrección con la espera de decisiones anunciadas: **406/406 pruebas**, cero fallos.
