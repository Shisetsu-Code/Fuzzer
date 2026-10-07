# Capturas de bloqueos y galería de última corrida

Base: `10f775ac43dca835c7c96ffa11cffe65c1c9f481`. Esta revisión no modifica
el criterio de cierre del bonus ni aplica el parche de recuperación pendiente
del turno anterior. Añade evidencia visual al comportamiento actual.

## Cuándo se captura

Se toma un JPEG de pantalla completa al devolver una operación fallida, una
transición detenida (`ACTIVE_TIMEOUT`, `QUIET_TIMEOUT`, `DEADLINE`) o un error de
entrada, por ejemplo `AMBIGUOUS_HIT_AREA`. La captura se espera antes de devolver
el fallo al planificador: ocurre antes del siguiente reinicio/cierre, no después.
No es un vídeo ni un muestreo continuo mientras se ejecutan animaciones.

Se conserva motivo, fase, última acción intentada, indicadores, secuencia de
protocolo y tiempos de observación/captura. La captura y la observación no son
atómicas; sus tiempos distintos quedan registrados. Un fallo al capturar produce
`STALL_CAPTURE_FAILED` sin sustituir el error original ni ejecutar otra entrada.

JPEG 65, máximo 512 KiB por imagen. Diario privado `stall-captures.json` con las
32 capturas más recientes por campaña, compartido entre tramos. Las anteriores
se descartan únicamente dentro del directorio propio `stall-screenshots`.
El exportador conserva los límites existentes: hasta ocho imágenes por juego,
priorizando las diagnósticas más recientes. Informa omisiones; no presume que
las imágenes faltantes se hayan capturado o publicado. El diario permite exportar
la evidencia incluso cuando el último resultado perdió su referencia.

## Dónde se ve

La rama generada `fuzzer-latest-run` contiene un README con la galería de una sola
corrida y un marcador `.fuzzer-latest.json` con su run ID, intento y commit fuente.
Se copian solo JPEGs con hash verificado y texto proyectado desde el resumen
saneado. No se publican HAR, credenciales, runtime crudo ni checkpoints privados.

Los workflows live y exit-probe publican al finalizar, también con resultados
parciales. La nueva corrida reemplaza el árbol completo de esa rama mediante
un commit sin padre y un lease sobre el SHA anterior. No se modifica `main`.
Una corrida antigua no puede sobrescribir una posterior. Una rama existente sin
el marcador propio se rechaza. Los objetos Git antiguos pueden permanecer en
el servidor; esto no promete recuperación inmediata de cuota de almacenamiento.

El marcador explícito `[gallery-run:<id>]` permite publicar las capturas de una
corrida anterior ya terminada. Se comprueba su repositorio, rama y workflow.
Esas imágenes se rotulan como capturas de cierre/estado si no contienen eventos
de bloqueo: no se presentan como evidencia producida por el nuevo código.

## Verificación local

Base: 468 pruebas. Revisión: 480/480, cero fallos, cancelaciones u omisiones.
TDD: ocho regresiones de captura/exportación y cuatro de galería; la integración
comprueba captura antes del cierre. Un remoto Git temporal verifica reemplazo,
único commit visible y rechazo de corridas antiguas. Revisión propia del diff,
no independiente. Los resultados live y la publicación remota se verifican
por separado; iniciar un workflow no demuestra que haya terminado.

```sh
npm test
node --test test/stall-capture.test.js test/stall-export.test.js test/latest-gallery.test.js
node --experimental-test-module-mocks test/fixtures/state-explorer-integration-runner.mjs verification-no-request
```
