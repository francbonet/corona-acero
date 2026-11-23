import { hash2 } from '../engine/rng';
import { Terrain } from '../map/terrain';

/**
 * Terreno pintado píxel a píxel (docs/arte.md §6), por trozos del mapa, sin casillas repetidas:
 * - Las fronteras entre terrenos se deforman con ruido continuo (en coordenadas del mundo), así que no hay
 *   costuras entre casillas ni entre trozos y cada orilla es distinta. Es un autotiling procedural.
 * - Orillas con espuma y arena mojada; el agua se oscurece con la profundidad (con tramado, sin degradados).
 * - Variación: claros y zonas secas en la hierba, matas, flores, guijarros en la tierra, ondas en la arena.
 *
 * Es puro (no usa el DOM): devuelve RGBA, así que se prueba en Node.
 */

export interface TerrainSource {
  readonly width: number;
  readonly height: number;
  terrainAt(x: number, y: number): Terrain;
  /** Árbol de la casilla al empezar la partida (0 = ninguno): debajo de los bosques el suelo es más oscuro. */
  treeAt?(x: number, y: number): number;
}

const hex = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const ramp = (...cs: string[]) => cs.map(hex);

const GRASS = ramp('#2f5a2a', '#3e7a35', '#4c8a3f', '#58994a', '#7fb85e');
const DRY = ramp('#4e5e28', '#647a32', '#76883c', '#8a9a48', '#a8b45e');
const DIRT = ramp('#4e331e', '#6a4a2c', '#7a5232', '#8a6440', '#a8804e');
const SAND = ramp('#9a8458', '#b8a06a', '#c8b078', '#d4bc84', '#e8d6a2');
/** Del agua más somera a la más profunda. */
const WATER = ramp('#6a9ccc', '#5089bd', '#3f74a8', '#33639a', '#2a5288', '#243f72', '#1d3260', '#192a52');
const FOAM = hex('#d6e6f0');
/** Suelo de bosque: hierba en sombra y hojarasca. */
const FOREST = ramp('#1a3418', '#223f1f', '#2a4a25', '#33572c', '#3f6634');
const LITTER = ramp('#3e2e16', '#5a4422', '#76602e');
const FLOWERS = ramp('#c84a3a', '#e8d6a2', '#d8b02a', '#9a7ac8');

