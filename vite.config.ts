import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Rutas relativas para poder publicar el build en cualquier carpeta (itch.io, GitHub Pages…).
  base: './',
  server: { port: 5173, strictPort: true },
  // Dos páginas: el juego y la galería de unidades.
  build: { rollupOptions: { input: { main: 'index.html', galeria: 'galeria.html' } } },
  test: { include: ['tests/**/*.test.ts'] },
});
