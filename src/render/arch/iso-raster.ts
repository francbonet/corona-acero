/**
 * Rasterizador isométrico de los edificios (y de lo que tenga que encajar con la rejilla): las piezas se
 * modelan como caras planas convexas en un espacio donde x e y van por los ejes de la rejilla (16 unidades
 * = 1 casilla) y z es la altura en píxeles. La proyección es la 2:1 del juego (docs/arte.md §3):
 *
 *   x de pantalla = x − y        y de pantalla = (x + y) / 2 − z
 *
 * así que una huella de n×n casillas ocupa exactamente el rombo de 32n × 16n píxeles.
 *
 * Se pintan con la luz de arriba a la izquierda y rampas de 4 tonos por material, con sombras: cada pieza
 * sólida (caja, tejado, torre…) arroja sombra sobre las demás y sobre el suelo, hacia abajo a la derecha.
 * Al final se añade el contorno oscuro del propio color en la silueta y donde una pieza tapa a otra.
 *
 * Es puro (no usa el DOM): devuelve RGBA, así que se prueba en Node.
 */

export type P3 = readonly [number, number, number];

/** Rampas de 4 tonos (oscuro → claro) por material. */
export type IsoRamps = Readonly<Record<string, readonly [string, string, string, string]>>;

/** Lo que recibe la función de pintado de una cara. */
export interface PaintAt {
  /** Coordenada horizontal sobre la cara (de izquierda a derecha en pantalla), en unidades del modelo. */
  readonly u: number;
  /** Coordenada vertical sobre la cara (altura en las paredes; distancia desde el alero en los tejados). */
  readonly v: number;
  /** Ancho y alto de la cara en esas mismas unidades. */
  readonly w: number;
  readonly h: number;
}

/**
 * Material de un píxel: nombre de la rampa con modificadores opcionales:
 * `-` / `+` oscurecen o aclaran un tono (se pueden repetir) y `!N` fija el tono N (para lo que brilla).
 */
export type MatToken = string;

export type Paint = (at: PaintAt) => MatToken | undefined;

/** Lo que devuelve una función de pintado para dejar el píxel sin pintar (bordes irregulares, agujeros). */
export const NONE = 'none';

export interface Face {
  /** Vértices de un polígono plano y convexo (en cualquier sentido). */
  readonly pts: readonly P3[];
  readonly mat: MatToken;
  /** Origen y ejes de las coordenadas de pintado (por defecto, a partir de los dos primeros lados). */
  readonly frame?: { readonly o: P3; readonly du: P3; readonly dv: P3; readonly w: number; readonly h: number };
  readonly paint?: Paint;
  /** Pieza sólida a la que pertenece (una pieza convexa no se hace sombra a sí misma). */
  readonly solid: number;
  /** Suelo (explanadas, surcos): ni contorno ni sombra propia. */
  readonly ground?: boolean;
  /** No arroja sombra (detalles finos). */
  readonly noShadow?: boolean;
  /** Se pinta por delante de lo que esté en el mismo plano (detalles superpuestos). */
  readonly bias?: number;
  /** Cara trasera: no se ve, pero arroja sombra. */
  readonly shadowOnly?: boolean;
}

export interface IsoOptions {
  readonly width: number;
  readonly height: number;
  /** Píxel donde cae el origen del modelo (el vértice de arriba de la huella). */
  readonly originX: number;
  readonly originY: number;
  readonly ramps: IsoRamps;
  /** Sombras (propias y sobre el suelo). Por defecto, sí. */
  readonly shadows?: boolean;
  /** Contorno. Por defecto, sí. */
  readonly outline?: boolean;
  /**
   * Escala de la proyección (1 = un píxel por unidad). Por debajo de 1 pinta el modelo en pequeño (iconos):
   * las caras y sus dibujos se siguen calculando en unidades del modelo, así que las puertas y ventanas caen en
   * su sitio y el contorno sale limpio, sin reducir una imagen grande.
   */
  readonly scale?: number;
}

