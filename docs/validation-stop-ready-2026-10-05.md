# Verificación de cierre visual y retorno a base

Las pruebas locales se ejecutan mediante el MCP de HardFire/Electron, con sesiones DEMO independientes y HAR locales. COMPLETE requiere dos rondas normales nuevas después de la compra; un doCollect o canSpin=true por sí solos no bastan.

## Defectos observados y corrección

La búsqueda de controles podía seleccionar un duplicado oculto. Se filtran los XTButton por activeInHierarchy=true y xtEnabled distinto de false. Además, la coincidencia aproximada de spin podía seleccionar StopSpin_Button: los eventos conocidos ahora se buscan por su evento exacto, sin ese fallback por nombre.

El diagnóstico de Gatot mostró que incluso el evento exacto de spin no enviaba un request nuevo cuando stopActive=true. El cliente anunciaba canSpin=true antes de terminar la animación. verifyBase ahora termina esa animación mediante el evento Stop y espera que deje de estar activo antes de pedir las rondas nuevas. Solo hace esto sin free spins, bloqueo de feature, respin, cascada del servidor o picker, y con na=s. No certifica un spin por el resultado del clic: sigue exigiendo los requests y respuestas normales en el HAR.

La regresión reproduce un cliente con canSpin=true y Stop activo que ignora Spin hasta recibir Stop. Falló antes del cambio y pasó después. Suite completa: 70 pruebas, cero fallos.

## Prueba reducida

Gatot Kaca's Fury, job 3b2ad91d-c6c6-41d5-98a3-5caacca5945f: compra pur=0 de 100× COMPLETE, 25 pasos, 39 segundos para la prueba. Se limitó deliberadamente a una rama; no certifica las otras compras ni el antebet. El experimento de apuesta observó 2→3→4→3→2 y relaciones de compra 100×/200×/300×. Ante sigue unresolved porque el runtime lo declara pero no se identificó su control.

## Repetición completa

Gatot, job d450163e-ebd5-4754-914f-57513f0e0ad1: las tres compras COMPLETE en la misma corrida, 142 segundos. HAR auditados sin errores HTTP ni de aplicación: pur=0 termina con spins normales index=20 e index=21 y collect index=22; pur=1 con index=25 e index=26; pur=2 con index=42 e index=43. Los spins posteriores no llevan pur ni campos de free spins/cascada. La rama Ante sigue PENDING/ACTION_FAILED porque su control permanece desconocido, por lo que el juego completo sigue PARTIAL.

Out of the Woods, job 2583fb88-f249-4b45-a2b3-ad61037d74bc: PARTIAL antes de ejecutar compras, PROBE_SPINS_NOT_COMPLETED. El HAR muestra una cascada normal rs_c=2, su cierre rs_t=2 y doCollect→na=s; no muestra errores HTTP ni de aplicación. Se restauró la apuesta. Se conserva este fallo del probe separado de las pruebas de compra y se inicia un reintento fresco.

No se publican HAR ni credenciales en este repositorio.

Reintento de Out of the Woods, job b6c9c5e9-89d0-4ae6-8f6c-7ee6a8a21a74, 130 segundos: compras 100× y 500× COMPLETE en la misma corrida. HAR auditados: pur=0 vuelve a dos spins normales index=34 e index=35; pur=1 a index=23 e index=24, seguido de collect index=25. Ante 5× COMPLETE con dos requests bl=1. Ante 10× PENDING/ACTION_FAILED: los requests bl=2 activan una cascada rs_c=1, terminan rs_t=1 y collect index=7, pero no se certificaron dos rondas independientes. No es un error HTTP ni de aplicación; sigue pendiente el manejo de verificación de Ante con cascadas. Se conserva PARTIAL, sin equiparar los tres doSpin de una cascada a tres rondas normales.

Al finalizar quedan únicamente IMPORT, MCP y una pestaña about:blank aislada a 4×. No quedan pestañas de estas pruebas abiertas. Los archivos instalados session.js y parser/runtime.js coinciden por SHA256 con la corrección probada.
