# Registro de implementación

- Diseño y plan aprobados. Ejecución nativa autorizada hasta completar el trabajo.
- Ruling: usar el checkout nuevo `Fuzzer-MCP` y la rama `feat/offline-har-mcp` como aislamiento existente; no crear otra copia/worktree. El repositorio de trabajo del usuario no se modifica.
- Ruling: usar SDK MCP v1 1.32.1 y Zod 4.6.5, versiones comprobadas en npm y API oficial v1; evitar una migración del explorador existente.
- Ruling: publicar solo la rama de adaptación, sin merge en main; el plan aprobado incluye entrega en GitHub.
- Tarea 1: ocho pruebas nuevas fallaron por módulos ausentes y luego pasaron. La suite base mostró errores EPERM al renombrar archivos en el TEMP del sandbox; repetir con TEMP dentro de outputs, sin cambiar código del explorador.
- Suite existente más tarea 1: 193 pruebas pasan al usar TEMP local.
- Tarea 2 RED: módulos ausentes. Primera ejecución encontró un error en la fixture del test: no contenía un giro normal y esperaba una sola continuación aunque había cascada y cobro. Se agregó un giro normal y se exigieron dos continuaciones.
- Ruling: parser offline separado del parser del explorador. `parseInit` actual infiere cero compras cuando falta purInit; el análisis offline conserva UNKNOWN. Cambiar el parser del explorador queda fuera del alcance y podría alterar sus contratos.
