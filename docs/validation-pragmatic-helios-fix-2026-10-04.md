# Cinco demos después de la corrección de fs_total

Ronda del 4 de octubre de 2026, 21:05–21:16 hora de Buenos Aires. Selección aleatoria sin reemplazo entre siete demos conocidas de la primera página del catálogo oficial: Forever Split Megaways, Big Bass Vegas 1000, Freya 1000, Coven Rising, Gates of Olympus 2500, Triple Hop Pots y Helios Triple Sun. Esta muestra no representa todo el catálogo.

Se utilizó el MCP local con la corrección de `fs_total` instalada, ejecución habilitada, máximo de 200 pasos y presupuesto de recorrido de 360 segundos por juego, sin límite fijo de ramas. No se aplicaron excepciones por juego. Preparación y guardado pueden superar el presupuesto del recorrido.

| Juego | Estado | Resultado observado |
| --- | --- | --- |
| Triple Hop Pots | ERROR | No confirmó las dos tiradas ordinarias iniciales; no se recorrieron compras |
| Big Bass Vegas 1000 | COMPLETE | Compras 100× y 450×, y Ante 1,5× completos |
| Coven Rising | PARTIAL | Compra 100× completa; compra 200× falló al preparar la demo; Ante 3× pendiente por tiempo |
| Gates of Olympus 2500 | ERROR | La entrada DEMO no expuso un runtime compatible; sin ejecución de compras |
| Freya 1000 | ERROR | La entrada DEMO no expuso un runtime compatible; sin ejecución de compras |

Big Bass verificó ambas compras hasta cierre y dos giros ordinarios posteriores, en 54 y 48 pasos respectivamente. Coven cerró la compra de 100× en 62 pasos. Ambos observaron y restauraron la serie económica `2 → 3 → 4 → 3 → 2`.

El error exacto de preparación fue `DEMO entry did not expose a supported runtime`. Esta ronda no determina si se debe a carga, sesión o una incompatibilidad del juego; no equivale a ausencia de compras. Triple Hop Pots devolvió `Two ordinary rounds not confirmed`.

Los HAR disponibles y los resultados completos se guardaron localmente en la carpeta de la ronda `outputs/pragmatic-five-helios-fix`. Big Bass y Coven guardaron sus HAR de ramas y raíz. Los fallos de preparación no devolvieron HAR utilizable en el resultado MCP. No se publican los HAR completos.

Al terminar, hardfire_tabs confirmó únicamente las dos pestañas internas y la pestaña original about:blank, sin pestañas de prueba abiertas. Resultado global: un juego COMPLETE, uno PARTIAL y tres ERROR. Las mejoras confirman cierres reales en los juegos ejecutados, pero todavía hay fallos de preparación y de verificación inicial que requieren diagnóstico.
