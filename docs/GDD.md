# Corona y Acero — Documento de diseño (GDD)

> Nombre provisional. RTS de navegador de construcción de reinos, ambientado en la Baja Edad Media (c. 1250–1500), en pixel art isométrico.

## 1. Visión

Partidas de 20–45 minutos en las que el jugador parte de una pequeña aldea, recolecta recursos, avanza por cuatro eras históricas y derrota a sus rivales (otros reinos controlados por la IA). Es un juego de mecánicas clásicas del género con identidad propia: nombre, arte, sonido, eras y números de equilibrado originales.

**Pilares**
1. **Economía legible**: cada aldeano importa y se ve lo que hace.
2. **Contraataques claros**: todo tiene un rival natural y la composición del ejército decide la batalla.
3. **Sabor de época**: tecnologías, edificios y facciones reconocibles de la Baja Edad Media.
4. **Pixel art nítido**: legible a cualquier zoom entero.

## 2. Modos de juego

| Modo | Versión |
|---|---|
| Partida libre contra 1–3 IAs (mapa generado con semilla) | 1.0 |
| Partida en el mapa de Europa (cada corona en su capital) | 1.0 |
| Guardar y cargar partida | 1.0 |
| Campaña (Guerra de los Cien Años, Reconquista) | Expansión |
| Multijugador online (lockstep) | Expansión |
| Editor de escenarios | Expansión |

## 3. Condiciones iniciales (provisionales)

- 1 Centro de la villa, 4 aldeanos y 1 batidor.
- Recursos: 250 comida, 250 madera, 150 piedra y 100 oro.
- Población: 5 (centro de la villa). Máximo: 200.
- Recursos cerca de cada posición inicial: 1 arbusto de bayas grande, 6 ovejas, 2 ciervos, 1 jabalí, 2 minas de oro, 1 de piedra y un bosque cercano.

## 4. Recursos y economía

| Recurso | Fuentes | Punto de entrega |
|---|---|---|
| Comida | Bayas, ovejas, ciervos, jabalíes, peces, granjas | Centro de la villa, Molino (Muelle para pesca) |
| Madera | Árboles | Centro de la villa, Aserradero |
| Piedra | Minas de piedra | Centro de la villa, Campamento minero |
| Oro | Minas de oro, comercio, reliquias (expansión) | Centro de la villa, Campamento minero |

- **Capacidad de carga** del aldeano: 12 (mejorable con tecnologías).
- **Ritmo de recolección** por recurso, definido en `src/data/`; los valores se ajustan en el equilibrado.
- **Granjas**: se construyen con madera, tienen comida finita y se pueden replantar.
- **Mercado**: compra y venta de recursos con precio dinámico. Los carros de comercio entre mercados generan oro según la distancia.

## 5. Eras

| Era | Nombre | Coste para avanzar (provisional) | Requisitos | Desbloquea |
|---|---|---|---|---|
| I | **Señorío** | — | — | Economía básica, Cuartel, milicia, batidor |
| II | **Burgos** | 400 comida y 100 madera | 2 edificios de la era I | Mercado, Herrería, Galería de tiro, Caballeriza, Torre de vigía, muralla de piedra |
| III | **Coronas** | 700 comida y 250 oro | 2 edificios de la era II | Castillo, Universidad, Monasterio, Taller de asedio, caballeros, unidades únicas |
| IV | **Pólvora** | 900 comida, 700 oro y 200 piedra | Castillo o 2 edificios de la era III | Fundición, bombardas, arcabuceros, Catedral |

Avanzar de era lleva tiempo y se investiga en el Centro de la villa.

## 6. Edificios