export interface IsoResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  /** Por píxel: -1 vacío, 0 suelo, 1 pieza (para los efectos de daño y las pruebas). */
  readonly kind: Int8Array;
  /** Material (nombre de la rampa) de cada píxel de pieza o suelo, o '' si está vacío. */
  readonly matAt: (x: number, y: number) => string;
  /** Tono (0–3) de cada píxel pintado. */
  readonly tone: Int8Array;
}

/** Longitud real de una unidad del modelo en x/y, y de un píxel de altura (proyección dimétrica a 30°). */
const SX = Math.SQRT2;
const SZ = 2 / Math.sqrt(3);
/** Hacia la luz, en espacio real: de arriba a la izquierda de la pantalla y bastante cenital. */
const LIGHT = normalize([-0.4 * SX, 0.15 * SX, 0.9 * SZ]);
/** Hacia la cámara, en espacio real. */
const VIEW = normalize([SX, SX, SZ]);
/** Color de la sombra sobre el suelo (docs/arte.md: plano y semitransparente). */
const SHADOW_RGBA = [18, 13, 10, 92] as const;

export function project(p: P3): [number, number] {
  return [p[0] - p[1], (p[0] + p[1]) / 2 - p[2]];
}

/** Hacia dónde cae la sombra sobre el suelo de un punto a altura 1, en unidades del modelo. */
export function shadowStep(): [number, number] {
  // Un punto P a altura z cae en P − z·(Lx, Ly)/Lz, pasando a unidades del modelo.
  const k = SZ / LIGHT[2];
  return [(-LIGHT[0] * k) / SX, (-LIGHT[1] * k) / SX];
}

function normalize(a: readonly number[]): [number, number, number] {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
const sub = (a: P3, b: P3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const toTrue = (p: readonly number[]): [number, number, number] => [p[0] * SX, p[1] * SX, p[2] * SZ];

/** Normal real (unitaria) de una cara, orientada hacia la cámara. Null si es degenerada. */
function faceNormal(pts: readonly P3[]): [number, number, number] | null {
  // Newell: robusto con polígonos de más de tres vértices.
  const n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = toTrue(pts[i]);
    const b = toTrue(pts[(i + 1) % pts.length]);
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(n[0], n[1], n[2]);
  if (l < 1e-9) return null;
  const u: [number, number, number] = [n[0] / l, n[1] / l, n[2] / l];
  return dot(u, VIEW) < 0 ? [-u[0], -u[1], -u[2]] : u;
}

/** Tono por la luz que recibe una cara. */
function toneFor(light: number): number {
  return light >= 0.6 ? 3 : light >= 0.08 ? 2 : light >= -0.75 ? 1 : 0;
}

/**
 * Recorre los centros de píxel dentro de un polígono convexo ya proyectado (`q`, en 2D) y da el punto 3D
 * correspondiente de la cara (la proyección es afín, así que se invierte con tres vértices).
 */
function fillPolygon(
  q: readonly (readonly [number, number])[],
  pts: readonly P3[],
  width: number,
  height: number,
  visit: (x: number, y: number, p: [number, number, number]) => void,
): void {
  const n = q.length;
  if (n < 3) return;
  // Tres vértices no alineados para la inversión afín.
  let i1 = 1;
  let i2 = 2;
  let det = 0;
  search: for (i1 = 1; i1 < n - 1; i1++) {
    for (i2 = i1 + 1; i2 < n; i2++) {
      det = (q[i1][0] - q[0][0]) * (q[i2][1] - q[0][1]) - (q[i2][0] - q[0][0]) * (q[i1][1] - q[0][1]);
      if (Math.abs(det) > 1e-6) break search;
    }
  }
  if (Math.abs(det) <= 1e-6) return; // cara de canto
  const ax = q[i1][0] - q[0][0];
  const ay = q[i1][1] - q[0][1];
  const bx = q[i2][0] - q[0][0];
  const by = q[i2][1] - q[0][1];
  const e1 = sub(pts[i1], pts[0]);
  const e2 = sub(pts[i2], pts[0]);
  // Sentido del polígono, para la prueba de dentro.
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = q[i];
    const b = q[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sign = area >= 0 ? 1 : -1;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of q) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(width - 1, Math.ceil(maxX));
  const y1 = Math.min(height - 1, Math.ceil(maxY));
  const EPS = 1e-7;
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5;
      let inside = true;
      for (let i = 0; i < n; i++) {
        const a = q[i];
        const b = q[(i + 1) % n];
        if (sign * ((b[0] - a[0]) * (cy - a[1]) - (b[1] - a[1]) * (cx - a[0])) < -EPS) {
          inside = false;
          break;
        }
      }
      if (!inside) continue;
      const dx = cx - q[0][0];
      const dy = cy - q[0][1];
      const s = (dx * by - bx * dy) / det;
      const t = (ax * dy - dx * ay) / det;
      visit(x, y, [pts[0][0] + s * e1[0] + t * e2[0], pts[0][1] + s * e1[1] + t * e2[1], pts[0][2] + s * e1[2] + t * e2[2]]);
    }
  }
}

