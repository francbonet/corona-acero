import { UnitType } from '../data/units';
import { Rng, hashString } from '../engine/rng';
import { GameMap } from './game-map';
import { Deposit, TERRAIN_INFO, Terrain, TreeKind } from './terrain';

export interface MapGenOptions {
  width: number;
  height: number;
  seed: string | number;
}

/** Radio (en casillas) alrededor del centro que se deja despejado: hierba y sin árboles. */
export const START_CLEAR_RADIUS = 6;

export interface Octave {
  cell: number;
  weight: number;
}

/** 8 direcciones con longitud ≈ 1 (sin trigonometría: Math.cos/sin no son deterministas entre motores). */
export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.7071, 0.7071],
  [0, 1],
  [-0.7071, 0.7071],
  [-1, 0],
  [-0.7071, -0.7071],
  [0, -1],
  [0.7071, -0.7071],
];

/**
 * Mapa de prueba: ruido de valor con semilla para lagos, playas, tierra y bosques, una posición inicial
 * en el centro con sus recursos cerca (GDD §3) y yacimientos repartidos por el resto del mapa.
 * Es determinista: la misma semilla produce siempre el mismo mapa.
 */
export function generateTestMap(options: MapGenOptions): GameMap {
  const { width: w, height: h } = options;
  const seed = typeof options.seed === 'string' ? hashString(options.seed) : options.seed >>> 0;
  const rng = new Rng(seed);

  const elevation = fractalNoise(w, h, rng, [
    { cell: 16, weight: 0.55 },
    { cell: 8, weight: 0.3 },
    { cell: 4, weight: 0.15 },
  ]);
  const soil = fractalNoise(w, h, rng, [
    { cell: 12, weight: 0.7 },
    { cell: 6, weight: 0.3 },
  ]);
  const forest = fractalNoise(w, h, rng, [
    { cell: 10, weight: 0.6 },
    { cell: 5, weight: 0.4 },
  ]);

  const map = new GameMap(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const maxDist = Math.min(w, h) / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Math.sqrt redondea igual en todos los motores (IEEE 754); Math.hypot no lo garantiza.
      const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      // Elevamos el centro para que la posición inicial quede en tierra firme.
      const e = (elevation[i] ?? 0) + 0.18 * (1 - Math.min(1, dist / maxDist));

      let terrain: Terrain;
      if (dist <= START_CLEAR_RADIUS) terrain = Terrain.Grass;
      else if (e < 0.33) terrain = Terrain.Deep;
      else if (e < 0.39) terrain = Terrain.Shallow;
      else if (e < 0.43) terrain = Terrain.Sand;
      else if ((soil[i] ?? 0) > 0.64) terrain = Terrain.Dirt;
      else terrain = Terrain.Grass;
      map.terrain[i] = terrain;

      const land = terrain === Terrain.Grass || terrain === Terrain.Dirt;
      const f = forest[i] ?? 0;
      // Consumimos el PRNG siempre en el mismo orden, haya árbol o no.
      const roll = rng.nextFloat();
      const speciesRoll = rng.nextFloat();
      if (land && dist > START_CLEAR_RADIUS + 2 && f > 0.57 && roll < 0.85) {
        let kind: TreeKind = TreeKind.Oak;
        if (terrain === Terrain.Dirt) kind = speciesRoll < 0.7 ? TreeKind.Olive : TreeKind.Oak;
        else if (e > 0.72 || speciesRoll < 0.2) kind = TreeKind.Pine;
        map.trees[i] = kind;
      }
    }
  }

  connectLand(map, [{ x: cx, y: cy }]);
  map.starts.push({ x: cx, y: cy });
  placeStartResources(map, rng, cx, cy);
  placeRandomDeposits(map, rng, cx, cy);
  placeAnimals(map, rng, cx, cy);
  return map;
}