| Edificio | Tamaño | Era | Función |
|---|---|---|---|
| Centro de la villa | 4×4 | I | Aldeanos, punto de entrega, avance de era, guarnición y disparo |
| Casa | 2×2 | I | +5 de población |
| Molino | 2×2 | I | Entrega de comida y tecnologías de granja |
| Granja | 3×3 | I | Fuente de comida |
| Aserradero | 2×2 | I | Entrega de madera y tecnologías de tala |
| Campamento minero | 2×2 | I | Entrega de piedra y oro, tecnologías de minería |
| Muelle | 3×3 | I | Barcas pesqueras (naval completo en la expansión) |
| Cuartel | 3×3 | I | Infantería |
| Empalizada | 1×1 | I | Muro barato de madera |
| Galería de tiro | 3×3 | II | Unidades a distancia |
| Caballeriza | 3×3 | II | Caballería |
| Herrería | 3×3 | II | Mejoras de ataque y armadura |
| Mercado | 4×4 | II | Comercio y carros de comercio |
| Torre de vigía | 1×1 | II | Defensa con guarnición |
| Muralla y Puerta | 1×1 | II | Defensa |
| Monasterio | 3×3 | III | Monjes y tecnologías religiosas |
| Universidad | 3×3 | III | Tecnologías de ingeniería y balística |
| Taller de asedio | 4×4 | III | Arietes, trabuquetes |
| Castillo | 4×4 | III | Unidad única y defensa fuerte |
| Fundición | 3×3 | IV | Bombardas y tecnologías de pólvora |
| Catedral | 5×5 | IV | Victoria por Catedral |

Cada edificio pasa por estos estados: **cimientos → en construcción → terminado → dañado → ruinas**. Varios aldeanos construyen más rápido, con rendimiento decreciente.

- **Reparar**: los aldeanos reparan los edificios propios dañados (salvo las granjas). Cada aldeano repone 15 puntos de vida por segundo, con el mismo rendimiento decreciente que al construir. El bonus de construcción de la facción también cuenta. Reparar un edificio entero cuesta la mitad de lo que costó, y se cobra sobre la marcha en proporción a la vida que repone. Si no hay con qué pagar, la obra se para hasta que vuelva a haber. Al terminar, el aldeano entrega lo que llevara y vuelve a su fuente.
- **Derribar**: el jugador puede derribar sus propios edificios. Se devuelve lo que hubiera en su cola, pero nada de lo construido. Si son unos cimientos, la obra se cancela y se recupera la parte del coste que aún no se había gastado.

## 7. Unidades

### Tipos de daño y armadura
- Dos tipos de ataque: **cuerpo a cuerpo (cac)** y **perforante (perf)**.
- Daño = max(1, ataque − armadura del tipo) + bonus por clase del objetivo.
- Clases: `infanteria`, `lancero`, `arquero`, `caballeria`, `caballeria_ligera`, `asedio`, `edificio`, `monje`, `aldeano`.

### Lista por línea

| Línea | Era I | Era II | Era III | Era IV | Edificio |
|---|---|---|---|---|---|
| Infantería de choque | Milicia | Hombre de armas | Espadachín | Espadachín veterano | Cuartel |
| Lanceros | — | Lancero | Piquero | Alabardero | Cuartel |
| A distancia | — | Arquero | Ballestero | Pavesero | Galería de tiro |
| Pólvora | — | — | — | Arcabucero | Galería de tiro |
| Caballería ligera | Batidor | Jinete ligero | Jinete ligero veterano | — | Caballeriza |
| Caballería pesada | — | — | Caballero | Caballero acorazado | Caballeriza |
| Asedio | — | — | Ariete, Trabuquete | Bombarda | Taller de asedio / Fundición |
| Apoyo | Aldeano, Barca pesquera | Carro de comercio | Monje | — | Varios |

### Contraataques

| Unidad | Fuerte contra | Débil contra |
|---|---|---|
| Infantería de choque | Infantería, edificios | Arqueros |
| Lanceros | Caballería | Arqueros, infantería de choque |
| A distancia | Infantería, lanceros | Caballería ligera |
| Caballería ligera | Arqueros, monjes, asedio | Lanceros |
| Caballería pesada | Casi todo | Lanceros, monjes |
| Asedio | Edificios, grupos compactos | Caballería, cuerpo a cuerpo |
| Monje | Unidades lentas y caras (conversión) | Caballería ligera |

