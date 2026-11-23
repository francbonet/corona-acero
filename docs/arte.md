# Corona y Acero — Biblia de arte

## 1. Estilo

Pixel art isométrico retro, con un aire de **manuscrito iluminado**: colores de tierra saturados, contornos oscuros pero no negros y luz que siempre viene de arriba a la izquierda. Tiene que leerse bien a zoom x2 sobre una resolución interna de 640×360.

**Reglas fijas**
- Escalado **solo entero** (x1, x2, x3, x4) y `image-rendering: pixelated`. Nunca suavizado.
- Sin píxeles a media posición: la cámara, los edificios y la naturaleza se colocan en píxel de mundo entero, y las unidades y la cámara se mueven de píxel en píxel **de pantalla** (no a saltos de `zoom`), siempre que cada píxel de su dibujo ocupe un número entero de píxeles de pantalla; si no (zoom x3 en una pantalla sin retina), van de píxel de mundo en píxel de mundo para no titilar.
- **Luz** desde arriba a la izquierda. Sombras proyectadas hacia abajo a la derecha, con un color plano semitransparente.
- **Contorno**: un tono oscuro del propio color (no negro puro), y se puede quitar en los bordes iluminados.
- Sin degradados suaves. Como mucho, tramado (dithering) en grandes superficies como el agua o el cielo de los menús.

## 2. Paleta

Unos 32 colores, organizados en rampas. Una paleta libre de partida es **Resurrect 64** (recortada); la definitiva se guarda en `assets/palette.hex` y en `assets/palette.aseprite`.

| Rampa | Uso | Tonos |
|---|---|---|
| Verde prado | Hierba, árboles | 4 |
| Ocre tierra | Caminos, campos, madera | 4 |
| Piedra gris cálido | Murallas, castillos, rocas | 4 |
| Arena | Playas, adobe, pergamino | 3 |
| Azul lapislázuli | Agua, cielo, detalles | 4 |
| Rojo bermellón | Tejados, heráldica | 3 |
| Oro | Oro, iluminación, UI | 3 |
| Piel | Personajes | 3 |
| Oscuros | Contornos, sombras | 2 |
| **Colores de equipo** | Reservados, ver abajo | 4 |

### Colores de equipo
Cada sprite usa **4 tonos reservados** (por ejemplo magentas puros, que no aparecen en ninguna otra parte) en estandartes, tabardos, escudos y tejados. Un shader los sustituye por la rampa del jugador:

| Jugador | Color |
|---|---|
| 1 | Azul |
| 2 | Rojo |
| 3 | Verde |
| 4 | Amarillo |
| 5–8 | Cian, violeta, gris, naranja |

## 3. Rejilla isométrica y tamaños

- **Casilla**: rombo de **32×16 px** (proporción 2:1). Las líneas del rombo siguen el patrón de 2 píxeles horizontales por 1 vertical.
- **Altura de una "planta"**: 16 px.
- **Ancla** de todo sprite: el centro de la casilla base, en la parte inferior del sprite.

| Elemento | Huella | Ancho del lienzo | Alto aproximado |
|---|---|---|---|
| Unidad a pie | 1 casilla | 32 px | 32 px (figura de 16–22 px) |
| Unidad a caballo | 1 casilla | 32 px | 32 px (figura de 22–28 px) |
| Asedio | 1 casilla | 48 px | 40 px |
| Árbol | 1 casilla | 32 px | 48 px |
| Edificio 2×2 | 2×2 | 64 px | 64–72 px |
| Edificio 3×3 | 3×3 | 96 px | 80–96 px |
| Edificio 4×4 | 4×4 | 128 px | 112–128 px |
| Catedral 5×5 | 5×5 | 160 px | 160–192 px |
| Icono de interfaz | — | 24×24 px | — |
| Retrato de selección | — | 48×48 px | — |

## 4. Unidades

- **Direcciones**: se dibujan 5 (**S, SO, O, NO, N**) y SE, E y NE salen en espejo.
- **Animaciones**:

| Animación | Fotogramas | Velocidad |
|---|---|---|
| Reposo | 2 | Lenta (500 ms) |
| Andar | 8 | Según lo que avanza (unos 100 ms a paso de aldeano) |
| Atacar | 4–6 | Según la cadencia de la unidad |
| Morir | 5 | 100 ms y se queda el cadáver |
| Trabajar (aldeano: talar, minar, cosechar, construir) | 4 | 120 ms |
| Cargar (aldeano con recurso a cuestas) | Andar con variante | 100 ms |

- **Proporciones**: las personas miden unos 21–23 px (unas 5,4 cabezas): piernas de 9,4 px (muslo y espinilla, con rodilla que se dobla al andar), cadera, torso de 6,8 más ancho en los hombros que en la cintura, cuello y cabeza de 3,9. Brazo y antebrazo con codo y la mano aparte; pies que asoman. Cabezas, miembros y cuerpos son redondos (elipsoides y cilindros que se estrechan hacia muñecas y tobillos), y las piezas que se tapan se separan con una línea interior más oscura.
- **Sombreado**: 7 niveles de luz por material (los 4 tonos de la rampa y sus intermedios), suavizados píxel a píxel; brillo en el metal (acero, malla, hierro, oro); y sombras propias, de una pieza sobre otra (el ala del sombrero sobre la cara, el brazo sobre el pecho), con un mapa de profundidad visto desde la luz.
- **Detalle**: ojos, cejas, nariz y boca; hebilla dorada en el cinturón, pliegues en faldones, vestidos y capas, anillas en la malla y lamas en las placas.
- **Aldeanos**: cuatro aspectos que se reparten entre los aldeanos de la partida: campesino (sombrero de paja, faldón y barba), campesina (pañuelo, vestido largo y delantal), mozo (sombrero de fieltro con pluma del color del jugador) y moza (cofia, moño y delantal de lana). Varían también la piel y el pelo.
- **Herramienta del oficio**: al andar y en reposo, cada aldeano lleva la herramienta de su tarea. El hacha (leñador), el pico (minero) y la azada (granjero) van cruzados sobre el pecho, de cara a la cámara para que se lean. El constructor lleva el martillo en alto y quien recolecta, una cesta con bayas en el brazo. Si vuelve cargado, se ve la carga y no la herramienta.
- **Caballos**: cuerpo de barril con pecho y grupa, cuello largo con crin abultada, cabeza hacia abajo con orejas, patas con rodilla que se dobla al levantarse, las traseras en zigzag por el corvejón, cascos oscuros y cola que arranca hacia arriba y cae, y se balancea al andar. Llevan silla, manta del color del jugador y riendas; el del caballero pesado, gualdrapa entera. El batidor monta un rocín bayo y lleva chaperón pardo, capa y lanza corta, para no confundirse con su caballo.
- **Sombra**: cada unidad lleva bajo los pies una elipse oscura translúcida, más grande la de la caballería y el asedio.
- **Andar**: un ciclo de 8 fotogramas (dos pasos). La pierna que avanza dobla mucho la rodilla al pasar bajo el cuerpo, la de apoyo va casi recta, la cadera baja al apoyar, el cuerpo se inclina un poco y los brazos van al contrario que las piernas. El ciclo no va con el reloj sino con la distancia recorrida (unas 0,7 casillas por ciclo a pie, 0,75 a caballo y según el largo de las patas en los animales), así que los pies no patinan y quien va más deprisa da los pasos más rápido.
- **Animales y caballería**: vistos justo de frente o de espaldas se quedarían en una columna, así que esas dos vistas se giran unos 30° para que se vea el costado. Los animales van a ×1,25–1,5 de su modelo para que se lean junto a las personas.
- **Legibilidad**: cada línea de unidades necesita una silueta distinguible a x1. Los lanceros llevan un arma larga vertical, los arqueros un arco curvado, la caballería se ve más ancha, los caballeros llevan yelmo cerrado y los aldeanos van sin armadura y con herramienta.
- Mejoras de una misma línea (por ejemplo, milicia → hombre de armas → espadachín): misma base, con más armadura y otro casco.

## 5. Edificios

