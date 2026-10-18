# GitHub Playwright worker: benchmark real de Pragmatic, 17-10-2026

## Resultado comprobado

GitHub Actions, `ubuntu-latest`, Node 22, Playwright 1.56.1 y un solo proceso Chromium
con dos contextos DEMO simultáneos. Los cuatro enlaces corresponden a demos oficiales:
Death Dominion, Coven Rising, Candy Rush y Alien Invaders.

- [Ejecución final con compra DEMO y evidencia](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39057679586).
- [Ejecución inicial, antes de corregir el gate](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39055556646).
- Script ejecutado: `scripts/benchmark-pragmatic-worker.mjs`.
- Workflow: `.github/workflows/pragmatic-worker-benchmark.yml`.
- Evidencias: artefacto `pragmatic-multi-game-benchmark`, con capturas JPEG,
  JSON por juego y `summary.json`.

El arranque del proceso Chromium en la prueba final tomó **263 ms**. La instalación
de Playwright en el runner demoró aproximadamente **1,9 s**, y la instalación de
Chromium y dependencias aproximadamente **18,8 s**, efectuadas **una vez** por
trabajo. El lote de cuatro juegos con dos páginas simultáneas tardó **39,66 s**
después de comenzar el script. En cada juego se creó **un contexto aislado**,
sin relanzar Chromium.

| Juego | Total de su contexto | Catálogo | Espera del runtime | Espera controles |
| --- | ---: | ---: | ---: | ---: |
| Death Dominion | 15,90 s | 0,83 s | 1,64 s | 2,32 s |
| Coven Rising | 15,67 s | 0,97 s | 1,62 s | 1,80 s |
| Candy Rush, cuatro decisiones guiadas | 23,60 s | 0,70 s | 1,56 s | 2,44 s |
| Alien Invaders | 14,75 s | 0,81 s | 1,01 s | 2,83 s |

Medias por juego de las fases comunes: confirmación de edad **51 ms**,
escaneo/filtrado **155 ms**, captura JPEG completa **1.133 ms**, cierre tardío
de consentimiento **1.849 ms** y espera visual de seguridad configurada en
**7.000 ms**. Esa espera visual es **artificial**, no tiempo de red ni certeza
de que el juego esté listo: en varios juegos la captura aún mostraba una
intro. Por eso las observaciones del runtime se registran como
`CONTROLS_EXTRACTED_VISUAL_UNVERIFIED`, nunca como compras completas.

## Prueba de acciones seleccionadas con evidencia visual

En Candy Rush, usando una sola sesión DEMO de este juego en un worker compartido
con los otros tres, se aprobaron de forma explícita y consecutiva:
1. `PlayButtonIntro` observado en una captura anterior. Se pulsó y la nueva
   captura confirmó el tablero base. En la ejecución final, clic **99,8 ms**.
2. `Buy Feature — 3 Options` identificado visualmente y confirmado por
   `FeaturePurchase/MainButton`. Se abrió el menú, clic **5,8 ms**.
3. `Option1 — Free Spins — $200.00`. Se observó la ventana
   `Confirm Buy` con `CANCEL` y `YES`. Clic **3,8 ms**.
4. `ConfirmPurchaseWindow/AcceptButton/Colliders/ColliderOption1`,
   etiqueta `YES`. Clic **47,8 ms**; respuesta del servidor **1.039 ms**
   después del clic, con `action=doSpin`, `pur=0`, `bl=0`,
   estado HTTP **200**. La captura mostraba el crédito DEMO de
   **100.000 a 99.800**, con `GOOD LUCK!` y el giro de bonus en curso.

**La compra DEMO quedó enviada y aceptada. No se completó ni verificó
la finalización de los Free Spins**, por lo que no se declara verificación de
todo el ciclo. No hubo dinero real, credenciales ni reenvíos automáticos
de la compra. El resultado aleatorio del giro no se interpretó como ruta.

El runner pudo extraer las tres opciones del menú sin comprar las otras
dos: Free Spins $200, Super Free Spins 1 $600 y Super Free Spins 2 $1.500
(precios observados con base de apuesta DEMO de $2).

## Hallazgos de fiabilidad

La primera corrida tardó 183 s y detectó cero runtimes porque los avisos
de cookies y mayoría de edad impedían entrar. El botón de edad era un
`button[data-age-gate-confirm="true"]`; los clics de puntero tardaban
10 s sin ejecutarlo. Se sustituyó **solo ese botón del catálogo** por
una activación DOM explícita, quedando en 28–77 ms según el juego.
El juego y sus compras siempre reciben clics reales de Playwright
sobre colliders observados, jamás un `element.click()` directo.

El consentimiento de cookies aparece de forma tardía, por lo que se
recomprueba antes de extraer las capturas. Se registraron errores de
`postMessage` con destino `http://`, y en Candy Rush un error de
decodificación de audio; no impidieron el `doSpin pur=0` confirmado.

La captura de una intro puede mostrar controles del runtime que están
ocultos detrás de splash o overlays. **Una lista de botones no demuestra
que sean pulsables**: el agente debe revisar una captura y la transición
antes de decidir. Los controles superpuestos necesitan desambiguación
geométrica y validación de estado.

## Optimizaciones priorizadas

1. **Mantener un Chromium por worker y agrupar enlaces**. La instalación
   inicial del navegador (~19 s) se amortiza entre todos los juegos del lote.
   GitHub-hosted runners son efímeros: un nuevo job vuelve a instalar
   dependencias salvo uso de caché/imagen preinstalada.
2. **Sustituir los 7 s fijos de seguridad visual** por verificación
   del controlador activo y capturas event-driven. Ahorro potencial:
   hasta 7 s por juego, sujeto a validar que el juego está visible.
3. **Resolver consentimiento una sola vez por contexto**, pero
   soportar aparición tardía (1,85 s de media en esta muestra).
4. **Capturar imágenes solo cuando cambie el estado o la acción**.
   Los JPEG costaron ~1,13 s frente a ~0,16 s del escaneo;
   no hacer capturas reiteradas cada 500 ms.
5. **No inferir un número fijo de compras**, no pulsar controles
   cuyo collider cambió, y mantener el grafo parcial si falta verificación
   de la operación o del retorno a base.
6. La modalidad realmente **guiada por el asistente** necesita acceso
   a sus observaciones y herramienta de decisión durante la sesión.
   Esta ejecución de GitHub probó una **secuencia de decisiones
   preseleccionadas por revisión de capturas**, no un agente LLM
   conectado al worker en tiempo real.

La muestra de cuatro juegos no justifica extrapolar un tiempo definitivo
a 600 juegos: el desarrollo de los bonos, las elecciones y sus cierres
pueden dominar el tiempo. Se conservan los JSON y capturas de cada corrida
para comparar sin confundir éxito parcial con cobertura completa.
