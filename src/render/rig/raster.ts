/**
 * Rasterizador de figuras para el pixel art de las unidades: cada figura se modela con cajas orientadas
 * (torso, cabeza, brazos, armas…) en un espacio 3D pequeño donde 1 unidad = 1 píxel, y se pinta en
 * proyección casi frontal desde cualquiera de las 5 direcciones dibujadas (S, SO, O, NO, N; las otras
 * salen en espejo). La luz viene de arriba a la izquierda y cada material tiene una rampa de 4 tonos;
 * al final se añade un contorno con un tono oscuro del propio color (docs/arte.md §1).
 *
 * Es puro (no usa el DOM): devuelve los píxeles en RGBA, así que se prueba en Node y en el navegador
 * se vuelca a un lienzo.
 */

export type Vec3 = readonly [number, number, number];

/** Rampas de color de oscuro a claro (4 tonos) por material. */
export type Ramps = Readonly<Record<string, readonly [string, string, string, string]>>;

/** Caras de una caja: por eje local (u = derecha, v = arriba, w = delante) y signo. */
export type Face = '+u' | '-u' | '+v' | '-v' | '+w' | '-w';

/**
 * Forma de una pieza: caja, elipsoide, cilindro (redondo en u–w, plano en los extremos de v) o caja de
 * esquinas redondeadas. Las redondas se sombrean píxel a píxel según su normal: cabezas, miembros y cuerpos
 * dejan de verse como bloques.
 */
export type Shape = 'box' | 'ell' | 'cyl' | 'rbox';

/** Pieza orientada: centro, ejes locales (unitarios y ortogonales) y semilados. */
export interface Prim {
  readonly center: Vec3;
  readonly u: Vec3;
  readonly v: Vec3;
  readonly w: Vec3;
  readonly half: Vec3;
  readonly mat: string;
  /** Detalles pintados sobre una cara: (a, b) van de −1 a 1 sobre la cara. Devuelve otro material o nada. */
  readonly paint?: (face: Face, a: number, b: number) => string | undefined;
  /** Forma (por defecto, caja). */
  readonly shape?: Shape;
  /**
   * Estrechamiento hacia el extremo −v: el ancho en u y w allí, respecto al de +v (1 = igual; 0,7 = un
   * tobillo o una muñeca; 1,5 = una falda que se abre). En los segmentos, −v es la punta.
   */
  readonly taper?: number;
  /** Piezas del mismo grupo (las partes de un cuerpo que se solapan) no se separan con línea interior. */
  readonly group?: string;
}

/** Las 5 direcciones que se dibujan; las de la derecha (SE, E, NE) se reflejan. */
export const DIRECTIONS = ['S', 'SW', 'W', 'NW', 'N'] as const;
export type Direction = (typeof DIRECTIONS)[number];

const H = Math.SQRT1_2;
/** Hacia dónde mira la figura en el espacio de vista (x a la derecha de la pantalla, z hacia la cámara). */
const FORWARD: Readonly<Record<Direction, Vec3>> = {
  S: [0, 0, 1],
  SW: [-H, 0, H],
  W: [-1, 0, 0],
  NW: [-H, 0, -H],
  N: [0, 0, -1],
};

/** Inclinación de la cámara: cuánto se ve de las caras de arriba (seno del ángulo). */
const TILT = 0.4;
const CAMERA: Vec3 = [0, TILT, Math.sqrt(1 - TILT * TILT)];
const LIGHT: Vec3 = normalize([-0.55, 0.75, 0.4]);
/** Paso de muestreo de las caras (medio píxel: sin huecos al girar 45°). */
const STEP = 0.5;
/** Diferencia de profundidad (píxeles) a partir de la cual una pieza tapa a otra y se marca la línea. */
const INNER_GAP = 1.6;