### Comportamientos
- **Posturas**: agresiva, defensiva, mantener posición y no atacar.
- **Ataque-mover**: avanzar atacando lo que se encuentre por el camino.
- **Formación**: un grupo de soldados (4 o más, la mayoría con armas) que se mueve o avanza atacando marcha en formación hacia el destino. Va con el cuerpo a cuerpo delante, los tiradores detrás y el asedio, los monjes y los aldeanos al final, en filas de 3 a 10. Marcha al paso del soldado más lento, así que la caballería no se adelanta sola; el asedio sigue a su ritmo. Al entrar en combate, cada uno pelea a su paso.
- **Reparto de objetivos**: los atacantes se reparten entre los enemigos en vez de echarse todos encima del mismo.
  - Cada unidad admite unos 4 atacantes cuerpo a cuerpo a la vez (5 si es un jinete o un asedio; un edificio, muchos más según su tamaño). Al buscar enemigo, los que ya tienen atacantes cuentan como más lejanos, y los que no tienen sitio libre, mucho más.
  - Los tiradores también reparten algo el fuego.
  - Una orden de ataque de un grupo sobre una unidad la cumplen los más cercanos que quepan (y hasta 6 tiradores); los demás avanzan atacando a los enemigos de al lado, o a ella si no hay más.
- **Rodear**: los que pegan cuerpo a cuerpo a una unidad plantada ocupan cada uno un puesto distinto de los 8 de su alrededor, empezando por el lado por el que llegan, y lo conservan mientras la ataquen. A una unidad que se mueve o huye (un ciervo, un batidor) se la persigue.
- **Búsqueda automática de objetivos** dentro del radio de visión, según la postura.
- **Trabuquete**: se monta y se desmonta. Solo dispara montado y solo se mueve desmontado.
- **Monje**: cura a unidades aliadas y convierte enemigos (lleva tiempo y tiene alcance).
- **Guarnición**: los aldeanos y la infantería pueden entrar en el Centro de la villa, las torres y el castillo, que disparan más flechas.

## 8. Facciones

Todas comparten el árbol base. Cada una tiene de 3 a 4 bonus, una unidad única (en el castillo) y una tecnología única.

Cada corona tiene su **escudo** (pixel art de 20 × 22 en `src/render/heraldry.ts`), que sale en la pantalla de nueva partida y en el panel de reinos del HUD.

### Castilla
- **Bonus**: la caballería ligera cuesta un 15 % menos. Repoblación: los aldeanos cuestan un 10 % menos y construyen un 15 % más rápido. Trashumancia: las ovejas y la caza se recogen un 25 % más rápido. Órdenes militares (Santiago, Calatrava, Alcántara): la caballería tiene +10 de vida.
- **Unidad única**: **Jinete**, caballería ligera que lanza jabalinas a corta distancia; fuerte contra arqueros e infantería.
- **Tecnología única**: *Mesta*: las granjas dan más comida y cuestan un 20 % menos.
- **Arquitectura**: mudéjar, de ladrillo, con arcos de herradura y almenas escalonadas.
- **Heráldica**: castillo dorado sobre gules y león púrpura.

### Inglaterra
- **Bonus**: los arqueros tienen +1 de alcance desde la era III (Coronas). Las granjas rinden un 10 % más. Torres +10 % de vida.
- **Unidad única**: **Arquero de arco largo**, de gran alcance y lento.
- **Tecnología única**: *Estacas*: los arqueros clavan estacas: +4 de daño contra caballería.
- **Arquitectura**: entramado de madera y piedra gótica.
- **Heráldica**: leones dorados y cruz de San Jorge.

### Corona de Aragón
- **Bonus**: *Consolat de Mar*: el comercio rinde un 10 % más y el mercado paga un 5 % mejor. La infantería es un 10 % más rápida. *Mercaderes*: los aldeanos cargan 1 recurso más.
- **Unidad única**: **Almogàver**, infantería ligera y rápida, sin armadura; con sus azconas castiga a la caballería.
- **Tecnología única**: *Desperta ferro* (el grito de guerra de los almogàvers): la infantería gana +1 de ataque y un 10 % de velocidad.
- **Arquitectura**: gótico mediterráneo, de arenisca dorada, con encalados, tejados de teja poco inclinados, arcos apuntados y almenas rectas.
- **Heráldica**: las barras de oro y gules.
- **Estrategias de la IA**: *Companyia d'almogàvers* (infantería desde el principio y almogàvers con el castillo) y *Mercaders de la Mediterrània* (mercado pronto, ballesteros y caballería).

