# Helios Triple Sun: evidencia manual y comprobación automática

Juego `vs20olympuspot`. El HAR manual del 4 de octubre contiene 38 intercambios de gameService. El HAR completo permanece privado; el contrato y la fixture publicados conservan únicamente campos permitidos, sin credenciales ni balances.

La apuesta base es `c * 20`. `purInit` anuncia dos compras: índice 0 a 80× y índice 1 a 200× la apuesta base. El HAR manual ejecuta únicamente `pur=1`; anunciar una opción no demuestra su ejecución.

Ante Bet nivel 1 cuesta 1,5×. Su request conserva `l=20` y cambia `bl=1`; la respuesta devuelve `l=30`. No se debe copiar el número efectivo de líneas de la respuesta al request.

La compra manual de 200× comenzó con ocho free spins, alcanzó catorce por retriggers y generó veinte requests de continuación sin `pur`. Terminó con `fs_total=14,na=c`, seguido de `doCollect` y giros ordinarios. Contar requests no equivale a contar acciones manuales. Las elecciones locales de UI permanecen UNKNOWN: este HAR no permite afirmar que no existen.

## Corrección aplicada

La captura sanitizada omitía `fs_total`, presente cuando desaparecen `fs` y `fsmax` al final del bonus. Ahora se conserva. La comprobación de regreso a base exige dos respuestas nuevas de doSpin, sin compra ni campos de free spins; esta condición se aplica también fuera de Ante Bet. Un collect o `na=s` aislado no certifica el regreso.

## Prueba automática posterior

Trabajo local `f8c64a96-e596-436a-9cdb-eb8dcce5b5f4`, ejecución de las tres opciones descubiertas, presupuesto de 200 pasos y 360 segundos. La prueba económica observó `2 → 3 → 4 → 3 → 2` y restauró la apuesta.

| Opción | Resultado | Evidencia |
| --- | --- | --- |
| Compra 80× | PENDING | Compra enviada y bonus cerrado; RETURN_TO_BASE_UNCONFIRMED tras 28 pasos |
| Compra 200× | COMPLETE | Compra, continuación, cierre y dos giros ordinarios confirmados; 51 pasos |
| Ante 1,5× | COMPLETE | Activación y dos giros ordinarios con bl=1 confirmados |

El resultado global es PARTIAL. El HAR de la compra 80× contiene dos requests ordinarios posteriores, pero la comprobación conjunta de runtime y protocolo no confirmó el regreso; su último collect respondió `na=c`. No se convierte esa evidencia parcial en COMPLETE.

El contrato está en [contracts/pragmatic/vs20olympuspot.json](../contracts/pragmatic/vs20olympuspot.json). La fixture sanitizada reproduce los 38 intercambios y la configuración inicial. Las pruebas cubren los multiplicadores, la diferencia entre líneas enviadas y efectivas, el final fs_total y los giros ordinarios reales posteriores. La suite completa contiene 50 pruebas.