export function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Gira un vector alrededor del eje x (cabeceo: positivo = hacia delante y arriba, con z delante). */
export function pitch(a: Vec3, deg: number): Vec3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [a[0], a[1] * c - a[2] * s, a[1] * s + a[2] * c];
}
/** Gira alrededor del eje z (alabeo: positivo = el extremo de abajo hacia la derecha, +x). */
export function roll(a: Vec3, deg: number): Vec3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c, a[2]];
}
/** Gira alrededor del eje y (guiñada: positivo = de delante hacia la derecha). */
export function yaw(a: Vec3, deg: number): Vec3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [a[0] * c + a[2] * s, a[1], -a[0] * s + a[2] * c];
}

/** Caja alineada con los ejes del modelo. */
export function box(center: Vec3, size: Vec3, mat: string, paint?: Prim['paint']): Prim {
  return { center, u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1], half: [size[0] / 2, size[1] / 2, size[2] / 2], mat, paint };
}

/** Elipsoide alineado con los ejes del modelo (`size` = diámetros). */
export function ell(center: Vec3, size: Vec3, mat: string, paint?: Prim['paint']): Prim {
  return { ...box(center, size, mat, paint), shape: 'ell' };
}

/** La misma pieza con otra forma (y estrechamiento). */
export function shaped(p: Prim, shape: Shape, taper = 1): Prim {
  return { ...p, shape, taper };
}

/** Las mismas piezas en un grupo (sin líneas interiores entre ellas). */
export function grouped(prims: readonly Prim[], group: string): Prim[] {
  return prims.map((p) => ({ ...p, group }));
}