/** Mapa de sombras visto desde la luz: para cada celda, lo más cercano a la luz y de qué pieza es. */
class ShadowMap {
  private readonly a: [number, number, number];
  private readonly b: [number, number, number];
  private readonly minA: number;
  private readonly minB: number;
  private readonly w: number;
  private readonly h: number;
  private readonly depth: Float32Array;
  private readonly solid: Int32Array;

  constructor(faces: readonly Face[]) {
    this.a = normalize(cross(LIGHT, [0, 0, 1]));
    this.b = cross(this.a, LIGHT);
    let minA = Infinity;
    let minB = Infinity;
    let maxA = -Infinity;
    let maxB = -Infinity;
    for (const f of faces) {
      if (f.ground || f.noShadow) continue;
      for (const p of f.pts) {
        const t = toTrue(p);
        minA = Math.min(minA, dot(t, this.a));
        maxA = Math.max(maxA, dot(t, this.a));
        minB = Math.min(minB, dot(t, this.b));
        maxB = Math.max(maxB, dot(t, this.b));
      }
    }
    if (minA > maxA) {
      minA = maxA = minB = maxB = 0;
    }
    this.minA = Math.floor(minA) - 1;
    this.minB = Math.floor(minB) - 1;
    this.w = Math.ceil(maxA - this.minA) + 2;
    this.h = Math.ceil(maxB - this.minB) + 2;
    this.depth = new Float32Array(this.w * this.h).fill(-Infinity);
    this.solid = new Int32Array(this.w * this.h).fill(-1);
    for (const f of faces) {
      if (f.ground || f.noShadow) continue;
      const q = f.pts.map((p) => this.cell(p));
      fillPolygon(q, f.pts, this.w, this.h, (x, y, p) => {
        const d = dot(toTrue(p), LIGHT);
        const k = y * this.w + x;
        if (d > this.depth[k]) {
          this.depth[k] = d;
          this.solid[k] = f.solid;
        }
      });
    }
  }

  private cell(p: P3): [number, number] {
    const t = toTrue(p);
    return [dot(t, this.a) - this.minA, dot(t, this.b) - this.minB];
  }

  /** ¿Está en sombra el punto `p` de la pieza `solid` (−1 = suelo)? */
  shadowed(p: P3, solid: number): boolean {
    const [ca, cb] = this.cell(p);
    const x = Math.floor(ca);
    const y = Math.floor(cb);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const k = y * this.w + x;
    if (this.solid[k] < 0 || this.solid[k] === solid) return false;
    return this.depth[k] > dot(toTrue(p), LIGHT) + 0.75;
  }
}

