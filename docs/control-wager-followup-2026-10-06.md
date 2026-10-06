# Controles, importe de apuesta y estado funcional — 6 de octubre de 2026

## Objetivo vigente

Fuzzer debe recorrer opciones observadas en DEMOs oficiales, seguir bifurcaciones y registrar qué efecto y qué solicitudes producen. No necesita clasificar primero compra, Ante Bet o giro normal. La clasificación puede añadirse después; no debe bloquear el recorrido.

Los controles universales de la interfaz se excluyen deliberadamente del árbol: sonido, ayuda, ajustes, autoplay, velocidad y los controles base de spin/stop. Esa exclusión no es un fallo de detección. Spin/Stop pueden usarse de forma controlada cuando son necesarios para operar o cerrar una secuencia, pero no se convierten en ramas normales.

Aceptar, cancelar, elecciones de bonus, continuar y controles propios de una compra sí forman parte del recorrido cuando están visibles, habilitados y con geometría segura.

## Cambios implementados

### 1. Menú de compra: abierto vs listo

La evidencia real mostró que una ventana podía considerarse “abierta” cuando solo estaban visibles su fondo y controles de importe. Eso hacía que el planificador fotografiara o recorriera el modal demasiado pronto y perdiera aceptar/cancelar cuando aparecían después.

Desde `77f59c8165f057b5359d054d4d32bfc4b7b8af8f` se distingue:

- `open`: hay evidencia de ventana/modal de compra.
- `ready`: existe al menos un control funcional, habilitado y proyectado dentro de la ventana, no solo Blocker/fondo o ajuste de importe.

Mientras el modal está abierto, el árbol funcional se restringe a controles propios de `FeaturePurchase` y `Buy_BetButtons`. Los controles de fondo que siguen vivos detrás del modal se registran como `modal_background`, no como ramas.

Resultado real: Hundreds and Thousands pasó de “aceptar/cancelar visibles pero ausentes del grafo” a descubrir `ButtonNo` y `ButtonYes0`; la ruta `ButtonYes0` envió una compra `pur=0`, recibió HTTP 200 y quedó registrada como compra aceptada. La operación posterior no terminó antes del plazo.

### 2. Subir/bajar la apuesta antes de comprar

Los controles +/- no se consideran modalidades distintas de compra. Son configuración de una misma ruta.

En modo de acciones:
- los +/- universales siguen excluidos fuera del contexto de compra;
- dentro del menú de compra pueden convertirse en controles `wager-adjustment`;
- se lee el importe real del runtime antes y después;
- cada rama solo prueba un paso arriba o un paso abajo desde el importe observado;
- el árbol no permite cadenas infinitas `+,+,+,...` o `+,-,+,-,...`;
- el informe declara `wagerSampling: one-step-per-route`, `maxWagerStepsPerRoute: 1` y `allAmountsTested: false`.

La tanda `37523912578`, fuente `4b5eea1d7d04b625da325fd4534282ab7cab242f`, comprobó en Dragon cambios 2 -> 3 y 2 -> 1.8. El precio de compra cambió de 100 a 150/90 y el HAR conservó `pur=0` con `c=0.1/0.15/0.09` y respuestas HTTP 200. Eso demuestra que el ajuste de importe afecta correctamente la misma ruta de compra; no acredita todos los importes posibles.

### 3. Stop como continuación técnica, no rama

Dragon mostró una operación aceptada que quedó con Stop visible y servidor todavía esperando continuación. Stop permanece fuera del árbol. Se añadió un camino de recuperación físico y protegido que solo puede pulsarlo cuando:

- Stop está realmente visible y habilitado;
- hay un único candidato;
- la geometría es finita y no ambigua;
- no hay modal ni decisión activa;
- la respuesta anterior está completa;
- no hay cuerpo pendiente ni captura incierta;
- el marcador de protocolo no cambió entre observación y clic;
- queda presupuesto de operación.

Si el clic es incierto, se registra una sola vez y no se prueba otro input desde la misma observación.

## Validación determinista

El commit `77f59c8165f057b5359d054d4d32bfc4b7b8af8f` tiene **404/404 pruebas aprobadas** en la matriz Node 22/24 × Windows/Linux, sin fallos. Incluye regresiones de:

- modal abierto pero no listo;
- exclusión de controles de fondo;
- aceptar/cancelar tardíos;
- +/- en contexto de compra;
- cambio de importe sin solicitud de red;
- muestreo acotado de importe;
- Stop físico;
- Stop deshabilitado o ambiguo;
- captura pendiente/incierta;
- protocolo cambiado;
- plazo vencido;
- clic de Stop incierto;
- recuperación de Stop durante StageSpin.