- **Estados**: cimientos (contorno en el suelo) → en construcción (andamios, 2–3 pasos) → terminado → dañado (humo y grietas, por debajo del 50 % de vida) → ruinas.
- **Variantes por era**: al menos el Centro de la villa y las casas cambian en cada era (madera → piedra y madera → piedra con tejas).
- **Facciones**:
  - **Castilla**: mudéjar, ladrillo rojizo, arcos de herradura, almenas escalonadas, azulejos verdes en los detalles.
  - **Inglaterra**: entramado de madera blanco y negro, piedra gris, tejados de pizarra o paja y ventanas góticas.
  - **Corona de Aragón**: gótico mediterráneo, arenisca dorada, encalados, tejados de teja árabe poco inclinados, arcos apuntados y almenas rectas, sin chapiteles.
  - **Francia**: gótico flamígero, caliza clara, pizarra azul, tejados muy empinados y chapiteles.
  - **Reino Nazarí**: tapial rojizo, yeserías blancas en los arcos de herradura, zócalos de alicatado y tejas verdes vidriadas.
  - **Portugal**: caliza blanca (*lioz*), encalados, teja roja poco inclinada y franjas de azulejo azul y blanco.
  - **Escocia**: casas-torre de piedra enlucida gris, granito, pizarra oscura y hastiales escalonados.
- Los colores de equipo van en estandartes, toldos y alguna parte del tejado.

**Cómo están hechos.** Los edificios se modelan con piezas en 3D (`src/render/arch/models.ts`): cajas, tejados a dos y cuatro aguas, torres de 12 lados con cono, almenas, estandartes, vigas… Se proyectan con la misma rejilla 2:1 del juego (`arch/iso-raster.ts`), así que la huella encaja al píxel con el rombo del terreno.
- La luz viene de arriba a la izquierda: cara de arriba en el tono 3, la izquierda en el 2 y la derecha en el 1; el tono 0 queda para contornos, juntas y huecos.
- Cada pieza arroja sombra sobre las demás y sobre el suelo, hacia la derecha.
- Las fábricas se pintan en las coordenadas de cada cara, así que las hiladas forman la escalera de 2×1: sillería, ladrillo con argamasa clara, entramado, tablas, troncos, paja, teja árabe, pizarra.
- Los huecos son arcos de medio punto, apuntados o de herradura (con alfiz en el mudéjar).
- Las obras recortan el modelo a media altura o a la altura de los muros y lo dejan hueco, con el suelo y las viguetas dentro y andamios delante. Las ruinas son el mismo corte con el borde irregular y cascotes, y el edificio dañado es el terminado con grietas, hollín y boquetes en el tejado.
- Los muros (empalizada, muralla y puerta) cambian según con qué vecinos enlazan, para que una línea de casillas se vea como un muro seguido.

## 6. Terreno

- **Tipos**: hierba, tierra, arena, agua profunda, agua poco profunda, vado, nieve (expansión) y camino.
- **Transiciones**: en lugar de casillas de transición, el terreno se pinta píxel a píxel por trozos de 16×16 casillas (`src/render/terrain-art.ts`). Las fronteras entre terrenos se deforman con ruido continuo en coordenadas del mundo, así que no hay costuras y cada orilla es distinta. La tierra pone una línea más oscura donde toca otro terreno, y el agua, espuma en la orilla.
- **Agua**: se oscurece con la distancia a la orilla (8 tonos con tramado de Bayer), con ondas cortas más claras. Por encima, una capa animada (`src/render/water-fx.ts`) con ondas que aparecen, derivan y se desvanecen y destellos sueltos, solo en agua abierta dentro de la vista.
- **Vados**: agua muy baja de los tonos más claros, con bancos de arena mojada y piedras sueltas con su sombra. Se distinguen del agua de la orilla, que no se pisa.
- **Bosques**: donde había árboles al empezar, el suelo es hierba en sombra con hojarasca, con el borde tramado; así los bosques se leen como masas.
- **Variación**: no hay casillas repetidas. La hierba tiene claros, zonas secas, matas y flores; la tierra, guijarros con su sombra; la arena, ondas.
- **Props**: rocas, flores, arbustos y tocones, sin colisión.
- **Recursos**: árbol (3 especies: roble, pino, olivo para Castilla), mina de oro, mina de piedra, arbusto de bayas y banco de peces. Cada uno con versión "agotándose".
  - Se pintan con volúmenes redondeados (`src/render/nature-art.ts`): esferas y elipsoides con la luz de arriba a la izquierda, ruido para las hojas, facetas para la roca y sombra plana.
  - Hay 4 variantes de cada especie de árbol, de distinto tamaño y tono, y la copa entera recibe la luz (más clara arriba a la izquierda). Un árbol está en pie hasta el primer hachazo; luego queda talado (tronco en el suelo junto al tocón) y al final solo queda el tocón.
  - Las minas pierden rocas y el arbusto pierde bayas según lo que queda.
  - La carne es el animal abatido (el último fotograma de su muerte).

