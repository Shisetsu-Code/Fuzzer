# Estado técnico del Fuzzer Pragmatic — 18 de octubre de 2026

> **Rama:** `feat/batch-purchase-600-20261017` · **PR:** [#3](https://github.com/Shisetsu-Code/Fuzzer/pull/3) (borrador; no fusionado a `main`).
>
> **Alcance:** únicamente demos públicas oficiales de Pragmatic; sin login, saldo real ni compra fuera del entorno DEMO. Las acciones documentadas se prueban sobre juegos de demostración.

## Resumen ejecutivo

El trabajo evolucionó desde un fuzzer que elegía botones por prioridad hacia un **explorador de decisiones asistido y verificable**:

- Descubre elementos del runtime y filtra la interfaz genérica.
- Obtiene capturas y controles para que el agente apruebe las alternativas visibles; **la prioridad no autoriza clics**.
- Construye un árbol de rutas y distribuye las alternativas aprobadas entre **hasta cuatro clientes DEMO aislados simultáneos**.
- Reconstruye el menú en cada cliente, validando estado y huella del control. Los estados aleatorios de la tirada **no** son rutas deterministas que puedan reproducirse.
- Una compra aceptada mantiene su cliente vivo; un supervisor permite inspeccionar el bonus, elegir de forma explícita `picker`, `Continue`, `Collect`, `Stop` o una tirada de verificación.
- Conserva auditoría, capturas, referencias a HAR y motivos de bloqueo. **El cierre del bonus y el retorno a base todavía no están certificados end-to-end en GitHub ni en HardFire**.

La lógica de árbol/supervisor ha superado **230 pruebas Node** (simuladas para esos componentes). Esto **no** es equivalente a certificar 230 juegos reales ni 230 compras completas.

## Componentes implementados

| Componente | Ubicación | Responsabilidad |
|---|---|---|
| Escaneo de controles | `providers/pragmatic/drawn-buttons.js` y `integrations/hardfire/drawn-buttons.js` | Identificar controles dibujados, sus etiquetas y áreas |
| Filtrado | `providers/pragmatic/known-controls.js` | Ocultar controles comunes; conservar candidatos relevantes |
| Priorización no vinculante | `providers/pragmatic/batch-explorer.js` | Ordenar opciones, no decidir compras por sí sola |
| Árbol de forks | `providers/pragmatic/forked-tree.js` | Nodos, aprobaciones, rutas, cola, concurrencia y sesiones vivas |
| Supervisor de bonus | `providers/pragmatic/live-bonus-branch.js` | Decisiones con token, picks, continuaciones, Stop una vez por spin, verificación |
| Estados del proveedor | `providers/pragmatic/operation-completion.js` | Transacción DEMO, flags de bonus y condiciones de estado normal |
| Adaptador de navegador | `integrations/hardfire/state-explorer.js` | Sesiones HardFire, observaciones y clics revalidados |
| API del árbol | `integrations/hardfire/forked-tree-tools.js` | Herramientas MCP para descubrir, aprobar, ejecutar y supervisar |
| Workflow real de cuatro clientes | `.github/workflows/forked-real-demo-smoke.yml` | Playwright en GitHub Actions, un Chromium compartido |
| Prueba aislada | `.github/workflows/single-demo-bonus.yml` | Una compra DEMO con más tiempo de observación |

La implementación contempla **una reserva máxima de cuatro pestañas de juego simultáneas**. Un bonus activo ocupa una de ellas hasta su liberación. `clients:4` no significa cuatro sesiones totales: son cuatro **en paralelo**. El parámetro `max_sessions` es un presupuesto acumulado independiente. El modo guiado anterior tiene su propio límite de 3–4 sesiones por juego; no mezclarlo con el presupuesto del árbol recursivo.

### Cómo se recorre el árbol

```text
Pantalla inicial
└── Abrir Buy Feature (observado y aprobado)
    ├── Free Spins 200 → cliente A → confirmación → bonus activo
    ├── Super Free Spins 1 → cliente B → confirmación → bonus activo
    ├── Super Free Spins 2 → cliente C → confirmación → bonus activo
    └── Especiales → cliente D → menú Ante Bet / Super Spin
                                   └── nuevos nodos pendientes de aprobación
```

Cada fork parte de una sesión limpia, **reproduce solamente la ruta de navegación observada** y verifica cada control antes de pulsarlo. Si no reproduce el estado esperado, la rama termina pendiente y no se inventa un clic. Al llegar a una operación DEMO, el cliente se conserva vivo para continuar el bonus.

## Comandos MCP del árbol

Para una nueva sesión en HardFire local, después de instalar la rama y reiniciar el agente:

```text
pragmatic_tree_start({
  game_url:"https://www.pragmaticplay.fun/en/slots/candy-rush/",
  clients:4,
  max_sessions:40,
  max_depth:8
})

pragmatic_tree_result({job_id:"..."})

pragmatic_tree_approve({
  job_id:"...",
  node_id:"route:...",
  control_keys:["ruta exacta de control previamente observada"]
})

pragmatic_tree_run({job_id:"..."})
pragmatic_tree_result({job_id:"..."})

pragmatic_tree_live_observe({job_id:"...",branch_id:"route:..."})
pragmatic_tree_live_act({
  job_id:"...",
  branch_id:"route:...",
  token:"token de la observación actual",
  action_id:"acción de la observación actual",
  reason:"motivo breve basado en la captura"
})
pragmatic_tree_live_release({
  job_id:"...",branch_id:"route:...",reason:"motivo de cierre"
})

pragmatic_tree_close({job_id:"..."})
```

- `tree_start`, `tree_result`, `tree_approve` y `tree_skip` **no ejecutan compras**. `approve` solo pone ramas en cola.
- `tree_run` usa sesiones aisladas para los caminos explícitamente aprobados, con hasta cuatro clientes activos.
- `tree_live_observe` entrega un nuevo token y evidencia actual. `tree_live_act` hace **una** acción autorizada y valida que la pantalla y el control sigan siendo los mismos.
- Los posibles actos del bonus incluyen `picker`, `button` (Continue/Collect/Close), `advance`, `continue_center`, `stop` y `verify_normal_spin`, condicionados al estado observado. Un `Stop` se registra como máximo una vez por secuencia de tirada conocida.
- `tree_live_release` registra éxito o bloqueo, libera la pestaña y deja las ramas restantes pendientes de una siguiente ejecución. No se reenvían compras por falta de respuesta.
- `tree_close` libera los clientes de ese trabajo. La limpieza por inactividad está prevista a los 30 minutos de espera sin acciones; las sesiones cerradas no se restauran automáticamente al reiniciar el proceso MCP.

**Limitación operativa:** el árbol genérico de HardFire aún no tiene un ciclo end-to-end real certificado. Los workflows de Playwright ejecutan **rutas de Candy Rush preseleccionadas de capturas anteriores**, no un agente LLM tomando decisiones en vivo durante un runner de GitHub.

## Resultados reales de GitHub Actions

### Cuatro forks simultáneos — Candy Rush

| Evidencia | Resultado |
|---|---|
| [Primer intento, fallido](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39088740891) | Cuatro clientes cargados; overlays de introducción y colliders ambiguos bloquearon las acciones |
| [Menús y compra inicial](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39088982563) | `pur=0` confirmado; `pur=1` y `pur=2` llegaron a confirmación |
| [Tres compras DEMO aceptadas](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39089160795) | `pur=0`, `pur=1`, `pur=2`: `doSpin` HTTP 200; Special Bets mostró Ante Bet y dos Super Spin |
| [Pantallas de inicio de bonus](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39089343521) | Tres continuaciones `FreeSpins/Start/ButtonContinue` observadas; compras todavía sin cierre |
| [Continuación de las tres ramas](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39089550222) | Continuación explícita → nuevas peticiones `doSpin` del juego, sin recompras |
| [Piloto Stop](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39089850308) | Una rama: 15 usos de Stop identificados, una vez por tirada; bonus seguía activo |
| [Stop en las tres ramas](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39090168087) | Free Spins: 11 respuestas `doSpin`, Super 1: 6, Super 2: 11; ningún bonus declarado completo |

La prueba real de cuatro ramas confirmó un **máximo simultáneo de cuatro contextos** y tres compras aceptadas, pero el procedimiento del workflow **cerraba las sesiones después del tiempo de observación**. Por eso esos resultados no certifican la persistencia del nuevo árbol vivo en HardFire.

### Último ensayo aislado: llegó a la pantalla de resultado

**[GitHub Actions run 39090588753](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39090588753)**, Candy Rush, solo `buy-free-spins`:

| Campo | Observación |
|---|---|
| Clientes simultáneos | 1 |
| Duración medida del script | 267,14 s |
| Inicio de Chromium | 793 ms |
| Compra | `doSpin pur=0 bl=0`, HTTP 200 |
| Latencia de respuesta de compra | 1.205 ms |
| Tiradas `doSpin` posteriores | 17 respuestas adicionales HTTP 200 |
| Acciones Stop registradas | 17 |
| Liquidación | `doCollect`, HTTP 200 |
| Pantalla de resultado | Free Spins: **$36,10**; crédito DEMO observado: **$99.836,10** |
| Estado final registrado | `PURCHASE_ACKED_BONUS_NOT_VERIFIED` |

**Interpretación correcta:** la compra fue aceptada, las tiradas gratuitas progresaron y hubo un `doCollect` con pantalla de resultado. **No** se observó aún el cierre de esa pantalla ni una tirada normal posterior de comprobación. El campo `bonusComplete:false` es correcto. El workflow terminó con éxito técnico porque ejecutó y guardó evidencia; **eso no significa que el ciclo funcional haya terminado**.

Los tiempos corresponden a este caso concreto y no permiten extrapolar directamente cuánto tardarán 600 juegos de proveedores o mecánicas diferentes. Los artefactos temporales de GitHub incluyen capturas y JSON por rama; consultar sus fechas de retención (generalmente 7 días en los workflows).

## Qué significa cada estado

| Estado | Interpretación | ¿Cuenta como bonus verificado? |
|---|---|---|
| `AWAITING_APPROVAL` | Captura y controles listos para decisión del agente | No |
| `OPERATION_PAUSED_LIVE` | Compra iniciada; pestaña retenida para continuar el bonus | No |
| `WAITING_FOR_PURCHASE_ACK` | Falta una respuesta de compra confirmada | No |
| `CHOICE_REQUIRED` / `BONUS_ACTIVE` | Hay una elección o continúa el bonus | No |
| `READY_FOR_VERIFICATION` | El estado normal parece recuperado y requiere giro de verificación | No |
| `VERIFYING_NORMAL_SPIN` | Giro de comprobación enviado; faltan condiciones terminales | No |
| `OPERATION_COMPLETE_VERIFIED` | Giro normal confirmado y dos snapshots finales estables | Sí, según contrato del verificador |
| `OPERATION_PENDING_CLOSED` | Se liberó una rama sin verificación completa | No |

`COMPLETE` no es sinónimo de “HTTP 200”, de “bono con premios” ni de “todos los estados posibles descubiertos”. Incluso una rama verificada no prueba cobertura absoluta de combinaciones aleatorias.

## Validación automatizada del código

**[CI 39090687265](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39090687265): 230 tests Node aprobados, 0 fallidos.**

Incluye, entre otras, las pruebas:

- `test/forked-tree.test.js`: bifurcaciones, cuatro clientes, profundidad, rutas y bloqueo ante estados cambiantes.
- `test/forked-tree-tools.test.js`: API MCP, evidencia persistida, exclusividad de hasta cuatro pestañas y liberación de sesiones vivas.
- `test/live-bonus-branch.test.js`: elección explícita, respuesta de compra, tokens obsoletos, ausencia de confirmación, giro normal de verificación, dos lecturas terminales y Stop una vez por secuencia.
- `test/readiness.test.js`: estados `INTRO`, `BASE_CONTROLS`, `PURCHASE_OPTIONS`, `CONFIRM_PURCHASE` y overlays.
- `test/fast-hit.test.js`: cálculo de coordenadas, huellas y rechazo de controles fuera del iframe.

Las pruebas unitarias y MCP usan adaptadores simulados. Se necesita una prueba de integración del árbol y bonus vivo en **HardFire real conectado** antes de considerar el nuevo modo listo para producción.

## Instalación y ejecución

1. Obtener la rama `feat/batch-purchase-600-20261017` del repositorio `Shisetsu-Code/Fuzzer`.
2. Usar **Node.js 22+**, HardFire local instalado y el agente de ChatGPT conectado.
3. Ejecutar en PowerShell desde la raíz del repositorio (con todos los HAR actuales ya guardados):

   ```powershell
   .\scripts\install-hardfire.ps1 -HardFireHome "C:\HardFire"
   ```

   El instalador respalda `local-mcp.js` y el módulo previo, registra las herramientas y conserva un camino de restauración ante fallos.
4. Reiniciar HardFire **solo después de cerrar las sesiones activas**, consultar el estado del agente y hacer primero un smoke de una demo.
5. Ejecutar `pragmatic_tree_start`, inspeccionar la captura y aprobar explícitamente las ramas de interés. Consultar `tree_result` para ver cuáles quedaron pendientes.
6. Para cada `liveBranch`, inspeccionar la captura, elegir una acción, observar el resultado y cerrar/liberar solo después de guardar la auditoría.

No ejecutar el catálogo de 600 juegos mientras haya ramas incompletas que mantengan las cuatro pestañas ocupadas. GitHub Actions ejecuta Chromium en su propio runner; **no es el agente HardFire local**.

## Pendientes priorizados

1. **Terminar el resultado de Free Spins en un ensayo real:** reconocer `FreeSpins/Content/Texts/Result/ButtonContinue`, confirmar que está visible, aprobar su clic, observar el retorno a la base y verificar una tirada normal DEMO. Conservar las dos observaciones posteriores.
2. Comprobar en HardFire que cuatro `OPERATION_PAUSED_LIVE` mantengan las pestañas y HAR correctos, y que liberar una rama desbloquee la cola sin quinta pestaña.
3. Validar picks, rescates, respins, reactivación de Free Spins y otras familias de juegos sin reaprovechar una ruta aleatoria.
4. Separar de forma explícita el estado **liquidado/cobrado** (`doCollect`) de **completamente verificado** (vuelta a base + spin posterior). Ajustar informes y contadores para ambas métricas.
5. Probar un lote de cinco juegos variados end-to-end, no únicamente el demo de Candy Rush. Solo entonces extrapolar tiempos y dimensionar lotes de 600.
6. Vigilar el tiempo de permanencia de pestañas activas, la retención del job en memoria, el cierre tras inactividad y el almacenamiento de capturas/HAR. No registrar cookies ni parámetros sensibles en informes versionados.

**Estado de entrega:** funcionalidad implementada en la rama de PR, CI de simulaciones aprobado y evidencia Playwright real hasta `doCollect`. **La verificación final del bonus y la integración del árbol genérico con cuatro HardFire reales siguen pendientes.** `main` no se ha modificado.