interface ParsedMat {
  readonly name: string;
  readonly delta: number;
  readonly fixed: number;
}
const matCache = new Map<string, ParsedMat>();
function parseMat(token: string): ParsedMat {
  let m = matCache.get(token);
  if (!m) {
    const match = /^([A-Za-z0-9_]+)([-+]*)(?:!(\d))?$/.exec(token);
    if (!match) throw new Error(`Material mal escrito: ${token}`);
    let delta = 0;
    for (const c of match[2]) delta += c === '+' ? 1 : -1;
    m = { name: match[1], delta, fixed: match[3] === undefined ? -1 : Number(match[3]) };
    matCache.set(token, m);
  }
  return m;
}

const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = Number.parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

/** Marco de pintado por defecto: el primer lado da la horizontal y la perpendicular dentro de la cara, la vertical. */
function defaultFrame(pts: readonly P3[]): NonNullable<Face['frame']> {
  const e1 = sub(pts[1], pts[0]);
  const l1 = Math.hypot(e1[0], e1[1], e1[2]) || 1;
  const du: P3 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
  const e2 = sub(pts[pts.length - 1], pts[0]);
  const along = dot(e2, du);
  const perp = [e2[0] - du[0] * along, e2[1] - du[1] * along, e2[2] - du[2] * along];
  const l2 = Math.hypot(perp[0], perp[1], perp[2]) || 1;
  const dv: P3 = [perp[0] / l2, perp[1] / l2, perp[2] / l2];
  let w = 0;
  let h = 0;
  for (const p of pts) {
    const d = sub(p, pts[0]);
    w = Math.max(w, dot(d, du));
    h = Math.max(h, dot(d, dv));
  }
  return { o: pts[0], du, dv, w, h };
}