Estas pruebas validan la lógica del motor. No prueban cobertura completa de un juego.

## Resultado real dirigido

Workflow: `37527476771`, fuente `77f59c8165f057b5359d054d4d32bfc4b7b8af8f`.

### Hundreds and Thousands

Resultado: `PARTIAL` por `DEADLINE`, no fallo de infraestructura.

- 7 rutas descubiertas.
- 4 rutas válidas.
- 4 acciones ejecutadas.
- `ButtonNo` y `ButtonYes0` llegaron al grafo.
- `ButtonYes0` envió `pur=0`, HTTP 200.
- La compra quedó aceptada pero no completada antes del plazo.
- Las cuatro tareas restantes quedaron diferidas por deadline.
- `cleanupPending:false`.

Esto corrige la brecha principal del detector para este juego.

### Dragon's Gate

Resultado: `PARTIAL` por `DEADLINE`.

- 6 rutas descubiertas.
- 4 rutas válidas.
- 4 acciones ejecutadas.
- La compra `ButtonOpt0` envió `pur=0`, HTTP 200.
- La operación terminó estancada con `CAN_SPIN_NOT_READY`, `STOP_ACTIVE` y `PROTOCOL_NOT_READY`.
- No se acreditó una decisión real de bonus.
- `cleanupPending:false`.

La recuperación física de Stop está cubierta por tests, pero esta ejecución real no demostró que complete Dragon. Ese es el bloqueo funcional prioritario.

El workflow dirigido figura rojo porque ambos resultados son `PARTIAL` y el runner devuelve exit code 1 cuando no agota el árbol observado. No es un crash de Electron ni una pérdida de evidencia.

## Evaluación contra el objetivo

### Ya cumple

- no obliga a clasificar compra/ante/giro antes de avanzar;
- conserva alternativas y reconstruye rutas;
- reintenta fallos acotadamente;
- diferencia controles universales excluidos de controles funcionales omitidos;
- espera a que un modal tenga controles funcionales antes de declararlo listo;
- descubre aceptar/cancelar tardíos en Hundreds;
- contempla +/- sin explotar el árbol;
- registra los importes muestreados;
- mantiene clics serializados y revalida UI/protocolo antes de cada input;
- guarda HAR, resultado y limpieza por sesión.

### Todavía no cumple completamente

- Dragon sigue sin cerrar la continuación posterior a la compra;
- no hay prueba general de que todas las decisiones de bonus de Pragmatic se detecten;
- una ejecución puede terminar por deadline con ramas diferidas;
- el muestreo de apuesta es deliberadamente parcial;
- `EXHAUSTED_OBSERVED_CONTROLS` solo acredita lo observado/filtrado, no todo lo posible por resultados aleatorios;
- `completeGame` permanece `false`.

## Próximo trabajo

1. Instrumentar específicamente Dragon después de `pur=0`: respuesta, `na`, flags, Stop observado, resultado exacto del clic físico y siguiente marcador de protocolo.
2. Determinar si la continuación válida es Stop, una decisión dibujada que aún no entra en `visibleOperationChoices`, o una transición del runtime que no estamos leyendo.
3. Añadir una regresión con la evidencia exacta antes de modificar el flujo.
4. Repetir Dragon únicamente.
5. Si Dragon cierra, repetir la tanda de cinco con el mismo commit y conservar una tabla por juego.
6. Mantener el muestreo de apuesta acotado; ampliarlo solo si una compra muestra opciones dependientes del importe que un paso arriba/abajo no alcanza.

## Continuidad

Leer primero `HANDOFF.md`, luego este archivo y `docs/objective-and-recovery-2026-10-06.md`. La PR #1 sigue en borrador. No declarar cobertura total porque un job termine o porque se vacíe una cola; revisar `pending`, `deferredRoutes`, decisiones y solicitudes reales.


## Ventana de estabilidad añadida

El recorrido real usa 4 s de estabilidad continua antes de aceptar/clicar estados nuevos y elecciones. Si UI o protocolo cambian durante esa ventana, el contador reinicia. Una elección anunciada por `na=b/m/fso` bloquea Stop y clic central mientras el panel se anima. Las recuperaciones genéricas también esperan 4 s de quietud antes de input.

El navegador continúa en 4×. Esto acelera las animaciones, pero no reduce los 4 s de estabilidad: se mantiene un margen deliberado contra parpadeos de controles base.
