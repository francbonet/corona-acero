import { hash2 } from '../../engine/rng';
import type { MatToken, Paint, PaintAt } from './iso-raster';

/**
 * Patrones de pintado de paredes y cubiertas (sillería, ladrillo, entramado, tablas, paja, tejas, pizarra)
 * y huecos (puertas, ventanas y arcos de medio punto, apuntados o de herradura). Todos trabajan en las
 * coordenadas de la cara (u horizontal, v vertical) en unidades del modelo, así que las juntas salen
 * alineadas con la rejilla isométrica: las hiladas forman la escalera de 2×1 del pixel art.
 */

const fl = Math.floor;
/** Ruido determinista de 0 a 1 para una celda entera. */
export function noise(x: number, y: number, seed: number): number {
  return (hash2(fl(x), fl(y), seed) & 0xffff) / 0x10000;
}
const mod = (a: number, m: number) => ((a % m) + m) % m;

// ── Fábricas ───────────────────────────────────────────────────────────

/** Sillería: hiladas de `rowH` con juntas a matajunta cada `blockW`; algunos sillares más claros u oscuros. */
export function ashlar(mat: string, rowH = 4, blockW = 7, seed = 1): Paint {
  return ({ u, v }) => {
    const row = fl(v / rowH);
    if (mod(v, rowH) < 1) return `${mat}-`;
    const shift = row % 2 === 0 ? 0 : blockW / 2;
    const col = fl((u + shift) / blockW);
    if (mod(u + shift, blockW) < 1) return `${mat}-`;
    const r = noise(col, row, seed);
    return r < 0.12 ? `${mat}-` : r > 0.9 ? `${mat}+` : undefined;
  };
}

/** Mampostería irregular (piedra sin labrar): manchas de juntas y piedras de varios tonos. */
export function rubbleStone(mat: string, seed = 3): Paint {
  return ({ u, v }) => {
    const cx = fl(u / 3);
    const cy = fl(v / 3);
    const r = noise(cx, cy, seed);
    if (mod(u + (cy % 2) * 1.5, 3) < 0.9 && noise(cx, cy, seed + 1) < 0.5) return `${mat}-`;
    if (mod(v, 3) < 0.9 && noise(cx, cy, seed + 2) < 0.6) return `${mat}-`;
    return r > 0.82 ? `${mat}+` : r < 0.1 ? `${mat}-` : undefined;
  };
}

/** Ladrillo: hiladas de 3 con la argamasa clara, llagas cada 5 alternadas. */
export function brick(mat = 'brick', mortar = 'mortar', seed = 5): Paint {
  return ({ u, v }) => {
    const row = fl(v / 3);
    if (mod(v, 3) < 1) return `${mortar}-`;
    const shift = row % 2 === 0 ? 0 : 2.5;
    if (mod(u + shift, 5) < 1 && noise(fl((u + shift) / 5), row, seed) < 0.75) return `${mortar}-`;
    const r = noise(fl((u + shift) / 5), row, seed + 1);
    return r > 0.88 ? `${mat}+` : r < 0.08 ? `${mat}-` : undefined;
  };
}

/** Tablas verticales de madera con rendijas oscuras. */
export function planks(mat = 'plank', boardW = 3, seed = 7): Paint {
  return ({ u, v }) => {
    if (mod(u, boardW) < 0.8) return `${mat}-`;
    const r = noise(fl(u / boardW), fl(v / 9), seed);
    return r > 0.8 ? `${mat}+` : r < 0.15 ? `${mat}-` : undefined;
  };
}

/** Troncos horizontales (empalizadas tumbadas, cabañas). */
export function logsH(mat = 'log', seed = 9): Paint {
  return ({ u, v }) => {
    if (mod(v, 3) < 0.9) return `${mat}-`;
    return noise(fl(u / 6), fl(v / 3), seed) > 0.85 ? `${mat}+` : undefined;
  };
}