/** Bayas, dos minas de oro y una de piedra alrededor de la posición inicial, en direcciones distintas. */
function placeStartResources(map: GameMap, rng: Rng, cx: number, cy: number): void {
  const k = rng.nextInt(8);
  const plan: [Deposit, number, number, number][] = [
    [Deposit.Berries, k, 8, 6],
    [Deposit.Gold, k + 3, 10, 5],
    [Deposit.Gold, k + 5, 11, 5],
    [Deposit.Stone, k + 6, 10, 4],
  ];
  for (const [kind, dir, dist, size] of plan) {
    const [dx, dy] = DIRECTIONS[dir % 8];
    placeCluster(map, rng, kind, Math.round(cx + dx * dist), Math.round(cy + dy * dist), size, cx, cy, START_CLEAR_RADIUS + 1);
  }
}

/** Yacimientos de oro y piedra repartidos lejos de la posición inicial. */
function placeRandomDeposits(map: GameMap, rng: Rng, cx: number, cy: number): void {
  const minDist = 16;
  for (const kind of [Deposit.Gold, Deposit.Stone, Deposit.Gold, Deposit.Stone, Deposit.Gold, Deposit.Stone, Deposit.Berries]) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = rng.nextInt(map.width);
      const y = rng.nextInt(map.height);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < minDist * minDist) continue;
      if (placeCluster(map, rng, kind, x, y, 4 + rng.nextInt(3), cx, cy, minDist)) break;
    }
  }
}

/** Casilla de hierba o tierra libre (sin árbol ni yacimiento ni animal). */
export function freeLand(map: GameMap, x: number, y: number): boolean {
  if (!map.inBounds(x, y)) return false;
  const t = map.terrainAt(x, y);
  if (t !== Terrain.Grass && t !== Terrain.Dirt && t !== Terrain.Sand) return false;
  if (map.treeAt(x, y) !== TreeKind.None || map.depositAt(x, y) !== Deposit.None) return false;
  return !map.animals.some((a) => a.x === x && a.y === y);
}

/** Dos ciervos y un jabalí cerca de la posición inicial (GDD §3) y algunos lobos y ciervos lejos. */
function placeAnimals(map: GameMap, rng: Rng, cx: number, cy: number): void {
  const k = rng.nextInt(8);
  const near: [number, number, number][] = [
    [UnitType.Deer, k + 1, 13],
    [UnitType.Deer, k + 1, 14],
    [UnitType.Boar, k + 4, 13],
  ];
  for (const [type, dir, dist] of near) {
    const [dx, dy] = DIRECTIONS[dir % 8];
    const spot = nearestFree(map, Math.round(cx + dx * dist), Math.round(cy + dy * dist));
    if (spot) map.animals.push({ type, x: spot[0], y: spot[1] });
  }
  const far: number[] = [UnitType.Wolf, UnitType.Wolf, UnitType.Wolf, UnitType.Deer, UnitType.Deer, UnitType.Boar];
  for (const type of far) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = rng.nextInt(map.width);
      const y = rng.nextInt(map.height);
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 < 20 * 20 || !freeLand(map, x, y)) continue;
      map.animals.push({ type, x, y });
      break;
    }
  }
}

export function nearestFree(map: GameMap, x: number, y: number): [number, number] | null {
  for (let r = 0; r <= 4; r++) {
    for (let ty = y - r; ty <= y + r; ty++) {
      for (let tx = x - r; tx <= x + r; tx++) {
        if (Math.max(Math.abs(tx - x), Math.abs(ty - y)) === r && freeLand(map, tx, ty)) return [tx, ty];
      }
    }
  }
  return null;
}

function suitableForDeposit(map: GameMap, x: number, y: number, cx: number, cy: number, minDist: number): boolean {
  if (!map.inBounds(x, y)) return false;
  const t = map.terrainAt(x, y);
  if (t !== Terrain.Grass && t !== Terrain.Dirt && t !== Terrain.Sand) return false;
  if (map.depositAt(x, y) !== Deposit.None) return false;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) >= minDist * minDist;
}

