import { defineConfig } from 'vitest/config';

/** `npm run plantillas`: exporta las figuras generadas como hojas de Aseprite (ver scripts/plantillas.tool.ts). */
export default defineConfig({ test: { include: ['scripts/plantillas.tool.ts'], testTimeout: 120_000 } });