## 7. Interfaz

- **Escudos de las coronas** (`src/render/heraldry.ts`): 20 × 22 píxeles, con la forma clásica de punta (los costados son arcos que se juntan abajo) y contorno oscuro. Los esmaltes son los de la heráldica con la gama del juego: oro, gules, azur, plata y púrpura.
  - Castilla: cuartelado de castillos de oro en gules y leones de púrpura en plata.
  - Inglaterra: tres leones pasantes de oro en gules.
  - Corona de Aragón: los cuatro palos de gules en oro.
  - Francia: tres flores de lis de oro en azur.
  - Reino Nazarí: banda de oro con el lema en gules.
  - Portugal: las cinco quinas de azur en plata, con bordura de gules y siete castillos.
  - Escocia: león rampante de gules en oro, dentro del doble trechor.
- **Nueva partida**: tarjetas de las coronas con su escudo, la ficha de la elegida (unidad y tecnología únicas, arquitectura y bonus), los rivales con su escudo y miniaturas de cada mapa. En la de Europa, un punto del color de cada jugador marca su capital.

- **Materiales**: marco de madera oscura con clavos, fondo de pergamino y detalles en oro.
- **Fuente**: pixel, legible a 8–11 px de alto. Opciones: **m5x7 / m6x11** (Daniel Linssen, gratis con crédito) o **Pixelify Sans** (Google Fonts, OFL).
- **Iconos** de 24×24 con un borde de 1 px de color según la categoría (económico ocre, militar rojo, tecnología azul).
- Iniciales iluminadas en los títulos de los menús.
- Cursores propios: espada (atacar), hacha/pico/hoz (recolectar), martillo (construir) y mano (por defecto).

**Cómo está hecha.** La piel se genera al arrancar (`src/ui/skin.ts`) y se pasa al CSS como variables:
- tablas de madera con vetas, pergamino con fibras;
- marcos de 9 trozos con clavos de hierro y filete de oro, que se dibujan por encima del relleno sin cambiar las medidas del HUD;
- botones biselados con el borde ocre, rojo o azul según su categoría.

Todo va a escala x2 con `image-rendering: pixelated`.

**Iconos:** todos son tarjetas cuadradas de 44×44 que el icono llena entero (`src/render/icon-card.ts`).
- **Unidades:** sobre un paisaje (cielo que se aclara hacia unas lomas lejanas y hierba con motas, con las esquinas algo oscurecidas). La gente a pie, en plano medio a ×3,2, con la cara centrada y el casco o el sombrero a la vista; los tiradores, apuntando, para que se vea el arco, la ballesta o el arcabuz. Caballería, asedio y animales, enteros.
- **Edificios:** sobre el mismo paisaje y apoyados en la hierba. Se pintan con el modelo 3D a escala pequeña (no reduciendo la imagen grande), así que puertas, ventanas, color de equipo y contorno salen limpios.
- **Tecnologías, acciones y mercado:** su glifo de 16×16 a doble tamaño sobre un fondo oscuro con un halo cálido; el numeral del nivel y la flecha de mejora, también a doble tamaño.
- Las tecnologías tienen un glifo por tipo: corona, espada, escudo, flecha, gavilla, hacha, pico con oro o con piedra, bolsa de monedas, martillo con ladrillos y estrella. Llevan el numeral romano de su nivel (I–IV) si hay varias del mismo tipo, y las eras van de la II a la IV.
- Las mejoras de una unidad usan su retrato con una flecha dorada, para no confundirlas con el botón de entrenarla.
- Los edificios se reducen sin las juntas ni las tejas, para que queden limpios, con un factor fraccionario para que llenen el botón.

