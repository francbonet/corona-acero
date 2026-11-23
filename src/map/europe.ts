import { Faction } from '../data/factions';
import { UnitType } from '../data/units';
import { Rng, hashString } from '../engine/rng';
import { GameMap } from './game-map';
import { DIRECTIONS, START_CLEAR_RADIUS, fractalNoise, freeLand, nearestFree, openForestPaths, placeCluster } from './generator';
import { Deposit, TERRAIN_INFO, Terrain, TreeKind } from './terrain';

/**
 * Mapa de Europa occidental: la península, Francia, las islas Británicas y algo de Italia, Alemania y el norte
 * de África, con cada corona en su capital histórica.
 *
 * Las costas son contornos simplificados en longitud y latitud. Se proyectan con el norte arriba en la vista
 * isométrica: la rejilla de casillas es un rombo en pantalla, y Europa se dibuja dentro de él (el mar rellena
 * las esquinas). La proyección está algo estilizada para que haya sitio para jugar: las latitudes al norte de
 * 50° se comprimen un 20 % y las longitudes, como a 42° de latitud.
 *
 * La forma es siempre la misma; la semilla cambia los bosques, los yacimientos y los animales.
 */

export const EUROPE_SIZE = 160;

type LonLat = readonly [number, number];

/** Península, Francia y el continente hasta el borde del mapa (los puntos lejanos cierran el polígono fuera de él). */
const CONTINENT: readonly LonLat[] = [
  [16, 55], [9, 54], [8.5, 53.6], [7, 53.6], [6, 53.45], [4.8, 53], [4.55, 52.4], [4.1, 51.95], [3.5, 51.6],
  [3, 51.25], [2.4, 51.05], [1.8, 50.95], [1.6, 50.6], [1.5, 50.15], [1.1, 49.95], [0.2, 49.7], [0.1, 49.45],
  [-0.2, 49.3], [-1.1, 49.4], [-1.25, 49.7], [-1.95, 49.72], [-1.6, 49.2], [-1.5, 48.65], [-2, 48.65],
  [-2.8, 48.55], [-3.5, 48.82], [-4.6, 48.65], [-4.8, 48.35], [-4.4, 48.25], [-4.7, 48.03], [-4.2, 47.8],
  [-3.3, 47.7], [-2.7, 47.5], [-2.2, 47.25], [-2.1, 46.8], [-1.8, 46.5], [-1.15, 46.15], [-1.15, 45.6],
  [-1.25, 44.65], [-1.45, 43.6], [-1.8, 43.38], [-2.9, 43.4], [-3.8, 43.47], [-5, 43.5], [-5.85, 43.65],
  [-7, 43.55], [-7.7, 43.78], [-8.4, 43.4], [-9, 43.2], [-9.3, 42.9], [-8.9, 42.4], [-8.85, 41.9], [-8.7, 41.15],
  [-8.95, 40.2], [-9.35, 39.4], [-9.5, 38.75], [-9.2, 38.4], [-8.8, 37.95], [-8.85, 37.4], [-9, 37], [-8, 37.05],
  [-7.4, 37.18], [-6.9, 37.15], [-6.4, 36.8], [-6.25, 36.5], [-5.95, 36.15], [-5.6, 36], [-5.35, 36.15],
  [-4.4, 36.7], [-3.5, 36.72], [-2.6, 36.72], [-2.15, 36.72], [-1.85, 37.2], [-1.3, 37.55], [-0.75, 37.6],
  [-0.75, 37.85], [-0.5, 38.3], [0.2, 38.75], [-0.15, 39], [-0.3, 39.45], [-0.05, 39.95], [0.5, 40.5],
  [0.9, 40.7], [1.25, 41.1], [2.15, 41.35], [2.8, 41.7], [3.2, 41.95], [3.3, 42.3], [3.05, 42.55], [3.05, 42.95],
  [3.55, 43.3], [4.2, 43.45], [4.9, 43.35], [5.4, 43.25], [6, 43.1], [6.7, 43.4], [7.3, 43.7], [8, 43.85],
  [8.9, 44.4], [9.8, 44.1], [10.3, 43.5], [11, 42.5], [12.5, 41.6], [16, 41],
];

