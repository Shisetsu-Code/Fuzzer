# Pragmatic: detección económica y ejecución interna

El experimento de apuesta conserva sus incrementos, decrementos, comparación de precios y comprobación de restauración. Si está disponible, invoca el evento concreto `SmartIncreaseBet` / `SmartDecreaseBet` del runtime antes de recurrir al botón. Los cambios se confirman leyendo el runtime; invocar un evento no certifica el cambio.

La compra busca primero un `FeaturePurchaseManager` o `FeaturePurchaseV2` con `PurchaseFeature(index)` y una lista propia de costes u opciones que contenga ese índice. El resultado guarda clase, raíz, instancia, método e índice. Esta ruta no modifica artificialmente `purchaseIndex` ni necesita pulsar el botón que abre el menú.

Si el controlador existe y se invoca, una selección no confirmada queda pendiente. No se ejecuta después otra compra por clic. Si no existe un controlador directo compatible, se conserva la ruta anterior de botones y su segundo clic espaciado un segundo.

La ejecución conserva la captura de request/response, las continuaciones del proveedor y la tirada ordinaria de cierre. La selección local es una comprobación intermedia: el payload y la respuesta siguen siendo necesarios para validar la operación completa.

El grafo descubre las opciones anunciadas después de comprar en cada juego; no presupone tres, siete ni otro número. Las familias relacionan estructuras, pero no heredan opciones ni cobertura. Una elección no disponible sigue pendiente.

Caso de regresión indicado por el usuario: **Deep Sea necesita elecciones dentro de la compra**. El recorrido debe descubrir ese menú después de iniciar la compra, crear una rama por elección y confirmar el cierre de cada hoja. No basta con certificar el request inicial ni una sola elección. Esta observación es información del usuario; todavía no se vincula a un slug ni a una ejecución verificada en la tanda de juegos nuevos del 5 de octubre.

Esta implementación prioriza dos controladores conocidos. No promete acceso a funciones privadas, ni sustituye las reglas del proveedor ni la confirmación del servidor.

## Evidencia local inicial

La prueba del 5 de octubre de 2026 confirmó llamadas reales a `FeaturePurchaseManager.PurchaseFeature(0)` en 3 Buzzing Wilds y `FeaturePurchaseV2.PurchaseFeature(0)` en 5 Frozen Charms Megaways. El experimento de apuesta registró los cuatro eventos internos de incremento/decremento. El grafo encontró tres elecciones en el primero y siete en el segundo.

La primera tanda con esta ruta quedó parcial por continuaciones. Que el controlador de compra funcione no certifica el final del bonus. Un caso reproducido mostró `CanSpin=true` y `StageResultFreeSpin.mustSpin=true` mientras el detector seguía intentando Stop; esa combinación ahora permite avanzar al siguiente spin. Los informes completos y las capturas permanecen fuera del repositorio, en los outputs locales.

La repetición de 3 Buzzing Wilds tras esa corrección terminó COMPLETE: las tres elecciones usaron la compra directa y completaron su spin ordinario de cierre. Se confirmó también el round-trip de apuesta. Esto no certifica las continuaciones pendientes de 5 Frozen: sus siete elecciones fueron descubiertas, pero sus finales necesitan otra validación.

## Continuaciones CAT y bloqueo de interfaz

El código y la configuración capturados en el HAR de 5 Lions Reborn muestran una segunda clase de controles: `CATButton`. Su `ButtonContinue` tiene un `catEventRelease` configurado y un `catEventClick` vacío. Ejecutar únicamente `OnClick()` no inicia esa animación; la ruta del juego es `OnPress(true)` seguido de `OnPress(false)`.

`StageResultFreeSpin.UHTUpdate` espera que termine `SpinBlockingFeatureIsRunning` antes de cambiar a la etapa Spin. `CanSpin=true` y `mustSpin=true` por sí solos no autorizan saltar esa condición con un request directo. La continuación busca un único CATButton Continue activo durante esa etapa bloqueada, sin elecciones activas. Respeta eventos que ya están corriendo y registra el controlador utilizado. Los controles ocultos o ambiguos no se invocan.

Los clics físicos de respaldo activan su propia pestaña antes de pulsar. Durante continuaciones detenidas se comprueba la imagen como máximo cada diez segundos. Si aparece `screenshot_empty`, se vuelve a presentar la ventana conservando su modo visible u oculto, sin navegar ni repetir la compra. Las capturas de fallo usan esa misma recuperación y un reintento; si siguen vacías, el informe conserva el error y no inventa una captura.

Las pruebas unitarias cubren el botón con continuación en release y el mismo botón oculto. La validación real debe confirmar el final del bonus y una tirada normal nueva; una llamada CAT aceptada no equivale a una compra COMPLETE.