/**
 * Coloca un grupo de `size` casillas del yacimiento creciendo desde (ax, ay) (o la casilla válida más cercana).
 * Quita los árboles que haya debajo. Devuelve `false` si no hay sitio.
 */
export function placeCluster(
  map: GameMap,
  rng: Rng,
  kind: Deposit,
  ax: number,
  ay: number,
  size: number,
  cx: number,
  cy: number,
  minDist: number,
): boolean {
  let start: [number, number] | null = null;
  for (let r = 0; r <= 4 && !start; r++) {
    for (let y = ay - r; y <= ay + r && !start; y++) {
      for (let x = ax - r; x <= ax + r && !start; x++) {
        if (Math.max(Math.abs(x - ax), Math.abs(y - ay)) === r && suitableForDeposit(map, x, y, cx, cy, minDist)) start = [x, y];
      }
    }
  }
  if (!start) return false;
  const placed: [number, number][] = [];
  const frontier: [number, number][] = [start];
  while (placed.length < size && frontier.length > 0) {
    const [x, y] = frontier.splice(rng.nextInt(frontier.length), 1)[0];
    if (!suitableForDeposit(map, x, y, cx, cy, minDist)) continue;
    const i = map.index(x, y);
    map.deposits[i] = kind;
    map.trees[i] = TreeKind.None;
    placed.push([x, y]);
    frontier.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return placed.length > 0;
}

/** Suma de capas de ruido de valor, normalizada a [0, 1]. */
export function fractalNoise(w: number, h: number, rng: Rng, octaves: Octave[]): Float32Array {
  const out = new Float32Array(w * h);
  let total = 0;
  for (const o of octaves) {
    const layer = valueNoise(w, h, o.cell, rng);
    for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + (layer[i] ?? 0) * o.weight;
    total += o.weight;
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) / total;
  return out;
}

/** Ruido de valor: valores aleatorios en una rejilla de `cell` casillas, interpolados con suavizado. */
function valueNoise(w: number, h: number, cell: number, rng: Rng): Float32Array {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.nextFloat();

  const at = (gx: number, gy: number): number => grid[gy * gw + gx] ?? 0;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / cell;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    for (let x = 0; x < w; x++) {
      const fx = x / cell;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const top = lerp(at(x0, y0), at(x0 + 1, y0), tx);
      const bottom = lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx);
      out[y * w + x] = lerp(top, bottom, ty);
    }
  }
  return out;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface MatchMapOptions {
  width: number;
  height: number;
  seed: string | number;
  /** Número de jugadores (2–4). */
  players: number;
}

/**
 * Mapa de partida para varios jugadores: posiciones en círculo alrededor del centro, cada una con el mismo
 * conjunto de recursos (girado según su dirección, para que el reparto sea justo), bosques entre medias,
 * yacimientos extra a mitad de camino, animales cerca de cada base y lobos en zonas alejadas.
 */
