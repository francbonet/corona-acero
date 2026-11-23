import { hash2 } from '../engine/rng';

/**
 * Recursos del mapa (docs/arte.md §6): árboles (roble, pino y olivo, con tres variantes cada uno), minas de oro
 * y de piedra y arbustos de bayas, cada uno con su versión "agotándose".
 *
 * Se pintan con volúmenes redondeados: esferas y elipsoides sombreados con la luz de arriba a la izquierda,
 * con ruido para la textura de las hojas o facetas para la roca, contorno oscuro del propio color y sombra
 * plana en el suelo. Es puro (no usa el DOM): devuelve RGBA.
 */

type RGB = readonly [number, number, number];
/** Rampa de oscuro a claro (5 tonos). */
type Ramp = readonly RGB[];

const hex = (h: string): RGB => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const ramp = (...cs: string[]): Ramp => cs.map(hex);

export const NATURE_RAMPS = {
  oak: ramp('#1c3a1e', '#2a5428', '#3a7032', '#528e42', '#78b25a'),
  pine: ramp('#11281c', '#1a3826', '#234a33', '#2f6040', '#45805a'),
  olive: ramp('#2e3820', '#46542c', '#5d6b3a', '#7a8a4a', '#a0ae6a'),
  bark: ramp('#24170e', '#3b2716', '#5c3d24', '#7a5232', '#94683e'),
  wood: ramp('#5c4428', '#8a6a42', '#b08a5a', '#d4b080', '#ecd0a0'),
  rock: ramp('#2e2a26', '#5e584e', '#7e786c', '#a09888', '#c4bcac'),
  goldRock: ramp('#2e261c', '#5a4c3a', '#7a6a52', '#9a8a6c', '#b8a888'),
  gold: ramp('#5a3c0c', '#a8782a', '#e3b23c', '#f2cc5a', '#fff0a8'),
  bush: ramp('#12301e', '#1e4a2c', '#2c6440', '#3c7e50', '#5a9a68'),
  berry: ramp('#4a0e18', '#8a1f2f', '#c8344a', '#ef4f5f', '#ff9aa4'),
} as const;

export interface NatureImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  /** Píxel donde va el centro de la casilla (el pie del árbol o el centro del montón). */
  readonly anchorX: number;
  readonly anchorY: number;
}

const fl = Math.floor;
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
const rnd = (a: number, b: number, seed: number) => (hash2(a, b, seed) & 0xffff) / 0x10000;