La configuración de la elección 1 de 5 Lions Reborn tiene `CATButton` y `XTButton` en el mismo collider. El CAT configura press/release y click para ejecutar animaciones; el XT configura `BonusPickItemIndex=1` y el evento de selección. Ejecutar solo el XT envía la elección, pero omite el cierre visual que necesita la etapa siguiente. La ruta interna ejecuta los callbacks configurados del CAT hermano y un único click XT, y registra ese componente acompañante en la evidencia.

Una selección puede aparecer después de observar y antes de continuar, particularmente con `na=fso`. En ese caso, `continueProtocol` devuelve las elecciones activas con `needsSelection`; el recorrido vuelve a observar y las incorpora al grafo sin abortar ni elegir arbitrariamente.

Si los spins normales de preparación activan un bonus natural, la sesión termina esa función con sus controles, eligiendo la primera opción anunciada cuando corresponda, y vuelve a verificar dos rounds normales nuevos. Esta preparación no inicia compras ni certifica su cobertura. Está acotada a 120 segundos por bonus, 200 acciones y dos recuperaciones; un fallo real sigue conservando HAR y diagnóstico.

El MCP admite dos trabajos simultáneos y mantiene su slot ocupado hasta guardar la evidencia y cerrar las pestañas. Cada trabajo puede cargar una pestaña de preparación y una de rama, por lo que el máximo del Fuzzer es cuatro pestañas DEMO. Los clientes deben consultar el trabajo existente y esperar al cierre antes de iniciar otro.

## Recuperación de esperas y validación del 5 de octubre

Después de confirmar un request de compra (`pur` en una respuesta aceptada), una espera sin avance de cinco segundos habilita un click físico en el centro de la pestaña DEMO. Se reintenta cada dos segundos dentro del plazo de la operación, aunque la introducción no exponga `StageResult` o `StageResultFreeSpin`, como ocurre en Hold & Spinner. Las elecciones activas y un menú de compra abierto bloquean este respaldo. Cada click se registra como `centerFallbackClicks`; no se vuelve a enviar la compra. La unidad incluye la introducción sin etapas y el mismo caso con elecciones activas, donde no se hace click.

Prueba real `pragmatic-five-second-click-20261005`: la compra Hold & Spinner de Big Bass recibió un click del nuevo respaldo, pasó la introducción, generó otro `doSpin` y llegó a `doCollect` con respuesta `na=s`. El retorno a base quedó pendiente con una animación Epic Win; no se certificó COMPLETE. La otra compra quedó pendiente durante collect, y el Ante Bet sigue sin control identificado. Esta ejecución confirma el click de introducción, no la terminación completa del juego. Suite: 139 pruebas aprobadas.

Durante cualquier espera de transición se comprueba también la superficie de la pestaña cada diez segundos, incluso en `StageSpin`, donde un click al centro no está autorizado. Si la captura no produce píxeles, se vuelve a presentar la ventana conservando su modo. Esta comprobación no envía spins ni compras. La evidencia distingue `surface-check` de `surface-refresh`.

Un resultado con `na=c`, controles listos, etapa Result y sin bonus, bloqueo, contador, Stop, menú ni elecciones puede cerrarse mediante una tirada normal del juego. Esa tirada verifica el cierre y no se repite al declarar la rama completa. Un inicio de free spins detenido ocho segundos puede intentar una única llamada nativa a `SpinUtils.UnblockSpin`, únicamente con respuesta inicial válida, etapa que exige entrar y girar, bloqueo activo y ninguna elección pendiente. No se escribe directamente una variable ni se fabrica un request.

La tanda `pragmatic-continuation-recovery-20261005` completó las siete elecciones y la compra adicional de 5 Lions Reborn. La tanda `pragmatic-frozen-final-20261005` completó las siete elecciones y el Ante Bet de 5 Frozen Charms Megaways. Esta última ejecución no necesitó la recuperación nativa ni el cierre especial: esas rutas tienen pruebas unitarias, pero no se afirma que fueran utilizadas en esa corrida. La regresión de 3 Buzzing volvió a detectar una compra aceptada con pantalla sin píxeles antes de mostrar las elecciones; motivó la comprobación de superficie independiente de los clicks. Estos resultados no certifican el catálogo completo.

La repetición `pragmatic-buzzing-surface-20261005` completó las tres elecciones y el grafo, sin pendientes. No utilizó `surface-refresh` en sus pasos registrados; confirma la regresión del recorrido, pero no demuestra que la recuperación resuelva todos los bloqueos intermitentes del renderizador. La suite final pasó 137 pruebas. Al finalizar no quedaron pestañas DEMO cargadas.
