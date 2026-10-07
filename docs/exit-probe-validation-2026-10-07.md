# Validación dirigida: separar preparación y prueba de salida

Código funcional: `dc07a738bf249b9b99a46d9d67cf5fea84aa93fe`.

La corrida `37582080973` se ejecutó realmente y duró 122.146 s. El primer
intento de abrir el menú terminó ACTIVE_TIMEOUT. Se recuperó automáticamente
en una sesión limpia, abrió el menú y recorrió cancelar. El tope diagnóstico
de tres acciones se agotó antes de enviar una compra: hubo cero compras y cero
pruebas de salida. Todas las sesiones quedaron cerradas. El gate de cierre
rechazó correctamente esta corrida; no es evidencia de éxito del nuevo criterio.

Ese límite suponía implícitamente que la preparación nunca requeriría un
reintento. La prueba diagnóstica pasa a ocho acciones dentro de los mismos ocho
minutos, para poder alcanzar la compra aun con preparación fallida. No cambia
el código funcional, FIFO ni el presupuesto de veinte minutos de producción.
El gate sigue exigiendo un cierre sustentado por un giro normal aceptado.

Artefacto `11465190399`, SHA-256 verificado al descargar:
`4c656764102ac6f01a4251b61e8e6c9a9c598c059cbbfce6051d7feed4006e21`.
La siguiente corrida se informa por separado, sin deducir éxito por lanzarla.
