# Publicar Corona y Acero

El juego es una web estática: no necesita servidor, base de datos ni cuentas. `npm run build` genera la carpeta `dist/` con dos páginas (el juego, `index.html`, y la galería de unidades, `galeria.html`) y sus ficheros. Las rutas son relativas, así que `dist/` funciona en cualquier carpeta de cualquier servidor.

- Tamaño: unos 1,1 MB (unos 400 KB comprimido). No hay imágenes ni sonidos que descargar: el arte, la música y los efectos se generan en el navegador al arrancar.
- Las partidas guardadas viven en el navegador de cada jugador (IndexedDB), ligadas a la dirección de la web. Si cambias de dirección (de Netlify a itch.io, por ejemplo), los jugadores no verán las partidas que guardaron en la otra.

## itch.io (recomendado)

1. Genera el zip:

   ```bash
   npm run itch
   ```

   Deja `corona-y-acero-web.zip` en la raíz del proyecto, con `index.html` en la raíz del zip, como pide itch.io.

2. En itch.io: *Upload new project*.
   - **Kind of project**: HTML.
   - **Uploads**: sube el zip y marca *This file will be played in the browser*.
   - **Embed options**:
     - *Viewport dimensions*: 1280 × 720;
     - marca *Fullscreen button*;
     - deja sin marcar *Mobile friendly*, porque el juego necesita ratón y teclado;
     - *Frame options*: deja sin marcar *SharedArrayBuffer support*, que no hace falta.
   - **Pricing**: lo que quieras (gratis, o *No payments*).
   - **Visibility**: guárdalo primero como *Draft* para probarlo, y cuando esté bien pásalo a *Public*.

3. El texto de la página, las etiquetas y las capturas propuestas están en [itch.md](itch.md).

Para actualizar, vuelve a ejecutar `npm run itch` y sustituye el fichero en *Uploads*.

## Netlify

El proyecto ya trae `netlify.toml`: Netlify ejecuta `npm run build` y publica `dist/`.

- **Con un repositorio** (GitHub, GitLab…): *Add new site → Import an existing project*, y elige el repositorio. Cada cambio en la rama principal se publica solo.
- **Sin repositorio**: ejecuta `npm run build` y arrastra la carpeta `dist/` a *Sites → Deploy manually*.

## GitHub Pages

Hace falta que el proyecto esté en un repositorio de GitHub. Este proyecto todavía no es un repositorio git.

1. *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
2. Añade el flujo oficial *Static HTML* de GitHub, cambiando el paso de subida para que haga antes `npm ci && npm run build` y suba la carpeta `dist`.

Como las rutas son relativas, funciona también en la dirección `usuario.github.io/repositorio/`.

## Antes de publicar

- `npm test` en verde y `npm run build` sin errores (el build pasa antes el comprobador de tipos).
- Prueba el build tal cual se publicará: `npx vite preview` lo sirve en http://localhost:4173.
- Revisa la versión que sale en la esquina de la pantalla de título.