/** Encalado: liso, con alguna mancha de desgaste abajo. */
export function whitewash(mat = 'whitewash', seed = 11): Paint {
  return ({ u, v }) => {
    if (v < 3 && noise(fl(u / 2), fl(v), seed) < 0.4) return `${mat}-`;
    return noise(fl(u / 2), fl(v / 2), seed + 1) < 0.04 ? `${mat}-` : undefined;
  };
}

/**
 * Entramado de madera: revoco claro entre postes cada `bay`, carreras arriba y abajo y una tornapunta
 * en diagonal en paneles alternos.
 */
export function timberFrame(fill = 'plaster', beam = 'timber', bay = 7, seed = 13): Paint {
  return ({ u, v, h }) => {
    if (v < 1.2 || v > h - 1.2) return beam;
    const local = mod(u, bay);
    if (local < 1.1) return beam;
    const panel = fl(u / bay);
    if (noise(panel, 0, seed) < 0.5) {
      const t = local / bay;
      const d = Math.abs(v / h - (panel % 2 === 0 ? t : 1 - t)) * h;
      if (d < 0.8) return beam;
    }
    return noise(fl(u / 2), fl(v / 2), seed + 1) < 0.05 ? `${fill}-` : fill;
  };
}

// ── Cubiertas (v = distancia desde el alero) ──────────────────────────

/** Paja: vetas en la dirección de la pendiente y un borde grueso en el alero. */
export function thatch(mat = 'thatch', seed = 17): Paint {
  return ({ u, v }) => {
    if (v < 1.2) return `${mat}-`;
    if (mod(v, 5) < 1 && noise(fl(u / 2), fl(v / 5), seed) < 0.55) return `${mat}-`;
    const r = noise(fl(u / 1.5), fl(v / 4), seed + 1);
    return r > 0.78 ? `${mat}+` : r < 0.12 ? `${mat}-` : undefined;
  };
}

/** Teja árabe (Castilla): canales que bajan por la pendiente. */
export function barrelTiles(mat = 'tiles', seed = 19): Paint {
  return ({ u, v }) => {
    if (v < 1) return `${mat}-`;
    if (mod(u, 3) < 1) return `${mat}-`;
    if (mod(v, 4) < 0.8) return noise(fl(u / 3), fl(v / 4), seed) < 0.5 ? `${mat}-` : undefined;
    return noise(fl(u / 3), fl(v / 4), seed + 1) > 0.85 ? `${mat}+` : undefined;
  };
}

/** Teja plana, pizarra o tablilla: hiladas horizontales con juntas a matajunta. */
export function shingles(mat: string, rowH = 3, tileW = 4, seed = 23): Paint {
  return ({ u, v }) => {
    if (v < 1) return `${mat}-`;
    const row = fl(v / rowH);
    if (mod(v, rowH) < 0.9) return `${mat}-`;
    const shift = row % 2 === 0 ? 0 : tileW / 2;
    if (mod(u + shift, tileW) < 0.7) return `${mat}-`;
    const r = noise(fl((u + shift) / tileW), row, seed);
    return r > 0.86 ? `${mat}+` : undefined;
  };
}

// ── Huecos y adornos ───────────────────────────────────────────────────

export type ArchShape = 'flat' | 'round' | 'pointed' | 'horseshoe';

export interface Opening {
  /** Centro horizontal como fracción del ancho de la cara (0–1). */
  readonly f: number;
  /** Ancho y alto del hueco (el alto incluye el arco). */
  readonly w: number;
  readonly h: number;
  /** Altura del alféizar (0 en las puertas). */
  readonly v0?: number;
  readonly shape?: ArchShape;
  /** Material del interior: puerta de tablas, hueco oscuro, cristal… */
  readonly fill?: MatToken;
  /** Marco alrededor (dovelas, jambas), o nada. */
  readonly frame?: MatToken;
  /** Alfiz: marco rectangular alrededor del arco (mudéjar). */
  readonly alfiz?: MatToken;
}