export function generateMatchMap(options: MatchMapOptions): GameMap {
  const { width: w, height: h } = options;
  const n = Math.max(2, Math.min(4, options.players | 0));
  const seed = typeof options.seed === 'string' ? hashString(options.seed) : options.seed >>> 0;
  const rng = new Rng(seed);

  const elevation = fractalNoise(w, h, rng, [
    { cell: 16, weight: 0.55 },
    { cell: 8, weight: 0.3 },
    { cell: 4, weight: 0.15 },
  ]);
  const soil = fractalNoise(w, h, rng, [
    { cell: 12, weight: 0.7 },
    { cell: 6, weight: 0.3 },
  ]);
  const forest = fractalNoise(w, h, rng, [
    { cell: 10, weight: 0.6 },
    { cell: 5, weight: 0.4 },
  ]);

  // Posiciones iniciales: direcciones repartidas por igual alrededor del centro.
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const ring = Math.floor(Math.min(w, h) * 0.33);
  const k0 = rng.nextInt(8);
  const step = n === 3 ? 3 : 8 / n;
  const dirs: number[] = [];
  const starts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const dir = (k0 + Math.round(i * step)) % 8;
    const [dx, dy] = DIRECTIONS[dir];
    dirs.push(dir);
    starts.push({ x: Math.round(cx + dx * ring), y: Math.round(cy + dy * ring) });
  }

  const map = new GameMap(w, h);
  const boostRadius = Math.min(w, h) * 0.22;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let nearest = Infinity;
      for (const s of starts) nearest = Math.min(nearest, Math.sqrt((x - s.x) * (x - s.x) + (y - s.y) * (y - s.y)));
      // Tierra firme alrededor de cada base.
      const e = (elevation[i] ?? 0) + 0.2 * Math.max(0, 1 - nearest / boostRadius);
      let terrain: Terrain;
      if (nearest <= START_CLEAR_RADIUS) terrain = Terrain.Grass;
      else if (e < 0.33) terrain = Terrain.Deep;
      else if (e < 0.39) terrain = Terrain.Shallow;
      else if (e < 0.43) terrain = Terrain.Sand;
      else if ((soil[i] ?? 0) > 0.64) terrain = Terrain.Dirt;
      else terrain = Terrain.Grass;
      map.terrain[i] = terrain;

      const land = terrain === Terrain.Grass || terrain === Terrain.Dirt;
      const roll = rng.nextFloat();
      const speciesRoll = rng.nextFloat();
      if (land && nearest > START_CLEAR_RADIUS + 2 && (forest[i] ?? 0) > 0.57 && roll < 0.85) {
        let kind: TreeKind = TreeKind.Oak;
        if (terrain === Terrain.Dirt) kind = speciesRoll < 0.7 ? TreeKind.Olive : TreeKind.Oak;
        else if (e > 0.72 || speciesRoll < 0.2) kind = TreeKind.Pine;
        map.trees[i] = kind;
      }
    }
  }

  // Un bosque cercano garantizado para cada base (en la misma dirección relativa).
  starts.forEach((s, p) => {
    const [dx, dy] = DIRECTIONS[(dirs[p] + 2) % 8];
    const fx = Math.round(s.x + dx * 10);
    const fy = Math.round(s.y + dy * 10);
    for (let y = fy - 3; y <= fy + 3; y++) {
      for (let x = fx - 3; x <= fx + 3; x++) {
        if (!map.inBounds(x, y) || (x - fx) * (x - fx) + (y - fy) * (y - fy) > 10) continue;
        const t = map.terrainAt(x, y);
        if (t === Terrain.Grass || t === Terrain.Dirt) map.trees[map.index(x, y)] = TreeKind.Oak;
      }
    }
  });

  connectLand(map, starts);
  map.starts.push(...starts);
  // Mismo plan de recursos para cada jugador, girado según su dirección.
  const plan: [Deposit, number, number, number][] = [
    [Deposit.Berries, 0, 8, 6],
    [Deposit.Gold, 3, 10, 5],
    [Deposit.Gold, 5, 11, 5],
    [Deposit.Stone, 6, 10, 4],
    [Deposit.Gold, 4, 19, 5],
    [Deposit.Stone, 4, 20, 4],
  ];
  starts.forEach((s, p) => {
    for (const [kind, rel, dist, size] of plan) {
      const [dx, dy] = DIRECTIONS[(dirs[p] + rel) % 8];
      placeCluster(map, rng, kind, Math.round(s.x + dx * dist), Math.round(s.y + dy * dist), size, s.x, s.y, START_CLEAR_RADIUS + 1);
    }
    for (const [type, rel, dist] of [
      [UnitType.Deer, 1, 13],
      [UnitType.Deer, 1, 14],
      [UnitType.Boar, 7, 13],
    ] as const) {
      const [dx, dy] = DIRECTIONS[(dirs[p] + rel) % 8];
      const spot = nearestFree(map, Math.round(s.x + dx * dist), Math.round(s.y + dy * dist));
      if (spot) map.animals.push({ type, x: spot[0], y: spot[1] });
    }
  });
  // Lobos y algo de caza lejos de todas las bases.
  for (const type of [UnitType.Wolf, UnitType.Wolf, UnitType.Wolf, UnitType.Wolf, UnitType.Deer, UnitType.Deer]) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = rng.nextInt(w);
      const y = rng.nextInt(h);
      if (starts.some((s) => (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) < 22 * 22) || !freeLand(map, x, y)) continue;
      map.animals.push({ type, x, y });
      break;
    }
  }
  openForestPaths(map, starts);
  return map;
}

