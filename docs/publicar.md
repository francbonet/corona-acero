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

Repositorio: [francbonet/corona-acero](https://github.com/francbonet/corona-acero).

El flujo [Publicar en GitHub Pages](../.github/workflows/pages.yml) publica automáticamente cada cambio de `main`. Instala las dependencias con `npm ci`, ejecuta los tests, compila el juego y sube únicamente `dist/`. Si falla una comprobación, no se publica esa versión.

Configuración inicial: *Settings → Pages → Build and deployment → Source*: **GitHub Actions**. Un repositorio privado necesita un plan de GitHub que permita Pages; no hace falta hacer público el código si el plan lo admite. La web publicada puede ser pública aunque el repositorio sea privado.

Para repetir un despliegue sin cambiar el código: *Actions → Publicar en GitHub Pages → Run workflow* sobre `main`. El resultado y la dirección publicada aparecen en la ejecución.

Como las rutas son relativas, funciona también en la dirección `usuario.github.io/repositorio/`.

## Versión de escritorio (Electron)

`npm run escritorio:mac`, `escritorio:win` y `escritorio:linux` generan los instaladores en `release/`. Se pueden generar los tres desde un Mac. Ocupan unos 110–125 MB cada uno, porque llevan su propio Chromium.

- **Cómo está hecha**: `electron/main.cjs` abre una ventana con el build de `dist/`, servido por un protocolo propio (`corona://juego/`).
  - Las partidas guardadas van a la carpeta de datos de la aplicación y no se mezclan con las del navegador.
  - El sonido empieza sin esperar al primer clic.
  - F11 pone la pantalla completa.
- **Por qué hay un script**: electron-builder no acepta rutas con caracteres como «&». Por eso `scripts/escritorio.mjs` empaqueta en una carpeta temporal y copia el resultado a `release/`.
- **Sin firmar**: los instaladores no llevan firma digital, así que los sistemas avisan la primera vez.
  - macOS: clic derecho sobre la aplicación → *Abrir* → *Abrir*. Si dice que está dañada (pasa con lo que se descarga de internet), hay que quitarle la marca de descarga: `xattr -dr com.apple.quarantine "/Applications/Corona y Acero.app"`.
  - Windows: en el aviso de SmartScreen, *Más información* → *Ejecutar de todas formas*.
  - Linux: dar permiso de ejecución al `.AppImage` (`chmod +x`).
- **Firmar**: para quitar los avisos hace falta una cuenta de desarrollador de Apple (firma y notarización) y un certificado de firma de código para Windows. Se configuran en el campo `build` de `package.json` (`mac.identity`, `win.certificateFile`…).
- **itch.io**: acepta los instaladores. Se suben como archivos de la página, marcando cada uno con su sistema (y se pueden subir también con [butler](https://itch.io/docs/butler/)).
- La versión (`version` en `package.json`) es la misma que sale en la pantalla de título y en el nombre de los instaladores.

## Antes de publicar

- `npm test` en verde y `npm run build` sin errores (el build pasa antes el comprobador de tipos).
- Prueba el build tal cual se publicará: `npx vite preview` lo sirve en http://localhost:4173.
- Revisa la versión: la de `package.json`, que sale en la esquina de la pantalla de título y en los instaladores de escritorio.
- Para la versión de escritorio: `npm run escritorio:prueba` tras el build.
