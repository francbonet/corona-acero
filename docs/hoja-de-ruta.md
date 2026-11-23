# Corona y Acero — Hoja de ruta

Estimaciones orientativas para 1 persona a media jornada: unos **6–8 meses** hasta la 1.0. Las tareas de diseño y arte de cada fase pueden avanzar en paralelo a las de programación.

Detalle de diseño en [GDD.md](GDD.md) y de estilo en [arte.md](arte.md).

---

## Fase 0 — Preproducción (1–2 semanas)

**Hecho cuando:** se ve un mapa isométrico pixel-perfect y uno se puede mover por él.

### Programación
- [x] Repositorio git y proyecto Vite + TypeScript + PixiJS + Vitest
- [x] Conversión de coordenadas casilla ↔ pantalla (`src/render/iso.ts`)
- [x] PRNG con semilla (`src/engine/rng.ts`)
- [x] Bucle de tick fijo con interpolación (`src/engine/loop.ts`)
- [x] Mapa de prueba 64×64 con casillas placeholder generadas por código
- [x] Cámara: WASD, flechas, borde de pantalla, zoom entero con la rueda
- [ ] ESLint + Prettier

### Diseño y arte
- [x] GDD
- [x] Biblia de arte
- [ ] Paleta definitiva (`assets/palette.hex`)
- [ ] Primera casilla de hierba dibujada a mano
- [ ] Primer aldeano de prueba (reposo y andar en 5 direcciones)

---

## Fase 1 — Motor sandbox (2–3 semanas)

**Hecho cuando:** 50 unidades se mueven por el mapa a 60 fps. ✔ Medido: 58 unidades a más de 100 fps; 450 unidades a 0,3 ms por tick de simulación.

### Programación
- [x] ECS propio (arrays tipados) y mundo de simulación (`src/sim/`)
- [x] Punto fijo (`src/engine/fixed.ts`): 1 casilla = 256 unidades
- [x] Cola de comandos (`Command`) y aplicación por tick, con registro para repeticiones
- [x] Selección por clic y por recuadro; Shift para añadir; doble clic para el mismo tipo
- [x] Rejilla de paso y A* (8 direcciones, sin cortar esquinas, suavizado) con presupuesto por tick
- [x] Movimiento con separación local, reparto de huecos en grupo y gestión de atascos
- [x] Orden de profundidad isométrico (árboles y unidades) e interpolación entre ticks
- [x] Test de determinismo: misma semilla + mismos comandos = mismo hash de estado

### Diseño y arte
- [ ] Juego de casillas base con transiciones (hierba, tierra, agua) — pendiente: hoy los bordes entre terrenos son rectos
- [x] Árboles (3 especies) — provisionales generados por código
- [x] Placeholders de unidades con color de equipo (`src/render/unit-sprites.ts`, editables como texto)

---

## Fase 2 — Economía (3–4 semanas)

**Hecho cuando:** se puede jugar una apertura económica hasta 100 de población. ✔ Medido: un guion automático (`tests/helpers/eco-script.ts`) llega a 100 en 22,8 min de partida desde las condiciones iniciales del GDD.

### Programación
- [x] Nodos de recurso (árbol, bayas, minas, ovejas) — la caza (ciervos, jabalíes) pasa a la Fase 3, con el combate
- [x] Recolectar → cargar → entregar en el punto más cercano → volver (y buscar otra fuente igual al agotarse)
- [x] Colocación de edificios (fantasma verde o rojo, rejilla)
- [x] Construcción por aldeanos (varios a la vez, con rendimiento decreciente; Shift para encadenar obras)
- [x] Colas de producción y puntos de reunión (sobre el suelo o sobre un recurso)
- [x] Población y casas (la producción espera si no hay hueco)
- [x] Granjas (finitas, se replantan pagando madera; requieren molino)
- [x] HUD: recursos, población, panel de selección y panel de órdenes con atajos (Preact)
- [x] Botón de aldeano ocioso (tecla `.`)

