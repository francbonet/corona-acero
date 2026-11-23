# Arte dibujado a mano

Mientras no haya arte definitivo, el juego **genera** las unidades con su modelador de figuras (`src/render/rig/`). Cualquier unidad se puede sustituir por una hoja dibujada en Aseprite:

1. Ejecuta `npm run plantillas`. En `assets/plantillas/` aparece una hoja PNG + JSON por unidad (`aldeano.png`, `aldeano.json`…), con el formato que espera el juego.
2. Abre la plantilla en Aseprite y dibuja encima, sin mover la rejilla de fotogramas.
3. Exporta como hoja de sprites: PNG + JSON en formato **Array**, con las etiquetas ("tags") y los slices.
4. Copia el PNG y el JSON a `assets/units/` con la clave de la unidad como nombre (`assets/units/aldeano.png`).

Reglas de la hoja:
- **Etiquetas** `<animación>/<dirección>`. Animaciones: `reposo`, `andar`, `atacar`, `morir`, y en el aldeano también `talar`, `minar`, `cosechar` y `construir`. En el trabuquete, además, `montar` y `montado`. Direcciones: `S`, `SO`, `O`, `NO` y `N` (las de la derecha salen en espejo).
- **Color de equipo**: los 4 magentas reservados `#ff00ff`, `#cc00cc`, `#990099` y `#660066` (de claro a oscuro) se cambian por el color de cada jugador.
- **Pies**: un slice llamado `pies` con su pivote donde apoya la figura. Sin él, se toma el centro de la fila 5 píxeles por encima del borde inferior.
- La duración de cada fotograma se toma de la hoja.