/** Hacia la luz, en pantalla (x a la derecha, y hacia abajo, z hacia la cámara). */
const L = (() => {
  const v = [-0.55, -0.6, 0.58];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

interface SphereOpts {
  /** Escala vertical (elipsoides achatados). */
  readonly squash?: number;
  /** Textura: cuánto ruido se suma a la luz (hojas). */
  readonly noise?: number;
  /** Escala del ruido en píxeles. */
  readonly grain?: number;
  /** Facetas: cuantiza la normal (rocas). */
  readonly facets?: number;
  /** Profundidad extra (lo que va delante). */
  readonly depth?: number;
  /** Detalle pintado: devuelve otra rampa y tono, o nada. */
  readonly speck?: (x: number, y: number, tone: number) => readonly [Ramp, number] | null;
  /** Copa entera a la que pertenece: más luz arriba a la izquierda del conjunto y menos abajo a la derecha. */
  readonly canopy?: { readonly x: number; readonly y: number; readonly r: number; readonly k: number };
}

/** Lienzo con profundidad donde se van añadiendo volúmenes. */
class Canvas {
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  private readonly depth: Float32Array;
  private readonly owner: Int16Array;
  private readonly ramps: Ramp[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly seed: number,
  ) {
    this.rgba = new Uint8ClampedArray(width * height * 4);
    this.depth = new Float32Array(width * height).fill(-Infinity);
    this.owner = new Int16Array(width * height).fill(-1);
  }

  private put(x: number, y: number, d: number, r: Ramp, tone: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const k = y * this.width + x;
    if (d <= this.depth[k]) return;
    this.depth[k] = d;
    let idx = this.ramps.indexOf(r);
    if (idx < 0) idx = this.ramps.push(r) - 1;
    this.owner[k] = idx;
    const c = r[Math.max(0, Math.min(r.length - 1, tone))];
    this.rgba[k * 4] = c[0];
    this.rgba[k * 4 + 1] = c[1];
    this.rgba[k * 4 + 2] = c[2];
    this.rgba[k * 4 + 3] = 255;
  }

  /** Esfera (o elipsoide) de radio r con centro en pantalla (cx, cy). */
  sphere(cx: number, cy: number, r: number, rp: Ramp, o: SphereOpts = {}): void {
    const sq = o.squash ?? 1;
    const ry = r * sq;
    const n = rp.length - 1;
    for (let y = fl(cy - ry) - 1; y <= cy + ry + 1; y++) {
      for (let x = fl(cx - r) - 1; x <= cx + r + 1; x++) {
        const ex = (x + 0.5 - cx) / r;
        const ey = (y + 0.5 - cy) / ry;
        const d2 = ex * ex + ey * ey;
        if (d2 > 1) continue;
        let nx = ex;
        let ny = ey;
        let nz = Math.sqrt(1 - d2);
        if (o.facets) {
          const f = o.facets;
          nx = Math.round(nx * f) / f;
          ny = Math.round(ny * f) / f;
          nz = Math.round(nz * f) / f;
        }
        const len = Math.hypot(nx, ny, nz) || 1;
        let light = (nx * L[0] + ny * L[1] + nz * L[2]) / len;
        if (o.noise) light += (vnoise((x + cx * 3) / (o.grain ?? 2.2), (y + cy * 5) / (o.grain ?? 2.2), this.seed) - 0.5) * o.noise;
        if (o.canopy) {
          const g = o.canopy;
          light += (((x + 0.5 - g.x) * L[0] + (y + 0.5 - g.y) * L[1]) / g.r) * g.k;
        }
        let tone = Math.round(((light + 0.15) / 1.05) * n);
        tone = Math.max(1, Math.min(n, tone));
        let rr = rp;
        const sp = o.speck?.(x, y, tone);
        if (sp) [rr, tone] = sp;
        this.put(x, y, (o.depth ?? 0) + cy + Math.sqrt(Math.max(0, 1 - d2)) * ry, rr, tone);
      }
    }
  }

  /** Columna (tronco, tocón): rectángulo con luz a la izquierda. */
  column(x0: number, y0: number, w: number, h: number, rp: Ramp, depth: number, top?: Ramp): void {
    for (let y = fl(y0); y < y0 + h; y++) {
      for (let x = fl(x0); x < x0 + w; x++) {
        const t = (x + 0.5 - x0) / w;
        const tone = t < 0.34 ? 3 : t < 0.67 ? 2 : 1;
        const isTop = top && y < y0 + 1.5;
        this.put(x, y, depth, isTop ? top : rp, isTop ? 3 : tone - (rnd(x, fl(y / 3), this.seed) < 0.2 ? 1 : 0));
      }
    }
  }

  /** Tronco tumbado a lo largo de una diagonal de la rejilla (hacia abajo a la derecha), con el corte al principio. */
  log(x: number, y: number, len: number, thick: number, rp: Ramp, end: Ramp, depth: number): void {
    for (let i = 0; i < len; i++) {
      const px = x + i;
      const py = y + i / 2;
      for (let t = 0; t < thick; t++) this.put(fl(px), fl(py - t), depth + i * 0.1, rp, t === thick - 1 ? 3 : t === 0 ? 1 : 2);
    }
    // Corte del tronco, más claro.
    for (let t = 0; t < thick; t++) {
      this.put(fl(x - 1), fl(y - t), depth + 1, end, t === 0 ? 2 : 3);
      this.put(fl(x), fl(y - t), depth + 1, end, t === thick - 1 ? 4 : 3);
    }
  }

  /** Píxel suelto por encima de todo (brillos). */
  spark(x: number, y: number, c: RGB): void {
    const k = (y * this.width + x) * 4;
    this.rgba[k] = c[0];
    this.rgba[k + 1] = c[1];
    this.rgba[k + 2] = c[2];
    this.rgba[k + 3] = 255;
  }

  /** Contorno exterior con el tono más oscuro de cada volumen. */
  outline(): void {
    const { width, height } = this;
    const src = this.owner.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const k = y * width + x;
        if (src[k] >= 0) continue;
        let nb = -1;
        if (x > 0 && src[k - 1] >= 0) nb = k - 1;
        else if (x < width - 1 && src[k + 1] >= 0) nb = k + 1;
        else if (y < height - 1 && src[k + width] >= 0) nb = k + width;
        else if (y > 0 && src[k - width] >= 0) nb = k - width;
        if (nb < 0) continue;
        const c = this.ramps[src[nb]][0];
        this.rgba[k * 4] = c[0] * 0.6;
        this.rgba[k * 4 + 1] = c[1] * 0.6;
        this.rgba[k * 4 + 2] = c[2] * 0.6;
        this.rgba[k * 4 + 3] = 255;
      }
    }
  }

  /** Sombra plana en el suelo (elipse), por debajo de todo lo pintado. */
  shadow(cx: number, cy: number, rx: number, ry: number): void {
    for (let y = fl(cy - ry); y <= cy + ry; y++) {
      for (let x = fl(cx - rx); x <= cx + rx; x++) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        const k = (y * this.width + x) * 4;
        if (this.rgba[k + 3] > 0) continue;
        this.rgba[k] = 18;
        this.rgba[k + 1] = 13;
        this.rgba[k + 2] = 10;
        this.rgba[k + 3] = 92;
      }
    }
  }
}