### Diseño y arte
- [x] Animaciones del aldeano: andar, trabajar y carga a cuestas — provisionales
- [x] Centro de la villa, casa, molino, aserradero, campamento minero, granja (y cuartel) — provisionales generados por código
- [x] Iconos de recursos y marco del HUD — provisionales
- [x] Fuente pixel elegida e integrada: Pixelify Sans para textos y Silkscreen para cifras (ambas OFL, servidas en local)

---

## Fase 3 — Combate (3–4 semanas)

**Hecho cuando:** hay batallas de prueba con contraataques que se notan. ✔ Medido en `tests/combat.test.ts` a igual coste: 8 lanceros vencen a 6 batidores sin bajas; 6 batidores a 7 arqueros (quedan 5); 7 arqueros a 6 milicias (quedan 6) y a 8 lanceros (quedan 6); 6 milicias a 8 lanceros (quedan 5).

### Programación
- [x] Vida, ataque cuerpo a cuerpo y a distancia
- [x] Proyectiles (flechas que siguen al objetivo; daño al llegar)
- [x] Armadura por tipo y bonus por clase
- [x] Ataque-mover, posturas (agresiva, defensiva, mantener posición, no atacar) y búsqueda automática de objetivos
- [x] Hash espacial para buscar objetivos
- [x] Edificios atacables, guarnición, torres y centro de la villa que disparan (más flechas con guarnición), toque a rebato
- [x] Niebla de guerra (3 estados), en la simulación para que la IA también la respete
- [x] Minimapa (clic: cámara; clic derecho: mover)
- [x] Gaia: lobos (atacan), jabalíes (se defienden) y ciervos (huyen); caza con aldeanos
- [x] Grupos de control (Ctrl + 1–9; doble pulsación centra la cámara)

### Diseño y arte
- [x] Unidades militares de las eras I–II (milicia, lancero, arquero, batidor) con poses de ataque — provisionales
- [x] Cuartel, galería de tiro, caballeriza, torre de vigía — provisionales
- [x] Efectos: flechas en arco, chispas, fuego en edificios dañados, cadáveres y escombros — falta el polvo al andar

---

## Fase 4 — Progresión (3–4 semanas)

**Hecho cuando:** se juega una partida completa contra un jugador pasivo, de la era I a la victoria. ✔ Medido en `tests/full-game.test.ts`: un guion que solo usa órdenes llega a la era II a los 12,3 min, a la III a los 23,5 y gana por conquista a los 31,3 min.

### Programación
- [x] Las 4 eras y el avance de era (2 edificios distintos de la era actual; castillo para la Pólvora)
- [x] Árbol tecnológico guiado por datos (`src/data/techs.ts`, modificadores en `src/data/modifiers.ts`, estadísticas por jugador en `src/sim/stats.ts`)
- [x] Mejoras de herrería, universidad, mercado, monasterio, fundición y edificios económicos; mejoras de línea (milicia → hombre de armas → …)
- [x] Monjes (curan solos; convierten en 4–10 s con el PRNG de la partida)
- [x] Asedio: ariete (solo edificios), trabuquete (se monta para disparar), bombarda
- [x] Murallas, empalizadas (se trazan arrastrando) y puertas (solo pasa su dueño)
- [x] Mercado (compra y venta con precio variable) y carros de comercio
- [x] Facciones Castilla e Inglaterra (bonus, unidad única, tecnología única); se elige con `?faccion=`
- [x] Victoria por conquista y por Catedral (10 minutos en pie), con pantalla de fin de partida
- [x] Generador procedural de mapas para 2–4 jugadores con reparto justo de recursos

### Diseño y arte
- [x] Resto de unidades y edificios — provisionales (los niveles de una línea cambian de color)
- [x] Variantes por era (centro de la villa y casas: madera y paja → piedra → teja → pizarra)
- [x] Arquitectura de cada facción (Castilla: ladrillo mudéjar; Inglaterra: piedra gótica)
- [x] Iconos de tecnologías (la unidad mejorada o un glifo por categoría) — provisionales

