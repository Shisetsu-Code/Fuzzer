# Fuzzer HAR MCP

Servidor local independiente de HardFire para analizar capturas existentes. Solo lee el archivo seleccionado: no usa navegador, screenshots, HTTP, sesiones de juego nuevas ni replay.

## Instalación en Codex

Requisito: Node.js 22 o posterior. La distribución contiene `dist/har-mcp.cjs`, un bundle autónomo con dependencias incluidas.

Desde la carpeta del repo, ejecutar en PowerShell:

```powershell
./scripts/install-har-mcp.ps1
```

El script registra `fuzzer-har` con las rutas absolutas de Node y del bundle. Es idempotente para esa configuración y se niega a reemplazar un servidor homónimo diferente. No borra otros servidores. Si la política de PowerShell impide ejecutar scripts locales, se puede registrar directamente:

```powershell
codex mcp add fuzzer-har -- node "C:/ruta/Fuzzer/dist/har-mcp.cjs"
codex mcp get fuzzer-har --json
```

Un registro correcto confirma configuración; la prueba MCP de este repo confirma negociación y herramientas. Una conversación que ya estaba abierta puede necesitar recargar la conexión o abrirse de nuevo para recibir el catálogo actualizado. No es necesario reiniciar HardFire. Mantener el bundle en la ruta registrada; volver a registrar si se mueve.

Alternativa de plugin portable: `plugin.json`, `mcp.json` y `.codex-plugin/plugin.json` apuntan al mismo bundle. No instalar simultáneamente el plugin y el registro directo si no se desea duplicar las herramientas. La entrega inicial usa el registro directo comprobable con la CLI. Los paquetes locales no se publican en el directorio de plugins.

Para reconstruir desde código fuente:

```powershell
npm ci
npm run har:build
npm test
```

La instalación/reconstrucción descarga dependencias. El servidor ya construido trabaja offline. Versiones fijadas: SDK MCP 1.32.1, Zod 4.6.5, esbuild 0.28.2. El explorador existente conserva sus comandos e integración HardFire.

## Uso desde el chat

Se puede pedir: «Analiza el HAR C:/ruta/juego.har con Fuzzer HAR y muestra la evidencia de compras y antebet». Las herramientas reciben:

| Herramienta | Argumentos principales | Resultado |
|---|---|---|
| `har_open` | `path` | `har_id`, cantidad de entradas, dominios, tipos y advertencias |
| `har_entries` | `har_id`, `filters`, `offset`, `limit` | Lista compacta con índices originales y total |
| `har_exchange` | `har_id`, `entry_index`, `section`, `offset`, `limit` | Petición/respuesta sanitizada, campos y fragmento de cuerpo |
| `har_features` | `har_id`, `offset`, `limit` | Compras y modificadores separados, con evidencia |
| `har_compare` | `left_har_id`, `right_har_id` | Acciones y campos diferentes con ejemplos |
| `har_close` | `har_id` | Libera memoria sin cambiar el archivo |

Ejemplo: abrir una captura, localizar tráfico del endpoint y leer una respuesta:

```json
{"path":"C:/Users/usuario/Desktop/juego.har"}
```

Con el identificador devuelto:

```json
{"har_id":"IDENTIFICADOR_DEVUELTO","filters":{"domain":"betman-demo.head.3oaks.com","action":"play"},"limit":20}
```

Con un `entry_index` de esa consulta:

```json
{"har_id":"IDENTIFICADOR_DEVUELTO","entry_index":42,"section":"response","offset":0,"limit":4096}
```

`section`: `request`, `response` o `both`. `offset` de listas cuenta entradas; en cuerpos cuenta bytes UTF-8 del texto sanitizado. Los fragmentos no son una copia byte a byte del cuerpo original. `filters` acepta `domain` exacto, `path` contenido, `method` exacto, `status`, `action`/`command` y `text` dentro de intercambios decodificados y sanitizados.

## Evidencia y alcance

