# Pragmatic Fuzzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution; use superpowers:subagent-driven-development only if the human selects delegation. Steps use checkbox syntax for tracking.

**Goal:** Ejecutar el arbol de Pragmatic en demos con compras anidadas, comparacion de apuestas y contratos verificables por juego.

**Architecture:** El script Pragmatic posee todas las decisiones de interfaz y protocolo. Un transporte limitado conecta Fuzzer con HardFire/Electron; almacenamiento y limites se comparten, pero no las reglas de proveedores. Se reutiliza codigo revisado de Parser fijado al commit 56817ddd45a864ad91087fa576319b9aad0e6436.

**Tech Stack:** Node.js 22+, JavaScript, pruebas node:test, Electron/CDP existente y transporte MCP existente. Sin servicios nuevos.

**Spec:** ../specs/2026-10-04-fuzzer-provider-scripts-design.md

## Global Constraints
- Scripts independientes por proveedor; primera entrega operativa solo Pragmatic.
- Los proyectos anteriores permanecen sin cambios; la extension puntual de HardFire se entrega como parche separado.
- Solo opciones DEMO descubiertas; no inventar selectores ni ejecutar en sesiones con dinero real.
- HAR privado local; contratos exportados sin credenciales ni tokens.
- Cada rama nueva parte de una sesion DEMO nueva y reproduce su prefijo.
- Cambios para juegos antiguos se expresan en excepciones del proveedor, no heuristicas universales.

## Review Focus
- doInit incompleto: compra desconocida, nunca ausencia confirmada.
- Referencias de controles caducadas tras cambiar de pantalla: redescubrir y no pulsar otro control por parecido.
- Transiciones demoradas: esperar respuesta/estado antes de la siguiente eleccion.
- Cambios de apuesta no disponibles: registrar bloqueo y no inferir relaciones de precios.
- Bonus abierto al acabar los limites: rama pendiente, no compra completada.

### Task 1: Pragmatic y evidencia saneada
**Files:** providers/pragmatic/runtime.js, providers/pragmatic/flow.js, providers/pragmatic/exceptions.js, lib/evidence.js, test/pragmatic.test.js, package.json.
**Interfaces:** runtime observa y ejecuta acciones concretas; flow.runPragmatic(session, options) devuelve {tree, contract, status}. session ofrece observe(), perform(action), waitForTransition(before), forkDemo(), capture(). La interfaz representa transporte; las acciones y elecciones las define Pragmatic.
- [ ] Escribir fixtures/tests que fallen para intro reconocida, compras anidadas, dos elecciones sucesivas y placeholders sin compra.
- [ ] Revisar/copiar las funciones necesarias de Parser con atribucion y referencia exacta; limitar dependencias.
- [ ] Implementar autoridad de purInit para Buy Feature, inventario separado de antebet/modificadores, identidad estable de controles y excepciones por juego.
- [ ] Implementar comparacion antes/despues de una variacion de apuesta, restauracion registrada y relaciones de precio solo demostradas.
- [ ] Implementar recorrido por rama con limite de pasos/tiempo/profundidad, espera de transicion y nueva sesion/replay para hermanos.
- [ ] Probar doInit incompleto, control caducado, transicion lenta, apuesta bloqueada y bonus sin terminar; comprobar saneamiento de tokens.
- [ ] Ejecutar node:test y confirmar todas las expectativas antes de commit.

### Task 2: Transporte HardFire y llamada MCP
**Files:** integrations/hardfire/session.js, integrations/hardfire/mcp-tools.js, integrations/hardfire/install-patch.js, scripts/pragmatic.js, test/hardfire.test.js.
**Interfaces:** createHardFireSession({tabId, client}) implementa session de Task 1. Tool pragmatic_discover observa precios/funciones; pragmatic_run recibe tabId y limites de ejecucion. No recibe JavaScript arbitrario. Resultados etiquetados con pestana, juego y rama.
- [ ] Escribir tests que fallen para pestana equivocada, iframe elegido, navegador cerrado y captura manual en curso.
- [ ] Implementar evaluacion de funciones fijas de Pragmatic en el runtime del iframe mediante Electron/CDP, sin modificar el perfil ajeno.
- [ ] Asociar request/response al paso y conservar HAR local; no duplicar orden si hay timeout de transporte.
- [ ] Preparar parche de registro MCP para HardFire y catalogo remoto existente, con respaldo y comprobacion de hashes. Solicitar acceso real solo a archivos afectados si queda fuera del workspace.
- [ ] Implementar salida de contratos y artefactos por el canal Cloudflare ya disponible, con limites y saneamiento; no subir HAR completo por defecto.
- [ ] Probar error de transporte despues de una accion: consultar resultado previo, nunca reenviar compra automaticamente.
- [ ] Ejecutar tests y comprobacion de sintaxis; commit de archivos concretos.

### Task 3: Validacion real y entrega
**Files:** test/fixtures/pragmatic/, docs/PRAGMATIC.md, README.md, .gitignore, scripts/verify-pragmatic.js.
**Interfaces:** verificador ejecuta una demo simple y otra con elecciones posteriores; emite resumen y rutas de evidencia. Salidas generadas y HAR no se versionan.
- [ ] Seleccionar desde evidencia de Parser un caso de compra simple y uno con eleccion posterior; registrar juegos y configuracion de demo.
- [ ] Ejecutar dos apuestas y comprobar precios observados, payloads reales, arbol con parentesco y regreso a base.
- [ ] Corregir exclusivamente reglas Pragmatic si un caso falla; repetir los tests afectados.
- [ ] Documentar funciones operativas, limites, excepciones y proveedores aun no implementados.
- [ ] Verificar desde MCP la llamada real sobre tabId y lectura del resultado por el chat.
- [ ] Revisar diff y ausencia de tokens/HAR; publicar en Fuzzer mediante GitHub autenticado. Si falla autenticacion conservar commits locales y reportar la limitacion.

## Ejecucion propuesta
Implementacion directa en este chat, sin abrir otros workers: mantiene el flujo simple y facilita revisar juntos la primera demo. No empezar otros proveedores hasta verificar Pragmatic. Esta propuesta requiere confirmacion del plan antes de implementar.