---

## Fase 5 — IA enemiga (3–4 semanas)

**Hecho cuando:** la IA en dificultad media gana a un novato y pierde contra un jugador decente.
✔ Medido con `npm run torneo` (4 partidas por enfrentamiento, mapa de 96×96, límite de 70 min):

| Enfrentamiento | Resultado | Duración media |
|---|---|---|
| Novato (solo economía) vs Media | Media gana 4 de 4 | 43 min |
| Fácil vs Media | Media gana 2, 2 empates, Fácil ninguna | 58 min |
| Media vs Difícil | Difícil gana 4 de 4 | 46 min |

Además, `tests/ai-games.test.ts` juega en cada `npm test` una partida completa de media contra fácil y otra de difícil contra media. Falta comprobar con personas que un jugador decente gana a la media.

### Programación
- [x] Marco de jugador IA que solo emite comandos (`src/ai/`, gancho `Controller` en la simulación; determinista)
- [x] Gestor económico (reparto de aldeanos según el almacén, casas, granjas y molinos, puntos de entrega, mercado)
- [x] Aperturas por facción y estrategia (2 por facción, en `src/ai/strategies.ts`)
- [x] Gestor militar: contraataques según lo que ha visto, asedio en proporción al ejército, oleadas, defensa y toque a rebato
- [x] Exploración con el batidor y memoria de lo visto (respeta la niebla)
- [x] Niveles de dificultad (fácil, media, difícil) con `?dificultad=`
- [x] La IA se rinde cuando ya no tiene con qué seguir (orden `resign`)
- [x] Script de partidas IA contra IA en Node con % de victorias por facción (`npm run torneo`)
- [x] Equilibrio de facciones (hecho en la Fase 7, ver allí)

### Diseño y arte
- [x] Nombres de los señores rivales (5 por corona, en `src/ai/lords.ts`) en el HUD y en los avisos
- [ ] Retratos de los señores (con el arte definitivo, Fase 6)

---

## Fase 6 — Arte y audio definitivos (4–6 semanas, solapada con las fases 3–5)

**Hecho cuando:** no queda ningún placeholder visible.

Hecha: audio (con la música del menú, que llegó con el menú en la Fase 7), unidades, edificios, terreno, recursos e interfaz.

### Programación
- [x] Sustitución del color de equipo: 4 magentas reservados que se cambian por la rampa del jugador al cargar la hoja (en la CPU y una sola vez, en lugar de un shader: así se conserva el agrupado de sprites)
- [x] Sistema de animaciones: reposo, andar, atacar (al ritmo de la cadencia), trabajar con cada herramienta, morir (y el cadáver queda), montar el trabuquete; 5 direcciones dibujadas y 3 en espejo
- [x] Carga de hojas de Aseprite por etiquetas (`andar/SO`…) desde `assets/units/`, y `npm run plantillas` para exportar las figuras como base para dibujar (ver `assets/LEEME.md`)
- [x] Audio posicional y mezcla con WebAudio, sin dependencias: buses de música y efectos, panorama según la pantalla, solo se oye lo que se ve y los ajustes se guardan en el navegador
- [x] Rasterizador isométrico de edificios (`src/render/arch/`): piezas en 3D proyectadas a la rejilla 2:1, con luz, sombras propias y sobre el suelo y contorno; las texturas se pintan la primera vez que hacen falta (0,4–9 ms cada una)
- [x] Terreno pintado por trozos de 16×16 casillas a medida que entran en pantalla, con fronteras deformadas por ruido continuo (sin costuras), orillas con espuma y profundidad del agua con tramado
- [x] Cursores propios según lo que hay bajo el ratón: espada, hacha, pico, hoz, martillo y guantelete
- [x] Niebla de guerra con un shader: borde suave y tramado, sin rombos
- [x] Sistema de partículas: polvo al andar, salpicaduras, chispas, derrumbes con polvo y cascotes, humo y fogonazo de pólvora, impactos de trabuquete y bala