const BRITAIN: readonly LonLat[] = [
  [1.38, 51.13], [1.42, 51.38], [0.7, 51.48], [0.95, 51.62], [1.25, 51.85], [1.6, 52.1], [1.75, 52.5], [1.65, 52.75],
  [1.3, 52.95], [0.5, 52.95], [0.25, 52.8], [0.35, 53.1], [0.1, 53.5], [0.1, 53.62], [-0.1, 54.1], [-0.6, 54.48],
  [-1.15, 54.62], [-1.4, 55], [-1.55, 55.6], [-2, 55.8], [-2.5, 56], [-2.8, 56.05], [-2.6, 56.28], [-2.8, 56.45],
  [-2.5, 56.6], [-2.1, 57.1], [-1.8, 57.5], [-2, 57.68], [-3, 57.7], [-4, 57.58], [-3.8, 57.85], [-3.1, 58.3],
  [-3.05, 58.64], [-3.4, 58.65], [-4.4, 58.55], [-5, 58.62], [-5.3, 58.25], [-5.2, 57.9], [-5.7, 57.6],
  [-5.8, 57.25], [-6.2, 56.7], [-5.5, 56.45], [-5.6, 56], [-5.8, 55.3], [-4.9, 55.4], [-5.1, 55], [-4.9, 54.65],
  [-4.4, 54.75], [-3.6, 54.9], [-3.3, 54.95], [-3.45, 54.5], [-3.05, 54], [-3, 53.4], [-3.6, 53.3], [-4.6, 53.4],
  [-4.75, 52.8], [-4.05, 52.4], [-4.6, 52.1], [-5.3, 51.88], [-5.05, 51.65], [-4.3, 51.65], [-4, 51.58],
  [-3.2, 51.45], [-2.7, 51.55], [-3.1, 51.2], [-4.2, 51.2], [-4.55, 51], [-5, 50.6], [-5.7, 50.07], [-5.2, 49.96],
  [-4.7, 50.3], [-4.1, 50.33], [-3.65, 50.22], [-3.45, 50.6], [-2.95, 50.7], [-2.45, 50.55], [-1.95, 50.6],
  [-1.3, 50.75], [-0.8, 50.73], [-0.1, 50.8], [0.25, 50.74], [0.97, 50.91], [1.2, 51.05],
];

const IRELAND: readonly LonLat[] = [
  [-6.2, 55.2], [-5.5, 54.6], [-6, 54], [-6.1, 53.3], [-6.05, 52.9], [-6.35, 52.2], [-7.5, 52.05], [-8.3, 51.8],
  [-9.8, 51.45], [-10.4, 51.9], [-10.4, 52.15], [-9.7, 52.6], [-10.1, 53.4], [-10, 54.2], [-8.6, 54.3], [-8.8, 54.65],
  [-8.3, 55.15], [-7.4, 55.38],
];

const MALLORCA: readonly LonLat[] = [[2.35, 39.55], [2.7, 39.95], [3.2, 39.95], [3.45, 39.7], [3.2, 39.35], [2.75, 39.35]];
const MENORCA: readonly LonLat[] = [[3.8, 39.95], [4.3, 40.08], [4.32, 39.82], [3.85, 39.9]];
const IBIZA: readonly LonLat[] = [[1.2, 38.95], [1.6, 39.12], [1.62, 38.88], [1.3, 38.82]];
const CORSICA: readonly LonLat[] = [[8.6, 42], [8.7, 42.6], [9.4, 43], [9.55, 42.1], [9.2, 41.38], [8.8, 41.6]];
const SARDINIA: readonly LonLat[] = [[8.2, 40.9], [8.4, 39], [9, 38.9], [9.6, 39.2], [9.8, 40.5], [9.4, 41.25], [8.6, 41]];
/** El norte de África (decorado: el estrecho queda de agua profunda). */
const AFRICA: readonly LonLat[] = [
  [-14, 33], [-6.8, 34], [-6.1, 35.3], [-5.8, 35.62], [-5.3, 35.68], [-4.4, 35.2], [-2.9, 35.3], [-1.3, 35.3],
  [-0.6, 35.75], [0.1, 36], [1, 36.5], [2, 36.6], [3, 36.8], [4.5, 36.9], [6.5, 37.05], [8.5, 36.95], [10.2, 37.2],
  [12, 33],
];

/** Tierras del mapa: el índice (+1) es el número de cada masa de tierra. */
const LANDS: readonly (readonly LonLat[])[] = [CONTINENT, BRITAIN, IRELAND, MALLORCA, MENORCA, IBIZA, CORSICA, SARDINIA, AFRICA];
const CONTINENT_ID = 1;
const BRITAIN_ID = 2;