### Francia
- **Bonus**: la caballería pesada (caballeros y gendarmes) tiene +1 de armadura cuerpo a cuerpo y a distancia. Los castillos cuestan un 20 % menos. Las bayas se recogen un 25 % más rápido.
- **Unidad única**: **Gendarme**, caballero de las compañías de ordenanza con arnés de placas: más vida y armadura que el caballero y daño extra contra la infantería; caro y vulnerable a los lanceros.
- **Tecnología única**: *Oriflama* (el estandarte real): la caballería gana +1 de ataque y +15 de vida.
- **Arquitectura**: gótico flamígero, de caliza clara bien labrada, con pizarra azul desde la era II, tejados muy empinados, chapiteles y arcos apuntados.
- **Heráldica**: flores de lis de oro sobre azur.
- **Estrategias de la IA**: *Compañías de ordenanza* (caballería pesada y castillo pronto) y *Hueste de los Cien Años* (ballesteros y hombres de armas, con caballería detrás).

### Reino Nazarí
- **Bonus**: murallas, puertas y torres tienen un 20 % más de vida. *Acequias*: las granjas cuestan un 25 % menos (también al replantarlas). *Voluntarios del Magreb*: la infantería cuesta un 15 % menos. *Zenetes*: la caballería ligera es un 10 % más rápida.
- **Unidad única**: **Gazí**, infantería ligera de los Voluntarios de la Fe: con la adarga aguanta bien las flechas y hace daño extra a los arqueros.
- **Tecnología única**: *Alcazaba*: torres, murallas, puertas y castillos ganan +2 de armadura cuerpo a cuerpo y a distancia.
- **Arquitectura**: nazarí, de tapial rojizo, con yeserías blancas alrededor de los arcos de herradura, zócalos de alicatado y tejas verdes vidriadas en los edificios principales.
- **Heráldica**: banda de oro sobre gules con el lema *Wa-lā gāliba illā Allāh*.
- **Estrategias de la IA**: *Frontera de Granada* (caballería ligera y gazíes) y *Voluntarios de la Fe* (infantería desde el principio y ballesteros).

### Portugal
- **Bonus**: *Navegantes*: todas las unidades tienen +1 de visión. *Feitorias*: el oro se extrae un 15 % más rápido. Arqueros y ballesteros cuestan un 15 % menos.
- **Unidad única**: **Besteiro do conto**, ballestero de las milicias de los concejos: barato, algo más resistente y con daño extra también contra la caballería.
- **Tecnología única**: *Aljubarrota* (la batalla en cuadro de 1385): la infantería y los tiradores ganan +1 de armadura cuerpo a cuerpo y a distancia.
- **Arquitectura**: gótico portugués, de caliza blanca (*lioz*), encalados, teja roja poco inclinada y, desde la era III, franjas de azulejo azul y blanco.
- **Heráldica**: las quinas azules sobre plata con la bordura de castillos.
- **Estrategias de la IA**: *Besteiros do conto* (ballesteros en masa con lanceros delante) y *Hueste de Avís* (mercado y oro pronto, ballesteros y caballería).

### Escocia
- **Bonus**: los lanceros cuestan un 20 % menos. *Clanes*: la infantería tiene +1 de armadura a distancia y los lanceros, +10 de vida. *Bosques de Caledonia*: la madera se tala un 15 % más rápido.
- **Unidad única**: **Schiltron**, piqueros en formación cerrada: lentos, pero detienen cualquier carga y aguantan bien las flechas.
- **Tecnología única**: *Bannockburn* (1314): los lanceros ganan +1 de armadura cuerpo a cuerpo y +6 de daño contra la caballería.
- **Arquitectura**: casas-torre de piedra enlucida gris (*harling*), con granito en las esquinas, pizarra oscura, hastiales escalonados y arcos de medio punto.
- **Heráldica**: león rampante de gules sobre oro y la cruz de San Andrés.
- **Estrategias de la IA**: *Schiltrons de Bannockburn* (lanceros en bloque con arqueros detrás) y *Clanes de las Highlands* (infantería de choque con arqueros detrás y caballería ligera).

### Más adelante
Sacro Imperio (infantería y ciudades) y Navarra.

## 9. Tecnologías (selección)

> La lista completa, con costes, eras y efectos, está en `src/data/techs.ts`; las unidades en `src/data/units.ts`,
> los edificios en `src/data/buildings.ts` y las facciones en `src/data/factions.ts`. Los valores de este documento son orientativos.

