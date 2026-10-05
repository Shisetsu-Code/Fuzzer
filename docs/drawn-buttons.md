# Extractor de botones dibujados de Pragmatic

Herramienta MCP local: `pragmatic_drawn_buttons({tab_id})`.

No hace spins, compras ni clics. Inspecciona la pestaña existente y filtra los controles comunes por defecto. No requiere LLM para calcular coordenadas.

## Extracción

Enumera XTButton, CATButton y UIButton activos/habilitados con Collider activo. Comprueba gráficos UISprite, UILabel y UITexture mediante sus objetos PIXI, visibilidad/alpha y límites. Cuando el collider es hijo de la gráfica, busca hasta ocho ancestros y conserva la primera asociación con dibujo visible comprobado; un widget oculto no termina la búsqueda. Agrupa múltiples handlers de un mismo GameObject.

Proyecta el collider con la cámara del layer y convierte a coordenadas de la captura completa, incluyendo desplazamiento del iframe y escalado de la imagen. Guarda recortes JPEG 85, captura completa JPEG 65, buttons.json y buttons.md. Cada botón tiene ID por captura, fingerprint para comparar juegos, dibujo, hit_rect y centro normalizado si se pudo comprobar el collider. El fingerprint agrupa candidatos; no prueba equivalencia funcional entre juegos.

Por defecto elimina spin normal, subir/bajar apuesta base, autoplay, paytable, sonido, ajustes, velocidad y cambio de formato de saldo. Usa eventos, nombres y ancestros. Contextos de compra, Ante Bet, bonus, elecciones, collect e intro tienen prioridad y se conservan. Nombres genéricos desconocidos se conservan. No se borran gráficos del juego: solo se excluyen de la salida y de los recortes. discarded_common guarda el motivo, runtime-all.json conserva la extracción completa y universal_filter_applied=true. Para revisar todos usar pragmatic_drawn_buttons({tab_id,include_universal:true}).

## Límites concretos

Solo runtime Pragmatic DEMO soportado. No es un extractor universal de canvas. El orden de oclusión frente a modales NO está verificado: una intro puede tapar gráficos aún activos del juego. Por eso se conserva la captura completa y occlusion_verified=false; no ejecutar estos controles automáticamente mientras haya un overlay sin revisar. UNKNOWN no autoriza un clic. No se interpreta el nombre de un objeto como prueba de su función.

La asociación de gráfico y collider puede usar ancestros; revisar los recortes si un juego organiza sus objetos de otro modo. Los controles sin gráfico comprobado quedan en unresolved.

## Verificación real

Probado en Candy Rush y Big Bass Hold & Spinner después de cerrar sus intros. Candy: compra y Special Bets salen como recortes distintos. Big Bass: Extra Chance of Scatters, Buy Free Spins y Hold & Spinner salen como tres recortes distintos. Se inspeccionaron las cinco imágenes reales. No se hicieron compras ni spins en esta prueba.

Artefactos de referencia (locales):
- Candy: C:/Users/Shisetsu/.hardfire/fuzzer/drawn-buttons/a4fdc572-b15c-472d-bef3-2345747e8f6b/buttons.md
- Big Bass: C:/Users/Shisetsu/.hardfire/fuzzer/drawn-buttons/2be6b731-534a-47fa-90e2-3b4a020be865/buttons.md

Tests: transformación iframe/píxel, clipping fuera de pantalla, exclusión de controles ocultos/deshabilitados/inactivos y deduplicación de handlers.

## Filtro comprobado
Candy Rush: 11 controles → 2 (Special Bets y Buy Feature). Big Bass: 12 → 3 (Extra Chance y las dos compras). Evidencia real previa y pruebas de protección de ramas y nombres ambiguos.

## Prueba de 15 juegos (2026-10-05)

Se extrajeron los controles de Candy Rush, Spell Master, Plushie Wins, Big Bass Hold & Spinner, Temple Guardians, 3 Buzzing Wilds, 5 Frozen Charms Megaways, 5 Lions Reborn, Alien Invaders, Jungle Gorilla, Starlight Wins, Rise of Pyramids, Romeo and Juliet, Triple Hop Pots y Wild Gladiators. Máximo cuatro demos simultáneas. Se inspeccionaron sus pantallas iniciales sin ejecutar spins ni compras.

Resultado: 15 botones especiales en 9 juegos; los otros 6 no presentaron controles especiales en su pantalla inicial. Esto NO demuestra ausencia de opciones ocultas ni cuenta las opciones de los menús de compra. Alien requirió repetir la carga en una pestaña nueva.

La prueba descubrió un falso positivo del menú móvil ButtonOpen y una excepción demasiado amplia para el contenedor VisibleInSpecialFeature. Se corrigieron ambos conservando los contextos económicos reales. Los resultados originales se conservan; el filtro corregido se reaplicó a la evidencia capturada. Reporte y galería: outputs/drawn-filter-15-20261005/results.md en el workspace principal. La verificación automatizada completa pasó 147 tests.

## Apertura de menús: 15 juegos (2026-10-05)

Prueba posterior sobre los mismos 15 juegos: 17 entradas de demo (dos adicionales para los segundos accesos de Big Bass y 5 Lions), 11 accesos de compra abiertos en 9 juegos y 6 juegos sin acceso visible en la pantalla inicial. Sin errores registrados. Máximo cuatro juegos simultáneos. Se guardaron 59 controles nuevos como hijos del acceso que abrió la pantalla, con recortes y coordenadas; no se activaron ni confirmaron compras en esa segunda pantalla.

La corrida es una prueba por tandas coordinada desde el chat, no un rastreador autónomo de todo el catálogo. La selección de accesos usa evidencia de path/sprites de compra; no coordenadas ni cantidades por juego. Los hijos se conservan por aparición, sin presumir que todos compren: hay controles de apuesta, cierres y blockers. La clasificación inicial es una ayuda por nombres, no verificación semántica. La oclusión sigue pendiente. Evidencia: outputs/purchase-entry-15-20261005/results.md y graph.json en el workspace principal.

## Sprites invisibles en interfaces de compra

La prueba de diez juegos nuevos del 2026-10-05 detectó que Hearts of Venus y Sweet Rush Bonanza tienen sprites invisibles sobre las áreas de clic. La presencia de un widget no prueba que exista un dibujo visible. El extractor ahora prueba primero los widgets directos y después cada nivel de ancestros, hasta ocho niveles, y solo detiene la búsqueda al encontrar un dibujo que pase las verificaciones de visibilidad. Los sprites y etiquetas de intentos descartados no entran en la configuración del control.

El cambio es compartido por el proveedor; no usa nombres ni coordenadas por juego. Si no puede asociar el dibujo, conserva association_diagnostics y el explorador registra UNRESOLVED_DRAWING con captura. Esto no prueba oclusión ni garantiza que el control visible del fondo pueda recibir el clic.

Repetición real: Hearts abrió un menú con tres compras y otro con cuatro apuestas especiales; Sweet Rush abrió dos compras y tres apuestas especiales. Antes ambos devolvían cero controles observados. La suite completa pasó 172 tests. Resultados de la tanda en outputs/state-explorer-new10-20261005/results.md del workspace principal.