/** Capitales: dónde empieza cada corona (longitud, latitud). */
export const EUROPE_CAPITALS: Readonly<Record<Faction, { readonly name: string; readonly at: LonLat }>> = {
  [Faction.Castilla]: { name: 'Valladolid', at: [-4.6, 41.55] },
  [Faction.Inglaterra]: { name: 'Londres', at: [-0.7, 51.65] },
  [Faction.Aragon]: { name: 'Lleida', at: [0.75, 41.65] },
  [Faction.Francia]: { name: 'París', at: [2.35, 48.75] },
  [Faction.Nazari]: { name: 'Granada', at: [-3.6, 37.4] },
  [Faction.Portugal]: { name: 'Coímbra', at: [-8.25, 39.85] },
  [Faction.Escocia]: { name: 'Scone', at: [-3.6, 56.45] },
};

/** El vado del paso de Calais, entre Dover y Calais: la única manera de cruzar a Gran Bretaña a pie (el agua no se pisa). */
const FORD: readonly [LonLat, LonLat] = [
  [1.3, 51.12],
  [1.85, 50.94],
];

/** Cresta de los Pirineos (bosque cerrado) y sus pasos: Roncesvalles, Somport y El Pertús. */
const PYRENEES: readonly LonLat[] = [[-1.85, 43.2], [-1, 43.0], [0, 42.78], [1.5, 42.6], [3.1, 42.45]];
const PYRENEES_PASSES: readonly (readonly [number, number])[] = [
  [-1.45, -1.05],
  [-0.65, -0.35],
  [2.6, 3.1],
];

// ── Proyección ─────────────────────────────────────────────────────────

/** Coseno de 42° (fijo: Math.cos no es determinista entre motores). */
const LON_SCALE = 0.743;
const LON_CENTER = -4.2;
const LAT_CENTER = 45.9;
/** Unidades del rombo (−1…1) por grado. */
const SCALE = 0.0776;

/** Latitud estilizada: al norte de 50° se comprime un 20 %. */
function squeezeLat(lat: number): number {
  return lat <= 50 ? lat : 50 + (lat - 50) * 0.8;
}

function unsqueezeLat(s: number): number {
  return s <= 50 ? s : 50 + (s - 50) / 0.8;
}

/** (longitud, latitud) → (e, n) en el rombo: e de oeste a este y n de sur a norte, con |e| + |n| ≤ 1. */
export function projectLonLat(lon: number, lat: number): [number, number] {
  return [(lon - LON_CENTER) * LON_SCALE * SCALE, (squeezeLat(lat) - LAT_CENTER) * SCALE];
}

function unproject(e: number, n: number): [number, number] {
  return [LON_CENTER + e / SCALE / LON_SCALE, unsqueezeLat(LAT_CENTER + n / SCALE)];
}

/** Casilla (centro) → (e, n). La casilla (0, 0) es la esquina de arriba del rombo (el norte). */
function tileToDiamond(tx: number, ty: number, size: number): [number, number] {
  return [(tx - ty) / size, 1 - (tx + ty + 1) / size];
}

/** (e, n) → casilla. */
export function diamondToTile(e: number, n: number, size: number): [number, number] {
  return [Math.round((size * (1 - n + e) - 1) / 2), Math.round((size * (1 - n - e) - 1) / 2)];
}