export function rasterizeIso(faces: readonly Face[], o: IsoOptions): IsoResult {
  const { width, height } = o;
  const size = width * height;
  const depth = new Float32Array(size).fill(-Infinity);
  const faceAt = new Int32Array(size).fill(-1);
  const mats = new Int16Array(size).fill(-1);
  const tones = new Int8Array(size);
  const matNames: string[] = [];
  const matIndex = new Map<string, number>();
  const indexOf = (name: string): number => {
    let i = matIndex.get(name);
    if (i === undefined) {
      if (!o.ramps[name]) throw new Error(`Material sin rampa: ${name}`);
      i = matNames.length;
      matNames.push(name);
      matIndex.set(name, i);
    }
    return i;
  };
  const shadows = o.shadows !== false ? new ShadowMap(faces) : null;
  const scale = o.scale ?? 1;

  faces.forEach((f, fi) => {
    if (f.shadowOnly) return;
    const normal = faceNormal(f.pts);
    if (!normal || dot(normal, VIEW) < 0.02) return;
    const light = dot(normal, LIGHT);
    const baseTone = toneFor(light);
    const vertical = Math.abs(normal[2]) < 0.05;
    const frame = f.paint ? (f.frame ?? defaultFrame(f.pts)) : null;
    const q = f.pts.map((p) => {
      const [sx, sy] = project(p);
      return [sx * scale + o.originX, sy * scale + o.originY] as [number, number];
    });
    const bias = f.bias ?? 0;
    const solid = f.ground ? -1 : f.solid;
    fillPolygon(q, f.pts, width, height, (x, y, p) => {
      const k = y * width + x;
      const d = p[0] + p[1] + p[2] + bias;
      if (d <= depth[k]) return;
      let token = f.mat;
      if (frame && f.paint) {
        const rel = sub(p, frame.o);
        const painted = f.paint({ u: dot(rel, frame.du), v: dot(rel, frame.dv), w: frame.w, h: frame.h });
        if (painted === NONE) return;
        if (painted) token = painted;
      }
      const m = parseMat(token);
      let tone = baseTone;
      if (shadows && light > 0 && shadows.shadowed(p, solid)) tone = Math.min(tone, 1);
      if (vertical && p[2] < 1 && !f.ground) tone -= 1; // las paredes se oscurecen al tocar el suelo
      tone = m.fixed >= 0 ? m.fixed : Math.max(0, Math.min(3, tone + m.delta));
      depth[k] = d;
      faceAt[k] = fi;
      mats[k] = indexOf(m.name);
      tones[k] = tone;
    });
  });

  const kind = new Int8Array(size).fill(-1);
  for (let k = 0; k < size; k++) if (faceAt[k] >= 0) kind[k] = faces[faceAt[k]].ground ? 0 : 1;

  // Contorno: por fuera de la silueta (así las piezas finas no pierden su color) y por dentro donde una
  // pieza tapa a otra que queda mucho más atrás.
  const outlined = new Uint8Array(size);
  const outlineMat = new Int16Array(size).fill(-1);
  if (o.outline !== false) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const k = y * width + x;
        const nbs = [x > 0 ? k - 1 : -1, x < width - 1 ? k + 1 : -1, y > 0 ? k - width : -1, y < height - 1 ? k + width : -1];
        if (kind[k] === 1) {
          for (const nb of nbs) if (nb >= 0 && kind[nb] === 1 && depth[nb] < depth[k] - 5) outlined[k] = 1;
        } else {
          for (const nb of nbs) {
            if (nb >= 0 && kind[nb] === 1) {
              outlined[k] = 2;
              outlineMat[k] = mats[nb];
              break;
            }
          }
        }
      }
    }
  }

  const rgba = new Uint8ClampedArray(size * 4);
  for (let k = 0; k < size; k++) {
    let r: number;
    let g: number;
    let b: number;
    if (outlined[k] === 2) {
      [r, g, b] = rgb(o.ramps[matNames[outlineMat[k]]][0]);
      r *= 0.62;
      g *= 0.58;
      b *= 0.58;
      tones[k] = 0;
    } else if (mats[k] < 0) {
      continue;
    } else if (outlined[k] === 1) {
      [r, g, b] = rgb(o.ramps[matNames[mats[k]]][0]);
      tones[k] = 0;
    } else {
      [r, g, b] = rgb(o.ramps[matNames[mats[k]]][tones[k]]);
    }
    rgba[k * 4] = r;
    rgba[k * 4 + 1] = g;
    rgba[k * 4 + 2] = b;
    rgba[k * 4 + 3] = 255;
  }

  // Sombra sobre el suelo, en lo que no tapa el edificio.
  if (shadows) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const k = y * width + x;
        if (mats[k] >= 0 || outlined[k]) continue;
        const sx = x + 0.5 - o.originX;
        const sy = y + 0.5 - o.originY;
        const p: P3 = [sy + sx / 2, sy - sx / 2, 0];
        if (!shadows.shadowed(p, -1)) continue;
        rgba[k * 4] = SHADOW_RGBA[0];
        rgba[k * 4 + 1] = SHADOW_RGBA[1];
        rgba[k * 4 + 2] = SHADOW_RGBA[2];
        rgba[k * 4 + 3] = SHADOW_RGBA[3];
      }
    }
  }

  return {
    width,
    height,
    rgba,
    kind,
    tone: tones,
    matAt: (x, y) => {
      const k = y * width + x;
      return mats[k] < 0 ? '' : matNames[mats[k]];
    },
  };
}

/** Caja que envuelve la proyección de unas caras y de su sombra (limitada a `maxShadow` píxeles a la derecha). */
export function projectedBounds(faces: readonly Face[], maxShadow = 24): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let rightNoShadow = -Infinity;
  const [kx, ky] = shadowStep();
  for (const f of faces) {
    for (const p of f.pts) {
      const [sx, sy] = project(p);
      x0 = Math.min(x0, sx);
      y0 = Math.min(y0, sy);
      x1 = Math.max(x1, sx);
      y1 = Math.max(y1, sy);
      rightNoShadow = Math.max(rightNoShadow, sx);
      if (!f.ground && !f.noShadow && p[2] > 0) {
        const [gx, gy] = project([p[0] + kx * p[2], p[1] + ky * p[2], 0]);
        x1 = Math.max(x1, gx);
        y1 = Math.max(y1, gy);
        y0 = Math.min(y0, gy);
      }
    }
  }
  x1 = Math.min(x1, rightNoShadow + maxShadow);
  return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
}
