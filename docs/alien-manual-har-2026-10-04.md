# Alien Invaders: HAR manual completo

Fuente privada: `www.pragmaticplay.fun_Archive [26-10-04 22-19-39].har`. Contiene 80 intercambios gameService, incluidos dos doInit, para `vs20alieninv`. El endpoint es `https://demogamesfree.pragmaticplay.net/hub-demo/ge/v4/gameService`. El HAR original permanece local; solo se publica el contrato con campos permitidos.

La configuración inicial anuncia dos compras: pur=0 a 65× y pur=1 a 400× la apuesta base. Ambas fueron ejecutadas con c=12, l=20 y bl=0; apuesta base 240. Ante nivel 1 está configurado a 1,25× por bls=20,25, pero esta captura no contiene requests bl=1. No se considera ausencia de Ante ni se inventa ejecución manual.

| Compra | Inicio | Final | Continuaciones | Cobro |
| --- | --- | --- | --- | --- |
| pur=0, 65× | 7 free spins | fs_total=10 por retriggers | 28 doSpin sin pur | doCollect → na=s |
| pur=1, 400× | 7 free spins | fs_total=11 por retriggers | 43 doSpin sin pur | doCollect → na=s |

Las continuaciones incluyen cascadas; sus cantidades no son el número de giros manuales ni el de free spins. Durante ellas el servidor devuelve rs_c/rs_p/rs_m. fs_total puede aparecer mientras una cascada sigue activa, con na=s: no autoriza por sí solo el cobro ni demuestra regreso a base. El final de cada compra sí llegó a na=c y luego doCollect con na=s.

Después del segundo cobro hay dos requests doSpin: index=78 activa una cascada (rs_c=1, na=s) y index=79 la termina (rs_t=1, na=c). Son una ronda normal y su continuación, no dos rondas normales completas. El HAR termina antes de su doCollect. Después de la primera compra se abre directamente la segunda; tampoco se demuestra allí la verificación de dos rondas ordinarias.

El contrato [vs20alieninv.json](../contracts/pragmatic/vs20alieninv.json) registra ambas compras manualmente ejecutadas y cobradas, sus payloads y el Ante configurado pero no ejecutado en esta captura. Conserva separada la última prueba automática, que quedó PARTIAL. Las elecciones locales de UI permanecen UNKNOWN: la red no permite inventariarlas.

Esta evidencia respalda el guard actual contra certificación de cascadas activas. No demuestra cuál control de UI dejó de enviar giros en el Fuzzer después de cerrar sus bonus; esa causa requiere observar el runtime en el momento del fallo. No se marca la prueba automática como completa usando el resultado manual.