function insidePolygon(lon: number, lat: number, poly: readonly LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Masa de tierra en (longitud, latitud): 0 = mar. */
export function landAt(lon: number, lat: number): number {
  for (let i = 0; i < LANDS.length; i++) if (insidePolygon(lon, lat, LANDS[i])) return i + 1;
  return 0;
}

/** Tierra en un punto del rombo (para la miniatura del menú). */
export function europeLandAtDiamond(e: number, n: number): number {
  const [lon, lat] = unproject(e, n);
  return landAt(lon, lat);
}

/** Casilla de la capital de una corona. */
export function capitalTile(faction: Faction, size = EUROPE_SIZE): { x: number; y: number } {
  const [lon, lat] = EUROPE_CAPITALS[faction].at;
  const [e, n] = projectLonLat(lon, lat);
  const [x, y] = diamondToTile(e, n, size);
  return { x, y };
}

/** Latitud de la cresta de los Pirineos en una longitud (o null fuera de ellos). */
function pyreneesLat(lon: number): number | null {
  for (let i = 0; i + 1 < PYRENEES.length; i++) {
    const [x0, y0] = PYRENEES[i];
    const [x1, y1] = PYRENEES[i + 1];
    if (lon >= x0 && lon <= x1) return y0 + ((y1 - y0) * (lon - x0)) / (x1 - x0);
  }
  return null;
}

// ── Generación ─────────────────────────────────────────────────────────

export interface EuropeMapOptions {
  readonly seed: string | number;
  /** Corona de cada jugador, en orden: el jugador i + 1 sale de la capital de factions[i]. Sin repetir. */
  readonly factions: readonly Faction[];
  readonly size?: number;
}

export function generateEuropeMap(options: EuropeMapOptions): GameMap {
  const size = options.size ?? EUROPE_SIZE;
  const seed = typeof options.seed === 'string' ? hashString(options.seed) : options.seed >>> 0;
  const rng = new Rng(seed ^ 0x4e55524f);
  const map = new GameMap(size, size);
  const count = size * size;

  const wobbleLon = fractalNoise(size, size, rng, [
    { cell: 9, weight: 0.6 },
    { cell: 4, weight: 0.4 },
  ]);
  const wobbleLat = fractalNoise(size, size, rng, [
    { cell: 9, weight: 0.6 },
    { cell: 4, weight: 0.4 },
  ]);
  const soil = fractalNoise(size, size, rng, [
    { cell: 12, weight: 0.65 },
    { cell: 5, weight: 0.35 },
  ]);
  const forest = fractalNoise(size, size, rng, [
    { cell: 10, weight: 0.6 },
    { cell: 4, weight: 0.4 },
  ]);
  const beach = fractalNoise(size, size, rng, [{ cell: 6, weight: 1 }]);

  // Tierra: cada casilla mira en qué contorno cae (con la costa algo irregular).
  const land = new Uint8Array(count);
  const lonOf = new Float32Array(count);
  const latOf = new Float32Array(count);
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const i = ty * size + tx;
      const [e, n] = tileToDiamond(tx, ty, size);
      const [lon, lat] = unproject(e, n);
      lonOf[i] = lon;
      latOf[i] = lat;
      land[i] = landAt(lon + (wobbleLon[i] - 0.5) * 0.45, lat + (wobbleLat[i] - 0.5) * 0.35);
    }
  }

  const starts = options.factions.map((f) => capitalTile(f, size));
  // Alrededor de cada capital, tierra firme seguro.
  for (const s of starts) {
    for (let y = s.y - START_CLEAR_RADIUS - 2; y <= s.y + START_CLEAR_RADIUS + 2; y++) {
      for (let x = s.x - START_CLEAR_RADIUS - 2; x <= s.x + START_CLEAR_RADIUS + 2; x++) {
        if (!map.inBounds(x, y)) continue;
        const i = y * size + x;
        if (land[i] === 0 && (x - s.x) ** 2 + (y - s.y) ** 2 <= (START_CLEAR_RADIUS + 2) ** 2) land[i] = landAt(lonOf[i], latOf[i]) || CONTINENT_ID;
      }
    }
  }

  // Agua: somera junto a la costa, salvo donde la costa de enfrente es de otra tierra (así nadie cruza a pie).
  const nearby = (x: number, y: number, r: number): number[] => {
    const ids: number[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const id = land[ny * size + nx];
        if (id && !ids.includes(id)) ids.push(id);
      }
    }
    return ids;
  };
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const i = ty * size + tx;
      if (land[i]) {
        const coast = nearby(tx, ty, 1).length > 0 && hasWaterAround(land, size, tx, ty);
        let terrain: Terrain = Terrain.Grass;
        const lat = latOf[i];
        const lon = lonOf[i];
        const iberia = land[i] === CONTINENT_ID && lat < 43.2 && lon < 3.4;
        const africa = land[i] === LANDS.length;
        // La Meseta y el sur, secos; algo de tierra suelta en el resto.
        const dry = africa ? 0.2 : iberia ? 0.62 - (42.5 - lat) * 0.05 : 0.74;
        if (coast && beach[i] > 0.38) terrain = Terrain.Sand;
        else if (soil[i] > dry) terrain = Terrain.Dirt;
        map.terrain[i] = terrain;
      } else {
        const near1 = nearby(tx, ty, 1);
        const near2 = nearby(tx, ty, 2);
        map.terrain[i] = near1.length === 1 && near2.length === 1 ? Terrain.Shallow : Terrain.Deep;
      }
    }
  }

  // El vado del paso de Calais.
  const [a, b] = FORD.map(([lon, lat]) => {
    const [e, n] = projectLonLat(lon, lat);
    return diamondToTile(e, n, size);
  });
  const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2 + 1;
  for (let k = 0; k <= steps; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / steps;
    const y = a[1] + ((b[1] - a[1]) * k) / steps;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const fx = Math.round(x + dx * 0.75);
        const fy = Math.round(y + dy * 0.75);
        if (map.inBounds(fx, fy) && land[fy * size + fx] === 0) map.terrain[fy * size + fx] = Terrain.Ford;
      }
    }
  }

  // Bosques: robles en el norte, pinos en Escocia y en las montañas, olivos en el sur de la península.
  for (let i = 0; i < count; i++) {
    const t = map.terrain[i];
    if (t !== Terrain.Grass && t !== Terrain.Dirt) continue;
    const x = i % size;
    const y = Math.floor(i / size);
    if (starts.some((s) => (x - s.x) ** 2 + (y - s.y) ** 2 <= (START_CLEAR_RADIUS + 2) ** 2)) continue;
    const lat = latOf[i];
    const lon = lonOf[i];
    const roll = rng.nextFloat();
    const species = rng.nextFloat();
    // Pirineos: un bosque cerrado a lo largo de la cresta, con sus pasos.
    const ridge = land[i] === CONTINENT_ID ? pyreneesLat(lon) : null;
    if (ridge !== null && Math.abs(lat - ridge) < 0.22 && !PYRENEES_PASSES.some(([w, e]) => lon >= w && lon <= e)) {
      map.trees[i] = TreeKind.Pine;
      continue;
    }
    const alps = land[i] === CONTINENT_ID && lon > 6.3 && lat > 44.6 && lat < 47.2;
    const south = lat < 40;
    const threshold = alps ? 0.5 : land[i] === LANDS.length ? 0.72 : south ? 0.64 : lat < 43 ? 0.6 : 0.55;
    if (forest[i] <= threshold || roll > 0.85) continue;
    let kind: TreeKind = TreeKind.Oak;
    if (alps || lat > 55.3 || (lat > 42.6 && lat < 43.6 && lon < -3) || species < 0.15) kind = TreeKind.Pine;
    else if ((south || t === Terrain.Dirt) && lat < 42 && species < 0.75) kind = TreeKind.Olive;
    map.trees[i] = kind;
  }

  // Lo que se puede alcanzar a pie desde la primera capital (los yacimientos y animales van solo ahí).
  const reach = reachable(map, starts[0] ?? { x: size >> 1, y: size >> 1 });

  map.starts.push(...starts);
  starts.forEach((s, p) => placeStartKit(map, rng, s, reach, p));

  // Yacimientos y animales repartidos por el resto de las tierras alcanzables, lejos de las capitales.
  const farFromStarts = (x: number, y: number, d: number) => starts.every((s) => (x - s.x) ** 2 + (y - s.y) ** 2 >= d * d);
  const extras: Deposit[] = [];
  for (let k = 0; k < 9; k++) extras.push(Deposit.Gold, Deposit.Stone);
  extras.push(Deposit.Berries, Deposit.Berries, Deposit.Berries);
  for (const kind of extras) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = rng.nextInt(size);
      const y = rng.nextInt(size);
      if (!reach[y * size + x] || !farFromStarts(x, y, 18)) continue;
      if (placeCluster(map, rng, kind, x, y, 4 + rng.nextInt(3), x, y, 0)) break;
    }
  }
  const wild: UnitType[] = [UnitType.Wolf, UnitType.Wolf, UnitType.Wolf, UnitType.Wolf, UnitType.Wolf, UnitType.Wolf];
  for (let k = 0; k < 10; k++) wild.push(UnitType.Deer);
  wild.push(UnitType.Boar, UnitType.Boar, UnitType.Boar);
  for (const type of wild) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = rng.nextInt(size);
      const y = rng.nextInt(size);
      if (!reach[y * size + x] || !farFromStarts(x, y, 22) || !freeLand(map, x, y)) continue;
      map.animals.push({ type, x, y });
      break;
    }
  }
  // Que los bosques (el de la orilla del vado, los Pirineos…) y los yacimientos no dejen a nadie aislado.
  openForestPaths(map, starts);
  return map;
}