| Edificio | Tecnología | Efecto |
|---|---|---|
| Centro de la villa | Jubón acolchado | Aldeanos más resistentes |
| Centro de la villa | Angarillas · Carro de bueyes | Aldeanos más rápidos y con más carga |
| Molino | Barbecho y abono · Molino hidráulico · Rotación trienal | Granjas con más comida |
| Aserradero | Hachas de hierro · Serrería hidráulica | Tala más rápida |
| Campamento minero | Pozos con malacate · Cuñas y barrenos | Minería más rápida |
| Herrería | Forja · Templado · Acero de Toledo (3 niveles) | Ataque cuerpo a cuerpo |
| Herrería | Gambesón · Loriga · Arnés de placas | Armadura de infantería y caballería |
| Herrería | Ballestería · Saetas templadas | Ataque y alcance a distancia |
| Mercado | Ferias francas · Letras de cambio | Mejor precio y comercio |
| Universidad | Cantería gótica · Fortificación abaluartada · Tiro parabólico | Edificios más fuertes y disparos más precisos |
| Monasterio | Predicación · Hospitalarios | Mejores monjes |
| Fundición | Pólvora refinada | Mejoras de arcabuceros y bombardas |

## 10. Gaia (naturaleza)

| Criatura | Comportamiento |
|---|---|
| Oveja | Se convierte al color de quien la ve primero. Pastoreable |
| Ciervo | Huye. Se caza |
| Jabalí | Se defiende al ser atacado. Mucha comida |
| Lobo | Ataca a las unidades cercanas; no se aleja más de 9 casillas de su guarida |
| Peces | Banco fijo en el agua |

## 11. Victoria y derrota

- **Conquista**: gana el último jugador (o equipo) con unidades o edificios en pie.
- **Catedral**: construir la Catedral y mantenerla en pie durante 10 minutos de juego.
- **Derrota**: perder todos los edificios y unidades, o rendirse (todo lo del jugador desaparece del mapa). La IA se rinde cuando se queda sin aldeanos, sin forma de hacer más y casi sin ejército.

## 12. Controles

| Acción | Control |
|---|---|
| Seleccionar | Clic izquierdo o arrastrar un recuadro |
| Añadir o quitar de la selección | Shift + clic |
| Seleccionar todas las del mismo tipo en pantalla | Doble clic sobre una unidad |
| Orden contextual (mover, recolectar, construir, reparar, entregar, punto de reunión) | Clic derecho. Sobre un edificio propio dañado, los aldeanos que llevan algo que se entrega allí lo entregan, y el resto lo repara |
| Reparar | E en el panel del aldeano y clic en el edificio (Shift para varios) |
| Derribar el edificio seleccionado | Supr (o el botón junto a su nombre) dos veces en 3 segundos. Unos cimientos se cancelan a la primera |
| Colocar varios edificios seguidos | Shift + clic al colocar |
| Grupos de control | Ctrl + 1–9 para asignar, 1–9 para seleccionar (dos veces: centrar la cámara) |
| Ataque-mover | Q en el panel militar y clic en el destino (o en un enemigo) |
| Posturas | A agresiva · S defensiva · D mantener posición · F no atacar (panel militar) |
| Guarecerse | Alt + clic derecho sobre un edificio propio con guarnición |
| Toque a rebato / expulsar | C / V con el centro de la villa seleccionado |
| Aldeano ocioso | Punto (.) |
| Botones del panel de órdenes | Rejilla de atajos Q W E R / A S D F / Z X C V |
| Cámara | Flechas o borde de pantalla; botón central para arrastrar; rueda para el zoom entero |
| Ir al Centro de la villa | H |
| Ir al último ataque recibido | Espacio |

> La cámara no usa WASD porque esas teclas forman parte de la rejilla de atajos.

## 13. Interfaz

- **Paneles flotantes en las esquinas**, para que se vea el mapa entero:
  - Arriba a la izquierda, los 4 recursos, la población (actual/máxima) y los aldeanos ociosos.
  - Arriba a la derecha, la era, el reloj y los botones de menú y sonido; debajo, los reinos de la partida (tú y cada rival con su color, su escudo, su corona y su dificultad, tachado si ha caído) y la cuenta atrás de las catedrales.
  - Abajo a la izquierda, el panel de órdenes (rejilla de 4×3) y a su lado la selección: retrato, vida y datos, y a su derecha la cola de producción o los grupos de una selección múltiple. Sin nada seleccionado, la selección no se muestra.
  - Abajo a la derecha, el minimapa.
