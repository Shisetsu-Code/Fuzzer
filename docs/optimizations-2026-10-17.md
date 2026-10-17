# Optimizaciones de fuzzer y GitHub workers — 17/10/2026

## Cambios aplicados

Se conservaron los modos DEMO aislados: el agente es responsable de elegir cada
acción; el explorador automático no se usa en el flujo guiado. No se manipulan
compras reales ni se predice el resultado aleatorio.

1. **Preparación sin espera fija de 7 segundos** en
   `scripts/benchmark-pragmatic-worker.mjs`. Un nuevo
   `providers/pragmatic/readiness.js` detecta y estabiliza las pantallas
   `INTRO`, `BASE_CONTROLS`, `PURCHASE_OPTIONS` y
   `CONFIRM_PURCHASE`, con dos observaciones consecutivas y vigilancia
   de overlays; las transiciones dejan de usar pausas arbitrarias de
   1.800, 950 y 2.200 ms.
2. **Cookies tardías:** `page.addInitScript` instala un
   `MutationObserver` limitado al catálogo `www.pragmaticplay.fun`
   que pulsa *rechazar cookies* cuando aparece ese botón. La
   confirmación de edad conserva su selección explícita. Se evita
   insistir con clics del catálogo que ya habían demostrado fallar.
3. **Capturas por estado:** las fotografías se guardan cuando cambia
   la firma de los botones y etiquetas observados; se omiten capturas
   duplicadas. Tras un `doSpin pur` se conserva una captura de
   evidencia incluso si la firma no cambió.
4. **Modo guiado HardFire:** antes de enviar el clic se refrescan
   flags, rutas y huellas, pero no se genera un JPEG nuevo si la
   captura del estado sigue vigente. El clic valida la huella del
   control contra un escaneo fresco y proyecta el collider del
   iframe al viewport sin crear una segunda fotografía/crop.
   El sistema **no** elimina la protección de superficie pintada
   ni el requisito de revisar visualmente las evidencias.
5. **GitHub Actions:** el workflow permite especificar 2–30 URLs
   DEMO y concurrencia 1–2 mediante `workflow_dispatch`;
   dentro de cada job se lanza **un** Chromium para todos los
   enlaces. Las pruebas y el benchmark guardan resultados y
   capturas; si no se observa ningún juego, el job falla en
   lugar de mostrar éxito engañoso.
6. **Pruebas:** se añadieron regresiones para clasificación
   de pantallas, estabilidad, oclusión por cookies, estado inestable,
   proyección del collider y huella sin modificar objetos.

## Medición real: misma muestra de cuatro juegos

| Medición | Benchmark anterior | Optimizado |
|---|---:|---:|
| GitHub Actions | [run 39057679586](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39057679586) | [run 39058704315](https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39058704315) |
| Chromium: arranque del proceso | 263,2 ms | 206,9 ms |
| Lote de cuatro URLs, dos contextos simultáneos | 39,66 s | **36,06 s** |
| Mediana por juego | 15,79 s | 14,00 s |
| Espera visual de 7 segundos | 7.000 ms fijos por juego | Eliminada; detector variable |

**Diferencia observada:** 3,59 s menos para el lote (**aproximadamente
9,1 %**). Una sola muestra de cada versión no demuestra que toda
la diferencia sea causal. El coste de cargar juegos y realizar
capturas sigue dominando; las nuevas esperas dependen del estado.

La nueva ejecución comprobó los cuatro runtimes, y Candy Rush
repitió `action=doSpin, pur=0, bl=0, HTTP 200` después de
las decisiones previamente aprobadas para ese juego. Eso
confirma el **envío y aceptación DEMO**: el cierre del bonus
todavía no quedó validado. Las pantallas filtradas se exponen
como `CONTROLS_EXTRACTED_VISUAL_UNVERIFIED`, no como
confirmaciones visuales automáticas.

## Lo que no está validado

- La **mejora de clics sin screenshot intermedio en HardFire** tiene
  pruebas unitarias de proyección y fingerprint, pero no una prueba
  end-to-end en el HardFire local porque el agente de la PC no está
  conectado.
- El runner de GitHub **no incorpora un LLM en vivo** durante este
  benchmark: utilizó una secuencia de acciones seleccionadas tras
  revisar previamente las capturas reales. El modo MCP guiado ofrece
  decisiones dinámicas en cada paso, pero necesita acceso al navegador
  HardFire para operar.
- No se han completado 600 juegos ni sus bonus. No extrapolar
  cobertura ni latencia por juego de esta muestra pequeña.

## Próximas mediciones recomendadas

Ejecutar la misma lista 3–5 veces en el worker y separar instalación
de dependencias, inicio de Chromium, carga de runtime, estabilización,
detección de overlay, scans y capturas. Medir tiempos P50/P95 por etapa,
además del total y de las operaciones DEMO realmente confirmadas.
