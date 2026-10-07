# Continuidad autónoma del explorador

El descubrimiento y la ejecución pertenecen a la misma campaña. Conservar todas
las opciones observadas, aunque compartan resultado, y recorrerlas en FIFO BFS.
No reemplazar fallos de UI por más tiempo ni declarar cobertura completa.

Mantener DEMO oficial, sin credenciales ni dinero real, cuatro pestañas globales
y dos jobs. El máximo fijado por el usuario es 20 minutos por juego. Los límites
de acciones, profundidad y reintentos pertenecen a la campaña, no a cada tramo.

Implementar checkpoints versionados de nodos, colas nueva/reintentos, metadatos
de rutas, planes de elección, contadores y tarea interrumpida. Una reanudación
reconstruye desde la raíz en sesión limpia y revalida controles; nunca restaura
coordenadas/handles de un navegador ni certifica una entrada incierta.

El supervisor continúa automáticamente después de tramos cooperativos de ocho
intentos de ruta (no interrumpe una operación sana al alcanzar ese umbral).
Guarda el estado de forma atómica antes de las entradas. No continúa tras un
fallo de escritura, limpieza incierta, corrupción, identidad incompatible o
agotamiento de los límites globales. Conserva los HAR de todos los tramos.

Reanudar desde disco es seguro únicamente desde un checkpoint que confirme
cierre de todas las sesiones propias. Un proceso muerto durante una entrada
no autoriza por sí solo otra ejecución: no se afirma reinicio general del host.
No se repiten automáticamente rutas con reintentos agotados.

El estado privado de planificación no se publica en el exportador de evidencia.
Los resultados públicos incluyen número de tramos y motivo de parada. El modo
antiguo discovery-only sigue explícito; no cambiar su autorización por defecto.