- **Pantallas estrechas**: se acortan la era y los botones, se esconde el panel de reinos, la selección pasa a una fila propia encima de las órdenes y, en las más estrechas, las dos tiras de arriba van una debajo de otra.
- **Avisos**: "¡Nos atacan!" (como mucho cada 20 s; Espacio lleva la cámara allí), "Necesitas más casas", "Era alcanzada", rendiciones y derrotas. Pendiente: flecha en el minimapa.

## 14. Sistemas técnicos

- **Simulación determinista** a 20 ticks/s, separada del render. Posiciones en punto fijo (1 casilla = 256 unidades) y PRNG con semilla.
- **Comandos**: todo input (del jugador o de la IA) es un `Command` que entra en la cola de la simulación.
- **Mapa**: 120×120 casillas para 4 jugadores, generado por ruido con semilla, con reparto justo de recursos y autotiling de terrenos.
- **Agua y vados**: el agua no se pisa, ni la profunda ni la somera de las orillas. Se cruza solo por los **vados**: agua muy baja con arena y piedras. Al generar el mapa, si una posición inicial o una tierra grande (40 casillas o más) queda separada por agua, se abre un vado por el camino de agua más corto, de dos casillas de ancho. Si lo que la aísla es un bosque cerrado o una mina, se talan los árboles del recorrido más corto. Así todas las posiciones iniciales se alcanzan siempre a pie.
- **Mapa de Europa** (`src/map/europe.ts`, 160×160): Europa occidental con la península, Francia, las islas Británicas y algo de Italia, Alemania y el norte de África. Cada corona sale de su capital: Valladolid (Castilla), Londres (Inglaterra), Lleida (Corona de Aragón), París (Francia), Granada (Reino Nazarí), Coímbra (Portugal) y Scone (Escocia).
  - Las costas son contornos simplificados en longitud y latitud, proyectados con el norte arriba en la vista isométrica. La proyección está estilizada para que haya sitio para jugar: al norte de 50° las latitudes se comprimen un 20 %.
  - A Gran Bretaña se cruza a pie por el vado del paso de Calais. Irlanda, las Baleares, Córcega, Cerdeña y África se ven, pero no se alcanzan: los estrechos son de agua profunda.
  - Los Pirineos son un bosque cerrado de pinos con tres pasos (Roncesvalles, Somport y El Pertús). La Meseta y el sur son secos, con olivos; el norte, de robles, y Escocia y los Alpes, de pinos.
  - Cada capital tiene los mismos recursos de salida que en los mapas generados, girados hacia donde haya tierra. Hay yacimientos, caza y lobos repartidos por el resto.
  - La forma es siempre la misma; la semilla cambia los bosques, los yacimientos y los animales. En Europa no se puede repetir corona: si dos jugadores eligen la misma, el segundo pasa a ir al azar, y el azar elige entre las libres.
- **Pathfinding**: A* con presupuesto por tick, y formaciones al mover grupos (ver §7). Más adelante, flow fields.
- **Niebla de guerra**: sin explorar, explorado y visible, por jugador.
- **Orden de profundidad**: por (x + y) de la casilla base.
- **Guardar y cargar**: estado serializado en IndexedDB. Repetición = semilla + registro de comandos.

## 15. IA enemiga

Código en `src/ai/`. Cada rival lo dirige un señor histórico de su corona (Alfonso X el Sabio, Leonor de Aquitania…), elegido al azar con la semilla.

