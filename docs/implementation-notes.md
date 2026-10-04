# Decisiones y evidencia

## Transporte aprobado

La corrección más reciente del usuario prevalece sobre el diseño inicial: Fuzzer registra herramientas propias en el MCP local HardFire, sin depender de Firetrace. No se agrega Cloudflare ni un servicio externo. Los contratos y HAR permanecen locales.

## Experimento de apuesta

Se implementó un recorrido de cinco mediciones `+ + − −`, con dos spins DEMO en el nivel superior. Los datos numéricos del runtime no se seleccionan por contener bet/stake en su nombre. Se conserva el filtrado de nombres sensibles. La referencia de apuesta aún usa nombres conocidos de Pragmatic; descubrirla totalmente por comportamiento queda pendiente.

La ejecución local `f65fdf5e-d9f7-4fbb-9231-03112b859d16` en Gates of Olympus confirmó apuesta `2,3,4,3,2`; costo de compra calculado `200,300,400,300,200`; requests doSpin con `c=0.2,l=20`; restauración correcta. Las cinco mediciones permiten descartar contadores irreversibles y registrar un factor observado de 100. No prueban causalidad ni que ese factor sea válido para todos los niveles del juego.

## Lecciones del recorrido

- Seleccionar purchaseIndex no siempre envía una compra: Parser puede devolver needsSpin y entonces hace falta el spin real.
- purInit usa en algunos juegos claves JSON sin comillas. Se admite esa gramática limitada sin ejecutar código.
- Un cambio de apuesta puede ser local: no se debe atribuir la respuesta anterior al nuevo selector.
- CanSpin tiene prioridad sobre un botón Stop que permanece activo tras la animación de una cascada.
- Una respuesta HTTP no garantiza que terminó la transición de UI.
- fs=fsmax todavía puede dejar visible el cierre del bonus. Debe usarse el control real de continuación y verificar el regreso a base.
- Dos elecciones con el mismo nombre/evento necesitan su índice exacto. No se sustituye una elección ausente por la primera.
- Un incremento aceptado en el máximo no autoriza un decremento de restauración.
- HasAnteBet sin control ejecutable se informa pendiente, no ausente.

## Límites actuales

Pragmatic es el único proveedor implementado. La validación del experimento de apuesta es real; las compras/elecciones dependen del árbol del proveedor y conservan estados pendientes explícitos. No se certifican todos los juegos ni se han validado todas las compras anidadas en vivo. La fase adicional de 4–6 valores distintos y otras dimensiones no está implementada.

La compra real de Gates fue enviada con pur=0 y respuesta 200. El recorrido posterior logró llegar a fs=15 y na=c usando el evento directo de servidor, pero no completó el cobro en UI; priorizar el evento de cliente tampoco completó la siguiente transición. Se conserva PENDING/TRANSITION_TIMEOUT: no hay prueba de cierre completo. HasAnteBet también sigue pendiente por no identificar su control. La protección final contra doble cierre pasa pruebas automatizadas. Suite actual: 27/27.