Los iconos se muestran al mayor múltiplo que cabe en su hueco contando la densidad de la pantalla (en una pantalla retina, ×1,5 también es nítido), y los de recursos (16×16) usan el mismo sombreado que los recursos del mapa. El cursor cambia según lo que haría un clic derecho sobre lo que hay debajo.

**HUD de la partida** (`src/ui/hud.tsx`, `src/ui/hud.css`): paneles flotantes en las esquinas, en vez de barras de lado a lado, para que se vea el mapa entero.
- Arriba, dos tiras con un marco dorado fino: recursos, población y aldeanos ociosos a la izquierda; era, reloj, menú y sonido a la derecha. Debajo de esta, un panel translúcido con los reinos de la partida.
- Abajo a la izquierda, la **consola**: un solo marco de madera con la rejilla de órdenes y, a su lado, la selección en pergamino.
  - La rejilla va hundida como una bandeja. Cada botón es la tarjeta del icono con un bisel, una franja abajo del color de su categoría (económico ocre, militar rojo, tecnología azul) y su tecla en una pastilla oscura. Los huecos vacíos apenas se marcan.
  - La selección lleva el retrato grande en un marco dorado, el nombre, la barra de vida y sus datos con iconos de 9×9 a doble tamaño (espada de ataque, flecha de alcance, escudo de armadura, bota de velocidad, casa de población, guarnición).
  - En pantallas estrechas la consola se abre: la selección pasa a una fila propia y la rejilla lleva su propio marco dorado.
- Abajo a la derecha, el minimapa en un pozo oscuro con filete de oro.

**Pantalla de título y menús** (`src/ui/title-art.ts`, `src/ui/menu.tsx`):
- La ilustración del título se pinta con el arte del propio juego: una villa con castillo, catedral, mercado, casas, molino y campos junto a un lago, vecinos trabajando y un caballero, con bosque alrededor y las orillas oscurecidas con el mismo tramado que la niebla.
- Se pinta a la medida de la ventana, a unos 2 píxeles de pantalla por píxel de arte (siempre un múltiplo entero). En pantallas anchas el cuadro del título va a la izquierda, sobre el bosque, y deja ver la villa; en las estrechas o verticales, va abajo y la villa queda arriba.
- Los menús (nueva partida, partidas guardadas, opciones, atajos y pausa) son paneles de pergamino con marco de madera, con botones de madera y el principal en oro. Fuera de la partida llevan detrás la ilustración del título, algo oscurecida; en partida, oscurecen el juego.

**Pantallas estrechas.** No se corta nada desde 480 px, contando el peor caso: cifras de cuatro dígitos y población 200/200.
- Por debajo de 1100 px, el minimapa se reduce y se quita el retrato de la selección.
- Por debajo de 960 px, la era pasa a su nombre corto, se esconde el panel de reinos y los botones de órdenes son algo más pequeños.
- Por debajo de 820 px, los iconos de recursos van a 16 px y se quita el reloj.
- Por debajo de 700 px, la selección pasa a una fila propia encima de las órdenes y el minimapa; por debajo de 600, las dos tiras de arriba van una debajo de otra.
- Por debajo de 480 px (móvil) haría falta otra disposición, que queda para más adelante.

## 8. Efectos

Flechas y virotes (1–2 px), polvo al andar, chispas al chocar metal, sangre pixelada discreta (opcional), fuego en edificios dañados, humo de pólvora y escombros al destruir.

