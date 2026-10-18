# Modo guiado: el fuzzer ve, el agente decide

Este modo sustituye la elección automática por una secuencia de **observación → captura → decisión del asistente → único clic verificado → nueva observación**. El fuzzer conserva su extracción de controles internos y el filtro de interfaz genérica, pero no selecciona automáticamente menús, botones de compra, opciones de bonus ni giros.

**Solo juegos DEMO públicos.** Mantiene hasta cuatro sesiones aisladas por juego (tres o cuatro, configurable). Máximo dos jobs de Fuzzer simultáneos y cuatro pestañas en toda la instalación. Ningún acceso a saldo real.

## MCP de HardFire

Después de instalar la versión de esta rama en el MCP local de HardFire y reiniciarlo:

1. `pragmatic_guided_start({game_url:"https://www.pragmaticplay.fun/en/slots/death-dominion/",max_sessions:4})`. Abre una sesión DEMO aislada y devuelve `job_id`, `tab_id`, `token`, `screenshot`, `actions[]`, `unresolved` y `flags`.
2. El **asistente** llama a `hardfire_screenshot({tab_id})` para ver visualmente el estado. Las imágenes de botones recortados quedan en `actions[].crop_path`; el resumen filtrado no requiere OCR.
3. El asistente decide un `action_id` observado y llama `pragmatic_guided_act({job_id,token,action_id})`. Solo se ejecuta **una** decisión. Para descartar un botón inocuo sin pulsarlo, `pragmatic_guided_skip`.
4. La respuesta de `guided_act` trae el nuevo `view` y un **nuevo token**. La herramienta compara estado, secuencia de operación, ruta y huella del botón antes de pulsar. Si cambia algo, **no hace clic** y devuelve una nueva vista.
5. Si un bonus exige una elección, aparece como acción `picker`; el asistente elige explícitamente. Para una pantalla `PRESS ANYWHERE TO CONTINUE`, la acción `continue_center` está disponible **solo para selección explícita** y debe estar respaldada por inspección visual. El motor no ejecuta un giro normal por su cuenta.
6. El asistente puede llamar `pragmatic_guided_observe({job_id})` en cualquier momento. Es una captura fresca sin clic que invalida tokens anteriores. `pragmatic_guided_status` devuelve la última vista sin cambiar el token.
7. Ante un callejón sin salida, `pragmatic_guided_reset({job_id})` consume una de las tres o cuatro sesiones DEMO. Nunca reinicia automáticamente. Al terminar, `pragmatic_guided_close({job_id})` cierra la pestaña propia y guarda HAR, trazas y evidencia.

`guided_skip` guarda el control como no probado, no como inexistente. `guided_close` y el cierre por inactividad de 30 minutos liberan recursos tras conservar evidencia. El reporte final no afirma que el RNG sea predecible ni que un bonus esté verificado por el solo hecho de recibir HTTP 200.

## Ejemplo de decisión

```
guided_start → juego base → [b0 Buy Feature Menu, spin_normal]
hardfire_screenshot → el asistente ve el botón de compra
guided_act(token,b0) → menú → [b0 Buy 80×, b1 Buy 200×, b2 Cancel]
hardfire_screenshot → el asistente elige 80×
guided_act(token,b0) → operación iniciada → estado observado
hardfire_screenshot → el asistente decide pick / continue / spin normal o reset
```

Las acciones de selección de bonus no se generan basándose en un resultado aleatorio anterior. No se hace clic en coordenadas viejas ni se envían comandos de protocolo arbitrarios inventados.

## Por qué no ejecutar el catálogo a ciegas

Los lotes de 600 juegos se pueden **planificar** con el modo batch anterior, pero el modo guiado requiere una decisión real del asistente por cada acción. El ahorro de tiempo se obtiene al eliminar menús comunes, comprimir observaciones y reutilizar sesiones, no saltándose decisiones en escenarios ambiguos.

La validación CI cubre decisiones explícitas, token viejo, cambio de estado y huella, picker, continuación, omisión sin clic y presupuesto de sesiones. Una prueba con interfaz real requiere HardFire conectado al equipo.