// ── Árboles ───────────────────────────────────────────────────────────

export type TreeSpeciesName = 'oak' | 'pine' | 'olive';
/** Árbol en pie, talado (tronco en el suelo y la copa al lado) o casi agotado (tocón y un tronco corto). */
export type TreeState = 'standing' | 'felled' | 'stump';

const TREE_W = 48;
const TREE_H = 54;
const BASE_X = 20;
const BASE_Y = 49;

/** Aclara u oscurece una rampa (variantes de color de los árboles). */
function tint(rp: Ramp, k: number, warm = 0): Ramp {
  return rp.map(([r, g, b]) => [Math.min(255, Math.round(r * k + warm)), Math.min(255, Math.round(g * k + warm * 0.6)), Math.min(255, Math.round(b * k))] as RGB);
}

/** Variantes de cada especie: tamaño y tono de la copa. */
const TREE_VARIANTS: readonly { readonly size: number; readonly tint: number; readonly warm: number }[] = [
  { size: 1, tint: 1, warm: 0 },
  { size: 0.86, tint: 1.08, warm: 6 },
  { size: 1.1, tint: 0.92, warm: 0 },
  { size: 0.95, tint: 1, warm: 12 },
];
export const TREE_VARIANT_COUNT = TREE_VARIANTS.length;