**Cómo están hechos.** Hay un sistema de partículas en pixel art (`src/render/particles.ts`). Las nubes crecen cambiando de textura (de 3 a 12 px, con el borde tramado) en vez de escalarse, así que los píxeles no se deforman. Cada partícula puede llevar gravedad y un suelo donde se queda.
- **Al andar:** polvo en los pies, muy a menudo en la caballería y el asedio y de vez en cuando en la infantería; salpicaduras si se va por el agua.
- **Golpes:** chispa animada con esquirlas que saltan.
- **Derrumbes:** una nube de polvo y humo por toda la huella y cascotes que saltan y caen; luego quedan las ruinas.
- **Pólvora:** fogonazo y humo blanco al disparar las bombardas y los arcabuceros.
- **Impactos de trabuquete y de bala:** polvo y cascotes.
- **Edificios:** humo en las chimeneas, la fragua y la fundición.
  - Las banderas ondean (4 fotogramas) y las aspas del molino giran (4 fotogramas): los modelos las dejan como emisores en lugar de pintarlas.
  - Los dañados arden en tres puntos de su tejado, con llamas animadas, humo negro y brasas.
- Las partículas solo se crean en lo que el jugador ve y está en pantalla, por debajo de la niebla.

**Niebla de guerra** (`src/render/fog-renderer.ts`). Es un único rectángulo con un shader que lee el estado de cada casilla de una textura pequeña. Entre casillas interpola, deforma el borde con ruido y lo trama con una matriz de Bayer fija al mundo, así que el borde es suave, en pixel art y sin rombos. Solo se sube la textura cuando cambia algo.

## 9. Audio

Todo el audio se **sintetiza en el propio juego** (`src/audio/`), sin ficheros: un sintetizador al estilo de jsfxr genera las muestras y WebAudio las reproduce.

- **Música** (`src/audio/music.ts`): chiptune de época con flauta, laúd, cromorno, trompeta, bordón de gaita, tamboril y campana. Pistas: *La Corona* (menú, una pavana en re mixolidio con campanas), *Prados de la Meseta* (economía, re dórico), *La Hueste* (batalla, la eólico), fanfarria de victoria y lamento de derrota. La de batalla entra cuando el combate es intenso cerca o contra el jugador, y vuelve la tranquila tras unos 18 s de calma.
- **Efectos** (`src/audio/sounds.ts`): hacha, pico, martillo, hoz, flecha (salida e impacto), choque de espadas, trabuquete, bombarda, derrumbe, muerte, cuerno de alarma, campana de rebato, fanfarria de era, investigación, unidad lista y edificio terminado. Cada uno tiene variantes y un poco de variación de tono.
- **Voces** (`src/audio/speech.ts` y las frases en `src/audio/voice-lines.ts`): frases cortas de época al seleccionar, al dar una orden, al mandar atacar y al salir de un edificio, en el idioma de cada corona:

  | Corona | Idioma | Grito de guerra |
  |---|---|---|
  | Castilla | castellano | *¡Santiago y cierra, España!*, *¡Castilla, Castilla!* |
  | Corona de Aragón | catalán | *Desperta ferro!*, *Aragó, Aragó!*, *Via fora!* |
  | Inglaterra | inglés | *For Saint George!*, *God for England!* |
  | Escocia | inglés | *For Scotland!*, *Saint Andrew!* |
  | Francia | francés | *Montjoie ! Saint-Denis !* |
  | Portugal | portugués | *Portugal e São Jorge!* |
  | Reino Nazarí | árabe | *Lā gāliba illā Allāh* (el lema nazarí) |

  Los gritos se suman a los ataques de soldados y jinetes. Las dice la síntesis de voz del navegador, con una voz por tipo de unidad elegida entre las que tenga el sistema en ese idioma (primero las de su variante: España, Inglaterra, Francia, Portugal). El monje lleva voz de anciano, los soldados y el asedio voz grave, y las aldeanas voz de mujer (contesta la voz de la aldeana o el aldeano seleccionado; las escocesas prefieren la voz escocesa). Se descartan las voces de broma de macOS.
  - Si falta la voz del idioma de la corona, hablan en castellano; si tampoco hay voz en español, o si se elige en *Opciones*, suenan las voces sintetizadas de antes: sílabas chiptune en un idioma inventado. Los animales siempre suenan sintetizados. *Opciones* dice qué idiomas tienen voz en el sistema.
- **Mezcla**: solo suena lo que el jugador ve (la niebla también tapa el sonido), con panorama y volumen según la posición en pantalla, y límites para que una batalla no sea un muro de ruido. El botón *Sonido* de la barra superior lo silencia todo; los volúmenes de música y efectos están en *Opciones*.