### Diseño y arte
- [x] Unidades: las 28, generadas con un modelador de figuras (`src/render/rig/`) con luz, contorno y color de equipo
- [x] Edificios: los 21, con cimientos, obra a media altura y con los muros levantados (con andamios), terminado, dañado (grietas, hollín y boquetes en el tejado) y ruinas; arquitectura mudéjar (Castilla) y gótica (Inglaterra); el centro de la villa y las casas cambian en cada era y los demás en los tejados; los muros enlazan con sus vecinos
- [x] Terreno: hierba con claros, zonas secas, matas y flores; suelo de bosque más oscuro con hojarasca; tierra con guijarros; arena con ondas; agua somera y profunda, animada con ondas y destellos
- [x] Recursos: roble, pino y olivo (4 variantes de tamaño y tono cada uno, con la luz de toda la copa; talados y en tocón), minas de oro y piedra y bayas que menguan al agotarse; la carne es el animal abatido
- [x] Edificios vivos: humo de chimeneas y fraguas, banderas que ondean, aspas del molino que giran y fuego con humo negro y brasas en los dañados
- [x] Animales más grandes y con la cabeza delante (antes la llevaban metida en el cuerpo); de frente y de espaldas, animales y caballería se giran un poco para que se vea el costado
- [x] Iconos de tecnología distintos (glifo por tipo y numeral de nivel; las mejoras de unidad, con una flecha dorada) y retratos de unidad con más resolución
- [x] Figuras redondeadas: cabezas, miembros y cuerpos con elipsoides y cilindros que se estrechan, codos, pies y líneas interiores entre piezas; personas más esbeltas (unas 5 cabezas)
- [x] Aldeanos con cuatro aspectos (campesino, campesina, mozo y moza) y la herramienta de su oficio a la vista al andar y en reposo
- [x] Caballos nuevos (cuerpo con pecho y grupa, cuello con crin, rodillas que se doblan, silla, manta del jugador y riendas) y batidor rediseñado; sombra bajo cada unidad
- [x] Galería de unidades (`galeria.html`): todas las figuras con sus animaciones, direcciones, colores, aspectos y oficios, y su ficha
- [x] HUD sin cortes en ventanas estrechas (desde 480 px): barra de arriba compacta con iconos y minimapa que se reduce o se oculta
- [x] Interfaz: madera con vetas, marcos con clavos y filete de oro, pergamino, botones con el borde del color de su categoría (económico, militar, tecnología), iconos de recursos con el sombreado de los del mapa, iconos de los edificios a partir de su modelo y todos los iconos escalados al mayor múltiplo que cabe (contando la densidad de la pantalla)
- [x] Música: menú, economía, batalla, victoria y derrota (composiciones propias en modos antiguos)
- [x] Efectos de sonido sintetizados: hachas, picos, martillos, flechas, espadas, trabuquete, bombarda, derrumbes, cuerno, campana, fanfarria…
- [x] Voces breves de confirmación en un idioma inventado (aldeano y aldeana, soldado, jinete, monje)

---

## Fase 7 — Pulido y lanzamiento (2–3 semanas)

**Hecho cuando:** la versión 1.0 se puede jugar en el navegador.

Parte 1 hecha: pantalla de título, menú de nueva partida, pausa, opciones y guardar y cargar. Parte 2: tutorial, rendimiento, preparación del despliegue y página de itch.io hechos; queda publicar.

