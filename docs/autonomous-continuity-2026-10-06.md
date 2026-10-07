# Continuidad autónoma: ejecución y estado verificable

Fecha local argentina: 6 de octubre de 2026; UTC: 7 de octubre.
Base: `dd9313b363113ed4a1e1c4e87a41155b7f68e929`, PR #1.

## Diagnóstico

La tanda live sí descubría y ejecutaba dentro del mismo trabajo. Sin embargo,
`.github/workflows/pragmatic-new5.yml` imponía 600000 ms. Al agotarlo, devolvía
PARTIAL/DEADLINE y la cola no continuaba en otro tramo. Los checkpoints previos
servían para rescatar evidencia, no para restaurar el scheduler.

El MCP también tiene dos entradas distintas: `pragmatic_explore_start` ejecuta
el árbol; `pragmatic_fuzz_start` mantiene un modo discovery-only explícito cuando
execute=false. No se cambió esa autorización silenciosamente.

## Cambios

- Campaña única, tramos cooperativos de ocho intentos de ruta. No se corta una
  operación sana solo para cambiar de tramo. Se guarda/cierra antes de continuar.
- FIFO y reintentos separados, estado versionado, nodo/tarea/planes/contadores
  restaurables. Las hermanas siguen pendientes aunque compartan destino.
- Plazo global de 20 minutos de exploración: el tiempo de guardado y cierres
  intermedios lo consume. No se recargan acciones ni reintentos en cada tramo.
- Escritura atómica y sincronizada antes de las entradas, lock exclusivo por
  campaña, rechazo de diario sucio/corrupto/incompatible. Fallo de persistencia,
  limpieza o consolidación impide avanzar a otra sesión.
- Una entrada interrumpida no se certifica como éxito. Se conserva como incierta
  y cualquier reintento permitido reconstruye desde raíz en una sesión limpia.
- HAR acumulativo entre tramos. Sus fuentes originales se mantienen privadas.
  La exportación omite resumeState/savedHarPaths y evita duplicar fuentes ya
  incluidas en el agregado usando identidad de archivo y SHA-256, no el payload.
- El MCP de ejecución comparte defaults de 100 acciones, profundidad 8 y
  1200000 ms. El workflow deja de sobrescribir el tiempo con diez minutos.

## Verificación

Baseline del source bundle: 414/414, Node 22.16.0/Linux; árbol
`951ffbd29f669f70768c2d82e303b8ac45b5646e`, idéntico al commit base publicado.
Las nuevas regresiones de continuidad, persistencia, límites, defaults,
consolidación y privacidad se ejecutaron contra el comportamiento anterior y
fallaron antes de aplicar las correcciones correspondientes.

La prueba integrada usa el adaptador HardFire real con fronteras de navegador
simuladas: tres tramos, tres sesiones creadas/cerradas, tres acciones distintas,
cero giros extra y tres entradas en el HAR consolidado. Es determinista, no una
afirmación sobre pantallas live. El replay de un checkpoint previo a una entrada
mantiene su incertidumbre y consume el intento, sin fabricar una arista exitosa.

Comandos:

```sh
npm test
node --experimental-test-module-mocks test/fixtures/campaign-integration-runner.mjs
node --check lib/explorer-campaign.js
git diff --check
```

Suite local final: **435/435**, cero fallos, cancelaciones u omisiones, 26.996 s.
La integración confirma 3 tramos / 3 sesiones cerradas / 3 acciones / 3 entradas HAR.
`node --check` y `git diff --check` aprobados. Actions se verifica por separado;
no se deduce su resultado del ensayo local.
Revisión propia separada del diff y de los riesgos; no revisión independiente.
Durante ella se detectó la duplicación de HAR retenidos y se añadió una regresión
que exige conservar tres exchanges distintos sin duplicar sus archivos fuente.

## Límites explícitos

No es una garantía de terminar todos los juegos. Una UI no soportada o una
continuación bloqueada sigue registrada como pendiente. Al agotar 20 minutos,
acciones, profundidad o reintentos se informa PARTIAL y la causa exacta. No se
eliminan estas barreras para aparentar autonomía infinita.

No hay reinicio general autónomo de Electron/HardFire tras un crash. Un diario
sucio o lock retenido bloquea la reanudación hasta recuperar la propiedad de las
sesiones; no basta con asumir que el proceso anterior murió. La reanudación
admitida desde disco parte de un checkpoint con cierre confirmado y conserva
el plazo original. Una campaña ya finalizada no comienza de nuevo al leerla.

Las esperas guardadas no hacen atómica la UI ni cancelan transaccionalmente
comandos de navegador ya enviados. El cierre final tiene su margen de seguridad
separado. `completeGame` continúa en false. Las pruebas live del nuevo commit se
registran separadas: iniciarlas no acredita que sus bonus se hayan resuelto.
