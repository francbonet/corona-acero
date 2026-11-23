import { defineConfig } from 'vitest/config';

/**
 * Torneo de IA contra IA en Node (`npm run torneo`): varias partidas por enfrentamiento, en paralelo
 * (un fichero por enfrentamiento) y un resumen al final. `TORNEO_PARTIDAS=8 npm run torneo` para más partidas.
 */
export default defineConfig({
  test: {
    include: ['scripts/torneo/*.torneo.ts'],
    globalSetup: ['scripts/torneo/resumen.ts'],
    testTimeout: 60 * 60 * 1000,
  },
});
