# Fuzzer: análisis local de HAR mediante MCP

## Objetivo

Analizar capturas HAR existentes directamente desde Codex, sin abrir juegos, tomar capturas de pantalla ni controlar HardFire. Reducir el tiempo y el volumen de contexto necesarios para investigar compras, antebets, giros normales y continuaciones. Conservar el explorador actual y reutilizar sus primitivas cuando sean adecuadas para evidencia offline.

## Arquitectura

Agregar un servidor MCP local independiente, con transporte stdio y Node.js 22 o posterior. El servidor no inicia Electron, navegadores ni peticiones HTTP. Su núcleo de análisis será reutilizable desde pruebas y una consola local. El registro MCP será una capa delgada sobre ese núcleo.

Un almacén en memoria cargará cada HAR una vez y devolverá un identificador. Los índices originales de las entradas serán referencias estables para toda la evidencia. Cada captura conservará su identidad: no mezclar sesiones de juegos distintos ni deducir secuencias entre archivos.

## Herramientas

- `har_open(path)`: validar HAR 1.2, cargar e indexar; devolver identificador, cantidad de entradas, dominios, tipos de contenido y advertencias de captura incompleta.
- `har_entries(har_id, filters, offset, limit)`: consultar solicitudes por dominio, ruta, método, estado HTTP, acción y texto; devolver resultados paginados y un total. Las vistas de lista omitirán cuerpos completos.
- `har_exchange(har_id, entry_index, section, offset, limit)`: consultar petición o respuesta sanitizada, campos interpretados y fragmentos de cuerpo con límites explícitos.
- `har_features(har_id)`: devolver evidencia de compras y modificadores, opciones anunciadas, opciones ejecutadas y posibles continuaciones, agrupadas por juego y sesión cuando haya identificadores demostrables.
- `har_compare(left_har_id, right_har_id)`: comparar acciones, campos y valores observados, con ejemplos referenciados; ignorar credenciales y valores temporales. Una diferencia por sí sola no demuestra causalidad ni una compra.
- `har_close(har_id)`: liberar memoria.

Todos los resultados indicarán truncamiento, paginación y referencias a entradas. Los límites estarán validados: 50 entradas por página por defecto, máximo 200; cuerpos de hasta 16 KiB por fragmento. Hasta ocho archivos abiertos, máximo 256 MiB por archivo; rechazar entradas inválidas y límites excedidos con errores legibles. Estas cifras son presupuestos de recursos, no criterios de detección.

## Interpretación de evidencia

Normalizar query strings, formularios y JSON; decodificar cuerpos base64 cuando estén presentes. Resolver referencias `_bodyReference` generadas por la consolidación actual, validando índice y hash, sin seguir referencias cíclicas. Un cuerpo ausente, binario o ilegible permanecerá explícitamente desconocido.

La primera interpretación especializada será Pragmatic: reutilizar o extraer el parser de inicialización, registrar `purInit` como evidencia de inventario y `pur` como selección observada de compra. Separar anuncios de solicitudes y solicitudes de respuestas exitosas. Interpretar niveles `bl` y escalas anunciadas como modificadores separados, nunca como compras. Giros, cobros y cascadas tendrán categorías distintas. Una respuesta de inicialización sin información suficiente no demostrará ausencia; revisar especialmente el comportamiento actual de `parseInit` antes de reutilizarlo.

Para 3 Oaks y demás proveedores, proporcionar inspección estructurada, diferencias y secuencias observadas. Campos con nombres sugerentes serán candidatos para investigar, no funciones confirmadas. No incorporar listas de juegos ni reglas por título. Nuevas primitivas especializadas necesitarán evidencia y pruebas antes de certificar presencia, ausencia o cierre de una función.

Un HAR parcial no demuestra que un juego carezca de compras o antebet. El resultado distinguirá PRESENTE, AUSENTE SEGÚN DECLARACIÓN EXPLÍCITA y DESCONOCIDO, junto con fuente y alcance. El análisis offline no certificará cobertura de todas las opciones visibles ni reconstruirá estados del cliente que no quedaron en la captura.

## Datos y operación

Leer únicamente archivos solicitados explícitamente, sin rastrear el disco. No modificar ni borrar HAR originales. Los tokens, cookies, autorizaciones y otros identificadores sensibles se ocultarán en URL, cabeceras, formularios, JSON y cuerpos de texto; toda herramienta compartirá esa sanitización. No ejecutar JavaScript ni instrucciones presentes en un HAR. Mantener resultados y configuración locales; no subir capturas a GitHub.

Distribuir un manifiesto de plugin local y configuración MCP con la ruta real del servidor. Protocolo por stdout y diagnósticos por stderr. Documentar instalación, arranque, herramientas, ejemplos y limitaciones. La conexión al host se verificará si su mecanismo disponible permite hacerlo; una prueba del servidor sola no se presentará como conexión confirmada en Codex.

## Verificación

Probar el núcleo con fixtures sintéticas y sanitizadas: JSON/formularios/base64, cuerpos ausentes, referencias consolidadas válidas e inválidas, paginación, límites y ocultación de secretos. Verificar que giros normales, antebets y continuaciones no aumentan el número de compras. Probar inventario desconocido, compras anunciadas pero no ejecutadas y solicitudes sin respuesta satisfactoria.

Ejecutar las pruebas existentes de Fuzzer para detectar regresiones. Verificar negociación MCP, listado de herramientas y llamadas reales sobre un HAR local del usuario, sin publicar sus datos. Comparar el resumen con las entradas originales y registrar tiempos de carga y consulta; no prometer una mejora de velocidad sin medición.

## Fuera del alcance inicial

Automatización de nuevos juegos, reproducción de compras, fuzzing HTTP, ejecución de código del proveedor, clasificación universal y cambios en Tester-Spin. El explorador actual de HardFire permanecerá disponible como herramienta complementaria para conseguir evidencia nueva.