### Programación
- [x] Menú de nueva partida: tu reino, de 1 a 3 rivales todos contra todos (reino y dificultad de cada uno), tamaño del mapa (80, 96 o 120 casillas; se agranda si no caben todos) y semilla. También se puede arrancar desde la URL
- [x] Guardar y cargar (IndexedDB): se guarda el estado entero de la simulación con las IA, así que cargar es instantáneo y la partida sigue exactamente igual; partidas con nombre, sobrescribir, borrar, *Continuar* desde el título y autoguardado cada 5 minutos
- [x] Menú de pausa (botón *Menú*, F10 o Esc): continuar, guardar, cargar, opciones, atajos y salir al menú
- [x] Opciones: volumen de música y efectos, silenciar, velocidad de la cámara, desplazar con los bordes, velocidad de la partida y autoguardado; lista de atajos de teclado (cambiarlos queda para más adelante)
- [x] HUD rediseñado con paneles flotantes en las esquinas: recursos arriba a la izquierda; era, reloj, menú, sonido y reinos arriba a la derecha; órdenes y selección abajo a la izquierda; minimapa abajo a la derecha. Sin cortes desde 480 px
- [x] Voces habladas en castellano (síntesis de voz del navegador) al seleccionar, ordenar, atacar y salir de un edificio, con una voz por tipo de unidad; si no hay voz en español, las sintetizadas. Opción *Voces*: habladas, sintetizadas o ninguna
- [x] Menús fuera de la partida con la ilustración del título de fondo
- [x] Iconos nuevos: tarjetas de 44×44 con paisaje (unidades en plano medio y edificios pintados a escala) o fondo oscuro (tecnologías y acciones)
- [x] Consola de órdenes y selección en un mismo marco, con la rejilla hundida, botones con franja de categoría y tecla, y los datos de la selección con iconos
- [x] Unidades más realistas: 7 niveles de luz, brillo en el metal y sombras propias; proporciones de unas 5,4 cabezas con rodillas, cadera y manos; pliegues, malla y placas; caballos más altos con corvejón, cascos y crin. Los retratos del HUD y de la galería salen de las figuras nuevas
- [x] Unidades a doble densidad (mismo tamaño en pantalla, cuatro veces más píxeles), con caras con ojos, cejas y boca; los fotogramas se pintan al verse y el resto en segundo plano, sin parar el juego
- [x] Andar más fluido: 8 fotogramas por ciclo con rodilla, cadera y brazos más naturales, y el ciclo sincronizado con la distancia recorrida (los pies no patinan)
- [x] Desplazamiento suave: unidades y cámara avanzan de píxel en píxel de pantalla en lugar de a saltos de un píxel de mundo (2–8 de pantalla según el zoom). Los fotogramas que faltan de la animación en curso se pintan los primeros, y la de morir poco a poco (antes, un tirón de unos 15 ms en cada primera muerte)
- [x] Unidades juntas sin tics: los aldeanos se reparten las casillas libres alrededor del árbol o la mina, quien trabaja no se mueve por roces pequeños ni vuelve a acercarse por un empujón, y los empujones de la separación no hacen andar ni girar a nadie (6 leñadores en un árbol: de unos 2.200 giros en 2 minutos a ninguno)
- [x] Los lobos defienden su guarida: persiguen hasta 9 casillas de ella y vuelven (antes seguían a su presa por medio mapa). La IA explora con su soldado más rápido si pierde el batidor sin saber dónde está el enemigo
- [x] Tutorial interactivo: 11 pasos con narrador (seleccionar, madera, comida, aldeanos, casa, cuartel, milicias, explorar y unos lobos), que comprueba en la partida que se ha hecho cada cosa y resalta el botón que toca. El narrador va en la columna de la derecha para no tapar la aldea. Un test lo juega de principio a fin
- [x] Rendimiento: un fotograma cuesta 0,5 ms con 56 unidades andando y una batalla de 52 unidades no pasa de 16 ms (solo se pasa cuando aparecen de golpe tipos nuevos). La simulación en un Web Worker no hace falta por ahora
- [x] Pase de equilibrado con partidas IA contra IA (6 partidas por enfrentamiento, dificultad media, mapa de 96×96):

  | Enfrentamiento | Antes | Después |
  |---|---|---|
  | Castilla vs Inglaterra | Inglaterra 4, Castilla 1, 1 empate | Castilla 3, Inglaterra 2, 1 empate |
  | Castilla vs Catalunya | Catalunya 5, Castilla 0, 1 empate | Catalunya 3, Castilla 2, 1 empate |
  | Inglaterra vs Catalunya | Catalunya 2, Inglaterra 1, 3 empates | Catalunya 3, Inglaterra 2, 1 empate |

  - Castilla se quedaba sin comida: su bonus de minería daba oro y piedra que la IA acumulaba sin gastar. Ahora tiene *Trashumancia* (ovejas y caza un 25 % más rápido), aldeanos un 10 % más baratos y *Órdenes militares* (caballería +10 de vida).
  - Catalunya: *Mercaderes* pasa de +2 a +1 de carga.
  - Dos fallos de la IA que afectaban a todas las coronas: tocaba a rebato y no sacaba a los aldeanos del centro de la villa mientras hubiera cualquier enemigo cerca de cualquier edificio (aldeanos enemigos incluidos); y un aldeano mandado a una mina encerrada probaba una casilla tras otra del yacimiento sin fin (miles de búsquedas de camino; la simulación iba 4 veces más lenta). Ahora el rebato es solo por soldados junto al centro de la villa, y el yacimiento inalcanzable queda vetado 2 minutos
