# Fuzzer

Scripts independientes por proveedor para ejecutar demos mediante el MCP local HardFire. No depende de Firetrace. La primera implementación corresponde a Pragmatic; otros proveedores no están implementados todavía.

## Uso desde el chat conectado al MCP local

1. Consultar `hardfire_tabs` y elegir un `tab_id` existente.
2. Llamar `pragmatic_fuzz_start` con ese ID y la URL pública del juego. `execute=false` descubre funciones y compara variables/apuestas; `execute=true` recorre las compras y elecciones descubiertas.
3. Guardar el `job_id` y consultar `pragmatic_fuzz_result`. Nunca repetir el inicio para consultar progreso.

```json
{"tab_id":3,"game_url":"https://www.pragmaticplay.com/en/games/gates-of-olympus/","execute":true,"max_branches":8,"max_steps":100}
```

El trabajo usa pestañas DEMO nuevas con sesiones aisladas. No navega ni graba sobre la pestaña original. Cada rama reproduce su ruta en una demo nueva; guarda su HAR antes de cerrar la pestaña propia. La mayoría de edad debe haber sido confirmada por el usuario si el sitio la solicita.

## Organización

- `providers/pragmatic/flow.js`: árbol de este proveedor, con límites y estados COMPLETE/EXPANDED/PENDING.
- `providers/pragmatic/session.js`: variables económicas, autoridad del servidor, órdenes y captura de payloads.
- `providers/pragmatic/parser/runtime.js`: código de interacción reutilizado de Shisetsu-Code/Parser.
- `providers/pragmatic/exceptions.js`: lugar reservado para excepciones demostradas de juegos específicos.
- `integrations/hardfire`: conexión directa con Electron y registro de las funciones MCP.
- `test`: pruebas del árbol, compras, payloads, dominios DEMO y referencias de marcos.

No hay un motor universal que adivine controles de todos los proveedores. El formato de resultados y el transporte se pueden compartir; los botones, estados y continuaciones pertenecen al proveedor.

## Evidencia y límites

`purInit` confirma las compras Buy Feature habilitadas en la sesión; controles internos vacíos no las crean. Antebet y otros modificadores se registran aparte cuando el runtime los expone. Una función anunciada pero no ejecutable permanece pendiente, no se declara ausente.

El experimento `BET_IMPACT_PROBE` ejecuta `+ + − −`: guarda cinco snapshots numéricos, espera estabilidad de apuesta/precios y comprueba la restauración. Barre hasta 2.000 variables numéricas o booleanas sin depender de nombres económicos, excluyendo eventos y nombres sensibles. La apuesta de referencia todavía se obtiene de variables conocidas de Pragmatic. En el nivel superior hace dos spins DEMO y guarda requests/responses sanitizados. La restauración se intenta también si falla la prueba; no reduce la apuesta cuando un incremento al máximo no cambió su valor.

`impact` conserva valores, deltas y multiplicadores observados. Usa `DERIVED` para series proporcionales reversibles, `TRANSIENT` para series que no regresan, y `UNKNOWN` para el resto. No asigna certeza causal ni diferencia DIRECT de DERIVED sin evidencia adicional. El precio `purchase-config.bet * BetDisplayed` se etiqueta como cálculo derivado. No prueba por sí mismo que una compra se ejecutó. Los snapshots numéricos completos quedan en el contrato local; la consulta MCP devuelve la comparación y un resumen de cada snapshot.

La segunda fase con 4–6 apuestas distintas, detección automática de la variable base y clasificación THRESHOLD/SERVER_ECHO todavía no está implementada. Se conserva el tráfico para contrastar esa evidencia posteriormente.

Los contratos exportados contienen payloads permitidos sin tokens de sesión ni credenciales. Los HAR completos siguen siendo archivos privados locales y pueden contener datos sensibles; no se versionan. El contrato se guarda en `.hardfire/fuzzer` bajo el perfil que ejecuta Electron. Los trabajos consultables en memoria se pierden al reiniciar el proceso; el archivo conserva la evidencia.

Si falta una respuesta, cambia un control, aparece una elección no reconocida o se alcanza un límite, la rama queda pendiente. No se improvisan clics centrales ni se reenvía una compra después de un timeout.

## Instalación y comprobación

Node.js 22 o posterior. `node --test test/*.test.js` ejecuta las pruebas sin instalar un navegador adicional. `scripts/install-hardfire.ps1` instala una copia del módulo y añade sus herramientas al MCP HardFire existente, con verificación de hash y respaldo del registro. Ejecutar bajo la cuenta de Windows con acceso a HardFire. Luego guardar cualquier HAR pendiente y reiniciar HardFire para que cargue el módulo.

`npm run pragmatic -- TAB_ID URL_PUBLICA execute` inicia un trabajo desde la consola. Usa el SDK MCP ya instalado en HardFire; `HARDFIRE_HOME` permite elegir su directorio y `MCP_URL` el endpoint local.

El catálogo comprobado es el MCP local de HardFire. No se publican estas funciones mediante Firetrace ni se despliega un servicio Cloudflare nuevo.

## Descubrimiento dinámico y familias

No se presupone que un juego tenga dos compras. `purInit` anuncia la lista actual del servidor, y el recorrido registra las opciones de los estados/menús observados. El grafo conserva cada opción con su padre, clase de control, costo disponible y estado UNTESTED/PENDING/EXPANDED/COMPLETE. Incluye opciones no ejecutadas. Los menús de compras activos que aparecen después de empezar también se inspeccionan; no se consideran un regreso terminal a base si aún tienen opciones.

No hay un número fijo de ramas por defecto. `max_branches` es un presupuesto opcional, independiente de la cantidad descubierta. Permanecen límites de tiempo, profundidad y pasos; si se alcanzan, las rutas conocidas quedan pendientes y `coverage.graphComplete` es false. Una cola vacía no prueba por sí misma que nunca aparecerán opciones nuevas.

`familyHints` describe patrones observados como entry→buy o buy→pick, además de transiciones del protocolo. `relateFamilies` compara esos patrones entre contratos. Son relaciones candidatas para reutilizar conocimiento de interacción; no copian cantidad, compras ni payloads de un juego a otro. Cada juego tiene que confirmar su inventario propio. Las familias con grafos parciales no equivalen a descubrimiento completo.

Los nodos incluyen una referencia a la serie económica medida de esa opción, cuando existe; no se completa la economía de un hermano por semejanza. Seleccionar una compra anidada tampoco demuestra envío: si falta una confirmación o el spin requerido no está demostrado, permanece pendiente.

`pragmatic_fuzz_result` pagina las ramas con offset/limit y el grafo con graph_offset/graph_limit; graph.next_offset indica otra página. El contrato completo se guarda localmente. Sigue pendiente validar en vivo todas las variantes de menús anidados y corregir la continuación del bonus que falló en la muestra de cinco juegos.

## Procedencia

El runtime de Pragmatic y su helper proceden de [Parser](https://github.com/Shisetsu-Code/Parser), referencia consultada `56817ddd45a864ad91087fa576319b9aad0e6436`. Fuzzer conserva el árbol y las invocaciones del cliente; añade recorrido por ramas, sesiones independientes, comparación de apuestas, captura y herramientas MCP propias.
