# Corona y Acero

RTS de navegador de construcción de reinos, ambientado en la Baja Edad Media (c. 1250–1500), en pixel art isométrico. Nombre provisional.

- Diseño de juego: [docs/GDD.md](docs/GDD.md)
- Biblia de arte: [docs/arte.md](docs/arte.md)
- Hoja de ruta y tareas: [docs/hoja-de-ruta.md](docs/hoja-de-ruta.md)
- Publicar y página de itch.io: [docs/publicar.md](docs/publicar.md), [docs/itch.md](docs/itch.md)

## Requisitos

Node.js 22 o superior.

## Comandos

```bash
npm install
```

```bash
npm run dev
```

Abre http://localhost:5173. Sale la pantalla de título. Desde ella:
- **Tutorial**: una partida guiada paso a paso para aprender lo esencial.
- **Nueva partida**: eliges tu reino, de 1 a 3 rivales (todos contra todos, cada uno con su reino y su dificultad), el tamaño del mapa y la semilla.
- **Continuar** carga la última partida guardada y **Cargar partida** las muestra todas.
- **Opciones**: volumen, cámara, velocidad de la partida y autoguardado.

En partida, el botón *Menú* de la barra de arriba (o F10, o Esc si no hay nada seleccionado) pausa el juego. Desde ahí se guarda, se carga, se cambian las opciones o se sale al menú. Las partidas se guardan en el navegador (IndexedDB), con un autoguardado cada 5 minutos.

La galería de unidades está en http://localhost:5173/galeria.html: todas las figuras con sus animaciones, direcciones y colores.

Con parámetros en la URL la partida empieza directamente, sin pasar por el menú (útil para probar y para compartir un mapa):
- `?seed=burgos` para otro mapa.
- `?faccion=castilla|inglaterra|aragon|francia|nazari|portugal|escocia|aleatoria` para tu reino (por defecto, Castilla).
- `?rivales=1|2|3` para el número de rivales (el primero lleva la otra facción; los demás, una al azar).
- `?dificultad=facil|media|dificil` para la dificultad de la IA (por defecto, media).
- `?mapa=pequeno|mediano|grande|europa` para el mapa (si no caben todos, se agranda). En `europa` cada corona sale de su capital.
- `?ia=no` para rivales quietos, útil para probar cosas.

Se pueden combinar, por ejemplo `?faccion=inglaterra&rivales=2&dificultad=dificil`.

```bash
npm test
```

```bash
npm run build
```

El build queda en `dist/`, con rutas relativas para publicarlo en itch.io o GitHub Pages.

```bash
npm run itch
```

Hace el build y lo empaqueta en `corona-y-acero-web.zip`, listo para subir a itch.io. Cómo publicarlo en itch.io, Netlify o GitHub Pages: [docs/publicar.md](docs/publicar.md).

```bash
npm run torneo
```

Juega partidas IA contra IA en Node (novato contra media, fácil contra media, media contra difícil y una liga con los 21 enfrentamientos entre las siete coronas) y muestra el porcentaje de victorias. Tarda unos 8 minutos. Para más partidas por enfrentamiento: `TORNEO_PARTIDAS=8 npm run torneo`; para los enfrentamientos de una sola corona, su nombre: `npm run torneo -- escocia`.

```bash
npm run plantillas
```

Exporta las unidades como hojas de Aseprite para dibujar encima (ver `assets/LEEME.md`).

El juego tiene música y sonido sintetizados: suenan a partir del primer clic o tecla (el navegador no deja antes). Las unidades contestan con voz hablada en el idioma de su corona: castellano (Castilla), catalán (Corona de Aragón), inglés (Inglaterra y Escocia), francés (Francia), portugués (Portugal) y árabe (Reino Nazarí). Usan las voces que tenga instaladas el sistema; si falta la de un idioma, hablan en castellano, y si tampoco hay voz en español, con voces sintetizadas. El botón *Sonido* de la barra superior lo silencia todo; los volúmenes y el tipo de voces están en *Opciones*.