- [x] Reparar y derribar edificios:
  - **Reparar**: clic derecho sobre un edificio propio dañado, o E en el panel del aldeano. Cada aldeano repone 15 de vida por segundo y cuesta la mitad del edificio en proporción a lo reparado. Se para si no hay recursos, y al terminar el aldeano vuelve a lo suyo. La IA repara sus edificios cuando no hay enemigos cerca.
  - **Derribar**: Supr o el botón junto al nombre, dos veces. Se devuelve la cola; unos cimientos se cancelan al momento y devuelven lo no gastado.
  - Arreglado de paso: si caía un edificio mientras investigaba, esa tecnología quedaba bloqueada para siempre.
  - Las partidas guardadas antes de este cambio siguen cargando.
- [x] Despliegue estático preparado: `npm run itch` genera el zip para itch.io, `netlify.toml` para Netlify, icono de pestaña y descripción; guía en [publicar.md](publicar.md). Falta publicarlo (con la cuenta del autor)

### Diseño y arte
- [x] Pantalla de título: una villa pintada con el arte del juego, a la medida de la ventana, y la música del menú (*La Corona*)
- [ ] Ilustraciones del tutorial
- [x] Texto de la página de itch.io, etiquetas y lista de capturas en [itch.md](itch.md)
- [ ] Capturas y GIF para itch.io

---

## Fase 8+ — Expansión