export function renderTree(species: TreeSpeciesName, variant: number, state: TreeState): NatureImage {
  const seed = hash2(species.length * 97 + variant, variant * 31 + 7, 0x7ee);
  const c = new Canvas(TREE_W, TREE_H, seed);
  const look = TREE_VARIANTS[variant % TREE_VARIANTS.length];
  const leaves = tint(NATURE_RAMPS[species], look.tint, look.warm);
  const sz = look.size;
  const r = (i: number) => rnd(i, variant, seed);
  if (state === 'standing') {
    if (species === 'pine') {
      const h = (34 + fl(r(1) * 6)) * sz;
      const canopy = { x: BASE_X, y: BASE_Y - h * 0.55, r: h * 0.5, k: 0.5 };
      c.column(BASE_X - 1, BASE_Y - 10, 3, 10, NATURE_RAMPS.bark, 0);
      // Pisos de ramas: elipsoides achatados cada vez más pequeños hacia arriba, con la punta.
      const tiers = 5;
      for (let i = 0; i < tiers; i++) {
        const t = i / (tiers - 1);
        const rad = (11 - t * 8 + (r(10 + i) - 0.5) * 1.5) * sz;
        const y = BASE_Y - 9 - t * (h - 12);
        c.sphere(BASE_X + (r(20 + i) - 0.5) * 1.5, y, rad, leaves, { squash: 0.62, noise: 0.55, grain: 1.8, depth: -i * 3, canopy });
      }
      c.sphere(BASE_X, BASE_Y - h + 2, 2.6 * sz, leaves, { squash: 1.6, noise: 0.3, depth: -20, canopy });
    } else if (species === 'olive') {
      // Tronco retorcido y copa baja, plateada y rala.
      for (let k = 0; k < 12; k++) c.column(BASE_X - 1 + (k > 6 ? 1 : 0) - (k > 9 ? 1 : 0), BASE_Y - k - 1, 3, 1.2, NATURE_RAMPS.bark, 0);
      const canopy = { x: BASE_X, y: BASE_Y - 20, r: 10 * sz, k: 0.55 };
      const blobs = 6 + fl(r(1) * 3);
      for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * Math.PI * 2 + r(2) * 3;
        const d = i === 0 ? 0 : (5 + r(30 + i) * 3) * sz;
        c.sphere(BASE_X + Math.cos(a) * d * 1.2, BASE_Y - 19 + Math.sin(a) * d * 0.6 - r(40 + i) * 3, (4.5 + r(50 + i) * 2) * sz, leaves, { noise: 0.8, grain: 1.6, squash: 0.85, canopy });
      }
    } else {
      // Roble: tronco grueso y copa redonda de varias masas, más clara arriba a la izquierda.
      c.column(BASE_X - 2, BASE_Y - 12, 4, 12, NATURE_RAMPS.bark, 0);
      c.column(BASE_X - 3, BASE_Y - 2, 6, 2, NATURE_RAMPS.bark, 0.5);
      const cy = BASE_Y - 13 - 11 * sz;
      const canopy = { x: BASE_X, y: cy, r: 13 * sz, k: 0.6 };
      c.sphere(BASE_X, cy, (10 + r(1) * 1.5) * sz, leaves, { noise: 0.75, grain: 2.2, depth: -10, canopy });
      const blobs = 6 + fl(r(2) * 3);
      for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * Math.PI * 2 + r(3) * 3;
        const d = (6 + r(30 + i) * 2.5) * sz;
        c.sphere(BASE_X + Math.cos(a) * d * 0.95, cy + Math.sin(a) * d * 0.8, (5 + r(50 + i) * 2) * sz, leaves, { noise: 0.75, grain: 2.2, depth: Math.sin(a) * 4, canopy });
      }
      c.sphere(BASE_X - 2 + r(4) * 3, cy - 7 * sz, 5.5 * sz, leaves, { noise: 0.7, grain: 2.2, depth: -2, canopy });
    }
  } else {
    // Tocón con el corte claro.
    c.column(BASE_X - 3, BASE_Y - 5, 5, 5, NATURE_RAMPS.bark, 0, NATURE_RAMPS.wood);
    const thick = species === 'oak' ? 4 : 3;
    if (state === 'felled') {
      // El tronco tumbado hacia abajo a la derecha, con la copa en la punta.
      c.log(BASE_X + 3, BASE_Y - 1, 13, thick, NATURE_RAMPS.bark, NATURE_RAMPS.wood, 2);
      const tip = species === 'pine' ? 4.5 : 5.5;
      for (let i = 0; i < 3; i++) c.sphere(BASE_X + 16 + i * 2.5, BASE_Y + 3 + i * 1.2 - thick + r(60 + i) * 2, tip - i * 0.8, leaves, { squash: 0.7, noise: 0.6, depth: 4 + i });
    } else {
      c.log(BASE_X + 3, BASE_Y, 7, thick, NATURE_RAMPS.bark, NATURE_RAMPS.wood, 2);
    }
  }
  c.outline();
  c.shadow(BASE_X + 3, BASE_Y, state === 'standing' ? 10 : 7, 3.2);
  return { width: TREE_W, height: TREE_H, rgba: c.rgba, anchorX: BASE_X, anchorY: BASE_Y };
}

