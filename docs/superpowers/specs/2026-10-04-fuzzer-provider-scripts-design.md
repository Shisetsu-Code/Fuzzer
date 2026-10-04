# Fuzzer: scripts independientes por proveedor

## Objetivo aprobado
Automatizar en demos el reconocimiento de apuestas, antebet y compras, incluidas compras anidadas y elecciones posteriores. Comparar variables al cambiar la apuesta y obtener endpoints/payloads de las acciones reales. Reutilizar el arbol de interaccion de Parser. Priorizar mantenimiento simple: cada proveedor controla su flujo; diferencias de juegos antiguos se resuelven mediante excepciones explicitas.

## Primera entrega: Pragmatic
Un script providers/pragmatic controla preparacion, intro/clic central, lectura de variables, menu de compras, modificadores de apuesta, compra, elecciones, continuaciones y retorno a base. Parser, referencia 56817ddd45a864ad91087fa576319b9aad0e6436, aporta XT/Vars, sceneRoots, XTButton, FeaturePurchaseOption/V2/Manager y eventos internos. Se reutiliza codigo revisado y se documenta su procedencia; no se importa el antiguo crawler universal.

Estados: entrada -> base -> menu -> opcion -> confirmacion -> compra -> eleccion/continuacion -> base. Cada respuesta puede producir nuevas opciones. Una compra con elecciones conserva sus hijos, no se convierte en varias compras independientes. Antes de la siguiente accion se espera respuesta o cambio de estado. El clic central se permite solo en una pantalla de entrada/continuacion reconocida por reglas Pragmatic.

## Descubrimiento y ejecucion
1. Registrar doInit de la sesion y localizar el runtime Pragmatic dentro de la pestana seleccionada.
2. Leer configuracion, controles y variables economicas. purInit gobierna Buy Feature habilitado; antebet, chance y otros modificadores se registran aparte. Una captura incompleta significa desconocido, no ausencia.
3. Capturar apuesta y precios, cambiar una vez mediante eventos del cliente, esperar actualizacion y comparar. No imponer proporcionalidad si la diferencia no la demuestra; restaurar la apuesta cuando sea posible y registrar si no se consigue.
4. Ejecutar exclusivamente opciones descubiertas en DEMO. Registrar request/response de cada paso, precio observado, variable y parentesco de las elecciones. No inventar pur, bgid ni indices.
5. Completar la rama y comprobar retorno a base. Limitar pasos, tiempo y profundidad. Una transicion desconocida guarda evidencia y queda pendiente; no se improvisan clics ni se marca completa.
6. Otras ramas parten de sesion/demo nueva y reproducen su ruta. No experimentar la siguiente compra dentro de un bonus abierto.

## Repositorio y responsabilidades
providers/pragmatic contiene el flujo y sus excepciones por juego. Futuras carpetas 3oaks, rubyplay y belatra contendran sus propios scripts cuando tengan evidencia suficiente. No se entregan placeholders como proveedores funcionales. La primera entrega operativa abarca Pragmatic.

El codigo compartido se limita al transporte con HardFire, almacenamiento, limites y formato de resultados. No contiene reglas de botones, compras, elecciones ni estados de proveedores. Fuzzer es el proyecto nuevo; los repositorios anteriores permanecen sin cambios. La ampliacion puntual del MCP se prepara separadamente para ejecutar los scripts de Fuzzer sobre una pestana identificada.

## Salidas
Por juego: contrato JSON con tipos de apuestas/compras/modificadores, precios observados y relaciones, arbol de decisiones, endpoints y payloads saneados, evidencia y estado de cada rama. HAR completo privado y local para posterior analisis. Artefactos para el LLM pueden subirse por el transporte Cloudflare existente; no se crean servicios nuevos ni se incluyen credenciales/tokens en contratos. No se necesita el HAR entero para decidir un clic.

## Comprobacion
Pruebas de fixtures: menus anidados, elecciones sucesivas, intro/clic central, placeholder sin compra, modificadores pagados, cambios de precio y transicion desconocida. Prueba real en demo sobre una compra simple y una con eleccion posterior, con HAR y retorno a base. La deteccion por dominio ayuda a seleccionar/validar el proveedor, pero no sustituye el arbol.

## Alcance pendiente de implementacion
Este documento describe el trabajo; aun no contiene un runner operativo ni herramientas MCP nuevas. Primero se aprueba el diseno; despues se prepara el plan y se implementa Pragmatic. Los siguientes proveedores se incorporan individualmente a partir de sus capturas y reglas.