- [x] Catalunya: bonus de comercio e infantería, el almogàver, *Desperta ferro*, arquitectura gótica mediterránea, cinco señores y dos estrategias de IA (adelantada en la Fase 7)
- [x] Catalunya pasa a llamarse **Corona de Aragón**, que era el reino de la época (Aragón, Cataluña, Valencia y Mallorca). Conserva su sabor catalán: los almogàvers, *Desperta ferro*, el Consolat de Mar y el gótico mediterráneo. Los reyes llevan la numeración de la Corona (Pere III el Gran, Pere IV el Cerimoniós, Alfons V el Magnànim). `?faccion=aragon` (los enlaces con `catalunya` siguen valiendo)
- [x] Nuevas facciones: Francia, Reino Nazarí, Portugal y Escocia, cada una con sus bonus, su unidad única (gendarme, gazí, besteiro do conto y schiltron), su tecnología única (*Oriflama*, *Alcazaba*, *Aljubarrota* y *Bannockburn*), su arquitectura, cinco señores y dos estrategias de IA. El menú de partida elige el reino de cada rival con un desplegable para que quepan siete. Las partidas guardadas antes siguen cargando (la tabla de tecnologías por jugador se rehace al cargar)
  - Equilibrado con una liga de las siete coronas (21 enfrentamientos × 6 partidas, dificultad media; los ficheros `scripts/torneo/4`, `6`, `7` y del `8` al `25`). Victorias de cada corona sobre sus 36 partidas:

    | Corona | 1.ª liga | 3.ª liga |
    |---|---|---|
    | Corona de Aragón | 64 % | 56 % |
    | Francia | 50 % | 50 % |
    | Portugal | 56 % | 50 % |
    | Reino Nazarí | 28 % | 44 % |
    | Castilla | 47 % | 42 % |
    | Escocia | 17 % | 39 % |
    | Inglaterra | 50 % | 36 % |

    Con 36 partidas por corona, el azar da unos ±8 puntos: entre el 36 y el 56 % se puede dar por equilibrado. Cambios: Escocia cambia la piedra y las torres por madera (+15 %) e infantería con +1 de armadura a distancia, y sus estrategias llevan más arqueros; el Reino Nazarí gana infantería un 15 % más barata; la caballería pesada francesa, +1 de armadura a distancia; el comercio de la Corona de Aragón pasa del 20 al 10 % (con la reparación de edificios, su estrategia de mercaderes había subido). Francia sigue perdiendo casi siempre contra Inglaterra: los arqueros con *Estacas* son su contraataque natural (Crécy, Azincourt)
- [x] Escudos de las siete coronas (pixel art propio), en la pantalla de nueva partida y en el panel de reinos del HUD
- [x] Mapa de Europa (160×160): cada corona sale de su capital, con el vado de Calais hacia Gran Bretaña y los Pirineos como bosque cerrado con tres pasos. `?mapa=europa`. Con cuatro jugadores, la simulación cuesta 0,2 ms por paso a los 30 minutos
- [x] Pantalla de nueva partida rediseñada: tarjetas de las coronas con su escudo y su ficha, rivales con escudo y desplegable, miniaturas de los mapas (en la de Europa, la capital de cada jugador)
- [x] Cada corona habla en su idioma: castellano, catalán (Corona de Aragón), inglés (Inglaterra y Escocia), francés, portugués y árabe (Reino Nazarí), con sus gritos de guerra. Si al sistema le falta la voz de un idioma, esa corona habla en castellano; *Opciones* dice qué idiomas tienen voz
- [x] Las unidades ya no andan por el agua: el agua somera de las orillas no se pisa y solo se cruza por vados (terreno nuevo, con arena y piedras). Los mapas generados abren vados donde una posición inicial o una tierra grande quedaría aislada, y talan un camino si la aísla un bosque (en Europa, la orilla del vado de Calais y los Pirineos). En el torneo, la escalera de dificultad sigue igual (la difícil gana las 6 a la media) y las coronas quedan entre el 31 y el 56 %
- [x] Batallas más ordenadas:
  - Los atacantes se reparten entre los enemigos: unos 4 cuerpo a cuerpo por unidad como mucho, y los tiradores también reparten algo el fuego.
  - Una orden de ataque de un grupo sobre una unidad la cumplen los que caben, y los demás van a por los de al lado.
  - Los de cuerpo a cuerpo rodean a su objetivo, cada uno en su puesto.
  - Los grupos de soldados marchan en formación (cuerpo a cuerpo delante, tiradores detrás) al paso del más lento; el asedio va a su ritmo.
  - Las oleadas de la IA también. En el torneo, la escalera de dificultad sigue igual.
- [ ] Sacro Imperio
- [ ] Combate naval completo
- [ ] Editor de escenarios
- [ ] Campaña: Guerra de los Cien Años, Reconquista
- [ ] Multijugador online lockstep (WebSocket / WebRTC)
- [ ] Repeticiones (semilla + registro de comandos)
