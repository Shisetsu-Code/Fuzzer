# Exploración dinámica de 3 Oaks

El explorador conserva el BFS existente: filtra controles habituales comprobados, descubre los controles restantes y reproduce los caminos del menú en sesiones DEMO aisladas. Las acciones del HAR validan lo ocurrido después del clic; no forman una lista fija de botones.

## Herramientas de HardFire

- `three_oaks_explore_start`: URL pública de 3 Oaks, `max_actions`, `max_depth`, `timeout_ms`. Devuelve `job_id`; puede ejecutar compras y spins de DEMO.
- `three_oaks_explore_result`: consulta el trabajo sin volver a ejecutar acciones.

Ejemplo de URL pública: `https://3oaks.com/game/lady_fortune`. Se abre una sesión nueva mediante el launcher público. No se aceptan URLs capturadas con credenciales o identificadores de sesión.

Estas herramientas pertenecen al explorador de HardFire. El MCP independiente `fuzzer-har` continúa siendo un analizador offline; no abre juegos ni hace clics.

## Primitivas aprendidas

El cliente de 3 Oaks publica `window.app`, su árbol PIXI y `window.GR`. Se inspecciona el árbol que realmente renderiza el cliente, incluyendo su capa compartida. El Spin del runner se reconoce por la propiedad del padre `spinButton`, sus hermanos `quickSpin`/`autogame` y su identificación de componente. Los nombres de un juego no intervienen en la selección.

Las zonas interactivas pueden ser transparentes o no tener dibujo propio. Se comprueba su relación con el arte visible y su geometría; Rectangle, Circle y Polygon se verifican mediante el `contains` nativo y la transformación actual. Máscaras y geometrías no comprobadas quedan pendientes. Antes de cada clic se vuelve a localizar el control y a comprobar sus coordenadas.

Abrir una compra es una transición de interfaz. La compra solo se confirma cuando se observa `buy_spin`, respuesta HTTP correcta, `status.code=OK`, `context.last_action` coincidente y eco de los parámetros en `last_args`. Los spins normales, los spins con `ante_bet>0` y las continuaciones se registran separados. Un bonus natural no cuenta como compra.

Después de activar antebet se permite un único spin normal observado, cuando el menú está cerrado y el servidor confirma una base terminada. Las respuestas pendientes del HAR se esperan; no se consideran errores. La operación se completa al volver a `current=spins`, `round_finished=true` y acciones que permiten `spin`, con la última operación confirmada.

Se espera que las animaciones automáticas avancen antes de recorrer los controles observados dentro de una operación. Las alternativas se reproducen mediante los planes de opciones del BFS. Los estados aleatorios de un bonus natural no se convierten en rutas de compras.

## Instalación y preservación

En una instalación existente de Fuzzer, ejecutar `scripts/install-three-oaks.ps1`. Agrega solamente los archivos y registros de 3 Oaks, conserva los cambios de Pragmatic y crea un respaldo. Guardar capturas, esperar los trabajos y reiniciar HardFire. Para una instalación nueva, `install-hardfire.ps1` copia también este proveedor.

Se comparten los dos espacios de trabajo de Fuzzer y el límite de cuatro juegos cargados. El HAR automático se guarda antes de cerrar cada pestaña propia. Si falla el guardado, se conserva la pestaña para recuperación y se informa su ID. Los HAR manuales del usuario no se modifican.

## Límites explícitos

`EXHAUSTED_OBSERVED_CONTROLS` solo significa que se agotaron los controles observados y comprobados; `completeGame` siempre es falso. Falta de geometría, respuesta no verificada, cambio de replay o límites de tiempo/profundidad/acciones producen evidencia pendiente. No se infiere ausencia de compras a partir de una captura incompleta.

Las capturas de regresión contienen datos mínimos sanitizados y títulos ficticios. Los tres HAR proporcionados contienen evidencia de protocolo pero no archivos JavaScript; los clientes y el runner guardados localmente por Tester-Spin aportaron la evidencia de interfaz complementaria.
## Verificación de esta adaptación

La suite completa pasa: 230 pruebas. Se verifican capturas sanitizadas de tres familias de protocolo: bonus natural, compras por selector y compras por cantidad de scatters. En una ejecución DEMO acotada de Lady Fortune se confirmaron antebet=1.25 y dos compras distintas (4 y 5 scatters), con respuesta aceptada y retorno a base. El límite de acciones dejó otras rutas pendientes; esta prueba no certifica cobertura total.

Durante un bonus pendiente, el Spin observado puede servir para continuar respins. Se conserva ese control únicamente cuando el contexto anuncia continuaciones y la ronda sigue sin terminar. La operación real enviada vuelve a validarse contra el HAR. La espera de una operación se renueva cuando avanza la secuencia de acciones, siempre dentro del límite global del trabajo; los mensajes de sincronización no renuevan ese plazo.

La ejecución DEMO de 777 Fruity Coins completó `buy_spin` con `selected_mode=0`, las continuaciones y el retorno a base. Terminó PARTIAL con un `QUIET_TIMEOUT` y rutas pendientes al alcanzar siete acciones. Su HAR se guardó y su pestaña propia se cerró. Este resultado valida una ruta de compra de la familia con selector, sin afirmar que se recorrieron todas sus opciones.
