# Validación Fuzzer HAR MCP — 2026-10-08

Suite completa: **211 pruebas aprobadas, cero fallos**, incluyendo el explorador previo. Node.js 26.8.1 en Windows; objetivo Node.js >=22. Las pruebas reconstruyen el bundle antes de ejecutarse.

Cliente oficial MCP contra servidor fuente y contra bundle autónomo: negociación, catálogo de seis herramientas, consultas, análisis, comparación, cierre y errores aprobados. La copia autónoma no necesita HardFire ni dependencias junto a ella.

## HAR real local

Captura de 3 Oaks autorizada: 39.365.022 bytes, 184 entradas. Las 31 entradas del endpoint DEMO se contrastaron con los índices originales. Lectura de respuesta, resumen y comparación idéntica aprobaron. Hash antes/después idéntico: original sin modificaciones.

| Operación por MCP | Tiempo de una ejecución |
|---|---:|
| Negociación/arranque | 142 ms |
| Abrir HAR | 74 ms |
| Consultar entradas | 18 ms |
| Leer un intercambio | 3 ms |
| Resumen de evidencia | 10 ms |
| Comparación con la misma captura | 88 ms |
| Cerrar | 1 ms |

No se midió el recorrido equivalente por UI. Los tiempos dependen del archivo y la PC. Para 3 Oaks, compras permanecen UNKNOWN: confirma inspección rápida, no detección automática especializada.

## Revisión y regresiones

Revisión independiente identificó cuatro defectos: sesiones en query mezcladas, init HTTP 200 con error declarando ausencia, acciones/selecciones en query omitidas y etiquetas opacas ocultas por sanitización. Pruebas nuevas reprodujeron los cuatro problemas; las correcciones pasaron y se ejecutó de nuevo la suite completa.

También se verificaron compra anunciada/intento/aceptación, inventario desconocido/cambiante, giros normales y modificados separados de compras, cascadas/cobros, ocultación de secretos, cuerpos faltantes/binarios, referencias corruptas/cíclicas, límites con escapes JSON y concordancia de manifiestos.

## Integración local

Registrado `fuzzer-har` con rutas absolutas de Node y bundle. `codex mcp get fuzzer-har --json` confirmó enabled=true y ruta correcta. Repetir el instalador confirmó idempotencia.

Protocolo verificado mediante cliente real independiente. El catálogo de la conversación ya abierta no se recarga automáticamente; requiere recargar conexión o abrir una conversación con la configuración nueva. No se afirma una llamada mediante el catálogo del host actual.

HAR y resultados privados fuera del control de versiones. Se distribuyen código, bundle, licencias y documentación. Cambios en `feat/offline-har-mcp`; no se integra main automáticamente.