// ── Tierras unidas ─────────────────────────────────────────────────────

const walkableTerrain = (t: number) => TERRAIN_INFO[t as Terrain].walkable;

/**
 * Masas de tierra a las que se llega andando, numeradas desde 1 (0 = agua). Van por los 4 vecinos rectos:
 * el A* no corta esquinas, así que dos casillas que solo se tocan por la esquina no están unidas.
 */
export function landRegions(map: GameMap): { region: Int32Array; sizes: number[] } {
  const w = map.width;
  const n = w * map.height;
  const region = new Int32Array(n);
  const sizes = [0];
  const stack: number[] = [];
  for (let start = 0; start < n; start++) {
    if (region[start] || !walkableTerrain(map.terrain[start])) continue;
    const id = sizes.length;
    let size = 0;
    region[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const i = stack.pop() as number;
      size++;
      const x = i % w;
      for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
        if (j < 0 || j >= n || region[j] || !walkableTerrain(map.terrain[j])) continue;
        region[j] = id;
        stack.push(j);
      }
    }
    sizes.push(size);
  }
  return { region, sizes };
}

/**
 * El agua somera ya no se pisa, así que una posición inicial (o una tierra grande, con sus recursos) puede
 * quedar aislada. Esto las une a la tierra de la primera posición con vados: el camino más corto por el agua
 * (mejor por la somera que por la profunda), de dos casillas de ancho. Devuelve cuántos vados ha abierto.
 */
export function connectLand(map: GameMap, starts: readonly { x: number; y: number }[], minRegion = 40): number {
  if (starts.length === 0) return 0;
  const w = map.width;
  const h = map.height;
  const n = w * h;
  let fords = 0;
  for (let guard = 0; guard < 32; guard++) {
    const { region, sizes } = landRegions(map);
    const home = region[starts[0].y * w + starts[0].x];
    if (!home) return fords;
    // La primera tierra que falte por unir: la de una posición inicial, o una grande.
    let target = 0;
    for (const s of starts) {
      const r = region[s.y * w + s.x];
      if (r && r !== home) {
        target = r;
        break;
      }
    }
    if (!target) {
      for (let r = 1; r < sizes.length; r++) {
        if (r !== home && sizes[r] >= minRegion) {
          target = r;
          break;
        }
      }
    }
    if (!target) return fords;
    // Dijkstra desde toda la tierra de casa por el agua (somera 1, profunda 3), hasta tocar la tierra objetivo.
    const cost = new Int32Array(n).fill(0x7fffffff);
    const prev = new Int32Array(n).fill(-1);
    const buckets: number[][] = [[]];
    for (let i = 0; i < n; i++) {
      if (region[i] === home) {
        cost[i] = 0;
        buckets[0].push(i);
      }
    }
    let reached = -1;
    for (let c = 0; c < buckets.length && reached < 0; c++) {
      const list = buckets[c];
      if (!list) continue;
      for (let k = 0; k < list.length && reached < 0; k++) {
        const i = list[k];
        if (cost[i] !== c) continue;
        const x = i % w;
        for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
          if (j < 0 || j >= n) continue;
          if (region[j] === target) {
            prev[j] = i;
            reached = j;
            break;
          }
          if (region[j]) continue; // otra tierra: no se atraviesa
          const step = map.terrain[j] === Terrain.Deep ? 3 : 1;
          const nc = c + step;
          if (nc < cost[j]) {
            cost[j] = nc;
            prev[j] = i;
            (buckets[nc] ??= []).push(j);
          }
        }
      }
    }
    if (reached < 0) return fords;
    // El vado: las casillas de agua del camino y la de al lado, para que quepa un grupo.
    for (let i = prev[reached]; i >= 0 && region[i] !== home; i = prev[i]) {
      const x = i % w;
      const y = (i - x) / w;
      for (const [fx, fy] of [
        [x, y],
        [x + 1, y],
        [x, y + 1],
      ] as const) {
        if (fx < w && fy < h && !walkableTerrain(map.terrain[fy * w + fx])) map.terrain[fy * w + fx] = Terrain.Ford;
      }
    }
    fords++;
  }
  return fords;
}