/** Umbrales de tramado 4×4 (Bayer), de 0 a 1. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

const fl = Math.floor;
/** Ruido de valor suave (interpolación cúbica) de 0 a 1. */
function vnoise(x: number, y: number, seed: number): number {
  const xi = fl(x);
  const yi = fl(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => (hash2(a, b, seed) & 0xffff) / 0xffff;
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const rnd = (x: number, y: number, seed: number) => (hash2(x, y, seed) & 0xffff) / 0x10000;

const isWater = (t: Terrain) => t === Terrain.Shallow || t === Terrain.Deep || t === Terrain.Ford;
/** Piedras del lecho de los vados, con su sombra. */
const FORD_STONE = hex('#9a958a');
const FORD_STONE_SHADOW = hex('#4a5866');

export class TerrainPainter {
  /** Profundidad por casilla: 0 en tierra, ~1 en agua somera y más en la profunda lejos de la orilla. */
  private readonly depth: Float32Array;
  /** 1 donde había árbol al empezar (para el suelo de bosque). */
  private readonly woods: Float32Array;

  constructor(
    private readonly map: TerrainSource,
    private readonly seed = 0x7e44a,
  ) {
    const { width, height } = map;
    // Distancia (en casillas) a la tierra más cercana, por barrido doble.
    const dist = new Float32Array(width * height).fill(1e9);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (!isWater(map.terrainAt(x, y))) dist[y * width + x] = 0;
    const relax = (x: number, y: number, nx: number, ny: number, c: number) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
      const k = y * width + x;
      const v = dist[ny * width + nx] + c;
      if (v < dist[k]) dist[k] = v;
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        relax(x, y, x - 1, y, 1);
        relax(x, y, x, y - 1, 1);
        relax(x, y, x - 1, y - 1, 1.4);
        relax(x, y, x + 1, y - 1, 1.4);
      }
    }
    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        relax(x, y, x + 1, y, 1);
        relax(x, y, x, y + 1, 1);
        relax(x, y, x + 1, y + 1, 1.4);
        relax(x, y, x - 1, y + 1, 1.4);
      }
    }
    this.depth = new Float32Array(width * height);
    for (let k = 0; k < width * height; k++) {
      const t = map.terrainAt(k % width, fl(k / width));
      const d = Math.min(dist[k], 30);
      this.depth[k] = t === Terrain.Deep ? 2.6 + Math.min(4, d * 0.55) : t === Terrain.Shallow ? 0.6 + Math.min(1.2, d * 0.35) : 0;
    }
    this.woods = new Float32Array(width * height);
    if (map.treeAt) for (let k = 0; k < width * height; k++) this.woods[k] = map.treeAt(k % width, fl(k / width)) ? 1 : 0;
  }

  /** Deformación continua de las fronteras: de dónde se lee el terreno para la casilla continua (tx, ty). */
  private warp(tx: number, ty: number): [number, number] {
    const s = this.seed;
    return [
      tx + (vnoise(tx * 0.7, ty * 0.7, s) - 0.5) * 0.7 + (vnoise(tx * 1.9, ty * 1.9, s + 1) - 0.5) * 0.36 + (vnoise(tx * 5, ty * 5, s + 4) - 0.5) * 0.1,
      ty + (vnoise(tx * 0.7, ty * 0.7, s + 2) - 0.5) * 0.7 + (vnoise(tx * 1.9, ty * 1.9, s + 3) - 0.5) * 0.36 + (vnoise(tx * 5, ty * 5, s + 5) - 0.5) * 0.1,
    ];
  }

  /** ¿Se ve agua en el píxel de mundo (wx, wy), lejos de la espuma de la orilla? (para las ondas animadas) */
  isOpenWater(wx: number, wy: number): boolean {
    const cx = wx + 0.5;
    const cy = wy + 0.5;
    const ttx = (cy / 8 + cx / 16) / 2;
    const tty = (cy / 8 - cx / 16) / 2;
    if (ttx < 0 || tty < 0 || ttx >= this.map.width || tty >= this.map.height) return false;
    const [tx, ty] = this.warp(ttx, tty);
    for (const [dx, dy] of [
      [0, 0],
      [0.3, 0],
      [-0.3, 0],
      [0, 0.3],
      [0, -0.3],
    ]) {
      if (!isWater(this.terrain(tx + dx, ty + dy))) return false;
    }
    return true;
  }

  /** ¿Hay agua en alguna parte del mapa? */
  hasWater(): boolean {
    return this.depth.some((d) => d > 0);
  }

  private terrain(tx: number, ty: number): Terrain {
    const x = Math.max(0, Math.min(this.map.width - 1, fl(tx)));
    const y = Math.max(0, Math.min(this.map.height - 1, fl(ty)));
    return this.map.terrainAt(x, y);
  }

  /** Profundidad interpolada entre los centros de las casillas. */
  private depthAt(tx: number, ty: number): number {
    return this.sample(this.depth, tx, ty);
  }

  /** Valor de un campo por casilla interpolado entre los centros. */
  private sample(field: Float32Array, tx: number, ty: number): number {
    const { width, height } = this.map;
    const x = tx - 0.5;
    const y = ty - 0.5;
    const x0 = Math.max(0, Math.min(width - 1, fl(x)));
    const y0 = Math.max(0, Math.min(height - 1, fl(y)));
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const fx = Math.max(0, Math.min(1, x - x0));
    const fy = Math.max(0, Math.min(1, y - y0));
    const d = field;
    const a = d[y0 * width + x0];
    const b = d[y0 * width + x1];
    const c = d[y1 * width + x0];
    const e = d[y1 * width + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
  }

  /**
   * Pinta los píxeles de mundo [wx0, wx0 + w) × [wy0, wy0 + h) cuya casilla (sin deformar) cumple `own`
   * (así los trozos encajan sin solaparse). Devuelve RGBA; lo demás queda transparente.
   */
  paint(wx0: number, wy0: number, w: number, h: number, own: (tx: number, ty: number) => boolean): Uint8ClampedArray<ArrayBuffer> {
    const out = new Uint8ClampedArray(w * h * 4);
    const E = 0.085; // separación para detectar orillas (en casillas)
    for (let py = 0; py < h; py++) {
      const wy = wy0 + py;
      for (let px = 0; px < w; px++) {
        const wx = wx0 + px;
        const cx = wx + 0.5;
        const cy = wy + 0.5;
        const ttx = (cy / 8 + cx / 16) / 2;
        const tty = (cy / 8 - cx / 16) / 2;
        const ox = fl(ttx);
        const oy = fl(tty);
        if (ox < 0 || oy < 0 || ox >= this.map.width || oy >= this.map.height || !own(ox, oy)) continue;
        // Deformación continua de las fronteras.
        const [tx, ty] = this.warp(ttx, tty);
        const t = this.terrain(tx, ty);
        // Vecinos a poca distancia: ¿hay otro terreno cerca? (orillas y bordes)
        let other: Terrain = t;
        let near = 0; // 0 nada, 1 muy cerca, 2 cerca
        for (const [k, d] of [
          [1, E],
          [2, E * 2.2],
        ] as const) {
          for (const [dx, dy] of [
            [d, 0],
            [-d, 0],
            [0, d],
            [0, -d],
          ]) {
            const n = this.terrain(tx + dx, ty + dy);
            if (n !== t && near === 0) {
              other = n;
              near = k;
            }
          }
          if (near) break;
        }
        const color = this.colorOf(t, other, near, tx, ty, wx, wy);
        const i = (py * w + px) * 4;
        out[i] = color[0];
        out[i + 1] = color[1];
        out[i + 2] = color[2];
        out[i + 3] = 255;
      }
    }
    return out;
  }

  private colorOf(t: Terrain, other: Terrain, near: number, tx: number, ty: number, wx: number, wy: number): readonly number[] {
    const s = this.seed;
    const r = rnd(wx, wy, s + 10);
    const th = dither(wx, wy);
    if (t === Terrain.Ford) {
      // Vado: agua muy baja sobre un lecho de arena, con bancos de arena mojada y piedras para pisar.
      if (rnd(fl(wx / 2), wy, s + 72) < 0.06) return FORD_STONE;
      if (rnd(fl(wx / 2), wy - 1, s + 72) < 0.06) return FORD_STONE_SHADOW;
      const bar = vnoise(tx * 0.9, ty * 0.9, s + 71) + (vnoise(tx * 2.4, ty * 2.4, s + 73) - 0.5) * 0.3;
      if (bar > 0.6 + (th - 0.5) * 0.2) return SAND[1];
      if (bar > 0.5 + (th - 0.5) * 0.2) return SAND[0];
      return WATER[th < 0.6 ? 0 : 1];
    }
    if (isWater(t)) {
      const shore = !isWater(other) && near > 0;
      if (shore && near === 1) return FOAM;
      let level = this.depthAt(tx, ty) * 1.25 + (vnoise(tx * 0.6, ty * 0.6, s + 20) - 0.5) * 0.9;
      if (shore) level = Math.min(level, 0.4);
      // Ondas: trazos cortos horizontales algo más claros.
      const wave = (wy + fl(vnoise(wx / 24, wy / 9, s + 21) * 6)) % 7 === 0 && rnd(fl(wx / 3), wy, s + 22) < 0.35;
      if (wave) level -= 1.2;
      const base = fl(level);
      const idx = level - base > th ? base + 1 : base;
      return WATER[Math.max(0, Math.min(WATER.length - 1, idx))];
    }
    if (t === Terrain.Sand) {
      if (near === 1 && isWater(other)) return SAND[0]; // arena mojada
      const v = vnoise(tx * 0.35, ty * 0.35, s + 30);
      let i = v > 0.55 + (th - 0.5) * 0.25 ? 3 : 2;
      // Ondas de arena: arcos cortos más oscuros.
      if ((wy + fl(wx / 6)) % 6 === 0 && rnd(fl(wx / 4), wy, s + 31) < 0.4) i = 1;
      if (r < 0.04) i = 1;
      else if (r > 0.97) i = 4;
      return SAND[i];
    }
    if (t === Terrain.Dirt) {
      if (near === 1 && isWater(other)) return DIRT[0];
      const v = vnoise(tx * 0.4, ty * 0.4, s + 40);
      let i = v > 0.5 + (th - 0.5) * 0.3 ? 2 : 1;
      // Guijarros con su sombra debajo.
      if (rnd(wx, wy, s + 41) < 0.025) i = 4;
      else if (rnd(wx, wy - 1, s + 41) < 0.025) i = 0;
      else if (r < 0.08) i = Math.max(0, i - 1);
      else if (r > 0.95) i = 3;
      return DIRT[i];
    }
    // Hierba: claros más luminosos, zonas secas y matas.
    if (near === 1 && other !== Terrain.Grass) return isWater(other) ? GRASS[0] : GRASS[1];
    // Bajo los bosques: suelo en sombra con hojarasca, con el borde tramado.
    const wood = this.sample(this.woods, tx, ty) + (vnoise(tx * 1.3, ty * 1.3, s + 60) - 0.5) * 0.35;
    if (wood > 0.45 + (th - 0.5) * 0.18) {
      if (rnd(wx, wy, s + 61) < 0.07) return LITTER[hash2(wx, wy, s + 62) % 3];
      const f = vnoise(tx * 0.8, ty * 0.8, s + 63);
      return FOREST[f > 0.62 + (th - 0.5) * 0.2 ? 3 : f > 0.3 + (th - 0.5) * 0.2 ? 2 : 1];
    }
    const dry = vnoise(tx * 0.09, ty * 0.09, s + 50);
    const pal = dry > 0.68 + (th - 0.5) * 0.08 ? DRY : GRASS;
    const meadow = vnoise(tx * 0.22, ty * 0.22, s + 51) + (vnoise(tx * 0.9, ty * 0.9, s + 52) - 0.5) * 0.25;
    let i = meadow > 0.58 + (th - 0.5) * 0.22 ? 3 : meadow > 0.32 + (th - 0.5) * 0.22 ? 2 : 1;
    // Matas: dos píxeles claros en vertical con una sombra a la derecha.
    const tuft = (x: number, y: number) => rnd(x, y, s + 53) < 0.022;
    if (tuft(wx, wy) || tuft(wx, wy + 1)) i = Math.min(4, i + 1);
    else if (tuft(wx - 1, wy) || tuft(wx - 1, wy + 1)) i = Math.max(0, i - 1);
    else if (r < 0.06) i = Math.max(0, i - 1);
    // Flores sueltas en los claros.
    if (pal === GRASS && meadow > 0.55 && rnd(wx, wy, s + 54) < 0.004) return FLOWERS[hash2(fl(tx * 3), fl(ty * 3), s + 55) % FLOWERS.length];
    return pal[i];
  }
}