function hasWaterAround(land: Uint8Array, size: number, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && land[ny * size + nx] === 0) return true;
    }
  }
  return false;
}

/** Casillas a las que se llega andando desde `from` (hierba, tierra, arena y vados; el agua no se pisa). */
export function reachable(map: GameMap, from: { x: number; y: number }): Uint8Array {
  const w = map.width;
  const seen = new Uint8Array(w * map.height);
  const walkable = (i: number) => TERRAIN_INFO[map.terrain[i] as Terrain].walkable;
  const start = from.y * w + from.x;
  if (!map.inBounds(from.x, from.y) || !walkable(start)) return seen;
  const stack = [start];
  seen[start] = 1;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    // Los 4 vecinos rectos: el A* no corta esquinas.
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!map.inBounds(nx, ny)) continue;
      const j = ny * w + nx;
      if (!seen[j] && walkable(j)) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return seen;
}

/**
 * Los recursos de salida de una capital (los mismos que en los mapas generados: bayas, oro, piedra, un bosque,
 * ciervos y un jabalí), girados hacia donde haya más tierra para que no caigan al mar.
 */
function placeStartKit(map: GameMap, rng: Rng, s: { x: number; y: number }, reach: Uint8Array, p: number): void {
  const plan: [Deposit, number, number, number][] = [
    [Deposit.Berries, 0, 8, 6],
    [Deposit.Gold, 3, 10, 5],
    [Deposit.Gold, 5, 11, 5],
    [Deposit.Stone, 6, 10, 4],
    [Deposit.Gold, 4, 18, 5],
    [Deposit.Stone, 4, 19, 4],
  ];
  const onLand = (x: number, y: number) => map.inBounds(x, y) && reach[y * map.width + x] === 1 && map.terrain[y * map.width + x] !== Terrain.Ford;
  const anchor = (dir: number, dist: number): [number, number] => {
    const [dx, dy] = DIRECTIONS[dir % 8];
    return [Math.round(s.x + dx * dist), Math.round(s.y + dy * dist)];
  };
  // El giro con más puntos del plan en tierra (empate: el primero desde uno al azar por jugador).
  const k0 = (rng.nextInt(8) + p) % 8;
  let best = k0;
  let bestScore = -1;
  for (let r = 0; r < 8; r++) {
    const k = (k0 + r) % 8;
    let score = 0;
    for (const [, rel, dist] of plan) if (onLand(...anchor(k + rel, dist))) score++;
    if (onLand(...anchor(k + 2, 10))) score++;
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  // Bosque cercano.
  const [fx, fy] = anchor(best + 2, 10);
  for (let y = fy - 3; y <= fy + 3; y++) {
    for (let x = fx - 3; x <= fx + 3; x++) {
      if (!map.inBounds(x, y) || (x - fx) ** 2 + (y - fy) ** 2 > 10) continue;
      const t = map.terrainAt(x, y);
      if ((t === Terrain.Grass || t === Terrain.Dirt) && map.depositAt(x, y) === Deposit.None) map.trees[map.index(x, y)] = TreeKind.Oak;
    }
  }
  for (const [kind, rel, dist, size] of plan) {
    let [ax, ay] = anchor(best + rel, dist);
    // Si cae al mar, prueba los giros vecinos.
    for (let r = 1; r < 8 && !onLand(ax, ay); r++) [ax, ay] = anchor(best + rel + (r % 2 ? (r + 1) / 2 : -r / 2), dist);
    if (onLand(ax, ay)) placeCluster(map, rng, kind, ax, ay, size, s.x, s.y, START_CLEAR_RADIUS + 1);
  }
  for (const [type, rel, dist] of [
    [UnitType.Deer, 1, 13],
    [UnitType.Deer, 1, 14],
    [UnitType.Boar, 7, 13],
  ] as const) {
    const [ax, ay] = anchor(best + rel, dist);
    const spot = nearestFree(map, ax, ay);
    if (spot && reach[spot[1] * map.width + spot[0]]) map.animals.push({ type, x: spot[0], y: spot[1] });
  }
}

export { BRITAIN_ID, CONTINENT_ID };