/** Disco (un cilindro corto) con su eje en `axis`: escudos redondos, ruedas. */
export function disc(center: Vec3, diameter: number, thickness: number, axis: Vec3, mat: string, paint?: Prim['paint']): Prim {
  const v = normalize(axis);
  let u: Vec3 = Math.abs(v[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  u = normalize(add(u, scale(v, -dot(u, v))));
  const w = cross(u, v);
  return { center, u, v, w, half: [diameter / 2, thickness / 2, diameter / 2], mat, paint, shape: 'cyl' };
}

/**
 * Segmento (miembro, mango, arma): caja que va de `from` en dirección `dir` con longitud `len`,
 * sección `thick` (ancho en x) × `depth`. Su eje v apunta de la punta hacia el arranque (arriba si cuelga).
 */
export function segment(from: Vec3, dir: Vec3, len: number, thick: number, depth: number, mat: string, paint?: Prim['paint']): Prim {
  const d = normalize(dir);
  const v: Vec3 = scale(d, -1);
  // Eje u lo más parecido posible a +x del modelo.
  let u: Vec3 = [1, 0, 0];
  u = normalize(add(u, scale(v, -dot(u, v))));
  if (!Number.isFinite(u[0]) || Math.hypot(u[0], u[1], u[2]) < 0.5) u = [0, 0, 1];
  const w = cross(u, v);
  return { center: add(from, scale(d, len / 2)), u, v, w, half: [thick / 2, len / 2, depth / 2], mat, paint };
}

/** Transforma todas las primitivas (para inclinar o tumbar la figura entera). */
export function transformPrims(prims: readonly Prim[], f: (p: Vec3) => Vec3, fv: (v: Vec3) => Vec3): Prim[] {
  return prims.map((p) => ({ ...p, center: f(p.center), u: fv(p.u), v: fv(p.v), w: fv(p.w) }));
}

export interface RasterOptions {
  readonly width: number;
  readonly height: number;
  /** Píxel donde cae el origen del modelo (los pies). */
  readonly originX: number;
  readonly originY: number;
  readonly ramps: Ramps;
  /** Contorno oscuro alrededor de la silueta. */
  readonly outline?: boolean;
  /** Líneas interiores entre piezas superpuestas (por defecto, sí). */
  readonly innerLines?: boolean;
  /** Sombras propias (una pieza que tapa la luz a otra). Por defecto, sí. */
  readonly shadows?: boolean;
  /**
   * Píxeles por unidad del modelo con que se ha escalado la figura (2 = unidades a doble densidad, retratos a
   * más). Ajusta los umbrales de las líneas interiores y de las sombras, que van en unidades del modelo.
   */
  readonly scale?: number;
}

export interface RasterResult {
  readonly width: number;
  readonly height: number;
  /** RGBA, fila a fila. */
  readonly rgba: Uint8ClampedArray;
}

const colorCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = colorCache.get(hex);
  if (!c) {
    const n = Number.parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    colorCache.set(hex, c);
  }
  return c;
}

const FACES: readonly { face: Face; axis: 0 | 1 | 2; sign: 1 | -1 }[] = [
  { face: '+u', axis: 0, sign: 1 },
  { face: '-u', axis: 0, sign: -1 },
  { face: '+v', axis: 1, sign: 1 },
  { face: '-v', axis: 1, sign: -1 },
  { face: '+w', axis: 2, sign: 1 },
  { face: '-w', axis: 2, sign: -1 },
];

/** Materiales que brillan (reflejo especular): el metal de armas, armaduras y cascos. */
const METALS = new Set(['steel', 'iron', 'mail', 'gold']);
/** Medio vector entre la luz y la cámara, para el brillo. */
const HALF: Vec3 = normalize(add(LIGHT, CAMERA));
/** Base del espacio de la luz (para las sombras propias): dos ejes perpendiculares a ella. */
const LIGHT_A: Vec3 = normalize(cross([0, 1, 0], LIGHT));
const LIGHT_B: Vec3 = cross(LIGHT, LIGHT_A);
/** Resolución y alcance del mapa de sombras (unidades del modelo), y el paso de sus muestras. */
const SHADOW_RES = 0.7;
const SHADOW_STEP = 0.7;
const SHADOW_SPAN = 48;
const SHADOW_N = Math.ceil((2 * SHADOW_SPAN) / SHADOW_RES);
/** Holgura para que una superficie no se sombree a sí misma. */
const SHADOW_BIAS = 0.9;

/** Nivel de luz (0–6) de una superficie según lo que mira hacia la luz. */
function levelOf(light: number): number {
  return light >= 0.68 ? 6 : light >= 0.44 ? 5 : light >= 0.2 ? 4 : light >= -0.04 ? 3 : light >= -0.28 ? 2 : light >= -0.52 ? 1 : 0;
}

const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/**
 * Rampa de 8 niveles a partir de la de 4 tonos: los 4 y los intermedios (7 niveles de luz) más un brillo,
 * el tono claro llevado hacia el blanco.
 */
const rampCache = new Map<readonly string[], [number, number, number][]>();
function ramp8(ramp: readonly [string, string, string, string]): [number, number, number][] {
  let r = rampCache.get(ramp);
  if (!r) {
    const c = ramp.map(rgb);
    r = [c[0], mix(c[0], c[1], 0.5), c[1], mix(c[1], c[2], 0.5), c[2], mix(c[2], c[3], 0.5), c[3], mix(c[3], [255, 255, 255], 0.45)];
    rampCache.set(ramp, r);
  }
  return r;
}

/** Datos de una muestra de superficie (reutilizados para no crear objetos en el bucle). */
interface Sample {
  pi: number;
  vx: number;
  vy: number;
  vz: number;
  nx: number;
  ny: number;
  nz: number;
  face: Face;
  axis: 0 | 1 | 2;
  c1: number;
  c2: number;
}

/**
 * Recorre la superficie de todas las piezas con muestras de medio píxel y llama a `visit` con su punto y su
 * normal (unitaria) en el espacio de vista. `facing` descarta las caras planas que no miran hacia esa dirección.
 */
function forEachSample(prims: readonly Prim[], toView: (p: Vec3) => Vec3, facing: Vec3, visit: (s: Sample) => void, step = STEP): void {
  const lp: [number, number, number] = [0, 0, 0];
  const ln: [number, number, number] = [0, 0, 0];
  const s: Sample = { pi: 0, vx: 0, vy: 0, vz: 0, nx: 0, ny: 0, nz: 0, face: '+u', axis: 0, c1: 0, c2: 0 };
  prims.forEach((p, pi) => {
    const axes = [p.u, p.v, p.w] as const;
    const va = axes.map(toView);
    const c = toView(p.center);
    const [h0, h1, h2] = p.half;
    const shape = p.shape ?? 'box';
    const taper = p.taper ?? 1;
    const flat = shape === 'box' && taper === 1;
    const slope = ((taper - 1) * (h0 + h2)) / 4 / (h1 || 1);
    // Las piezas que se ensanchan necesitan más muestras para no dejar huecos.
    const widen = Math.max(1, taper);
    s.pi = pi;
    for (const { face, axis, sign } of FACES) {
      if (flat) {
        const n = scale(va[axis], sign);
        if (dot(n, facing) <= 0.02) continue;
        s.nx = n[0];
        s.ny = n[1];
        s.nz = n[2];
      }
      s.face = face;
      s.axis = axis;
      const a1 = ((axis + 1) % 3) as 0 | 1 | 2;
      const a2 = ((axis + 2) % 3) as 0 | 1 | 2;
      const steps1 = Math.max(1, Math.ceil((2 * p.half[a1] * (a1 === 1 ? 1 : widen)) / step));
      const steps2 = Math.max(1, Math.ceil((2 * p.half[a2] * (a2 === 1 ? 1 : widen)) / step));
      for (let i = 0; i <= steps1; i++) {
        const c1 = -1 + (2 * i) / steps1;
        for (let j = 0; j <= steps2; j++) {
          const c2 = -1 + (2 * j) / steps2;
          // Punto del cubo [−1, 1]³ sobre esta cara.
          lp[axis] = sign;
          lp[a1] = c1;
          lp[a2] = c2;
          if (!flat) {
            surface(shape, axis, sign, lp, ln);
            let n0 = ln[0] / (h0 || 1);
            let n1 = ln[1] / (h1 || 1);
            let n2 = ln[2] / (h2 || 1);
            if (taper !== 1) {
              // Estrecha (o ensancha) u y w a lo largo de v; la normal se inclina con la pendiente.
              const k = 1 + ((taper - 1) * (1 - lp[1])) / 2;
              lp[0] *= k;
              lp[2] *= k;
              const radial = Math.sqrt(n0 * n0 + n2 * n2);
              if (radial > 1e-6) {
                n0 /= radial;
                n2 /= radial;
                n1 = n1 / radial + slope;
              }
            }
            const nx = va[0][0] * n0 + va[1][0] * n1 + va[2][0] * n2;
            const ny = va[0][1] * n0 + va[1][1] * n1 + va[2][1] * n2;
            const nz = va[0][2] * n0 + va[1][2] * n1 + va[2][2] * n2;
            const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            s.nx = nx / nl;
            s.ny = ny / nl;
            s.nz = nz / nl;
            if (s.nx * facing[0] + s.ny * facing[1] + s.nz * facing[2] <= -0.05) continue;
          }
          const q0 = lp[0] * h0;
          const q1 = lp[1] * h1;
          const q2 = lp[2] * h2;
          s.vx = c[0] + va[0][0] * q0 + va[1][0] * q1 + va[2][0] * q2;
          s.vy = c[1] + va[0][1] * q0 + va[1][1] * q1 + va[2][1] * q2;
          s.vz = c[2] + va[0][2] * q0 + va[1][2] * q1 + va[2][2] * q2;
          s.c1 = c1;
          s.c2 = c2;
          visit(s);
        }
      }
    }
  });
}

/**
 * Pinta las primitivas vistas desde `dir`, en dos pasadas: primero un mapa de profundidad visto desde la luz
 * (sombras propias: el ala del sombrero sobre la cara, el brazo sobre el pecho) y después la vista, con
 * 7 niveles de luz por material, brillo en el metal y los matices de los dibujos (pliegues, malla).
 */
export function rasterize(prims: readonly Prim[], dir: Direction, o: RasterOptions): RasterResult {
  const { width, height } = o;
  const f = FORWARD[dir];
  const right: Vec3 = [-f[2], 0, f[0]];
  const toView = (p: Vec3): Vec3 => [p[0] * right[0] + p[2] * f[0], p[1], p[0] * right[2] + p[2] * f[2]];
  const depth = new Float32Array(width * height).fill(-Infinity);
  const mats = new Int16Array(width * height).fill(-1);
  const tones = new Uint8Array(width * height);
  const owner = new Int16Array(width * height).fill(-1);
  const matNames: string[] = [];
  const matIndex = new Map<string, number>();
  const indexOf = (m: string) => {
    let i = matIndex.get(m);
    if (i === undefined) {
      i = matNames.length;
      matNames.push(m);
      matIndex.set(m, i);
    }
    return i;
  };
  // Número de grupo de cada pieza (las de un mismo grupo no se sombrean entre sí).
  const groupNames = new Map<string, number>();
  const groupIds = prims.map((p, i) => {
    if (p.group === undefined) return i;
    let g = groupNames.get(p.group);
    if (g === undefined) groupNames.set(p.group, (g = -1 - groupNames.size));
    return g;
  });
  const groupOf = (pi: number) => groupIds[pi];

  // 1. Mapa de sombras: lo más cercano a la luz en cada celda del plano perpendicular a ella. Sus medidas van en
  // unidades del modelo, así que crecen con la escala de la figura.
  const detail = o.scale ?? 1;
  const res = SHADOW_RES * detail;
  const span = SHADOW_SPAN * detail;
  const bias = SHADOW_BIAS * detail;
  const innerGap = INNER_GAP * detail;
  const lightDepth = o.shadows === false ? null : new Float32Array(SHADOW_N * SHADOW_N).fill(-Infinity);
  const lightOwner = lightDepth ? new Int32Array(SHADOW_N * SHADOW_N).fill(-1) : null;
  const cellOf = (x: number, y: number, z: number) => {
    const u = Math.floor((x * LIGHT_A[0] + y * LIGHT_A[1] + z * LIGHT_A[2] + span) / res);
    const v = Math.floor((x * LIGHT_B[0] + y * LIGHT_B[1] + z * LIGHT_B[2] + span) / res);
    return u < 0 || v < 0 || u >= SHADOW_N || v >= SHADOW_N ? -1 : v * SHADOW_N + u;
  };
  if (lightDepth && lightOwner) {
    forEachSample(prims, toView, LIGHT, (s) => {
      const cell = cellOf(s.vx, s.vy, s.vz);
      if (cell < 0) return;
      const d = s.vx * LIGHT[0] + s.vy * LIGHT[1] + s.vz * LIGHT[2];
      if (d > lightDepth[cell]) {
        lightDepth[cell] = d;
        lightOwner[cell] = groupOf(s.pi);
      }
    }, SHADOW_STEP * detail);
  }

  // 2. La vista. Cada píxel guarda la luz continua, el matiz del dibujo, si le tapa la sombra y su brillo;
  // los niveles se deciden después, ya suavizados, para que las superficies curvas no salgan moteadas.
  const lightv = new Float32Array(width * height);
  const deltas = new Int8Array(width * height);
  const shade = new Uint8Array(width * height);
  const shine = new Float32Array(width * height);
  forEachSample(prims, toView, CAMERA, (s) => {
    const sx = Math.round(o.originX + s.vx - 0.5);
    const sy = Math.round(o.originY - s.vy + s.vz * TILT - 0.5);
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return;
    let d = s.vz + s.vy * TILT;
    const k = sy * width + sx;
    // Los detalles pintados ganan a la cara en el mismo píxel; si ni así se ven, ni se pintan.
    if (d + 0.05 <= depth[k]) return;
    const p = prims[s.pi];
    let mat = p.mat;
    let delta = 0;
    if (p.paint) {
      // (a, b) sobre la cara: a es el eje horizontal (u, o w en las caras ±u) y b el vertical (v, o w en
      // las caras ±v). En las caras ±u y ±v los ejes de la cara salen en el orden contrario.
      const painted = s.axis === 2 ? p.paint(s.face, s.c1, s.c2) : p.paint(s.face, s.c2, s.c1);
      if (painted) {
        // Un '-' al final oscurece el material dos niveles (pliegues, juntas, anillas); un '+', lo aclara.
        const last = painted.charCodeAt(painted.length - 1);
        if (last === 45) {
          delta = -2;
          mat = painted.slice(0, -1);
        } else if (last === 43) {
          delta = 1;
          mat = painted.slice(0, -1);
        } else {
          mat = painted;
        }
        if (mat !== p.mat || delta !== 0) d += 0.05;
      }
    }
    if (d <= depth[k]) return;
    let shadowed = 0;
    if (lightDepth && lightOwner) {
      const cell = cellOf(s.vx, s.vy, s.vz);
      if (cell >= 0 && lightOwner[cell] !== groupOf(s.pi) && lightDepth[cell] - (s.vx * LIGHT[0] + s.vy * LIGHT[1] + s.vz * LIGHT[2]) > bias) shadowed = 1;
    }
    depth[k] = d;
    mats[k] = indexOf(mat);
    owner[k] = s.pi;
    lightv[k] = s.nx * LIGHT[0] + s.ny * LIGHT[1] + s.nz * LIGHT[2];
    deltas[k] = delta;
    shade[k] = shadowed;
    shine[k] = METALS.has(mat) ? s.nx * HALF[0] + s.ny * HALF[1] + s.nz * HALF[2] : -1;
  });

  // Suavizado: la luz de cada píxel con la de sus vecinos de la misma pieza, y las sombras sin motas sueltas.
  const N = width * height;
  const smooth = new Float32Array(N);
  const cleanShade = new Uint8Array(N);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = y * width + x;
      if (mats[k] < 0) continue;
      let sum = lightv[k] * 2;
      let n = 2;
      let shaded = 0;
      let around = 0;
      for (const nb of [x > 0 ? k - 1 : -1, x < width - 1 ? k + 1 : -1, y > 0 ? k - width : -1, y < height - 1 ? k + width : -1]) {
        if (nb < 0 || owner[nb] !== owner[k]) continue;
        sum += lightv[nb];
        n++;
        around++;
        shaded += shade[nb];
      }
      smooth[k] = sum / n;
      // Una sombra se queda si la acompaña algún vecino; un hueco de luz rodeado de sombra, se cierra.
      cleanShade[k] = shade[k] ? (around === 0 || shaded >= 1 ? 1 : 0) : around >= 3 && shaded >= around - 1 ? 1 : 0;
    }
  }
  for (let k = 0; k < N; k++) {
    if (mats[k] < 0) continue;
    let level = Math.max(0, Math.min(6, levelOf(smooth[k]) + deltas[k] - (cleanShade[k] ? 2 : 0)));
    if (!cleanShade[k] && shine[k] > 0.93) level = 7;
    tones[k] = level;
  }

  if (o.innerLines !== false) {
    // Líneas interiores: donde una pieza queda claramente por delante de otra (un brazo sobre el pecho, la
    // pierna de delante), la de detrás se oscurece en el borde y las piezas se separan.
    const darker = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const k = y * width + x;
        if (mats[k] < 0) continue;
        for (const nb of [x > 0 ? k - 1 : -1, x < width - 1 ? k + 1 : -1, y > 0 ? k - width : -1, y < height - 1 ? k + width : -1]) {
          if (nb < 0 || mats[nb] < 0 || owner[nb] === owner[k]) continue;
          const ga = prims[owner[nb]].group;
          if (ga !== undefined && ga === prims[owner[k]].group) continue;
          if (depth[nb] - depth[k] > innerGap) {
            darker[k] = 1;
            break;
          }
        }
      }
    }
    for (let k = 0; k < width * height; k++) if (darker[k]) tones[k] = Math.max(0, Math.min(6, tones[k]) - 2);
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let k = 0; k < width * height; k++) {
    if (mats[k] < 0) continue;
    const ramp = o.ramps[matNames[mats[k]]];
    if (!ramp) throw new Error(`Material sin rampa: ${matNames[mats[k]]}`);
    const [r, g, b] = ramp8(ramp)[tones[k]];
    rgba[k * 4] = r;
    rgba[k * 4 + 1] = g;
    rgba[k * 4 + 2] = b;
    rgba[k * 4 + 3] = 255;
  }
  if (o.outline !== false) {
    // Contorno: los huecos junto a la figura toman el tono más oscuro de su vecino, oscurecido.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const k = y * width + x;
        if (mats[k] >= 0) continue;
        let nb = -1;
        if (x > 0 && mats[k - 1] >= 0) nb = k - 1;
        else if (x < width - 1 && mats[k + 1] >= 0) nb = k + 1;
        else if (y < height - 1 && mats[k + width] >= 0) nb = k + width;
        else if (y > 0 && mats[k - width] >= 0) nb = k - width;
        if (nb < 0) continue;
        const [r, g, b] = rgb(o.ramps[matNames[mats[nb]]][0]);
        rgba[k * 4] = r * 0.55;
        rgba[k * 4 + 1] = g * 0.5;
        rgba[k * 4 + 2] = b * 0.5;
        rgba[k * 4 + 3] = 255;
      }
    }
  }
  return { width, height, rgba };
}

