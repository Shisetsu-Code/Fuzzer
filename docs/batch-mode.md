# Modo batch para compras DEMO (hasta 600 juegos)

Esta variante es **purchase-first** y no reemplaza al explorador exhaustivo
\`pragmatic_explore_start\`. Se ejecuta solo en páginas públicas DEMO oficiales:
el mismo validador \`assertDemoUrl\` que el fuzzer original rechaza URLs
autenticadas y parámetros de sesión.

## Cómo trabaja

1. Abre **una sesión aislada** y observa los controles dibujados que dejó el
   filtro existente. Prioriza Buy/Feature/Ante, luego elecciones y aperturas de
   menú. Los botones normales de apuesta, sonido y spin continúan excluidos.
2. Abre un menú y recorre sus opciones de compra **en la misma sesión**. Tras
   enviar la compra, usa el verificador de operación del fuzzer original:
   completitud del bonus, elección visible cuando corresponde, giro normal de
   comprobación y retorno a controles disponibles. El HTTP 200 no basta.
3. Para otro hijo del mismo menú, lo vuelve a abrir desde la base sin recargar.
   Si debe reconstruir una ruta, comprueba primero el estado y el control.
   Puede pulsar un botón observado Cancel/Back para regresar a la base.
4. **Solo** reinicia una DEMO cuando no consigue recuperar una ruta o una
   operación quedó en estado inseguro; límite total configurable de **3 o 4
   sesiones por juego**. Si agota el presupuesto, declara pendiente el resto.
5. Guarda por juego: \`result.json\`, \`progress.json\`,
   \`har-reference.json\`, capturas y \`all-branches.har\` consolidado.
   No versiona HAR privados. Un HAR combinado reúne varias sesiones, no es una
   única secuencia cronológica.
6. El trabajo general guarda \`progress.json\` y \`summary.json\`.
   El reinicio de HardFire borra el registro MCP de jobs, pero no sus archivos.

\`TARGETS_EXHAUSTED\` solo significa que terminó los controles **priorizados**;
**no** equivale a haber descubierto todas las posibilidades ni los resultados
RNG. Los controles descartados figuran en \`ignored\`. Una compra cuenta como
verificada solo cuando \`finishOperation\` devuelve \`ok=true\` para \`purchase\`.
Las ramas cuyo cierre no se demostró permanecen \`PARTIAL\`.

## Comandos MCP locales (después de instalar en HardFire)

\`\`\`json
{
  "game_urls": [
    "https://www.pragmaticplay.fun/en/slots/death-dominion/",
    "https://www.pragmaticplay.fun/en/slots/coven-rising/"
  ],
  "sessions_per_game": 4,
  "actions_per_game": 30,
  "depth": 6,
  "timeout_ms_per_game": 300000,
  "concurrency": 1
}
\`\`\`

Iniciar **una sola vez** con \`pragmatic_batch_start\`. Consultar el
\`job_id\` con \`pragmatic_batch_result({job_id,offset:0,limit:10})\`.
Se aceptan **1–600** URLs y **1 o 2** workers dentro del presupuesto global
HardFire de cuatro pestañas DEMO y dos trabajos. Cada worker mantiene una
pestaña cargada; no subir concurrencia para saltar límites del navegador.

La instalación local necesita Node.js 22+ y \`scripts/install-hardfire.ps1\`.
Para la versión aislada de rama, instalarla desde una copia local de esa rama,
no desde \`main\`. Probar primero dos juegos DEMO antes de lanzar el catálogo.

## Alcance de la validación

Se incluyen pruebas deterministas que simulan menus, compras, elecciones,
reutilización de sesión, timeouts y límites. **No son evidencia de que un
proveedor real haya aceptado 600 compras o de una velocidad concreta.**
Las pruebas end-to-end requieren el agente HardFire del equipo conectado y
DEMOs públicas disponibles. No ejecutar juegos con saldo real.