## Controles (prototipo)

| Acción | Control |
|---|---|
| Seleccionar | Clic o arrastrar un recuadro (el recuadro solo coge unidades propias) |
| Añadir a la selección | Shift + clic o Shift + recuadro |
| Todas las del mismo tipo en pantalla | Doble clic sobre una unidad |
| Orden contextual: mover, recolectar, construir, entregar, atacar, cazar | Clic derecho |
| Guarecerse en un edificio | Alt + clic derecho |
| Reparar un edificio propio dañado (con aldeanos) | Clic derecho sobre él, o E y clic (Shift para varios) |
| Derribar el edificio seleccionado | Supr dos veces, o el botón junto a su nombre (unos cimientos se cancelan a la primera) |
| Ataque-mover (con unidades militares) | Q y clic en el destino |
| Posturas (con unidades militares) | A agresiva · S defensiva · D mantener posición · F no atacar |
| Grupos de control | Ctrl + 1–9 asigna · 1–9 selecciona (dos veces: centra) |
| Minimapa | Clic: mover la cámara · clic derecho: mover las unidades |
| Punto de reunión (con un edificio seleccionado) | Clic derecho en el suelo o sobre un recurso |
| Botones del panel de órdenes | Q W E R / A S D F / Z X C V |
| Edificios del aldeano | Q económicos · W militares (y luego la tecla de cada edificio; V vuelve) |
| Trazar un muro o empalizada | Arrastrar con el botón izquierdo |
| Investigar o avanzar de era | Botones del edificio seleccionado (el avance de era está en el centro de la villa) |
| Convertir (monjes) / ruta de comercio (carros) | Clic derecho sobre la unidad enemiga / sobre otro mercado propio |
| Colocar varios edificios seguidos | Shift + clic |
| Cancelar colocación o soltar la selección | Esc o clic derecho |
| Menú y pausa (guardar, cargar, opciones) | F10, botón *Menú* o Esc sin nada seleccionado |
| Siguiente aldeano ocioso | . (punto) |
| Ir al Centro de la villa | H |
| Ir al último ataque recibido | Espacio |
| Mover la cámara | Flechas o llevar el ratón al borde |
| Zoom (entero: x1–x4) | Rueda del ratón |
| Arrastrar la cámara | Botón central |
| Mostrar u ocultar la rejilla | G |
| Panel de depuración | ` (tecla a la izquierda del 1) |
| Crear 5 unidades bajo el cursor (depuración) | U milicia · I arquero · O lancero · P batidor (con Shift: del jugador rojo) |
| Revelar el mapa (depuración) | M |

## Estructura

```
src/
  engine/   bucle de tick fijo, PRNG con semilla, punto fijo, hash (sin Pixi ni DOM)
  data/     recursos, unidades, edificios, fuentes, eras, tecnologías, facciones (datos de equilibrado)
  map/      terreno, mapa y generador procedural
  sim/      simulación determinista: ECS, órdenes, A*, movimiento, recolección,
            construcción, producción, población, combate, niebla, tecnologías, monjes,
            asedio, comercio y victoria (sin Pixi ni DOM)
  game/     lado del jugador: selección, panel de órdenes, clic derecho, escenario inicial
  render/   geometría isométrica, cámara, arte generado (figuras, edificios, terreno, recursos) y render con PixiJS
  gallery/  galería de unidades (galeria.html): todas las figuras, animaciones y direcciones
  input/    cámara, selección y órdenes con el ratón
  ui/       HUD con Preact (barra de recursos, selección, panel de órdenes) e iconos
tests/      tests de Vitest
docs/       diseño, arte y hoja de ruta
```

La simulación es determinista y está separada del render (ver GDD §14): todo lo que entra en `engine/`, `data/`, `map/`, `sim/` y, más adelante, `ai/` no puede importar Pixi ni usar `Math.random`, y dentro de `sim/` las posiciones y velocidades son enteros en punto fijo.
