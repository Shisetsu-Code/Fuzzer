# Árbol de decisiones con cuatro clientes DEMO

El planificador providers/pragmatic/forked-tree.js descubre opciones de menú y crea rutas observadas. Cada botón de menú requiere aprobación explícita del asistente antes de ejecutarse.

## Recorrido

Inicio → Abrir compras → Menú con cuatro compras.

El asistente observa las cuatro opciones y las aprueba. El planificador asigna cada una a una sesión DEMO aislada, hasta cuatro concurrentes. Reconstruye desde el inicio el camino hacia ese menú, comprobando en cada paso la identidad y huella del control. Los cuatro clientes recorren sus ramas sin compartir sesión ni resultado aleatorio.

Si una rama abre otro menú con dos opciones, aparecen dos hijos nuevos sin ejecutar. El asistente decide cuáles explorar y se repite el despacho. Nunca hace clic en controles desconocidos o ambiguos ni reenvía una compra cuyo estado sea incierto.

Cuatro clientes es el límite simultáneo, NO el número total de sesiones usadas. Un árbol con muchas ramas necesita más sesiones sucesivas: max_sessions y max_depth limitan el coste.

## Herramientas MCP

- pragmatic_tree_start: descubre la raíz y guarda una captura.
- pragmatic_tree_result: consulta nodos, controles y progreso sin hacer clic.
- pragmatic_tree_approve: aprueba opciones observadas en un nodo, sin ejecutar.
- pragmatic_tree_skip: descarta provisionalmente controles sin declararlos ausentes.
- pragmatic_tree_run: distribuye las opciones aprobadas en hasta cuatro clientes.
- pragmatic_tree_live_observe: observa la pantalla de un bonus vivo, con token nuevo.
- pragmatic_tree_live_act: ejecuta una acción elegida y revalida estado/control (incluido Stop una sola vez por tirada).
- pragmatic_tree_live_release: registra auditoría, cierra ese cliente y libera su espacio.
- pragmatic_tree_close: guarda el árbol completo y libera recursos.

Ejemplo:
pragmatic_tree_start({game_url:"https://www.pragmaticplay.fun/en/slots/candy-rush/",clients:4,max_sessions:40,max_depth:8})

La evidencia y los HAR se guardan por sesión en la carpeta forked-tree del perfil HardFire; los HAR completos no se publican en GitHub.

## Reglas de seguridad y cobertura

Una compra aceptada mediante `doSpin pur=0`, HTTP 200, no es un bonus completo.
Si una operación comienza, su arista se marca `OPERATION_PAUSED_LIVE` y la
sesión se conserva hasta resolución guiada o cierre explícito. No se eligen
picks de RNG automáticamente ni se reenvía la compra por ausencia de respuesta.

La operación solo recibe `OPERATION_COMPLETE_VERIFIED` tras cumplir
el verificador de regreso a base (tirada normal adicional y dos snapshots
terminales); si se cierra antes queda `OPERATION_PENDING_CLOSED`. Una
liquidación `doCollect` y una pantalla de resultado **son evidencia útil
pero no terminan la verificación**.

Las rutas de menú son reproducibles si siguen apareciendo los mismos controles. Los eventos RNG no se reproducen como si fueran estados deterministas.

En GitHub Actions, las pruebas del algoritmo utilizan sesiones simuladas con cuatro clientes concurrentes. El modo de decisión dinámico necesita un agente conectado al navegador; los runners no tienen un LLM integrado por defecto.


## Continuación de compras con sesión viva

A diferencia del modo anterior, cuando una rama envía un `doSpin pur` **no se
cierra la pestaña**. Se guarda con identificador `branchId` como
`OPERATION_PAUSED_LIVE`. Estas pestañas cuentan para el máximo de
cuatro sesiones abiertas. Si las cuatro están ocupadas, las demás tareas
aprobadas permanecen en cola.

El agente puede inspeccionar la pantalla de esa misma sesión mediante
`pragmatic_tree_live_observe({job_id,branch_id})`, y elegir una única
acción autorizada con
`pragmatic_tree_live_act({job_id,branch_id,token,action_id,reason})`.

Las opciones pueden ser un picker visible, un control Continue/Collect,
una continuación explícita del proveedor o un clic al centro cuando el
overlay lo justifique visualmente. **No se elige automáticamente ninguna
alternativa** y nunca se reenvía una compra por timeout.

La rama solo queda `OPERATION_COMPLETE_VERIFIED` cuando hay:
1. Compra DEMO confirmada por el servidor.
2. Ausencia de free spins, respins, selección pendiente, cascadas o menús.
3. Dos observaciones del estado base preparado.
4. Una tirada normal de verificación aprobada por el agente y confirmada
   por el servidor.
5. Dos nuevas observaciones estables posteriores a esa tirada.

Finalmente `pragmatic_tree_live_release({job_id,branch_id,reason})`
guarda la auditoría de decisiones dentro de la arista del árbol, cierra
la pestaña y libera el slot. Si faltó alguna prueba, queda
`OPERATION_PENDING_CLOSED` con motivo explícito, **nunca COMPLETE**.

En GitHub Actions hay pruebas deterministas del supervisor de bonus,
incluyendo pickers, tokens caducados, respuesta del servidor ausente,
tirada de verificación y dos snapshots estables posteriores. La
integración completa con HardFire real sigue pendiente mientras el
agente local no esté conectado. Las pruebas Playwright de cuatro
clientes, por separado, miden ramas reales sin un LLM dentro del runner.

## Estado de validación y lectura obligatoria

Consultar el **[informe consolidado del 18/10/2026](estado-fuzzer-2026-10-18.md)**:
contiene los enlaces a GitHub Actions, resultados reales de compras DEMO,
primer `doCollect`, tiempos, condiciones de `COMPLETE` y limitaciones del
árbol genérico. Los workflows Playwright usaron rutas de Candy Rush
preseleccionadas mediante capturas, **no decisiones en vivo de un LLM**.
El árbol de HardFire retiene clientes vivos, pero esa integración de navegador
no tiene todavía una prueba de extremo a extremo real.
