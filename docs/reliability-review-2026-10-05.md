# Fuzzer: revisión técnica y mejoras de fiabilidad

Base revisada: `0aed1ce909842ef71cedb3e67d76c6eead88f950`. Fecha: 5 de octubre de 2026. Objetivo: analizar el funcionamiento real y continuar el desarrollo sobre su arquitectura existente.

## Qué aporta esta arquitectura

Fuzzer descubre controles del runtime de Pragmatic, los relaciona con dibujos visibles y reconstruye rutas de menú en sesiones DEMO aisladas. Relaciona las acciones con tráfico HTTP capturado y mantiene los resultados aleatorios del bonus fuera del grafo de navegación. Eso permite reutilizar interacción por proveedor sin fijar un inventario de compras o coordenadas por juego.

La lectura de runtime, el filtro de controles comunes y el protocolo siguen siendo específicos de Pragmatic. El proyecto no contiene todavía implementaciones de otros proveedores. Tampoco descubre automáticamente todo estado oculto ni demuestra oclusión solo con los rectángulos de los controles.

| Componente | Función |
|---|---|
| [`drawn-buttons.js`](../providers/pragmatic/drawn-buttons.js) | Relaciona componentes activos, dibujos y geometría. |
| [`known-controls.js`](../providers/pragmatic/known-controls.js) | Filtra controles comunes y conserva incertidumbre sobre áreas ejecutables. |
| [`state-explorer.js`](../providers/pragmatic/state-explorer.js) | Recorre rutas observadas y conserva acciones pendientes. |
| [`operation-completion.js`](../providers/pragmatic/operation-completion.js) | Identifica el envío, sigue continuaciones y verifica el cierre de operaciones. |
| [`integrations/hardfire`](../integrations/hardfire) | Gestiona sesiones Electron, capturas, HAR, trabajos MCP y limpieza. |
| [`flow.js`](../providers/pragmatic/flow.js) | Conserva el flujo económico anterior con comparación de apuestas y ramas. |

## Evidencia que ya existía

La [repetición de Death Dominion](validation-death-dominion-2026-10-05.md) documenta cuatro compras y cuatro modificadores verificados: 46 acciones, ocho estados y 24,9 minutos. El resultado global fue `PARTIAL` por ocho acciones de navegación sin transición. Las cuatro operaciones de compra sumaron aproximadamente 163 segundos; la duración restante también incluye modificadores, preparación, recargas, capturas y observaciones. No es una medición que permita prometer un factor de aceleración.

La [muestra de cinco juegos](validation-pragmatic-new5-2026-10-05.md) deja fallos reales en Harvest Moon, Sunnydaze Asylum y Sleeping Dragon. Su existencia impide extrapolar el éxito de Death Dominion al catálogo. Esta revisión no ejecutó nuevas demos ni modificó los contratos históricos.

## Cambios implementados

### 1. Identidad del envío original

Si entre dos observaciones llegaban la petición de compra y un giro automático, el parser seleccionaba el último giro. La compra podía perder su `pur`, clasificarse como giro ordinario y omitir la tirada normal posterior.

Ahora el contador anterior a la acción identifica el primer envío nuevo. Su tipo y payload quedan fijos; la respuesta original puede terminar de llegar. La respuesta más reciente sigue describiendo el avance del juego. Una petición inicial fallida o incompleta no queda validada por el éxito de otra posterior. Las alternativas observadas dentro de una compra conservan su identidad de compra para el replay.

### 2. Cobertura pendiente explícita

Los controles visibles sin área de clic se descartaban del conjunto ejecutable sin entrar en los pendientes. Ahora conservan path, motivo y captura como `UNRESOLVED_HIT_AREA`. Se mantienen fuera de los clics y de la autorización de un giro de comprobación.

Un `ACTIVE_TIMEOUT` podía producir una clave nueva y terminar como recorrido observado agotado. Ahora conserva la acción pendiente y no establece una ruta verificada. El mismo criterio impide ejecutar un hijo después de un replay que agotó su espera.

### 3. Propiedad y recuperación de pestañas

Un fallo de guardado podía dejar una pestaña abierta mientras el recorrido creaba nuevas sesiones o el MCP liberaba su cupo. Ahora el cierre fallido detiene el recorrido, conserva las rutas sin ejecutar y retiene el cupo hasta confirmar el cierre de las pestañas propias.

`pragmatic_fuzzer_cleanup({"job_id":"ID_DEL_TRABAJO"})` reintenta solo los cierres retenidos de un trabajo terminado. Guarda la evidencia antes de cerrar; no crea sesiones, no vuelve a comprar y no reinicia el navegador. Las llamadas concurrentes comparten el intento de cierre. `cleanupHars` registra los HAR recuperados; un error histórico no implica que siga pendiente el cierre cuando `cleanupPending` es false.

La captura se conserva si falla la escritura. También se mantiene una obligación independiente de guardado si `recorder.stop()` desactiva la grabación y luego falla: un segundo intento no puede cerrar sin guardar. Sin identidad o cierre registrado se conserva el bloqueo y se informa que la recuperación automática no está disponible.

### 4. Verificación automatizada

La base pasó 185 pruebas. Después de los cambios, `npm test` pasó **216 pruebas, cero fallos, cero omitidas**, en Node 24.19.0 sobre Linux; duración aproximada: 24,3 segundos. Se añadieron 31 regresiones, incluyendo seis escenarios del wrapper real con las fronteras de Electron sustituidas en procesos de prueba aislados.

Las regresiones demostraron los fallos antes de corregirlos. Una revisión independiente detectó el caso de `stop()` fallido; se corrigió y se repitió su reproducción. `git diff --check` también pasó. El workflow `Tests` prepara la misma suite para Linux y Windows, con Node 22 y 24; su estado remoto debe consultarse en GitHub Actions y no se deduce de la ejecución local.

## Próximos avances recomendados

1. **Repetir las continuaciones pendientes en el runtime real.** Sleeping Dragon mostraba una pantalla de continuación cuando el detector intentaba el spin normal; Harvest Moon tenía discrepancias entre pantalla base y cierre. Las pruebas actuales no certifican su resolución.
2. **Priorizar ramas económicas y reducir observaciones redundantes.** Medir por fase el tiempo de preparación, replay, capturas, navegación y operación antes de ajustar esperas.
3. **Reanudar grafos compatibles entre trabajos.** Validar identidad del juego, versión y controles actuales antes de reutilizar rutas; nunca importar credenciales o resultados aleatorios como rutas fijas.
4. **Extender por proveedor cuando el contrato esté estabilizado.** Compartir transporte y evidencia, manteniendo discovery y continuaciones propios.

Quedan además dos hallazgos del flujo anterior para una revisión acotada posterior: validación de userinfo/parámetros en URLs de catálogo y captura estructurada del tráfico cuando una transición agota su espera. No se modificaron en esta tanda. La recuperación de un recorder real, la geometría y la oclusión requieren comprobación en Electron; los tests no sustituyen esa validación.
