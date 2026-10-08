# Registro de implementación

- Diseño y plan aprobados. Ejecución nativa autorizada hasta completar el trabajo.
- Ruling: usar el checkout nuevo `Fuzzer-MCP` y la rama `feat/offline-har-mcp` como aislamiento existente; no crear otra copia/worktree. El repositorio de trabajo del usuario no se modifica.
- Ruling: usar SDK MCP v1 1.32.1 y Zod 4.6.5, versiones comprobadas en npm y API oficial v1; evitar una migración del explorador existente.
- Ruling: publicar solo la rama de adaptación, sin merge en main; el plan aprobado incluye entrega en GitHub.
- Tarea 1: ocho pruebas nuevas fallaron por módulos ausentes y luego pasaron. La suite base mostró errores EPERM al renombrar archivos en el TEMP del sandbox; repetir con TEMP dentro de outputs, sin cambiar código del explorador.
- Suite existente más tarea 1: 193 pruebas pasan al usar TEMP local.
- Tarea 2 RED: módulos ausentes. Primera ejecución encontró un error en la fixture del test: no contenía un giro normal y esperaba una sola continuación aunque había cascada y cobro. Se agregó un giro normal y se exigieron dos continuaciones.
- Ruling: parser offline separado del parser del explorador. `parseInit` actual infiere cero compras cuando falta purInit; el análisis offline conserva UNKNOWN. Cambiar el parser del explorador queda fuera del alcance y podría alterar sus contratos.
- Ruling: una solicitud con pur que falla no demuestra disponibilidad. La presencia necesita inventario anunciado o respuesta aceptada con opción anunciada/transición de feature; los intentos permanecen visibles por separado.
- Ruling: añadir bundle autónomo con esbuild para que la distribución local funcione sin node_modules ni instalaciones durante el análisis. El código fuente y la consola conservan dependencias fijadas.
- Tarea 3 RED: servidor ausente cerró negociación MCP. GREEN: cliente real lista seis herramientas y completa llamadas offline. Se corrigió el orden de limpieza de la prueba en Windows (cerrar proceso antes de borrar su cwd).
- HAR real 3 Oaks: 184 entradas, 39.365.022 bytes; carga 75 ms, consulta 13 ms, resumen 8 ms en una ejecución local, sin comparación de rendimiento contra UI. Se excluyeron assets sin campos de petición del resumen de funciones tras prueba RED/GREEN.
- Suite de tarea 3: 207 pruebas pasan. Fuente y bundle autónomo negocian MCP y completan las seis llamadas. Prueba real por MCP: 31 intercambios del endpoint DEMO, índices contrastados con original y hash del HAR sin cambios.
- MCP `fuzzer-har` registrado en Codex con ruta absoluta al bundle; segunda instalación confirmó idempotencia. Catálogo de esta conversación no se recarga automáticamente: configuración comprobada y cliente MCP real verificado, sin afirmar una llamada mediante el catálogo del host actual.
- Revisión independiente: cuatro hallazgos (sesiones sid/sessionId en query mezcladas, init con errores certificando ausencia, acciones solo en query ignoradas y etiquetas de sesión ocultas). Tres pruebas nuevas reprodujeron los cuatro hallazgos; correcciones pasaron. Campos del cuerpo prevalecen sobre query; `session_label` conserva etiqueta opaca sin exponer credenciales.