- **Reglas de juego limpio**: la IA solo da órdenes por la misma cola que el jugador y solo sabe lo que su niebla le deja ver. Recuerda los edificios enemigos que ha visto y solo los olvida cuando vuelve a ver el sitio. No hace trampas de visión en ninguna dificultad.
- **Determinismo**: decide dentro del paso de la simulación con su propio PRNG, así que una partida con IA se repite igual con la misma semilla.
- **Gestor económico**: reparte los aldeanos según la era y lo que hay en el almacén (más gente a lo que escasea y menos a lo que se acumula). Construye casas antes del tope, granjas alrededor del centro de la villa y de los molinos (y un molino nuevo cuando ya no caben), y puntos de entrega cuando los recolectores andan demasiado. Avanza de era cuando le toca y usa el mercado: compra lo que falta y vende lo que sobra cuando no hay oro. Repara los edificios dañados si no hay enemigos a menos de 6 casillas y puede pagarlo. El centro de la villa, el castillo y las torres se reparan por debajo del 85 % de vida (el centro y el castillo, con hasta 3 aldeanos). Los demás edificios, por debajo del 70 % y con un aldeano.
- **Estrategias** (2 por facción): Castilla tiene *Caballería castellana* y *Hueste de la Reconquista*; Inglaterra, *Arqueros de Crécy* y *Hombres de armas*; la Corona de Aragón, *Companyia d'almogàvers* y *Mercaders de la Mediterrània*; Francia, *Compañías de ordenanza* y *Hueste de los Cien Años*; el Reino Nazarí, *Frontera de Granada* y *Voluntarios de la Fe*; Portugal, *Besteiros do conto* y *Hueste de Avís*; Escocia, *Schiltrons de Bannockburn* y *Clanes de las Highlands*. Cada una fija sus edificios, cuándo avanza de era, la mezcla de su ejército y su agresividad.
- **Gestor militar**:
  - Corrige la mezcla según la proporción de cada clase enemiga que ha visto, con una tabla de ventajas: lanceros contra caballería, caballería ligera contra arqueros y asedio, infantería de choque contra lanceros, arqueros contra infantería.
  - Los cuarteles, galerías o caballerizas que añade son del tipo que pide esa mezcla.
  - Fabrica asedio en proporción a su ejército y guarda el oro para él si hace falta.
  - Reúne una fuerza en el punto de reunión antes de atacar, respetando el tamaño mínimo y el minuto de cada dificultad. Mantiene un objetivo común según su valor militar/económico, distancia y defensas conocidas; no divide el ejército para perseguir edificios distintos.
  - Los refuerzos esperan compañía y salen en grupo hacia el bloque principal. El ejército marcha en formación al paso del apoyo para escoltar al asedio y a los sanadores. Ante fortalezas, el asedio de largo alcance dispara con la escolta fuera del fuego defensivo.
  - Valora los combates por vida restante, mejoras, cadencia y contraataques frente a las unidades visibles. Si está claramente superada o pierde la mayor parte de la fuerza desplegada, retira también a las unidades que están combatiendo y al apoyo, y espera 25 segundos para reagruparse antes de salir otra vez.
  - Compara el acceso directo con dos flancos y sopesa distancia, defensas recordadas, tropas visibles y terreno conocido. Rodea las posiciones peligrosas cuando compensa y replantea la aproximación si descubre una nueva fortaleza. No conoce obstáculos ni tropas ocultos en terreno sin explorar.
  - Un ejército mayoritariamente de caballería sin asedio puede hostigar una economía expuesta: prioriza los trabajadores cercanos y limita la persecución a esa zona. Si aparecen defensores, mantiene el combate principal.
  - Recuerda durante 3 minutos el objetivo y el flanco de una ofensiva fallida, para favorecer otra alternativa. Si la marcha pasa 45 segundos sin avanzar ni combatir, se retira para poder probar otro acceso.
  - Si le atacan en casa, defiende con todo y toca a rebato cuando le superan.
- **Exploración**: un batidor recorre el mapa sin pararse a pelear. Si el ejército no sabe dónde está el enemigo, va a donde lo vio por última vez o barre el mapa por cuadrantes.
- **Rendición**: se rinde cuando no le quedan aldeanos ni forma de hacer más y tiene menos de 5 soldados.

| Dificultad | Decide cada | Aldeanos | Primer ataque | Tecnologías | Recolección | Era máxima |
|---|---|---|---|---|---|---|
| Fácil | 3 s | 30 | min 28 | 30 % de la lista | normal | Coronas |
| Media | 1,5 s | 55 | min 18 | 65 % | normal | Pólvora |
| Difícil | 0,75 s | 80 | min 14 | todas | +10 % | Pólvora |

Las mejoras militares solo se investigan cuando ya hay un ejército que mejorar. `npm run torneo` mide el equilibrio entre dificultades y facciones (ver la hoja de ruta, Fase 5).