// ── Minas y arbustos ──────────────────────────────────────────────────

const PILE_W = 36;
const PILE_H = 28;
const PILE_X = 18;
const PILE_Y = 22;

/** Posiciones de las rocas de un montón, de detrás a delante (las primeras desaparecen antes al agotarse). */
const ROCKS: readonly (readonly [number, number, number])[] = [
  [-6, -5, 6],
  [5, -5, 5.5],
  [0, -8, 6.5],
  [-9, 1, 5],
  [9, 0, 5],
  [-3, 1, 6],
  [4, 3, 5.5],
];

/** Mina de oro o de piedra; `left` (0–1) dice cuánto queda: el montón se va quedando con menos rocas. */
export function renderDeposit(kind: 'gold' | 'stone', left: number): NatureImage {
  const seed = kind === 'gold' ? 0x901d : 0x570e;
  const c = new Canvas(PILE_W, PILE_H, seed);
  const count = left > 0.66 ? ROCKS.length : left > 0.33 ? 5 : 3;
  const rocks = ROCKS.slice(ROCKS.length - count);
  const base = kind === 'gold' ? NATURE_RAMPS.goldRock : NATURE_RAMPS.rock;
  rocks.forEach(([dx, dy, rad], i) => {
    const cx = PILE_X + dx;
    const cy = PILE_Y + dy - rad * 0.35;
    c.sphere(cx, cy, rad, base, {
      squash: 0.8,
      facets: 2,
      noise: 0.25,
      grain: 1.5,
      depth: dy * 2,
      speck:
        kind === 'gold'
          ? (x, y, tone) => (rnd(x, y, seed + i) < 0.16 && tone >= 2 ? [NATURE_RAMPS.gold, Math.min(4, tone + 1)] : null)
          : (x, y, tone) => (rnd(x, y, seed + i) < 0.05 ? [base, Math.max(1, tone - 1)] : null),
    });
  });
  // Pepitas o lascas sueltas delante.
  for (let i = 0; i < 4; i++) {
    const x = PILE_X - 10 + fl(rnd(i, 1, seed) * 20);
    const y = PILE_Y + 3 + fl(rnd(i, 2, seed) * 2);
    c.sphere(x, y, 1.3, kind === 'gold' ? NATURE_RAMPS.gold : base, { facets: 1, depth: 30 });
  }
  c.outline();
  c.shadow(PILE_X + 2, PILE_Y + 2, 14, 4);
  return { width: PILE_W, height: PILE_H, rgba: c.rgba, anchorX: PILE_X, anchorY: PILE_Y };
}