Para Pragmatic, `purInit` explícito describe inventarios; `pur` muestra intentos de selección. Inventario vacío explícito es `ABSENT_EXPLICIT`; inventario ausente o ilegible es `UNKNOWN`. Una petición fallida no demuestra una compra disponible. La aceptación requiere respuesta satisfactoria del protocolo más una opción anunciada o transición de feature; no certifica finalización del bonus. Inventarios cambiantes se conservan como observaciones y no producen un número definitivo.

Los niveles `bl` y escalas `bls` se guardan como modificadores, separados de compras. Giros ordinarios, giros con modificador, cascadas y cobros tienen categorías distintas. Las categorías describen señales observadas, no reconstruyen todo el estado del cliente. Los niveles pertenecen al mecanismo BetLevel de Pragmatic; no certifican todos los controles opcionales del juego.

Para 3 Oaks, Red Tiger, Belatra y otros proveedores, las consultas interpretan JSON, formularios, base64 y query strings, pero `har_features` conserva `UNKNOWN`: no hay certificación automática de compras por nombre de campo. Permite investigar directamente payloads, inicialización y diferencias para desarrollar primitivas respaldadas por evidencia. Assets sin campos de petición no generan grupos de funciones; siguen disponibles en consultas de entradas y cuerpos.

Cada evidencia cita el índice original. Sesiones con identificadores capturados se separan usando etiquetas opacas; sus credenciales no salen del proceso. Sin identificador, aparece `SESSION_ID_NOT_CAPTURED`: no se puede demostrar separación completa. Capturas incompletas y cuerpos ausentes permanecen explícitos. Un HAR parcial no demuestra ausencia de funciones ni cobertura de todas las opciones visibles.

## Límites y datos

Hasta ocho archivos abiertos y 256 MiB por archivo. Listas: 50 entradas por defecto, máximo 200. Cuerpos: fragmentos de hasta 16 KiB. Funciones: hasta 100 grupos, 200 elementos por lista de evidencia; consultas de grupos por páginas de 20. Comparaciones: hasta 2.000 campos, 100 valores por campo y 200 diferencias. Respuestas MCP limitadas a 64 KiB por objeto, con `output_truncated` explícito; usar filtros/fragmentos para inspeccionar más datos. Estos límites son presupuestos de recursos y no reglas de detección.

Se ocultan credenciales reconocibles en cabeceras, URL, formularios, JSON, XML y texto. La ocultación es por estructura/nombres conocidos: no garantiza reconocer un secreto alojado en un campo arbitrario o texto sin etiqueta. No compartir resultados sin revisarlos si la captura contiene datos privados. No se ejecuta código ni instrucciones contenidos en HAR. Los archivos completos y resultados privados no se versionan.

Los identificadores viven en memoria y dejan de existir al cerrar o reiniciar el servidor. `HAR_READ_FAILED`, `INVALID_HAR`, `HAR_TOO_LARGE`, `HAR_CAPACITY`, `UNKNOWN_HAR` e `INVALID_ENTRY` se devuelven como errores sin volcar cuerpos ni credenciales. Las referencias `_bodyReference` de la consolidación HardFire se resuelven validando índices y hash; ciclos/corrupción dejan advertencias.

## Comprobación

`npm test` reconstruye el bundle y prueba tanto el servidor fuente como una copia autónoma en una carpeta temporal. Usa cliente MCP oficial: negociación, catálogo de seis herramientas, lectura, paginación, análisis, comparación, cierre y errores. Incluye pruebas contra falsos positivos, inventario desconocido, respuestas fallidas, secretos, referencias de cuerpos y límites.

Medición local inicial sobre HAR de 3 Oaks: 184 entradas, 39.365.022 bytes; carga 75 ms, consulta de lista 13 ms y resumen 8 ms. Es una medición del núcleo en esta PC, no una comparación contra control de navegador ni una promesa para todo HAR. Las llamadas reales MCP y la suite completa están documentadas en [validación final](har-mcp-validation.md).

Referencias de implementación: [SDK MCP oficial](https://ts.sdk.modelcontextprotocol.io/server), [configuración MCP de Codex](https://developers.openai.com/codex/mcp), [formato de plugins](https://developers.openai.com/plugins/build/plugins).
