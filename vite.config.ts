import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // La versión de package.json, para el menú (y la misma que la de la versión de escritorio).
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Rutas relativas para poder publicar el build en cualquier carpeta (itch.io, GitHub Pages…).
  base: './',
  server: { port: 5173, strictPort: true },
  // Dos páginas: el juego y la galería de unidades.
  build: { rollupOptions: { input: { main: 'index.html', galeria: 'galeria.html' } } },
  test: { include: ['tests/**/*.test.ts'] },
});
