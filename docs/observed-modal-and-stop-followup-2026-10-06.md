# Corrección posterior a la primera tanda de menús/apuestas

Este registro separa la implementación posterior del resultado de `4b5eea1d`. Leer `HANDOFF.md` para el estado final.

La tanda `37523912578` acreditó en Dragon cambios de apuesta 2 -> 3 y 2 -> 1.8. El precio de compra pasó de 100 a 150/90, y el HAR conservó `pur=0,c=0.1/0.15/0.09` con respuestas HTTP 200 y débitos de 100/150/90. Son importes de una misma modalidad, no tres modalidades distintas. Las continuaciones no terminaron.

Hundreds produjo un falso agotamiento práctico: solo cinco rutas observadas, sin compra, aunque el scanner había encontrado aceptar/cancelar en el inventario independiente. Su nodo de menú capturó **solo el fondo y los +/- de base**, durante la apertura. Inca también alternó una variante con fondos y otra con aceptar/cancelar, generando fallos de reconstrucción. Esto refuta la hipótesis de que bastaba con cualquier control dentro del menú para considerarlo listo.

La corrección diferencia `open` de `ready`. Un fondo Blocker/BlockerExtra o controles de importe no acreditan por sí solos una confirmación lista. Se espera un control funcional proyectado y habilitado dentro de la ventana. Mientras el modal esté abierto se conservan sus controles y `Buy_BetButtons`; el fondo de la interfaz queda registrado con `modal_background`. No se reintroducen universalmente sonido/ayuda/autoplay ni los +/- genéricos detrás del modal. La prevención de un giro normal se aplica incluso durante la apertura.

En Dragon la captura mostró Stop señalado, con el servidor esperando `na=b`. La recuperación anterior informó `result-counting-stop` al disparar un evento XT, pero no cambió la pantalla ni produjo `doBonus`. El clic central tampoco resolvió el caso. Se añade un **clic físico al Stop realmente observado**, después de una respuesta completa, conservándolo fuera del árbol de opciones. Esto prueba la ruta de input completa del control; que el evento XT omita comportamiento adicional es una hipótesis a verificar, no una causa ya acreditada en el juego.

El clic exige un único Stop habilitado, geometría finita no ambigua, ausencia de modal/decisiones, marcador de protocolo vigente y ningún cuerpo pendiente o captura incierta. El presupuesto de la operación se propaga hasta antes del input. Si el clic falla o su transporte es incierto se registra como intentado y no se prueba otro input con la misma observación. Durante StageSpin solo esta recuperación anunciada por Stop puede adelantarse; no se emite otra apuesta.

Regresiones locales: fondo no listo, controles de fondo excluidos, Stop físico, deshabilitado, geometría inválida, captura pendiente, protocolo cambiado, área ambigua, plazo expirado, clic incierto y recuperación Stop durante StageSpin. Suite **404/404** local, Node22.16.0, cero omisiones, 27.84s. Falta atribuir los resultados reales posteriores a su propio SHA.

`.github/workflows/control-followup.yml` ejecuta únicamente Dragon/Hundreds, hasta seis acciones y 180 segundos por juego, con el marcador `[control-followup]`. Es una regresión dirigida, **no cobertura completa**, y no reduce los límites de la tanda general de cinco juegos. Comparte la misma cola y el límite de dos trabajos, guarda HAR y cierra las sesiones por el runner ordinario. Los artefactos se conservan un día; preservar resultados saneados en el informe final.