/** ¿Está (du, dv) dentro de un hueco de ancho w y alto h con ese arco? (du respecto al centro, dv desde abajo). */
export function insideArch(du: number, dv: number, w: number, h: number, shape: ArchShape): boolean {
  if (dv < 0 || dv > h) return false;
  const r = w / 2;
  switch (shape) {
    case 'flat':
      return Math.abs(du) < r;
    case 'round': {
      const spring = h - r;
      if (dv < spring) return Math.abs(du) < r;
      return du * du + (dv - spring) ** 2 < r * r;
    }
    case 'pointed': {
      // Dos arcos de radio w con centro en las impostas opuestas.
      const spring = h - w * 0.866;
      if (dv < spring) return Math.abs(du) < r;
      return (du + r) ** 2 + (dv - spring) ** 2 < w * w && (du - r) ** 2 + (dv - spring) ** 2 < w * w;
    }
    case 'horseshoe': {
      // Arco que pasa de la semicircunferencia: más ancho que las jambas por encima de la imposta.
      const R = r * 1.22;
      const center = h - R;
      if ((dv - center) ** 2 + du * du < R * R) return true;
      return dv < center - R * 0.55 && Math.abs(du) < r;
    }
  }
}

/** Puerta de tablas con herrajes. */
export const DOOR: MatToken = 'plank';

/** Pinta los huecos encima de un patrón de fábrica. */
export function withOpenings(base: Paint | MatToken | undefined, openings: readonly Opening[]): Paint {
  const basePaint: Paint = typeof base === 'function' ? base : () => base;
  return (at: PaintAt) => {
    for (let i = openings.length - 1; i >= 0; i--) {
      const o = openings[i];
      const c = o.f * at.w;
      const du = at.u - c;
      const dv = at.v - (o.v0 ?? 0);
      const shape = o.shape ?? 'flat';
      if (insideArch(du, dv, o.w, o.h, shape)) {
        const fill = o.fill ?? 'void';
        if (fill === DOOR) {
          // Tablas verticales y un herraje a media altura.
          if (Math.abs(du) > o.w / 2 - 0.9 && o.frame) return o.frame;
          if (Math.abs(dv - o.h * 0.4) < 0.6) return 'iron';
          return Math.abs(du % 2) < 0.7 ? 'plank-' : 'plank';
        }
        return fill;
      }
      if (o.frame && insideArch(du, dv + 1, o.w + 2, o.h + 1, shape)) return o.frame;
      if (o.alfiz) {
        const left = -o.w / 2 - 2;
        const right = o.w / 2 + 2;
        const top = o.h + 2;
        if (du > left - 1 && du < right + 1 && dv > -0.5 && dv < top + 1) {
          if (du < left || du > right || dv > top) return o.alfiz;
        }
      }
    }
    return basePaint(at);
  };
}

/** Franja horizontal decorativa entre v0 y v1 (azulejos en damero, moldura…). */
export function withBand(base: Paint | MatToken, v0: number, v1: number, band: MatToken, checker?: MatToken): Paint {
  const basePaint: Paint = typeof base === 'function' ? base : () => base;
  return (at) => {
    if (at.v >= v0 && at.v < v1) return checker && (fl(at.u / 2) + fl(at.v)) % 2 === 0 ? checker : band;
    return basePaint(at);
  };
}

/** Ventanas repetidas a lo largo de la cara: una cada `every` unidades, a la altura v0. */
export function windowRow(every: number, w: number, h: number, v0: number, shape: ArchShape, fill: MatToken, frame?: MatToken, margin = 4): (faceW: number) => Opening[] {
  return (faceW) => {
    const count = Math.max(0, Math.floor((faceW - 2 * margin) / every));
    const out: Opening[] = [];
    for (let i = 0; i < count; i++) {
      const u = margin + every / 2 + i * every + (faceW - 2 * margin - count * every) / 2;
      out.push({ f: u / faceW, w, h, v0, shape, fill, frame });
    }
    return out;
  };
}