/**
 * Lleva un punto del cubo [−1, 1]³ (sobre la cara `axis`, `sign`) a la superficie de la forma, en unidades
 * de los semilados, y deja en `n` su normal en esas mismas unidades (sin normalizar; hay que dividirla por los
 * semilados para pasarla al modelo).
 */
function surface(shape: Shape, axis: 0 | 1 | 2, sign: 1 | -1, p: [number, number, number], n: [number, number, number]): void {
  switch (shape) {
    case 'ell': {
      const l = Math.hypot(p[0], p[1], p[2]);
      p[0] /= l;
      p[1] /= l;
      p[2] /= l;
      n[0] = p[0];
      n[1] = p[1];
      n[2] = p[2];
      return;
    }
    case 'cyl': {
      if (axis === 1) {
        // Tapas: el cuadrado se lleva al disco.
        const r = Math.max(Math.abs(p[0]), Math.abs(p[2]));
        const l = Math.hypot(p[0], p[2]) || 1;
        p[0] *= r / l;
        p[2] *= r / l;
        n[0] = 0;
        n[1] = sign;
        n[2] = 0;
        return;
      }
      const l = Math.hypot(p[0], p[2]);
      p[0] /= l;
      p[2] /= l;
      n[0] = p[0];
      n[1] = 0;
      n[2] = p[2];
      return;
    }
    case 'rbox': {
      // Superelipsoide de exponente 4: caja con las aristas redondeadas.
      const m = Math.sqrt(Math.sqrt(p[0] ** 4 + p[1] ** 4 + p[2] ** 4));
      p[0] /= m;
      p[1] /= m;
      p[2] /= m;
      n[0] = p[0] ** 3;
      n[1] = p[1] ** 3;
      n[2] = p[2] ** 3;
      return;
    }
    default:
      n[0] = axis === 0 ? sign : 0;
      n[1] = axis === 1 ? sign : 0;
      n[2] = axis === 2 ? sign : 0;
  }
}

/** Refleja horizontalmente un resultado (para SE, E y NE). */
export function mirror(r: RasterResult): RasterResult {
  const out = new Uint8ClampedArray(r.rgba.length);
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const s = (y * r.width + x) * 4;
      const d = (y * r.width + (r.width - 1 - x)) * 4;
      out[d] = r.rgba[s];
      out[d + 1] = r.rgba[s + 1];
      out[d + 2] = r.rgba[s + 2];
      out[d + 3] = r.rgba[s + 3];
    }
  }
  return { width: r.width, height: r.height, rgba: out };
}

/** Caja que contiene los píxeles opacos (para cajas de clic y retratos). */
export function opaqueBounds(r: RasterResult): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = r.width;
  let y0 = r.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      if (r.rgba[(y * r.width + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