/**
 * Los bosques (y los yacimientos) también cortan el paso: un vado que desemboca en un bosque cerrado, o una
 * sierra de pinos sin pasos, puede dejar aisladas dos posiciones iniciales. Esto abre caminos talando los
 * árboles del recorrido más corto (los árboles cuestan más que el campo abierto, así que se tala lo justo),
 * de dos casillas de ancho. Devuelve cuántos caminos ha abierto.
 */
export function openForestPaths(map: GameMap, starts: readonly { x: number; y: number }[]): number {
  if (starts.length < 2) return 0;
  const w = map.width;
  const h = map.height;
  const n = w * h;
  const free = (i: number) => walkableTerrain(map.terrain[i]) && map.trees[i] === TreeKind.None && map.deposits[i] === Deposit.None;
  let paths = 0;
  for (let guard = 0; guard < 16; guard++) {
    // Lo que se alcanza desde la primera posición por casillas libres.
    const home = new Uint8Array(n);
    const s0 = starts[0].y * w + starts[0].x;
    const stack = [s0];
    home[s0] = 1;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      const x = i % w;
      for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
        if (j < 0 || j >= n || home[j] || !free(j)) continue;
        home[j] = 1;
        stack.push(j);
      }
    }
    const lost = starts.find((s) => !home[s.y * w + s.x]);
    if (!lost) return paths;
    const goal = lost.y * w + lost.x;
    // Dijkstra desde lo alcanzado hasta la posición aislada: campo 1, árbol 4 (el agua y las minas no se cruzan).
    const cost = new Int32Array(n).fill(0x7fffffff);
    const prev = new Int32Array(n).fill(-1);
    const buckets: number[][] = [[]];
    for (let i = 0; i < n; i++) {
      if (home[i]) {
        cost[i] = 0;
        buckets[0].push(i);
      }
    }
    let found = false;
    for (let c = 0; c < buckets.length && !found; c++) {
      const list = buckets[c];
      if (!list) continue;
      for (let k = 0; k < list.length && !found; k++) {
        const i = list[k];
        if (cost[i] !== c) continue;
        if (i === goal) {
          found = true;
          break;
        }
        const x = i % w;
        for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
          if (j < 0 || j >= n || !walkableTerrain(map.terrain[j]) || map.deposits[j] !== Deposit.None) continue;
          const nc = c + (map.trees[j] === TreeKind.None ? 1 : 4);
          if (nc < cost[j]) {
            cost[j] = nc;
            prev[j] = i;
            (buckets[nc] ??= []).push(j);
          }
        }
      }
    }
    if (!found) return paths;
    for (let i = goal; i >= 0 && !home[i]; i = prev[i]) {
      const x = i % w;
      const y = (i - x) / w;
      for (const [fx, fy] of [
        [x, y],
        [x + 1, y],
        [x, y + 1],
      ] as const) {
        if (fx < w && fy < h) map.trees[fy * w + fx] = TreeKind.None;
      }
    }
    paths++;
  }
  return paths;
}