/** Arbusto de bayas; `left` (0–1): cuantas menos quedan, menos bayas rojas se ven. */
export function renderBush(left: number): NatureImage {
  const seed = 0xbe44;
  const c = new Canvas(PILE_W, PILE_H, seed);
  const density = 0.05 + 0.2 * left;
  const blobs: [number, number, number][] = [
    [-5, -5, 5.5],
    [5, -4, 5],
    [0, -8, 5.5],
    [-8, 0, 4.5],
    [8, 0, 4.5],
    [0, -1, 6],
  ];
  blobs.forEach(([dx, dy, rad], i) => {
    c.sphere(PILE_X + dx, PILE_Y + dy - rad * 0.4, rad, NATURE_RAMPS.bush, {
      noise: 0.7,
      grain: 1.7,
      squash: 0.85,
      depth: dy * 2,
      speck: (x, y, tone) => (rnd(x, y, seed + i) < density && tone >= 2 ? [NATURE_RAMPS.berry, tone >= 3 ? 3 : 2] : null),
    });
  });
  c.outline();
  c.shadow(PILE_X + 2, PILE_Y + 2, 13, 3.5);
  return { width: PILE_W, height: PILE_H, rgba: c.rgba, anchorX: PILE_X, anchorY: PILE_Y };
}

// ── Iconos de recursos (16×16) ────────────────────────────────────────

export type ResourceIconKind = 'food' | 'wood' | 'stone' | 'gold' | 'pop';

const SKIN = ramp('#7a4a30', '#b97a50', '#e0a878', '#f2c9a0', '#f8dcc0');

/** Iconos de la barra de recursos con el mismo sombreado que los recursos del mapa. `team` colorea el de población. */
export function renderResourceIcon(kind: ResourceIconKind, team: readonly [string, string, string] = ['#1e3a8a', '#3a5fcd', '#7a9cf0']): NatureImage {
  const c = new Canvas(16, 16, 0x1c0 + kind.length);
  const flat = { noise: 0 } as const;
  switch (kind) {
    case 'food':
      // Racimo de bayas con una hoja.
      c.sphere(10, 4, 3, NATURE_RAMPS.bush, { squash: 0.6, depth: -6 });
      c.sphere(5.5, 8.5, 3.3, NATURE_RAMPS.berry, flat);
      c.sphere(10.5, 8.5, 3.3, NATURE_RAMPS.berry, { depth: 1 });
      c.sphere(8, 12, 3.3, NATURE_RAMPS.berry, { depth: 4 });
      break;
    case 'wood':
      // Dos troncos con el corte a la vista.
      c.log(4, 6, 9, 4, NATURE_RAMPS.bark, NATURE_RAMPS.wood, 0);
      c.log(3, 12, 9, 4, NATURE_RAMPS.bark, NATURE_RAMPS.wood, 10);
      break;
    case 'stone':
      c.sphere(8.5, 6.5, 3.6, NATURE_RAMPS.rock, { facets: 2, depth: -4 });
      c.sphere(5.5, 10.5, 4.2, NATURE_RAMPS.rock, { facets: 2, squash: 0.85 });
      c.sphere(11, 11, 3.4, NATURE_RAMPS.rock, { facets: 2, squash: 0.85, depth: 1 });
      break;
    case 'gold':
      c.sphere(8, 6.5, 3, NATURE_RAMPS.gold, { facets: 2, depth: -4 });
      c.sphere(5, 11, 3.2, NATURE_RAMPS.gold, { facets: 2 });
      c.sphere(11, 11, 3.2, NATURE_RAMPS.gold, { facets: 2, depth: 1 });
      break;
    case 'pop': {
      const t = team.map(hex);
      const teamRamp: Ramp = [t[0].map((v) => v * 0.6) as unknown as RGB, t[0], t[1], t[2], t[2].map((v) => Math.min(255, v + 40)) as unknown as RGB];
      c.sphere(8, 13.5, 6, teamRamp, { squash: 0.62 });
      c.sphere(8, 5, 3.2, SKIN, { depth: 10 });
      break;
    }
  }
  c.outline();
  if (kind === 'gold') {
    c.spark(6, 9, hex('#fffbe0'));
    c.spark(9, 5, hex('#fffbe0'));
  }
  return { width: 16, height: 16, rgba: c.rgba, anchorX: 8, anchorY: 8 };
}
