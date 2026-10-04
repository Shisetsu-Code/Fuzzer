# Validación real: cinco demos de Pragmatic — 2026-10-04

Se seleccionaron cinco juegos sin reemplazo, mediante azar criptográfico, entre siete demos del catálogo oficial previamente visibles. Es una muestra pequeña del catálogo reciente, no representa todos los juegos históricos. Se usaron pestañas nuevas aisladas a 4×, sin ajustar código por juego ni limitar el número de compras. Presupuesto por recorrido: 360 segundos, 100 pasos por rama; los HAR se guardaron localmente antes de cerrar cada pestaña propia.

## Muestra original

| Juego | Compras: factor respecto a apuesta base | Niveles Ante Bet descubiertos | Contrato original |
|---|---|---|---|
| Freya 1000 | 50×, 75×, 200× | No identificado | PARTIAL |
| Coven Rising | 100×, 200× | 3× | PARTIAL |
| Big Bass Vegas 1000 | 100×, 450× | 1.5× | PARTIAL |
| Helios Triple Sun | 80×, 200× | 1.5× | PARTIAL |
| Forever Split Megaways | 100×, 500× | 1.5×, 3× | PARTIAL |

Las cinco apuestas regresaron a su valor inicial. Cuatro probes originales completaron las tiradas; Helios quedó pendiente y después pasó en un reintento de descubrimiento. Se midieron once opciones de compra en total. Se enviaron nueve órdenes de compra con respuesta HTTP 200, pero ninguna compra de la muestra original confirmó todo el cierre. Cuatro ramas Ante Bet sí completaron su comprobación: Coven 3×; Big Bass 1,5×; Forever Split 1,5× y 3×. El Ante Bet de Helios sólo se descubrió en el reintento; no fue ejecutado.

## Errores encontrados y correcciones

- La respuesta de compra puede llegar mientras StageSpin sigue animando. La etapa activa tiene prioridad antes de seleccionar botones, confirmar o cerrar.
- StageResultFreeSpin programa sus propios giros. El evento del botón normal no tiene su handler de spin y enviar peticiones directas evita el ciclo del cliente. Se espera su avance y se confirma fsStartConfirmed cuando corresponde.
- Después del doCollect, el objeto de free spins puede quedar vacío mientras Logic_IsFreeSpin y StageResultFreeSpin siguen activos. IsFreeSpinsCollected no representa la respuesta de doCollect. El cierre valida el request/response de cobro, estado final o reset explícito del runtime, y handler de resultado habilitado. Después exige volver a base y dos tiradas normales.
- HasAnteBet no describe cuántos niveles hay. Se enumeran todos los índices habilitados de BetLevelV2.betLevelSettings.betLevelScale. Cada nivel exige dos solicitudes nuevas con bl correcto, sin pur ni datos de free spins. Una tirada normal ganadora puede terminar con doCollect.
- Helios perdió su inventario al quedar dentro de un bonus durante el probe y fue etiquetado incorrectamente ABSENT. Ahora un probe pendiente conserva el descubrimiento inicial y no ejecuta compras nuevas.

## Reintentos con la corrección final

Big Bass Vegas 1000, compra 0 (100×): COMPLETE, 39 acciones del recorrido, cierre del resultado y dos tiradas normales verificadas. El contrato global sigue PARTIAL porque el reintento se limitó expresamente a esa rama; no certifica la compra 1 ni todo el grafo. Duración: 54 segundos.

Helios Triple Sun, sólo descubrimiento: DISCOVERED, probe OBSERVED y apuesta restaurada. Conserva dos compras 80×/200× y un Ante Bet 1,5×; buyFeaturePresence=PRESENT. Duración: 22 segundos. No se ejecutaron compras ni ese Ante Bet.

## Pendientes

Freya conserva la transición bonus-init sin control identificado. Forever Split conserva un bloqueo en la animación inicial del bonus. Coven y las compras no revalidadas de otros juegos permanecen pendientes en sus contratos históricos; compartir la misma etapa no equivale a una nueva comprobación real. No hubo un juego completo certificado por la muestra original.

La suite final pasa 45 pruebas. El informe JSON adjunto conserva órdenes sanitizadas, resultados y cobertura. Los HAR completos, tokens y snapshots crudos no se publican.