## 10. Herramientas y flujo

**Unidades generadas.** Mientras no haya arte dibujado, las unidades salen de un modelador de figuras (`src/render/rig/`):
- Cada figura se construye con piezas orientadas en un pequeño espacio 3D (1 unidad = 1 píxel): torso, cabeza, brazos, armas, escudos, caballos y máquinas. Cada pieza es una caja, un elipsoide, un cilindro o una caja redondeada, y puede estrecharse hacia un extremo.
- Se pinta desde las 5 direcciones con la luz de arriba a la izquierda y el contorno oscuro del propio color. Primero se hace un mapa de profundidad visto desde la luz (las sombras propias) y después la vista: cada píxel guarda su luz continua, que se suaviza con sus vecinos de la misma pieza y se pasa a uno de los 7 niveles de la rampa (más el brillo del metal). Los dibujos de las caras pueden oscurecer o aclarar el material (`'team-'`, `'mail-'`) para pliegues y texturas.
- El aspecto de cada unidad (ropa, casco, arma, escudo, montura), sus variantes (aspectos de los aldeanos y herramienta de cada oficio) y sus poses están en `src/render/rig/catalog.ts`.
- Las celdas son de 40×40 px para las unidades a pie y los animales, y de 48×48 para la caballería, el asedio y el carro.
- **Doble densidad**: las texturas de las unidades tienen el doble de píxeles por lado que el mundo y se dibujan a la mitad. En pantalla miden lo mismo, pero con cuatro veces más detalle: ojos, cejas, nariz y boca, anillas de la malla y degradados suaves. En una pantalla retina cada píxel de unidad cae siempre en píxeles enteros del monitor; en una normal, a zoom impar, algunos salen algo más anchos que otros. Las hojas de Aseprite se amplían ×2 al cargarlas.
- Cada hoja (tipo, jugador, aspecto y oficio) pinta cada fotograma cuando se ve por primera vez: el primero de una animación, en el momento (como mucho 8 ms por fotograma de pantalla), y el resto en cola, unos milisegundos por fotograma (`UnitArt.pump`). Mientras falta uno, se muestra el pintado más cercano de la misma animación. La hoja se sube a la GPU una sola vez por fotograma de pantalla.

**Galería de unidades.** `galeria.html` (en desarrollo, `http://localhost:5173/galeria.html`; también sale en el build) muestra todas las unidades sobre el suelo de la partida. Tienen todas sus animaciones, las 8 direcciones (o girando), los colores de cada jugador, zoom ×2–×6, varios fondos y su ficha (vida, ataque, armadura, coste y dónde se entrenan). Los aldeanos se ven además con cada aspecto y oficio. «Ver hoja» abre la hoja completa, fotograma a fotograma, para repasar el arte.

**Arte dibujado a mano** (ver `assets/LEEME.md`):
1. `npm run plantillas` exporta cada unidad como hoja de Aseprite en `assets/plantillas/`, con sus etiquetas, el slice `pies` y el color de equipo en magenta.
2. Se dibuja encima en **Aseprite**, con la paleta del proyecto.
3. Se exporta como hoja de sprites PNG + JSON (formato *Array*, con etiquetas y slices).
4. El PNG y el JSON se guardan en `assets/units/<clave>.png` + `.json`.
5. El juego carga las animaciones por etiqueta, `<animación>/<dirección>` (por ejemplo `andar/SO`), y usa esa hoja en lugar de la figura generada.

**Edificios, terreno, recursos e interfaz** también se generan en código, con los modeladores de las secciones 5–7. Solo las unidades admiten hojas de Aseprite dibujadas a mano por ahora; si más adelante hay arte dibujado de edificios o terreno, se cargaría de la misma manera.

## 11. Orden de producción del arte

1. Casillas base (hierba, tierra, agua) + transiciones.
2. Aldeano completo (todas las animaciones).
3. Centro de la villa, casa y árboles.
4. Edificios económicos y minas.
5. Milicia, lancero, arquero y batidor.
6. Interfaz: marcos, iconos de recursos y fuente.
7. Resto de unidades y edificios por era.
8. Variantes de facción y por era.
9. Efectos, retratos y pantalla de título.
